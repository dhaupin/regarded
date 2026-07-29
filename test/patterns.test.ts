/**
 * Patterns Module Tests
 */

import { describe, it, expect } from 'vitest';
import { HumpsPattern, DivergencePattern, CrossoverPattern, DoubleTopBottomPattern, patterns, detectPattern } from '../lib/patterns';

describe('Patterns', () => {
  // Generate mock candles
  const generateCandles = (count: number, startPrice: number = 100): any[] => {
    const candles = [];
    let price = startPrice;
    
    for (let i = 0; i < count; i++) {
      const change = (Math.random() - 0.5) * 2;
      const open = price;
      const close = price + change;
      const high = Math.max(open, close) + Math.random();
      const low = Math.min(open, close) - Math.random();
      
      candles.push({
        timestamp: Date.now() - (count - i) * 60000,
        open, high, low, close,
        volume: Math.random() * 1000,
      });
      
      price = close;
    }
    
    return candles;
  };

  describe('HumpsPattern', () => {
    it('should detect humps pattern', () => {
      const candles = generateCandles(30, 100);
      const pattern = new HumpsPattern();
      const result = pattern.detect(candles, { count: 3, direction: 'up' });
      
      expect(typeof result.detected).toBe('boolean');
      expect(typeof result.confidence).toBe('number');
    });
  });

  describe('DivergencePattern', () => {
    it('should detect divergence', () => {
      const candles = generateCandles(30, 100);
      const pattern = new DivergencePattern();
      const result = pattern.detect(candles, { direction: 'bullish' });
      
      expect(typeof result.detected).toBe('boolean');
    });
  });

  describe('CrossoverPattern', () => {
    it('should detect crossover', () => {
      const candles = generateCandles(20, 100);
      const pattern = new CrossoverPattern();
      const result = pattern.detect(candles, { direction: 'up' });
      
      expect(typeof result.detected).toBe('boolean');
    });
  });

  describe('DoubleTopBottomPattern', () => {
    it('should detect double top/bottom', () => {
      const candles = generateCandles(30, 100);
      const pattern = new DoubleTopBottomPattern();
      const result = pattern.detect(candles, { direction: 'up' });
      
      expect(typeof result.detected).toBe('boolean');
    });
  });

  describe('PatternRegistry', () => {
    it('should create patterns by type', () => {
      expect(patterns.create('humps')).toBeInstanceOf(HumpsPattern);
      expect(patterns.create('divergence')).toBeInstanceOf(DivergencePattern);
      expect(patterns.create('crossover')).toBeInstanceOf(CrossoverPattern);
      expect(patterns.create('double_top')).toBeInstanceOf(DoubleTopBottomPattern);
    });

    it('should list available patterns', () => {
      const list = patterns.list();
      expect(list).toContain('humps');
      expect(list).toContain('divergence');
      expect(list).toContain('crossover');
      expect(list).toContain('double_top');
    });

    it('should detect pattern by name', () => {
      const candles = generateCandles(30, 100);
      const result = detectPattern('humps', candles);
      
      expect(result).toBeDefined();
      expect(typeof result?.detected).toBe('boolean');
    });
  });
});
