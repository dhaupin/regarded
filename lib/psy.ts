/**
 * Market Psychology Module
 *
 * Analyzes market sentiment and psychology for trading decisions.
 * Includes sell-the-news, buy-the-dip, and momentum exhaustion detection.
 * Uses existing regarded modules: error, audit, news, indicators, cache, storage.
 */

import { createError, ErrorCode } from './error';
import { logAuditEvent } from './audit';
import type { Candle } from './types';
import { calculateIndicator } from './indicators';
import { type Storage, createJSONStorage } from './storage';

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
  private storage?: Storage;
  private lastAnalysis: Map<string, PsychologyResult> = new Map();

  constructor(config: PsychologyConfig = {}, storage?: Storage) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.storage = storage;
  }

  /**
   * Get storage key
   */
  private getStorageKey(): string {
    return 'psy:last-analysis';
  }

  /**
   * Save psychology analysis state
   */
  async save(): Promise<void> {
    if (!this.storage) return;
    
    const state = Array.from(this.lastAnalysis.entries());
    const jsonStorage = createJSONStorage(this.storage, this.getStorageKey());
    await jsonStorage.save(state as any);
  }

  /**
   * Load psychology analysis state
   */
  async load(): Promise<boolean> {
    if (!this.storage) return false;
    
    const jsonStorage = createJSONStorage<[string, PsychologyResult][]>(this.storage, this.getStorageKey());
    const state = await jsonStorage.load();
    
    if (!state) return false;
    
    try {
      this.lastAnalysis = new Map(state);
      return true;
    } catch (error) {
      console.error('Failed to load psychology state:', error);
      return false;
    }
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
      'rsi',
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

    // Extract numeric value (RSI returns single number)
    const rsiValue = Array.isArray(rsi.value) ? rsi.value[0] : rsi.value;
    const rsiFormatted = rsiValue.toFixed(1);

    // Check for overbought (exhaustion to upside)
    if (rsiValue > rsiOverbought) {
      const result: PsychologyResult = {
        allowed: false,
        signal: 'momentum_exhaustion',
        reason: `Momentum exhaustion: RSI overbought at ${rsiFormatted} (threshold: ${rsiOverbought})`,
        confidence: (rsiValue - rsiOverbought) / 30,
        details: {
          rsi: rsiValue,
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
    if (rsiValue < rsiOversold) {
      const result: PsychologyResult = {
        allowed: false,
        signal: 'momentum_exhaustion',
        reason: `Momentum exhaustion: RSI oversold at ${rsiFormatted} (threshold: ${rsiOversold})`,
        confidence: (rsiOversold - rsiValue) / 30,
        details: {
          rsi: rsiValue,
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
      reason: `RSI at ${rsiFormatted} - neutral zone`,
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

// ============================================================================
// Fear & Greed Index
// ============================================================================

export interface FearGreedResult {
  value: number; // 0-100
  classification: 'extreme_fear' | 'fear' | 'neutral' | 'greed' | 'extreme_greed';
  reason: string;
}

export interface FearGreedConfig {
  apiUrl?: string;
  cacheDurationMs?: number;
}

/**
 * Fetch Crypto Fear & Greed Index from alternative.me
 * 
 * @returns Fear & Greed index (0 = extreme fear, 100 = extreme greed)
 */
export async function fetchFearGreedIndex(config?: FearGreedConfig): Promise<FearGreedResult> {
  const url = config?.apiUrl || 'https://api.alternative.me/fng/';
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Fear & Greed API error: ${response.status}`);
    }
    
    const data = await response.json() as any;
    const today = data.data[0];
    
    const value = parseInt(today.value);
    const classification = classifyFearGreed(value);
    
    return {
      value,
      classification,
      reason: today.value_classification,
    };
  } catch (error) {
    // Return neutral on error
    return {
      value: 50,
      classification: 'neutral',
      reason: 'Unable to fetch fear & greed index',
    };
  }
}

function classifyFearGreed(value: number): FearGreedResult['classification'] {
  if (value <= 25) return 'extreme_fear';
  if (value <= 45) return 'fear';
  if (value <= 55) return 'neutral';
  if (value <= 75) return 'greed';
  return 'extreme_greed';
}

// ============================================================================
// Social Sentiment Analysis
// ============================================================================

export interface SocialSentimentResult {
  symbol: string;
  twitter?: { mentions: number; sentiment: number };
  reddit?: { mentions: number; sentiment: number };
  overall: number; // -1 to 1
  confidence: number; // 0-1
}

/**
 * Analyze social media sentiment for a symbol
 * Note: This is a placeholder - integrate with Twitter/Reddit MCP
 */
export async function analyzeSocialSentiment(
  symbol: string,
  _options?: { twitter?: boolean; reddit?: boolean }
): Promise<SocialSentimentResult> {
  // Placeholder - in production, integrate with social media APIs
  // Twitter API, Reddit API, or MCP integrations
  
  // Return neutral sentiment as placeholder
  return {
    symbol,
    overall: 0,
    confidence: 0,
    twitter: { mentions: 0, sentiment: 0 },
    reddit: { mentions: 0, sentiment: 0 },
  };
}

// ============================================================================
// Whale Watch - Large Order Detection
// ============================================================================

export interface WhaleResult {
  detected: boolean;
  type: 'buy_wall' | 'sell_wall' | 'large_order' | 'none';
  size: number;
  price: number;
  impact: 'high' | 'medium' | 'low';
  reason: string;
}

export interface WhaleConfig {
  /** Minimum USD value to be considered a whale order */
  minOrderSizeUsd?: number;
  /** Price impact threshold (%) */
  impactThreshold?: number;
}

/**
 * Detect whale orders from order book or trade data
 */
export function detectWhaleOrders(
  orders: Array<{ side: 'buy' | 'sell'; size: number; price: number }>,
  config: WhaleConfig = {}
): WhaleResult {
  const minSize = config.minOrderSizeUsd || 100000; // $100k default
  const impactThreshold = config.impactThreshold || 2; // 2% default
  
  // Sort by size descending
  const sortedOrders = [...orders].sort((a, b) => (b.size * b.price) - (a.size * a.price));
  
  for (const order of sortedOrders) {
    const value = order.size * order.price;
    
    if (value >= minSize) {
      const impact = value >= minSize * 5 ? 'high' : value >= minSize * 2 ? 'medium' : 'low';
      
      return {
        detected: true,
        type: order.side === 'buy' ? 'buy_wall' : 'sell_wall',
        size: order.size,
        price: order.price,
        impact,
        reason: `Large ${order.side} order: $${value.toLocaleString()}`,
      };
    }
  }
  
  return {
    detected: false,
    type: 'none',
    size: 0,
    price: 0,
    impact: 'low',
    reason: 'No whale orders detected',
  };
}

// ============================================================================
// Volatility Regime Detection
// ============================================================================

export type VolatilityRegime = 'low' | 'normal' | 'high' | 'extreme';

export interface VolatilityResult {
  regime: VolatilityRegime;
  current: number; // Current ATR value
  average: number; // Historical average
  ratio: number; // Current / Average
}

/**
 * Detect volatility regime using ATR (Average True Range)
 */
export function detectVolatilityRegime(
  candles: Candle[],
  atrPeriod: number = 14
): VolatilityRegime {
  if (candles.length < atrPeriod) return 'normal';
  
  // Calculate ATR
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trs.push(tr);
  }
  
  const currentATR = trs.slice(-atrPeriod).reduce((a, b) => a + b, 0) / atrPeriod;
  const avgATR = trs.reduce((a, b) => a + b, 0) / trs.length;
  const ratio = currentATR / avgATR;
  
  if (ratio < 0.5) return 'low';
  if (ratio < 1.5) return 'normal';
  if (ratio < 2.5) return 'high';
  return 'extreme';
}

/**
 * Get detailed volatility analysis
 */
export function analyzeVolatility(candles: Candle[], period: number = 14): VolatilityResult {
  if (candles.length < period) {
    return { regime: 'normal', current: 0, average: 0, ratio: 1 };
  }
  
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trs.push(tr);
  }
  
  const currentATR = trs.slice(-period).reduce((a, b) => a + b, 0) / period;
  const avgATR = trs.reduce((a, b) => a + b, 0) / trs.length;
  const ratio = currentATR / avgATR;
  
  return {
    regime: detectVolatilityRegime(candles, period),
    current: currentATR,
    average: avgATR,
    ratio,
  };
}

// ============================================================================
// Time-of-Day Analysis (Session Filter)
// ============================================================================

export type TradingSession = 'asian' | 'london' | 'new_york' | 'off_hours';

export interface SessionResult {
  session: TradingSession;
  active: boolean;
  reason: string;
  liquidity: 'high' | 'medium' | 'low';
}

/**
 * Get current trading session based on UTC time
 * 
 * Market hours (UTC):
 * - Asian: 00:00 - 08:00 UTC
 * - London: 08:00 - 16:00 UTC  
 * - New York: 13:00 - 21:00 UTC (overlaps with London)
 * - Off hours: Everything else
 */
export function getTradingSession(date: Date = new Date()): SessionResult {
  const hour = date.getUTCHours();
  
  if (hour >= 0 && hour < 8) {
    return {
      session: 'asian',
      active: true,
      reason: 'Asian session active (00:00-08:00 UTC)',
      liquidity: 'medium',
    };
  }
  
  if (hour >= 8 && hour < 13) {
    return {
      session: 'london',
      active: true,
      reason: 'London session active (08:00-16:00 UTC)',
      liquidity: 'high',
    };
  }
  
  if (hour >= 13 && hour < 21) {
    return {
      session: 'new_york',
      active: true,
      reason: 'New York session active (13:00-21:00 UTC)',
      liquidity: 'high',
    };
  }
  
  return {
    session: 'off_hours',
    active: false,
    reason: 'Off hours - low liquidity period',
    liquidity: 'low',
  };
}

/**
 * Check if current time is in preferred trading session
 */
export function isInPreferredSession(
  preferred: TradingSession[],
  date: Date = new Date()
): boolean {
  const current = getTradingSession(date);
  return preferred.includes(current.session);
}

// ============================================================================
// Correlation Analysis
// ============================================================================

export interface CorrelationResult {
  symbol: string;
  correlatedSymbol: string;
  correlation: number; // -1 to 1
  strength: 'strong_positive' | 'moderate_positive' | 'weak' | 'moderate_negative' | 'strong_negative';
  timeframe: string;
}

/**
 * Calculate correlation between two price series
 */
export function calculateCorrelation(
  pricesA: number[],
  pricesB: number[]
): number {
  if (pricesA.length !== pricesB.length || pricesA.length < 2) return 0;
  
  const n = pricesA.length;
  
  // Calculate means
  const meanA = pricesA.reduce((a, b) => a + b, 0) / n;
  const meanB = pricesB.reduce((a, b) => a + b, 0) / n;
  
  // Calculate covariance and variances
  let covariance = 0;
  let varianceA = 0;
  let varianceB = 0;
  
  for (let i = 0; i < n; i++) {
    const diffA = pricesA[i] - meanA;
    const diffB = pricesB[i] - meanB;
    covariance += diffA * diffB;
    varianceA += diffA * diffA;
    varianceB += diffB * diffB;
  }
  
  const denominator = Math.sqrt(varianceA * varianceB);
  if (denominator === 0) return 0;
  
  return covariance / denominator;
}

/**
 * Analyze correlation with BTC/ETH
 */
export function analyzeCorrelation(
  symbolPrices: number[],
  btcPrices: number[],
  ethPrices: number[]
): { btc: CorrelationResult; eth: CorrelationResult } {
  const btcCorrelation = calculateCorrelation(symbolPrices, btcPrices);
  const ethCorrelation = calculateCorrelation(symbolPrices, ethPrices);
  
  return {
    btc: {
      symbol: 'SYMBOL',
      correlatedSymbol: 'BTC',
      correlation: btcCorrelation,
      strength: classifyCorrelation(btcCorrelation),
      timeframe: '24h',
    },
    eth: {
      symbol: 'SYMBOL',
      correlatedSymbol: 'ETH',
      correlation: ethCorrelation,
      strength: classifyCorrelation(ethCorrelation),
      timeframe: '24h',
    },
  };
}

function classifyCorrelation(corr: number): CorrelationResult['strength'] {
  if (corr >= 0.7) return 'strong_positive';
  if (corr >= 0.3) return 'moderate_positive';
  if (corr >= -0.3) return 'weak';
  if (corr >= -0.7) return 'moderate_negative';
  return 'strong_negative';
}

// ============================================================================
// Liquidity Analysis
// ============================================================================

export interface LiquidityResult {
  sufficient: boolean;
  level: 'high' | 'medium' | 'low';
  volume24h: number;
  bidDepth: number;
  askDepth: number;
  spread: number;
  reason: string;
}

export interface LiquidityConfig {
  minVolume24h?: number;
  minBidDepth?: number;
  minAskDepth?: number;
  maxSpread?: number;
}

/**
 * Analyze market liquidity
 */
export function analyzeLiquidity(
  volume24h: number,
  bids: number[],
  asks: number[],
  config: LiquidityConfig = {}
): LiquidityResult {
  const minVolume = config.minVolume24h || 1000000; // $1M default
  const minDepth = config.minBidDepth || 50000; // $50k default
  const maxSpread = config.maxSpread || 0.5; // 0.5% max
  
  const bidDepth = bids.reduce((a, b) => a + b, 0);
  const askDepth = asks.reduce((a, b) => a + b, 0);
  
  // Calculate spread (assuming bids[0] and asks[0] are best prices)
  const bestBid = bids[0] || 0;
  const bestAsk = asks[0] || 0;
  const spread = bestAsk > 0 ? ((bestAsk - bestBid) / bestAsk) * 100 : 100;
  
  // Determine level
  let level: 'high' | 'medium' | 'low';
  if (volume24h >= minVolume * 2 && bidDepth >= minDepth * 2 && spread <= maxSpread / 2) {
    level = 'high';
  } else if (volume24h >= minVolume && bidDepth >= minDepth && spread <= maxSpread) {
    level = 'medium';
  } else {
    level = 'low';
  }
  
  return {
    sufficient: level !== 'low',
    level,
    volume24h,
    bidDepth,
    askDepth,
    spread,
    reason: `Volume: $${volume24h.toLocaleString()}, Spread: ${spread.toFixed(2)}%`,
  };
}

// ============================================================================
// Order Book Imbalance
// ============================================================================

export interface OrderBookImbalance {
  imbalance: number; // -1 (all sell) to 1 (all buy)
  direction: 'buy_pressure' | 'sell_pressure' | 'balanced';
  bidAskRatio: number;
  totalBids: number;
  totalAsks: number;
  confidence: number;
}

/**
 * Calculate order book imbalance
 * 
 * @param bids Array of bid sizes
 * @param asks Array of ask sizes
 * @returns Imbalance score from -1 (sell pressure) to 1 (buy pressure)
 */
export function calculateOrderBookImbalance(
  bids: number[],
  asks: number[]
): OrderBookImbalance {
  const totalBids = bids.reduce((a, b) => a + b, 0);
  const totalAsks = asks.reduce((a, b) => a + b, 0);
  const total = totalBids + totalAsks;
  
  if (total === 0) {
    return {
      imbalance: 0,
      direction: 'balanced',
      bidAskRatio: 1,
      totalBids: 0,
      totalAsks: 0,
      confidence: 0,
    };
  }
  
  const imbalance = (totalBids - totalAsks) / total;
  const ratio = totalAsks > 0 ? totalBids / totalAsks : 1;
  
  let direction: OrderBookImbalance['direction'];
  if (imbalance > 0.2) direction = 'buy_pressure';
  else if (imbalance < -0.2) direction = 'sell_pressure';
  else direction = 'balanced';
  
  // Confidence based on total volume
  const confidence = Math.min(total / 1000000, 1); // Cap at $1M
  
  return {
    imbalance,
    direction,
    bidAskRatio: ratio,
    totalBids,
    totalAsks,
    confidence,
  };
}

// ============================================================================
// Comprehensive Psychology Guard
// ============================================================================

export interface PsychologyGuardConfig {
  /** Enable fear & greed check */
  fearGreedEnabled?: boolean;
  /** Block trades when fear & greed is extreme */
  fearGreedBlockThreshold?: number; // 0-100
  
  /** Enable social sentiment check */
  socialSentimentEnabled?: boolean;
  /** Block when sentiment is too negative */
  minSentiment?: number; // -1 to 1
  
  /** Enable whale detection */
  whaleDetectionEnabled?: boolean;
  /** Block when whale orders detected */
  blockWhales?: boolean;
  
  /** Enable volatility regime filter */
  volatilityFilterEnabled?: boolean;
  /** Allowed volatility regimes */
  allowedRegimes?: VolatilityRegime[];
  
  /** Enable session filter */
  sessionFilterEnabled?: boolean;
  /** Allowed sessions */
  allowedSessions?: TradingSession[];
  
  /** Enable liquidity check */
  liquidityCheckEnabled?: boolean;
  /** Block when liquidity is low */
  requireHighLiquidity?: boolean;
  
  /** Enable order book imbalance check */
  imbalanceCheckEnabled?: boolean;
  /** Block when imbalance is extreme */
  maxImbalance?: number;
}

export interface PsychologyGuardResult {
  allowed: boolean;
  reasons: string[];
  checks: {
    fearGreed?: FearGreedResult;
    sentiment?: SocialSentimentResult;
    whale?: WhaleResult;
    volatility?: VolatilityResult;
    session?: SessionResult;
    liquidity?: LiquidityResult;
    imbalance?: OrderBookImbalance;
  };
}

/**
 * Comprehensive psychology guard that combines all checks
 */
export class PsychologyGuard {
  private config: Required<PsychologyGuardConfig>;
  
  constructor(config: PsychologyGuardConfig = {}) {
    this.config = {
      fearGreedEnabled: config.fearGreedEnabled ?? false,
      fearGreedBlockThreshold: config.fearGreedBlockThreshold ?? 20,
      socialSentimentEnabled: config.socialSentimentEnabled ?? false,
      minSentiment: config.minSentiment ?? -0.5,
      whaleDetectionEnabled: config.whaleDetectionEnabled ?? false,
      blockWhales: config.blockWhales ?? true,
      volatilityFilterEnabled: config.volatilityFilterEnabled ?? false,
      allowedRegimes: config.allowedRegimes ?? ['normal', 'high'],
      sessionFilterEnabled: config.sessionFilterEnabled ?? false,
      allowedSessions: config.allowedSessions ?? ['london', 'new_york'],
      liquidityCheckEnabled: config.liquidityCheckEnabled ?? false,
      requireHighLiquidity: config.requireHighLiquidity ?? true,
      imbalanceCheckEnabled: config.imbalanceCheckEnabled ?? false,
      maxImbalance: config.maxImbalance ?? 0.7,
    };
  }
  
  async evaluate(
    options: {
      symbol?: string;
      candles?: Candle[];
      orderBook?: { bids: number[]; asks: number[] };
      whaleOrders?: Array<{ side: 'buy' | 'sell'; size: number; price: number }>;
    } = {}
  ): Promise<PsychologyGuardResult> {
    const result: PsychologyGuardResult = {
      allowed: true,
      reasons: [],
      checks: {},
    };
    
    // Fear & Greed check
    if (this.config.fearGreedEnabled) {
      const fg = await fetchFearGreedIndex();
      result.checks.fearGreed = fg;
      
      if (fg.value < this.config.fearGreedBlockThreshold) {
        result.allowed = false;
        result.reasons.push(`Fear & Greed at ${fg.value} (threshold: ${this.config.fearGreedBlockThreshold})`);
      }
    }
    
    // Social sentiment check
    if (this.config.socialSentimentEnabled && options.symbol) {
      const sentiment = await analyzeSocialSentiment(options.symbol);
      result.checks.sentiment = sentiment;
      
      if (sentiment.overall < this.config.minSentiment) {
        result.allowed = false;
        result.reasons.push(`Negative sentiment: ${sentiment.overall.toFixed(2)}`);
      }
    }
    
    // Whale detection
    if (this.config.whaleDetectionEnabled && options.whaleOrders) {
      const whale = detectWhaleOrders(options.whaleOrders);
      result.checks.whale = whale;
      
      if (this.config.blockWhales && whale.detected) {
        result.allowed = false;
        result.reasons.push(whale.reason);
      }
    }
    
    // Volatility regime check
    if (this.config.volatilityFilterEnabled && options.candles) {
      const volatility = analyzeVolatility(options.candles);
      result.checks.volatility = volatility;
      
      if (!this.config.allowedRegimes.includes(volatility.regime)) {
        result.allowed = false;
        result.reasons.push(`Volatility regime: ${volatility.regime}`);
      }
    }
    
    // Session filter
    if (this.config.sessionFilterEnabled) {
      const session = getTradingSession();
      result.checks.session = session;
      
      if (!this.config.allowedSessions.includes(session.session)) {
        result.allowed = false;
        result.reasons.push(`Session: ${session.session} (off-hours)`);
      }
    }
    
    // Order book imbalance
    if (this.config.imbalanceCheckEnabled && options.orderBook) {
      const imbalance = calculateOrderBookImbalance(
        options.orderBook.bids,
        options.orderBook.asks
      );
      result.checks.imbalance = imbalance;
      
      if (Math.abs(imbalance.imbalance) > this.config.maxImbalance) {
        result.allowed = false;
        result.reasons.push(`Order book imbalance: ${imbalance.direction}`);
      }
    }
    
    return result;
  }
}
