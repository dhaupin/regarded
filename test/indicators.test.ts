/**
 * Indicators Module Tests
 */

import { describe, it, expect } from 'vitest';
import { RSIIndicator, KDJIndicator, BollingerBandsIndicator, MACDIndicator, indicators, createIndicator, calculateIndicator } from '../lib/indicators';

describe('Indicators', () => {
  // Generate mock candles with deterministic prices for reliable indicator calculation
  const generateCandles = (count: number, startPrice: number = 100): any[] => {
    const candles = [];
    let price = startPrice;
    
    for (let i = 0; i < count; i++) {
      // Use sine wave for predictable price movements
      const change = Math.sin(i / 5) * 2 + 0.5;
      const open = price;
      const close = price + change;
      const high = Math.max(open, close) + Math.abs(Math.random());
      const low = Math.min(open, close) - Math.abs(Math.random());
      
      candles.push({
        timestamp: Date.now() - (count - i) * 60000,
        open, high, low, close,
        volume: Math.random() * 1000,
      });
      
      price = close;
    }
    
    return candles;
  };

  describe('RSI', () => {
    it('should calculate RSI', () => {
      const candles = generateCandles(50, 100);
      const rsi = new RSIIndicator();
      const result = rsi.calculate(candles);
      
      // Just verify it runs without error and returns valid structure
      expect(result).toBeDefined();
      expect(result.value).toBeDefined();
      expect(result.signal).toBeDefined();
      expect(['buy', 'sell', 'neutral']).toContain(result.signal);
    });

    it('should respect custom period', () => {
      const candles = generateCandles(50, 100);
      const rsi = new RSIIndicator({ period: 7 });
      const result = rsi.calculate(candles);
      
      expect(result.metadata?.period).toBe(7);
    });
  });

  describe('KDJ', () => {
    it('should calculate KDJ', () => {
      const candles = generateCandles(20, 100);
      const kdj = new KDJIndicator();
      const result = kdj.calculate(candles);
      
      expect(Array.isArray(result.value)).toBe(true);
      expect(result.value).toHaveLength(3); // K, D, J
      expect(['buy', 'sell', 'neutral']).toContain(result.signal);
    });
  });

  describe('Bollinger Bands', () => {
    it('should calculate Bollinger Bands', () => {
      const candles = generateCandles(50, 100);
      const boll = new BollingerBandsIndicator();
      const result = boll.calculate(candles);
      
      // Just verify it runs without error
      expect(result).toBeDefined();
      expect(Array.isArray(result.value)).toBe(true);
      expect(result.value).toHaveLength(3);
      expect(result.signal).toBeDefined();
    });
  });

  describe('MACD', () => {
    it('should calculate MACD', () => {
      const candles = generateCandles(50, 100);
      const macd = new MACDIndicator();
      const result = macd.calculate(candles);
      
      expect(Array.isArray(result.value)).toBe(true);
      expect(result.value).toHaveLength(3); // macd, signal, histogram
    });
  });

  describe('IndicatorRegistry', () => {
    it('should create indicators by name', () => {
      expect(createIndicator('rsi')).toBeInstanceOf(RSIIndicator);
      expect(createIndicator('kdj')).toBeInstanceOf(KDJIndicator);
      expect(createIndicator('boll')).toBeInstanceOf(BollingerBandsIndicator);
      expect(createIndicator('macd')).toBeInstanceOf(MACDIndicator);
    });

    it('should return undefined for unknown indicator', () => {
      expect(createIndicator('unknown')).toBeUndefined();
    });

    it('should list available indicators', () => {
      const list = indicators.list();
      expect(list).toContain('rsi');
      expect(list).toContain('kdj');
      expect(list).toContain('boll');
      expect(list).toContain('macd');
    });

    it('should calculate indicator by name', () => {
      const candles = generateCandles(50, 100);
      const result = calculateIndicator('rsi', candles);
      
      expect(result).toBeDefined();
      expect(result?.value).toBeDefined();
    });
  });
});
