/**
 * Technical Indicators
 * 
 * RSI, KDJ, Bollinger Bands, MACD with registry.
 */

import type { Indicator, IndicatorResult, IndicatorSignal, Candle } from './types';

export abstract class BaseIndicator implements Indicator {
  abstract name: string;
  abstract version: string;
  abstract defaultParams: Record<string, number>;
  params: Record<string, number>;
  
  constructor(params: Record<string, number> = {}) {
    const defaults = (this.constructor as any).defaultParams || {};
    this.params = { ...defaults, ...params };
  }
  
  abstract calculate(candles: Candle[]): IndicatorResult;
  validateParams(params: Record<string, number>): boolean {
    return Object.keys(params).every(k => k in this.defaultParams);
  }
  
  protected getValues(candles: Candle[], field: keyof Candle = 'close'): number[] {
    return candles.map(c => c[field] as number);
  }
}

/**
 * RSI Indicator
 */
export class RSIIndicator extends BaseIndicator {
  name = 'rsi';
  version = '1.0.0';
  defaultParams = { period: 14, overbought: 70, oversold: 30 };
  
  calculate(candles: Candle[]): IndicatorResult {
    const { period, overbought, oversold } = this.params;
    const closes = this.getValues(candles);
    
    if (closes.length < period + 1) return { value: 50, signal: 'neutral' };
    
    const changes = closes.slice(1).map((c, i) => c - closes[i]);
    const gains = changes.map(c => c > 0 ? c : 0);
    const losses = changes.map(c => c < 0 ? -c : 0);
    
    let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
    
    for (let i = period; i < gains.length; i++) {
      avgGain = (avgGain * (period - 1) + gains[i]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    }
    
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));
    
    let signal: IndicatorSignal = 'neutral';
    if (rsi < oversold) signal = 'buy';
    else if (rsi > overbought) signal = 'sell';
    
    return { value: rsi, signal, metadata: { period, overbought, oversold } };
  }
}

/**
 * KDJ Indicator
 */
export class KDJIndicator extends BaseIndicator {
  name = 'kdj';
  version = '1.0.0';
  defaultParams = { n: 9, m1: 3, m2: 3 };
  
  calculate(candles: Candle[]): IndicatorResult {
    const { n, m1, m2 } = this.params;
    const highs = this.getValues(candles, 'high');
    const lows = this.getValues(candles, 'low');
    const closes = this.getValues(candles, 'close');
    
    if (closes.length < n) return { value: [50, 50, 50], signal: 'neutral' };
    
    const kValues: number[] = [];
    const dValues: number[] = [];
    
    for (let i = n - 1; i < closes.length; i++) {
      const periodHighs = highs.slice(i - n + 1, i + 1);
      const periodLows = lows.slice(i - n + 1, i + 1);
      const highest = Math.max(...periodHighs);
      const lowest = Math.min(...periodLows);
      const rsv = highest === lowest ? 50 : ((closes[i] - lowest) / (highest - lowest)) * 100;
      
      const k = kValues.length > 0 ? (kValues[kValues.length - 1] * (m1 - 1) + rsv) / m1 : 50;
      const d = dValues.length > 0 ? (dValues[dValues.length - 1] * (m2 - 1) + k) / m2 : k;
      
      kValues.push(k);
      dValues.push(d);
    }
    
    const k = kValues[kValues.length - 1];
    const d = dValues[dValues.length - 1];
    const j = 3 * k - 2 * d;
    
    return { value: [k, d, j], signal: k < 20 ? 'buy' : (k > 80 ? 'sell' : 'neutral') };
  }
}

/**
 * Bollinger Bands
 */
export class BollingerBandsIndicator extends BaseIndicator {
  name = 'boll';
  version = '1.0.0';
  defaultParams = { period: 20, stdDev: 2 };
  
  calculate(candles: Candle[]): IndicatorResult {
    const { period, stdDev } = this.params;
    const closes = this.getValues(candles);
    
    if (closes.length < period) return { value: [0, 0, 0], signal: 'neutral' };
    
    const recent = closes.slice(-period);
    const sma = recent.reduce((a, b) => a + b, 0) / period;
    const variance = recent.map(v => Math.pow(v - sma, 2)).reduce((a, b) => a + b, 0) / period;
    const sd = Math.sqrt(variance);
    
    const upper = sma + stdDev * sd;
    const lower = sma - stdDev * sd;
    const current = closes[closes.length - 1];
    
    return {
      value: [upper, sma, lower],
      signal: current < lower ? 'buy' : (current > upper ? 'sell' : 'neutral'),
      metadata: { upper, middle: sma, lower },
    };
  }
}

/**
 * MACD Indicator
 */
export class MACDIndicator extends BaseIndicator {
  name = 'macd';
  version = '1.0.0';
  defaultParams = { fast: 12, slow: 26, signal: 9 };
  
  calculate(candles: Candle[]): IndicatorResult {
    const { fast, slow, signal: signalPeriod } = this.params;
    const closes = this.getValues(candles);
    
    if (closes.length < slow + signalPeriod) return { value: [0, 0, 0], signal: 'neutral' };
    
    const ema = (data: number[], period: number) => {
      const mult = 2 / (period + 1);
      const result: number[] = [data.slice(0, period).reduce((a, b) => a + b, 0) / period];
      for (let i = period; i < data.length; i++) {
        result.push((data[i] - result[result.length - 1]) * mult + result[result.length - 1]);
      }
      return result;
    };
    
    const emaFast = ema(closes, fast);
    const emaSlow = ema(closes, slow);
    const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
    const signalLine = ema(macdLine, signalPeriod);
    
    const macd = macdLine[macdLine.length - 1];
    const sig = signalLine[signalLine.length - 1];
    const histogram = macd - sig;
    
    return {
      value: [macd, sig, histogram],
      signal: histogram > 0 && macd > sig ? 'buy' : (histogram < 0 && macd < sig ? 'sell' : 'neutral'),
      metadata: { macd, signal: sig, histogram },
    };
  }
}

/**
 * Stochastic Oscillator
 */
export class StochasticIndicator extends BaseIndicator {
  name = 'stochastic';
  version = '1.0.0';
  defaultParams = { k_period: 14, d_period: 3, overbought: 80, oversold: 20 };
  
  calculate(candles: Candle[]): IndicatorResult {
    const { k_period, d_period, overbought, oversold } = this.params;
    
    if (candles.length < k_period + d_period) {
      return { value: [50, 50], signal: 'neutral' };
    }
    
    const kValues: number[] = [];
    
    for (let i = k_period - 1; i < candles.length; i++) {
      const slice = candles.slice(i - k_period + 1, i + 1);
      const high = Math.max(...slice.map(c => c.high));
      const low = Math.min(...slice.map(c => c.low));
      const close = candles[i].close;
      
      if (high === low) {
        kValues.push(50);
      } else {
        kValues.push(((close - low) / (high - low)) * 100);
      }
    }
    
    // Calculate %D (smoothed %K)
    const dValues: number[] = [];
    for (let i = d_period - 1; i < kValues.length; i++) {
      const slice = kValues.slice(i - d_period + 1, i + 1);
      dValues.push(slice.reduce((a, b) => a + b, 0) / d_period);
    }
    
    const k = kValues[kValues.length - 1];
    const d = dValues[dValues.length - 1];
    
    let signal: IndicatorSignal = 'neutral';
    if (k < oversold && d < oversold) signal = 'buy';
    else if (k > overbought && d > overbought) signal = 'sell';
    
    return {
      value: [k, d],
      signal,
      metadata: { k, d, overbought, oversold },
    };
  }
}

/**
 * Average True Range (ATR)
 */
export class ATRIndicator extends BaseIndicator {
  name = 'atr';
  version = '1.0.0';
  defaultParams = { period: 14 };
  
  calculate(candles: Candle[]): IndicatorResult {
    const { period } = this.params;
    
    if (candles.length < period + 1) {
      return { value: 0, signal: 'neutral', metadata: { atr: 0, period } };
    }
    
    const trueRanges: number[] = [];
    
    for (let i = 1; i < candles.length; i++) {
      const high = candles[i].high;
      const low = candles[i].low;
      const prevClose = candles[i - 1].close;
      
      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      trueRanges.push(tr);
    }
    
    if (trueRanges.length < period) {
      return { value: 0, signal: 'neutral', metadata: { atr: 0, period } };
    }
    
    // Calculate ATR using Wilder's smoothing
    const atr: number[] = [];
    let sum = trueRanges.slice(0, period).reduce((a, b) => a + b, 0);
    atr.push(sum / period);
    
    for (let i = period; i < trueRanges.length; i++) {
      const value = (atr[atr.length - 1] * (period - 1) + trueRanges[i]) / period;
      atr.push(value);
    }
    
    const value = atr[atr.length - 1];
    
    return {
      value: isNaN(value) ? 0 : value,
      signal: 'neutral',
      metadata: { atr: isNaN(value) ? 0 : value, period },
    };
  }
}

/**
 * Exponential Moving Average (EMA)
 */
export class EMAIndicator extends BaseIndicator {
  name = 'ema';
  version = '1.0.0';
  defaultParams = { period: 20 };
  
  calculate(candles: Candle[]): IndicatorResult {
    const { period } = this.params;
    const closes = this.getValues(candles);
    
    if (closes.length < period) {
      return { value: 0, signal: 'neutral', metadata: { ema: 0, period } };
    }
    
    const mult = 2 / (period + 1);
    let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
    
    for (let i = period; i < closes.length; ema = (closes[i] - ema) * mult + ema, i++);
    
    if (isNaN(ema)) {
      return { value: 0, signal: 'neutral', metadata: { ema: 0, period } };
    }
    
    const currentPrice = closes[closes.length - 1];
    const signal = currentPrice > ema ? 'buy' : 'sell';
    
    return {
      value: ema,
      signal,
      metadata: { ema, period },
    };
  }
}

/**
 * Volume Weighted Average Price (VWAP)
 */
export class VWAPIndicator extends BaseIndicator {
  name = 'vwap';
  version = '1.0.0';
  defaultParams = { period: 20 };
  
  calculate(candles: Candle[]): IndicatorResult {
    const { period } = this.params;
    const lookback = Math.min(period, candles.length);
    const recentCandles = candles.slice(-lookback);
    
    let cumulativeTPV = 0; // Typical Price * Volume
    let cumulativeVolume = 0;
    
    for (const candle of recentCandles) {
      const typicalPrice = (candle.high + candle.low + candle.close) / 3;
      const volume = candle.volume || 1;
      cumulativeTPV += typicalPrice * volume;
      cumulativeVolume += volume;
    }
    
    const vwap = cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : 0;
    
    const currentPrice = candles[candles.length - 1].close;
    const signal = currentPrice > vwap ? 'buy' : 'sell';
    
    return {
      value: vwap,
      signal,
      metadata: { vwap, period },
    };
  }
}

/**
 * Indicator Registry
 */
export class IndicatorRegistry {
  private indicators = new Map<string, new () => BaseIndicator>();
  
  constructor() {
    this.register('rsi', RSIIndicator);
    this.register('kdj', KDJIndicator);
    this.register('boll', BollingerBandsIndicator);
    this.register('macd', MACDIndicator);
    this.register('stochastic', StochasticIndicator);
    this.register('atr', ATRIndicator);
    this.register('ema', EMAIndicator);
    this.register('vwap', VWAPIndicator);
  }
  
  register(name: string, cls: new () => BaseIndicator): void {
    this.indicators.set(name.toLowerCase(), cls);
  }
  
  create(name: string): Indicator | undefined {
    const cls = this.indicators.get(name.toLowerCase());
    return cls ? new cls() : undefined;
  }
  
  has(name: string): boolean {
    return this.indicators.has(name.toLowerCase());
  }
  
  list(): string[] {
    return Array.from(this.indicators.keys());
  }
}

export const indicators = new IndicatorRegistry();

export function createIndicator(name: string): Indicator | undefined {
  return indicators.create(name);
}

export function calculateIndicator(name: string, candles: Candle[], params?: Record<string, number>): IndicatorResult | undefined {
  const indicator = createIndicator(name);
  if (!indicator) return undefined;
  const baseIndicator = indicator as any;
  if (params) indicator.params = { ...baseIndicator.defaultParams, ...params };
  return indicator.calculate(candles);
}
