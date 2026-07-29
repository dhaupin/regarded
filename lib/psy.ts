/**
 * Market Psychology Module
 *
 * Analyzes market sentiment and psychology for trading decisions.
 * Includes sell-the-news, buy-the-dip, and momentum exhaustion detection.
 * Uses existing regarded modules: error, audit, news, indicators, cache.
 */

import { createError, ErrorCode } from './error';
import { logAuditEvent } from './audit';
import type { Candle } from './types';
import { calculateIndicator, IndicatorType } from './indicators';

// ============================================================================
// Types
// ============================================================================

export interface PsychologyConfig {
  /** Hours after positive news to trigger sell-the-news */
  sellTheNewsHours?: number;
  /** Price increase threshold since positive news (%) */
  sellTheNewsThreshold?: number;
  /** Hours after negative news to trigger buy-the-dip */
  buyTheDipHours?: number;
  /** Price decrease threshold since negative news (%) */
  buyTheDipThreshold?: number;
  /** Lookback period for momentum analysis */
  momentumPeriod?: number;
  /** RSI threshold for overbought/oversold */
  rsiOverbought?: number;
  /** RSI threshold for oversold */
  rsiOversold?: number;
}

export interface PsychologyResult {
  allowed: boolean;
  signal?: 'sell_the_news' | 'buy_the_dip' | 'momentum_exhaustion' | 'neutral';
  reason: string;
  confidence: number; // 0-1
  details?: Record<string, any>;
}

export interface NewsAnalysis {
  symbol: string;
  latestNewsTime: number;
  latestNewsSentiment: 'positive' | 'negative' | 'neutral';
  priceAtNews: number;
  currentPrice: number;
  priceChangePercent: number;
  hoursSinceNews: number;
}

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_CONFIG: Required<PsychologyConfig> = {
  sellTheNewsHours: 24,
  sellTheNewsThreshold: 5,
  buyTheDipHours: 24,
  buyTheDipThreshold: -5,
  momentumPeriod: 14,
  rsiOverbought: 70,
  rsiOversold: 30,
};

// ============================================================================
// MarketPsychology Class
// ============================================================================

export class MarketPsychology {
  private config: Required<PsychologyConfig>;
  private lastAnalysis: Map<string, PsychologyResult> = new Map();

  constructor(config: PsychologyConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get configuration
   */
  getConfig(): Readonly<Required<PsychologyConfig>> {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<PsychologyConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Analyze if a symbol is in "sell the news" territory
   *
   * Conditions:
   * 1. Recent positive news (within sellTheNewsHours)
   * 2. Price has risen by sellTheNewsThreshold % or more since news
   *
   * @param analysis News analysis data
   * @param userId User ID for audit logging
   */
  async analyzeSellTheNews(
    analysis: NewsAnalysis,
    userId?: string
  ): Promise<PsychologyResult> {
    const { sellTheNewsHours, sellTheNewsThreshold } = this.config;

    // Check if there's recent positive news
    if (analysis.latestNewsSentiment !== 'positive') {
      return {
        allowed: true,
        signal: 'neutral',
        reason: 'No recent positive news',
        confidence: 0,
      };
    }

    // Check if news is within the time window
    if (analysis.hoursSinceNews > sellTheNewsHours) {
      return {
        allowed: true,
        signal: 'neutral',
        reason: `News is older than ${sellTheNewsHours} hours`,
        confidence: 0,
      };
    }

    // Check price increase threshold
    if (analysis.priceChangePercent >= sellTheNewsThreshold) {
      const result: PsychologyResult = {
        allowed: false,
        signal: 'sell_the_news',
        reason: `Sell-the-news: Price up ${analysis.priceChangePercent.toFixed(1)}% since positive news ${analysis.hoursSinceNews.toFixed(1)}h ago (threshold: ${sellTheNewsThreshold}%)`,
        confidence: Math.min(analysis.priceChangePercent / 10, 1),
        details: {
          priceAtNews: analysis.priceAtNews,
          currentPrice: analysis.currentPrice,
          hoursSinceNews: analysis.hoursSinceNews,
          priceChangePercent: analysis.priceChangePercent,
        },
      };

      // Log to audit
      if (userId) {
        await this.logPsychologyEvent(userId, 'sell_the_news', result);
      }

      this.lastAnalysis.set(analysis.symbol, result);
      return result;
    }

    return {
      allowed: true,
      signal: 'neutral',
      reason: `Price up ${analysis.priceChangePercent.toFixed(1)}% but below ${sellTheNewsThreshold}% threshold`,
      confidence: 0.3,
    };
  }

  /**
   * Analyze if a symbol is a "buy the dip" opportunity
   *
   * Conditions:
   * 1. Recent negative news (within buyTheDipHours)
   * 2. Price has dropped by buyTheDipThreshold % or more since news
   *
   * @param analysis News analysis data
   * @param userId User ID for audit logging
   */
  async analyzeBuyTheDip(
    analysis: NewsAnalysis,
    userId?: string
  ): Promise<PsychologyResult> {
    const { buyTheDipHours, buyTheDipThreshold } = this.config;

    // Check if there's recent negative news
    if (analysis.latestNewsSentiment !== 'negative') {
      return {
        allowed: true,
        signal: 'neutral',
        reason: 'No recent negative news',
        confidence: 0,
      };
    }

    // Check if news is within the time window
    if (analysis.hoursSinceNews > buyTheDipHours) {
      return {
        allowed: true,
        signal: 'neutral',
        reason: `News is older than ${buyTheDipHours} hours`,
        confidence: 0,
      };
    }

    // Check price decrease threshold (negative value)
    if (analysis.priceChangePercent <= buyTheDipThreshold) {
      const result: PsychologyResult = {
        allowed: false,
        signal: 'buy_the_dip',
        reason: `Buy-the-dip: Price down ${analysis.priceChangePercent.toFixed(1)}% since negative news ${analysis.hoursSinceNews.toFixed(1)}h ago (threshold: ${buyTheDipThreshold}%)`,
        confidence: Math.min(Math.abs(analysis.priceChangePercent) / 10, 1),
        details: {
          priceAtNews: analysis.priceAtNews,
          currentPrice: analysis.currentPrice,
          hoursSinceNews: analysis.hoursSinceNews,
          priceChangePercent: analysis.priceChangePercent,
        },
      };

      // Log to audit
      if (userId) {
        await this.logPsychologyEvent(userId, 'buy_the_dip', result);
      }

      this.lastAnalysis.set(analysis.symbol, result);
      return result;
    }

    return {
      allowed: true,
      signal: 'neutral',
      reason: `Price down ${analysis.priceChangePercent.toFixed(1)}% but above ${buyTheDipThreshold}% threshold`,
      confidence: 0.3,
    };
  }

  /**
   * Analyze momentum exhaustion using RSI
   *
   * Conditions:
   * 1. RSI in overbought territory (>70) - potential reversal down
   * 2. RSI in oversold territory (<30) - potential reversal up
   *
   * @param candles Price candles
   * @param userId User ID for audit logging
   */
  async analyzeMomentumExhaustion(
    candles: Candle[],
    userId?: string
  ): Promise<PsychologyResult> {
    const { rsiOverbought, rsiOversold } = this.config;

    // Need enough candles for RSI calculation
    if (candles.length < 14) {
      return {
        allowed: true,
        signal: 'neutral',
        reason: 'Insufficient candle data for RSI calculation',
        confidence: 0,
      };
    }

    // Calculate RSI
    const rsi = calculateIndicator(
      IndicatorType.RSI,
      candles,
      { period: 14 }
    );

    if (!rsi || rsi.value === undefined) {
      return {
        allowed: true,
        signal: 'neutral',
        reason: 'Failed to calculate RSI',
        confidence: 0,
      };
    }

    // Check for overbought (exhaustion to upside)
    if (rsi.value > rsiOverbought) {
      const result: PsychologyResult = {
        allowed: false,
        signal: 'momentum_exhaustion',
        reason: `Momentum exhaustion: RSI overbought at ${rsi.value.toFixed(1)} (threshold: ${rsiOverbought})`,
        confidence: (rsi.value - rsiOverbought) / 30,
        details: {
          rsi: rsi.value,
          overboughtThreshold: rsiOverbought,
          direction: 'down',
        },
      };

      if (userId) {
        await this.logPsychologyEvent(userId, 'momentum_exhaustion', result);
      }

      return result;
    }

    // Check for oversold (exhaustion to downside)
    if (rsi.value < rsiOversold) {
      const result: PsychologyResult = {
        allowed: false,
        signal: 'momentum_exhaustion',
        reason: `Momentum exhaustion: RSI oversold at ${rsi.value.toFixed(1)} (threshold: ${rsiOversold})`,
        confidence: (rsiOversold - rsi.value) / 30,
        details: {
          rsi: rsi.value,
          oversoldThreshold: rsiOversold,
          direction: 'up',
        },
      };

      if (userId) {
        await this.logPsychologyEvent(userId, 'momentum_exhaustion', result);
      }

      return result;
    }

    return {
      allowed: true,
      signal: 'neutral',
      reason: `RSI at ${rsi.value.toFixed(1)} - neutral zone`,
      confidence: 0.2,
    };
  }

  /**
   * Combined analysis - runs all psychology checks
   *
   * @param analysis News analysis data
   * @param candles Price candles (optional, for momentum check)
   * @param userId User ID for audit logging
   */
  async analyze(
    analysis: NewsAnalysis,
    candles?: Candle[],
    userId?: string
  ): Promise<{
    sellTheNews: PsychologyResult;
    buyTheDip: PsychologyResult;
    momentum: PsychologyResult;
    overall: PsychologyResult;
  }> {
    const [sellTheNews, buyTheDip] = await Promise.all([
      this.analyzeSellTheNews(analysis, userId),
      this.analyzeBuyTheDip(analysis, userId),
    ]);

    let momentum: PsychologyResult = {
      allowed: true,
      signal: 'neutral',
      reason: 'No candle data provided',
      confidence: 0,
    };

    if (candles && candles.length > 0) {
      momentum = await this.analyzeMomentumExhaustion(candles, userId);
    }

    // Determine overall result - most restrictive wins
    const results = [sellTheNews, buyTheDip, momentum].filter(r => !r.allowed);
    
    let overall: PsychologyResult;
    if (results.length > 0) {
      // Use the result with highest confidence
      overall = results.reduce((best, current) => 
        current.confidence > best.confidence ? current : best
      );
    } else {
      overall = {
        allowed: true,
        signal: 'neutral',
        reason: 'All checks passed',
        confidence: 0.8,
      };
    }

    return {
      sellTheNews,
      buyTheDip,
      momentum,
      overall,
    };
  }

  /**
   * Get last analysis result for a symbol
   */
  getLastAnalysis(symbol: string): PsychologyResult | undefined {
    return this.lastAnalysis.get(symbol);
  }

  /**
   * Clear analysis cache
   */
  clearCache(): void {
    this.lastAnalysis.clear();
  }

  /**
   * Log psychology event to audit
   */
  private async logPsychologyEvent(
    userId: string,
    signal: string,
    result: PsychologyResult
  ): Promise<void> {
    try {
      await logAuditEvent(
        'psychology_analysis' as any,
        userId,
        {
          signal,
          allowed: result.allowed,
          confidence: result.confidence,
          reason: result.reason,
          details: result.details,
        },
        result.allowed ? 'low' : 'medium'
      );
    } catch (error) {
      // Don't fail the main operation if audit logging fails
      console.warn('Failed to log psychology event to audit:', error);
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a MarketPsychology instance
 */
export function createMarketPsychology(config?: PsychologyConfig): MarketPsychology {
  return new MarketPsychology(config);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Calculate price change percentage
 */
export function calculatePriceChange(
  priceAtNews: number,
  currentPrice: number
): number {
  if (priceAtNews === 0) return 0;
  return ((currentPrice - priceAtNews) / priceAtNews) * 100;
}

/**
 * Calculate hours since timestamp
 */
export function hoursSince(timestamp: number): number {
  return (Date.now() - timestamp) / (1000 * 60 * 60);
}

/**
 * Create news analysis from news item and prices
 */
export function createNewsAnalysis(
  symbol: string,
  newsItem: {
    publishedAt: number;
    sentiment?: 'positive' | 'negative' | 'neutral';
  },
  priceAtNews: number,
  currentPrice: number
): NewsAnalysis {
  return {
    symbol,
    latestNewsTime: newsItem.publishedAt,
    latestNewsSentiment: newsItem.sentiment || 'neutral',
    priceAtNews,
    currentPrice,
    priceChangePercent: calculatePriceChange(priceAtNews, currentPrice),
    hoursSinceNews: hoursSince(newsItem.publishedAt),
  };
}
