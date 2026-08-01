/**
 * Pattern Recognition
 * 
 * Humps, divergence, crossover, double top/bottom patterns.
 */

import type { Pattern, PatternResult, PatternOptions, Candle } from './types';

export abstract class BasePattern implements Pattern {
  abstract name: string;
  abstract type: string;
  abstract detect(candles: Candle[], options?: PatternOptions): PatternResult;
  
  protected getValues(candles: Candle[], field: keyof Candle = 'close'): number[] {
    return candles.map(c => c[field] as number);
  }
  protected getHighs(candles: Candle[]): number[] { return candles.map(c => c.high); }
  protected getLows(candles: Candle[]): number[] { return candles.map(c => c.low); }
}

/**
 * Humps Pattern - N consecutive peaks
 */
export class HumpsPattern extends BasePattern {
  name = 'Humps';
  type = 'humps';
  
  detect(candles: Candle[], options?: PatternOptions): PatternResult {
    const count = options?.count ?? 3;
    const direction = options?.direction ?? 'up';
    const minHeight = options?.min_height ?? 0.5;
    const lookback = options?.lookback ?? 20;
    
    const prices = this.getValues(candles);
    if (prices.length < count + 2) return { detected: false, confidence: 0 };
    
    const recent = prices.slice(-lookback);
    const peaks: number[] = [];
    
    for (let i = 1; i < recent.length - 1; i++) {
      if (recent[i] > recent[i - 1] && recent[i] > recent[i + 1]) peaks.push(i);
    }
    
    if (peaks.length < count) return { detected: false, confidence: 0 };
    
    const lastNPeaks = peaks.slice(-count);
    let valid = true;
    let totalHeight = 0;
    
    for (let i = 1; i < lastNPeaks.length; i++) {
      const height = recent[lastNPeaks[i]] - recent[lastNPeaks[i - 1]];
      if ((direction === 'up' && height < minHeight) || (direction === 'down' && height > -minHeight)) {
        valid = false;
        break;
      }
      totalHeight += Math.abs(height);
    }
    
    if (!valid) return { detected: false, confidence: 0 };
    
    return {
      detected: true,
      confidence: Math.min(totalHeight / (minHeight * 2 * count), 1),
      direction: direction as 'up' | 'down',
      start_index: lastNPeaks[0],
      end_index: lastNPeaks[lastNPeaks.length - 1],
    };
  }
}

/**
 * Divergence Pattern
 */
export class DivergencePattern extends BasePattern {
  name = 'Divergence';
  type = 'divergence';
  
  detect(candles: Candle[], options?: PatternOptions): PatternResult {
    const direction = options?.direction ?? 'up';
    const lookback = options?.lookback ?? 20;
    
    const prices = this.getValues(candles);
    const highs = this.getHighs(candles);
    const lows = this.getLows(candles);
    
    if (prices.length < lookback) return { detected: false, confidence: 0 };
    
    const recentHighs = highs.slice(-lookback);
    const recentLows = lows.slice(-lookback);
    const recentPrices = prices.slice(-lookback);
    
    const highestHigh = Math.max(...recentHighs);
    const lowestLow = Math.min(...recentLows);
    const highestIndex = recentHighs.indexOf(highestHigh);
    const lowestIndex = recentLows.indexOf(lowestLow);
    
    const currentPrice = recentPrices[recentPrices.length - 1];
    const pricePosition = (currentPrice - lowestLow) / (highestHigh - lowestLow);
    
    if (direction === 'up' && pricePosition < 0.3 && highestIndex > lowestIndex) {
      return { detected: true, confidence: 0.7, direction: 'up', start_index: lowestIndex };
    }
    if (direction === 'down' && pricePosition > 0.7 && lowestIndex > highestIndex) {
      return { detected: true, confidence: 0.7, direction: 'down', start_index: highestIndex };
    }
    
    return { detected: false, confidence: 0 };
  }
}

/**
 * Crossover Pattern
 */
export class CrossoverPattern extends BasePattern {
  name = 'Crossover';
  type = 'crossover';
  
  detect(candles: Candle[], options?: PatternOptions): PatternResult {
    const direction = options?.direction ?? 'up';
    const lookback = options?.lookback ?? 5;
    
    const prices = this.getValues(candles);
    if (prices.length < lookback + 1) return { detected: false, confidence: 0 };
    
    const recent = prices.slice(-lookback - 1);
    const sma = recent.slice(0, -1).reduce((a, b) => a + b, 0) / (recent.length - 1);
    const currentPrice = recent[recent.length - 1];
    const prevPrice = recent[recent.length - 2];
    
    if (direction === 'up' && prevPrice < sma && currentPrice > sma) {
      return { detected: true, confidence: 0.8, direction: 'up' };
    }
    if (direction === 'down' && prevPrice > sma && currentPrice < sma) {
      return { detected: true, confidence: 0.8, direction: 'down' };
    }
    
    return { detected: false, confidence: 0 };
  }
}

/**
 * Double Top/Bottom
 */
export class DoubleTopBottomPattern extends BasePattern {
  name = 'Double Top/Bottom';
  type = 'double_top';
  
  detect(candles: Candle[], options?: PatternOptions): PatternResult {
    const direction = options?.direction ?? 'up';
    const threshold = options?.threshold ?? 0.02;
    const lookback = options?.lookback ?? 20;
    
    const highs = this.getHighs(candles);
    const lows = this.getLows(candles);
    
    if (lookback > highs.length) return { detected: false, confidence: 0 };
    
    const recentHighs = highs.slice(-lookback);
    const recentLows = lows.slice(-lookback);
    
    if (direction === 'up') {
      const maxHigh = Math.max(...recentHighs);
      const peaks = recentHighs.map((h, i) => ({ h, i })).filter(x => Math.abs(x.h - maxHigh) / maxHigh < threshold);
      if (peaks.length >= 2) return { detected: true, confidence: 0.8, direction: 'down', start_index: peaks[0].i };
    } else {
      const minLow = Math.min(...recentLows);
      const troughs = recentLows.map((l, i) => ({ l, i })).filter(x => Math.abs(x.l - minLow) / minLow < threshold);
      if (troughs.length >= 2) return { detected: true, confidence: 0.8, direction: 'up', start_index: troughs[0].i };
    }
    
    return { detected: false, confidence: 0 };
  }
}

/**
 * Head and Shoulders Pattern
 */
export class HeadShouldersPattern extends BasePattern {
  name = 'Head and Shoulders';
  type = 'head_shoulders';
  
  detect(candles: Candle[], options?: PatternOptions): PatternResult {
    const lookback = options?.lookback ?? 50;
    const threshold = options?.threshold ?? 0.03;
    
    const highs = this.getHighs(candles);
    if (lookback > highs.length) return { detected: false, confidence: 0 };
    
    const recent = highs.slice(-lookback);
    
    // Find peaks using local maxima
    const peaks: number[] = [];
    for (let i = 1; i < recent.length - 1; i++) {
      if (recent[i] > recent[i - 1] && recent[i] > recent[i + 1]) {
        peaks.push(recent[i]);
      }
    }
    
    if (peaks.length < 3) return { detected: false, confidence: 0 };
    
    // Get the last 3 peaks for head and shoulders
    const lastThree = peaks.slice(-3);
    const [leftShoulder, head, rightShoulder] = lastThree;
    
    // Head should be higher than both shoulders
    if (head <= leftShoulder || head <= rightShoulder) {
      return { detected: false, confidence: 0 };
    }
    
    // Shoulders should be roughly equal (within threshold)
    const shoulderDiff = Math.abs(leftShoulder - rightShoulder) / head;
    if (shoulderDiff > threshold) {
      return { detected: false, confidence: 0 };
    }
    
    // Head should be significantly higher than shoulders
    const headHeight = (head - Math.max(leftShoulder, rightShoulder)) / head;
    if (headHeight < 0.02) {
      return { detected: false, confidence: 0 };
    }
    
    const confidence = Math.min(0.7 + headHeight, 0.95);
    
    return {
      detected: true,
      confidence,
      direction: 'down',
    };
  }
}

/**
 * Triangle Patterns (Ascending, Descending, Symmetrical)
 */
export class TrianglePattern extends BasePattern {
  name = 'Triangle';
  type = 'triangle';
  
  detect(candles: Candle[], options?: PatternOptions): PatternResult {
    const lookback = options?.lookback ?? 30;
    const type = options?.type || 'symmetrical';
    
    const highs = this.getHighs(candles);
    const lows = this.getLows(candles);
    
    if (lookback > highs.length) return { detected: false, confidence: 0 };
    
    const recentHighs = highs.slice(-lookback);
    const recentLows = lows.slice(-lookback);
    
    // Linear regression for highs and lows
    const regression = (values: number[]) => {
      const n = values.length;
      let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
      
      for (let i = 0; i < n; i++) {
        sumX += i;
        sumY += values[i];
        sumXY += i * values[i];
        sumX2 += i * i;
      }
      
      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;
      
      return { slope, intercept };
    };
    
    const highReg = regression(recentHighs);
    const lowReg = regression(recentLows);
    
    // Check pattern type
    if (type === 'ascending') {
      // Ascending: flat lows, rising highs
      const lowSlopeAbs = Math.abs(lowReg.slope);
      if (highReg.slope > 0.1 && lowSlopeAbs < 0.1) {
        return { detected: true, confidence: 0.75, direction: 'up' };
      }
    } else if (type === 'descending') {
      // Descending: falling lows, flat highs
      const highSlopeAbs = Math.abs(highReg.slope);
      if (lowReg.slope < -0.1 && highSlopeAbs < 0.1) {
        return { detected: true, confidence: 0.75, direction: 'down' };
      }
    } else {
      // Symmetrical: converging trendlines
      const highSlopeAbs = Math.abs(highReg.slope);
      const lowSlopeAbs = Math.abs(lowReg.slope);
      if (highReg.slope < -0.05 && lowReg.slope > 0.05) {
        return { detected: true, confidence: 0.7, direction: 'neutral' };
      }
    }
    
    return { detected: false, confidence: 0 };
  }
}

/**
 * Pattern Registry
 */
export class PatternRegistry {
  private patterns = new Map<string, new () => BasePattern>();
  
  constructor() {
    this.register('humps', HumpsPattern);
    this.register('divergence', DivergencePattern);
    this.register('crossover', CrossoverPattern);
    this.register('double_top', DoubleTopBottomPattern);
    this.register('double_bottom', DoubleTopBottomPattern);
    this.register('head_shoulders', HeadShouldersPattern);
    this.register('triangle', TrianglePattern);
    this.register('ascending_triangle', TrianglePattern);
    this.register('descending_triangle', TrianglePattern);
    this.register('symmetrical_triangle', TrianglePattern);
  }
  
  register(type: string, cls: new () => BasePattern): void {
    this.patterns.set(type.toLowerCase(), cls);
  }
  
  create(type: string): Pattern | undefined {
    const cls = this.patterns.get(type.toLowerCase());
    return cls ? new cls() : undefined;
  }
  
  has(type: string): boolean { return this.patterns.has(type.toLowerCase()); }
  list(): string[] { return Array.from(this.patterns.keys()); }
}

export const patterns = new PatternRegistry();

export function createPattern(type: string): Pattern | undefined {
  return patterns.create(type);
}

export function detectPattern(type: string, candles: Candle[], options?: PatternOptions): PatternResult | undefined {
  const pattern = createPattern(type);
  return pattern ? pattern.detect(candles, options) : undefined;
}
