/**
 * Backtest Module Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BacktestValidator, createBacktestValidator } from '../lib/backtest';

describe('BacktestValidator', () => {
  let validator: BacktestValidator;

  beforeEach(() => {
    validator = createBacktestValidator({
      minPeriods: 100,
      minWinRate: 0.4,
      maxDrawdown: 0.25,
      minProfitFactor: 1.2,
      maxConsecutiveLosses: 5,
    });
  });

  describe('constructor', () => {
    it('should use default config', () => {
      const v = createBacktestValidator();
      expect(v).toBeDefined();
    });

    it('should accept custom config', () => {
      const v = createBacktestValidator({
        minWinRate: 0.5,
        maxDrawdown: 0.1,
      });
      expect(v).toBeDefined();
    });
  });

  describe('validateDataAvailability', () => {
    it('should return available true when enough data', async () => {
      const mockConnector = {
        getCandles: vi.fn().mockResolvedValue(
          Array.from({ length: 150 }, (_, i) => ({
            timestamp: Date.now() - i * 60000,
            open: 100,
            high: 105,
            low: 95,
            close: 102,
            volume: 1000,
          }))
        ),
      };

      const result = await validator.validateDataAvailability(
        mockConnector as any,
        'BTC/USD',
        '1m'
      );

      expect(result.available).toBe(true);
      expect(result.periods).toBe(150);
    });

    it('should return available false when insufficient data', async () => {
      const mockConnector = {
        getCandles: vi.fn().mockResolvedValue(
          Array.from({ length: 50 }, (_, i) => ({
            timestamp: Date.now() - i * 60000,
            open: 100,
            high: 105,
            low: 95,
            close: 102,
            volume: 1000,
          }))
        ),
      };

      const result = await validator.validateDataAvailability(
        mockConnector as any,
        'BTC/USD',
        '1m'
      );

      expect(result.available).toBe(false);
      expect(result.periods).toBe(50);
    });

    it('should handle errors', async () => {
      const mockConnector = {
        getCandles: vi.fn().mockRejectedValue(new Error('Network error')),
      };

      const result = await validator.validateDataAvailability(
        mockConnector as any,
        'BTC/USD',
        '1m'
      );

      expect(result.available).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('runBacktest', () => {
    it('should return error when insufficient data', async () => {
      const mockConnector = {
        getCandles: vi.fn().mockResolvedValue(
          Array.from({ length: 50 }, (_, i) => ({
            timestamp: Date.now() - i * 60000,
            open: 100,
            high: 105,
            low: 95,
            close: 102,
            volume: 1000,
          }))
        ),
      };

      const mockStrategy = {
        analyze: vi.fn().mockResolvedValue({ signal: 'hold', strength: 0.5, reason: 'test' }),
      };

      const result = await validator.runBacktest(
        mockConnector as any,
        'BTC/USD',
        '1m',
        mockStrategy as any
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Insufficient data: 50 < 100 periods');
    });

    it('should run backtest with valid data', async () => {
      const mockConnector = {
        getCandles: vi.fn().mockResolvedValue(
          Array.from({ length: 200 }, (_, i) => ({
            timestamp: Date.now() - i * 60000,
            open: 100 + i,
            high: 105 + i,
            low: 95 + i,
            close: 102 + i,
            volume: 1000,
          }))
        ),
      };

      const mockStrategy = {
        analyze: vi.fn()
          .mockResolvedValueOnce({ signal: 'buy', strength: 0.7, reason: 'test' })
          .mockResolvedValueOnce({ signal: 'sell', strength: 0.7, reason: 'test' })
          .mockResolvedValue({ signal: 'hold', strength: 0.7, reason: 'test' }),
      };

      const result = await validator.runBacktest(
        mockConnector as any,
        'BTC/USD',
        '1m',
        mockStrategy as any
      );

      expect(result.errors).toBeDefined();
      // May or may not have trades depending on signal generation
    });
  });
});
