/**
 * News API Integration
 * 
 * Dynamic news feed for trading decisions and blackout periods.
 * Emits events: news:fetched, news:error, news:rate-limited
 */

import { EventEmitter } from './event';
import { LRUCache } from './cache';
import { RateLimiter } from './qos';
import { createError, ErrorCode } from './error';
import { logAuditEvent } from './audit';

export interface NewsEvents {
  'news:fetched': { count: number; symbols: string[] };
  'news:error': { error: string; symbols?: string[] };
  'news:rate-limited': { retryAfter?: number };
}

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: number;
  symbols: string[];
  sentiment?: 'positive' | 'negative' | 'neutral';
  relevance: number; // 0-1
}

export interface NewsConfig {
  /** API key for news service */
  apiKey?: string;
  /** Base URL for news API */
  baseUrl?: string;
  /** Cache duration in ms */
  cacheDurationMs: number;
  /** Default symbols to track */
  defaultSymbols: string[];
  /** Max API requests per minute (default: 60) */
  maxRequestsPerMinute?: number;
}

export interface NewsSearchOptions {
  symbols?: string[];
  since?: number;
  until?: number;
  sentiment?: 'positive' | 'negative' | 'neutral';
  minRelevance?: number;
  limit?: number;
}

const DEFAULT_CONFIG: NewsConfig = {
  cacheDurationMs: 5 * 60 * 1000, // 5 minutes
  defaultSymbols: ['BTC', 'ETH', 'SOL', 'SPY', 'QQQ', 'AAPL', 'TSLA'],
};

export class NewsService extends EventEmitter<NewsEvents> {
  private config: NewsConfig;
  private cache: LRUCache<NewsItem[]>;
  private rateLimiter: RateLimiter;
  private recentNews: NewsItem[] = [];

  constructor(config: Partial<NewsConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    // Use LRUCache with TTL for caching news
    this.cache = new LRUCache<NewsItem[]>(100, this.config.cacheDurationMs);
    // Rate limiter: tokens refill at (maxTokens / ms) per minute
    const maxRequests = this.config.maxRequestsPerMinute || 60;
    this.rateLimiter = new RateLimiter(maxRequests, maxRequests / 60000);
  }

  /**
   * Fetch latest news
   */
  async getLatest(options: NewsSearchOptions = {}): Promise<NewsItem[]> {
    const cacheKey = `latest:${options.symbols?.join(',') || 'all'}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached) {
      // Emit fetched from cache event
      this.emit('news:fetched', { count: cached.length, symbols: options.symbols || [] });
      return this.filterNews(cached, options);
    }

    // Try to fetch from API if configured
    if (this.config.apiKey && this.config.baseUrl) {
      try {
        const news = await this.fetchFromApi(options);
        this.cache.set(cacheKey, news);
        this.recentNews = news;
        
        // Emit fetched event
        this.emit('news:fetched', { count: news.length, symbols: options.symbols || [] });
        
        // Audit log
        logAuditEvent('news_fetched' as any, 'system', {
          count: news.length,
          symbols: options.symbols,
        }, 'low').catch(() => {});
        
        return this.filterNews(news, options);
      } catch (e) {
        const error = e as Error;
        
        // Emit error event
        this.emit('news:error', { error: error.message, symbols: options.symbols });
        
        // Audit log errors
        logAuditEvent('news_error' as any, 'system', {
          error: error.message,
          symbols: options.symbols,
        }, 'medium').catch(() => {});
        
        console.warn('News API fetch failed, using fallback:', e);
      }
    }

    // Return cached or empty
    return this.filterNews(this.recentNews, options);
  }

  /**
   * Fetch news for specific symbols
   */
  async getNewsForSymbols(symbols: string[], limit = 10): Promise<NewsItem[]> {
    const allNews = await this.getLatest({ symbols, limit });
    return allNews.filter(item => 
      item.symbols.some(s => symbols.includes(s))
    ).slice(0, limit);
  }

  /**
   * Check if there are any news items in the blackout period
   */
  async isNewsBlackoutPeriod(symbols: string[]): Promise<{ blackout: boolean; reason?: string }> {
    const news = await this.getLatest({ symbols, since: Date.now() - 30 * 60 * 1000 }); // Last 30 min
    
    // Check for high-impact news
    const highImpactKeywords = [
      'fed', 'interest rate', 'inflation', 'recession',
      'earnings', 'bankruptcy', 'hack', 'SEC', 'ETF',
      'halving', 'upgrade', 'downgrade', 'lawsuit',
    ];

    for (const item of news) {
      const titleLower = item.title.toLowerCase();
      const summaryLower = item.summary.toLowerCase();
      
      for (const keyword of highImpactKeywords) {
        if (titleLower.includes(keyword) || summaryLower.includes(keyword)) {
          return {
            blackout: true,
            reason: `High-impact news: ${item.title}`,
          };
        }
      }
    }

    return { blackout: false };
  }

  /**
   * Get current market sentiment based on news
   */
  async getMarketSentiment(symbols?: string[]): Promise<{
    overall: 'positive' | 'negative' | 'neutral';
    symbolSentiments: Record<string, 'positive' | 'negative' | 'neutral'>;
    newsCount: number;
  }> {
    const news = await this.getLatest({ symbols });
    
    const symbolSentiments: Record<string, 'positive' | 'negative' | 'neutral'> = {};
    const symbolScores: Record<string, number> = {};
    
    for (const item of news) {
      const score = item.sentiment === 'positive' ? 1 : item.sentiment === 'negative' ? -1 : 0;
      
      for (const symbol of item.symbols) {
        symbolScores[symbol] = (symbolScores[symbol] || 0) + score * item.relevance;
      }
    }

    // Convert scores to sentiments
    for (const [symbol, score] of Object.entries(symbolScores)) {
      if (score > 0.2) symbolSentiments[symbol] = 'positive';
      else if (score < -0.2) symbolSentiments[symbol] = 'negative';
      else symbolSentiments[symbol] = 'neutral';
    }

    // Calculate overall
    const allScores = Object.values(symbolScores);
    const avgScore = allScores.length > 0 
      ? allScores.reduce((a, b) => a + b, 0) / allScores.length 
      : 0;
    
    const overall = avgScore > 0.2 ? 'positive' : avgScore < -0.2 ? 'negative' : 'neutral';

    return { overall, symbolSentiments, newsCount: news.length };
  }

  private async fetchFromApi(options: NewsSearchOptions): Promise<NewsItem[]> {
    // Wait for rate limiter before making request
    const canProceed = this.rateLimiter.tryConsume(1);
    if (!canProceed) {
      // Emit rate-limited event
      this.emit('news:rate-limited', { retryAfter: 60 });
      
      // Audit log rate limit
      logAuditEvent('news_rate_limited' as any, 'system', {}, 'medium').catch(() => {});
      
      throw createError({
        code: ErrorCode.RATE_LIMITED,
        message: 'News API rate limit exceeded',
        statusCode: 429,
      });
    }

    const params = new URLSearchParams();
    if (options.symbols) params.set('symbols', options.symbols.join(','));
    if (options.since) params.set('since', String(options.since));
    if (options.until) params.set('until', String(options.until));
    if (options.limit) params.set('limit', String(options.limit));

    const url = `${this.config.baseUrl}/news?${params}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw createError({
        code: ErrorCode.EXCHANGE_ERROR,
        message: `News API error: ${response.status}`,
        statusCode: response.status,
      });
    }

    const data = await response.json() as any[];
    return data.map(item => ({
      id: item.id,
      title: item.title,
      summary: item.summary,
      source: item.source,
      url: item.url,
      publishedAt: new Date(item.publishedAt).getTime(),
      symbols: item.symbols || [],
      sentiment: item.sentiment,
      relevance: item.relevance || 0.5,
    }));
  }

  private filterNews(news: NewsItem[], options: NewsSearchOptions): NewsItem[] {
    let filtered = news;

    if (options.symbols && options.symbols.length > 0) {
      filtered = filtered.filter(item =>
        item.symbols.some(s => options.symbols!.includes(s))
      );
    }

    if (options.since) {
      filtered = filtered.filter(item => item.publishedAt >= options.since!);
    }

    if (options.until) {
      filtered = filtered.filter(item => item.publishedAt <= options.until!);
    }

    if (options.sentiment) {
      filtered = filtered.filter(item => item.sentiment === options.sentiment);
    }

    if (options.minRelevance) {
      filtered = filtered.filter(item => item.relevance >= options.minRelevance!);
    }

    if (options.limit) {
      filtered = filtered.slice(0, options.limit);
    }

    return filtered;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Add news item manually (for testing or manual feed)
   */
  addNewsItem(item: Omit<NewsItem, 'id'>): void {
    const newsItem: NewsItem = {
      ...item,
      id: `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    };
    this.recentNews.unshift(newsItem);
    
    // Keep only recent items
    if (this.recentNews.length > 100) {
      this.recentNews = this.recentNews.slice(0, 100);
    }
  }
}

export function createNewsService(config?: Partial<NewsConfig>): NewsService {
  return new NewsService(config);
}
