/**
 * Guard Module Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Guard, createGuard, GuardReasonCode, type GuardConfig, type GuardResult } from '../lib/guard';

describe('Guard', () => {
  let guard: Guard;

  beforeEach(() => {
    guard = new Guard({
      maxPositions: 3,
      maxDailyLoss: 1000,
      maxDailyTrades: 10,
      warmupTicks: 5,
    });
  });

  describe('checkNewPosition', () => {
    it('should allow position when all checks pass', () => {
      // Warm up first
      for (let i = 0; i < 5; i++) guard.tick();
      
      const result = guard.checkNewPosition(0, 10000, 0);
      expect(result.allowed).toBe(true);
      expect(result.reasonCode).toBe(GuardReasonCode.OK);
    });

    it('should block when emergency stop is active', () => {
      guard.setEmergencyStop(true);
      
      const result = guard.checkNewPosition(0, 10000, 0);
      expect(result.allowed).toBe(false);
      expect(result.reasonCode).toBe(GuardReasonCode.EMERGENCY_STOP);
    });

    it('should block during warmup period', () => {
      guard.tick(); // Only 1 tick
      
      const result = guard.checkNewPosition(0, 10000, 0);
      expect(result.allowed).toBe(false);
      expect(result.reasonCode).toBe(GuardReasonCode.WARMUP);
      expect(result.reason).toContain('Warmup');
    });

    it('should block when max positions reached', () => {
      for (let i = 0; i < 5; i++) guard.tick();
      
      const result = guard.checkNewPosition(3, 10000, 0);
      expect(result.allowed).toBe(false);
      expect(result.reasonCode).toBe(GuardReasonCode.MAX_POSITIONS);
      expect(result.reason).toContain('Max positions');
    });

    it('should block when daily trade limit reached', () => {
      // Warm up first - must be done BEFORE recording trades for this test
      for (let i = 0; i < 5; i++) guard.tick();
      
      // Verify warmup complete
      expect(guard.getTickCount()).toBe(5);
      
      // Record 10 trades to hit limit (maxDailyTrades = 10)
      for (let i = 0; i < 10; i++) guard.recordTrade();
      
      // Now check should fail
      const result = guard.checkNewPosition(0, 10000, 0);
      expect(result.allowed).toBe(false);
      expect(result.reasonCode).toBe(GuardReasonCode.MAX_DAILY_TRADES);
    });

    it('should block when daily loss limit exceeded', () => {
      for (let i = 0; i < 5; i++) guard.tick();
      
      const result = guard.checkNewPosition(0, 10000, -1000);
      expect(result.allowed).toBe(false);
      expect(result.reasonCode).toBe(GuardReasonCode.MAX_DAILY_LOSS);
    });

    it('should block when max drawdown exceeded', () => {
      for (let i = 0; i < 5; i++) guard.tick();
      
      // Set peak to 10000, current at 7500 (25% drawdown > 20% limit)
      guard.updateDrawdown(10000);
      guard.updateDrawdown(7500);
      
      const result = guard.checkNewPosition(0, 7500, 0);
      expect(result.allowed).toBe(false);
      expect(result.reasonCode).toBe(GuardReasonCode.MAX_DRAWDOWN);
    });

    it('should emit guard:blocked event when blocked', () => {
      const handler = vi.fn();
      guard.on('guard:blocked', handler);
      
      guard.tick();
      const result = guard.checkNewPosition(0, 10000, 0);
      
      expect(handler).toHaveBeenCalled();
      expect(handler.mock.calls[0][0].result).toBe(result);
    });

    it('should emit guard:passed event when allowed', () => {
      const handler = vi.fn();
      guard.on('guard:passed', handler);
      
      // Warm up
      for (let i = 0; i < 5; i++) guard.tick();
      
      const result = guard.checkNewPosition(0, 10000, 0);
      
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('drawdown tracking', () => {
    it('should track drawdown correctly', () => {
      guard.updateDrawdown(10000);
      guard.updateDrawdown(9000);
      
      expect(guard.getCurrentDrawdown()).toBe(10);
    });

    it('should update peak value on new highs', () => {
      guard.updateDrawdown(10000);
      guard.updateDrawdown(9000);
      guard.updateDrawdown(11000);
      
      expect(guard.getCurrentDrawdown()).toBe(0);
    });

    it('should reset drawdown', () => {
      guard.updateDrawdown(10000);
      guard.updateDrawdown(8000);
      
      guard.resetDrawdown();
      
      expect(guard.getCurrentDrawdown()).toBe(0);
    });
  });

  describe('price staleness', () => {
    it('should allow fresh prices', () => {
      const result = guard.checkPriceStaleness('BTC/USD', Date.now());
      expect(result.allowed).toBe(true);
    });

    it('should block stale prices', () => {
      const staleTime = Date.now() - 120000; // 2 minutes old
      const result = guard.checkPriceStaleness('BTC/USD', staleTime);
      expect(result.allowed).toBe(false);
      expect(result.reasonCode).toBe(GuardReasonCode.PRICE_STALE);
    });

    it('should record price updates', () => {
      const timestamp = Date.now();
      guard.recordPriceUpdate('BTC/USD', timestamp);
      
      const result = guard.checkPriceStaleness('BTC/USD', timestamp);
      expect(result.allowed).toBe(true);
    });
  });

  describe('stop loss check', () => {
    it('should trigger stop loss when threshold exceeded', () => {
      const position = {
        id: '1',
        symbol: 'BTC/USD',
        side: 'long' as const,
        entryPrice: 50000,
        amount: 1,
        pnlPercent: -3, // -3% < -2% stop loss
        openedAt: Date.now(),
      };
      
      const result = guard.checkStopLoss(position);
      expect(result.allowed).toBe(false);
      expect(result.reasonCode).toBe(GuardReasonCode.STOP_LOSS);
    });

    it('should allow position when stop loss not triggered', () => {
      const position = {
        id: '1',
        symbol: 'BTC/USD',
        side: 'long' as const,
        entryPrice: 50000,
        amount: 1,
        pnlPercent: -1, // -1% > -2% stop loss
        openedAt: Date.now(),
      };
      
      const result = guard.checkStopLoss(position);
      expect(result.allowed).toBe(true);
    });
  });

  describe('take profit check', () => {
    it('should trigger take profit when threshold exceeded', () => {
      const position = {
        id: '1',
        symbol: 'BTC/USD',
        side: 'long' as const,
        entryPrice: 50000,
        amount: 1,
        pnlPercent: 6, // 6% > 5% take profit
        openedAt: Date.now(),
      };
      
      const result = guard.checkTakeProfit(position);
      expect(result.allowed).toBe(false);
      expect(result.reasonCode).toBe(GuardReasonCode.TAKE_PROFIT);
    });

    it('should allow position when take profit not triggered', () => {
      const position = {
        id: '1',
        symbol: 'BTC/USD',
        side: 'long' as const,
        entryPrice: 50000,
        amount: 1,
        pnlPercent: 3, // 3% < 5% take profit
        openedAt: Date.now(),
      };
      
      const result = guard.checkTakeProfit(position);
      expect(result.allowed).toBe(true);
    });
  });

  describe('slippage check', () => {
    it('should block when slippage exceeds limit', () => {
      const result = guard.checkSlippage(100, 102.5); // 2.5% slippage > 1%
      expect(result.allowed).toBe(false);
      expect(result.reasonCode).toBe(GuardReasonCode.SLIPPAGE);
    });

    it('should allow when slippage is acceptable', () => {
      const result = guard.checkSlippage(100, 100.5); // 0.5% slippage < 1%
      expect(result.allowed).toBe(true);
    });
  });

  describe('position concentration', () => {
    it('should block when concentration too high', () => {
      const result = guard.checkPositionConcentration(4000, 10000); // 40% > 30%
      expect(result.allowed).toBe(false);
      expect(result.reasonCode).toBe(GuardReasonCode.CONCENTRATION);
    });

    it('should allow reasonable concentration', () => {
      const result = guard.checkPositionConcentration(2000, 10000); // 20% < 30%
      expect(result.allowed).toBe(true);
    });

    it('should allow when portfolio value is zero', () => {
      const result = guard.checkPositionConcentration(1000, 0);
      expect(result.allowed).toBe(true);
    });
  });

  describe('leverage check', () => {
    it('should block excessive leverage', () => {
      const result = guard.checkLeverage(3); // 3x > 1x
      expect(result.allowed).toBe(false);
      expect(result.reasonCode).toBe(GuardReasonCode.LEVERAGE);
    });

    it('should allow within limit', () => {
      const result = guard.checkLeverage(1);
      expect(result.allowed).toBe(true);
    });
  });

  describe('volatility check', () => {
    it('should block low volatility when configured', () => {
      const g = createGuard({ minVolatilityPercent: 2 });
      const result = g.checkVolatility(1); // 1% < 2%
      expect(result.allowed).toBe(false);
      expect(result.reasonCode).toBe(GuardReasonCode.LOW_VOLATILITY);
    });

    it('should block high volatility when configured', () => {
      const g = createGuard({ maxVolatilityPercent: 10 });
      const result = g.checkVolatility(15); // 15% > 10%
      expect(result.allowed).toBe(false);
      expect(result.reasonCode).toBe(GuardReasonCode.HIGH_VOLATILITY);
    });

    it('should allow normal volatility', () => {
      const g = createGuard({ minVolatilityPercent: 2, maxVolatilityPercent: 10 });
      const result = g.checkVolatility(5);
      expect(result.allowed).toBe(true);
    });
  });

  describe('reserve balance check', () => {
    it('should block when balance below reserve', () => {
      const g = createGuard({ minReserveBalance: 1000 });
      const result = g.checkReserveBalance(500);
      expect(result.allowed).toBe(false);
      expect(result.reasonCode).toBe(GuardReasonCode.RESERVE_BALANCE);
    });

    it('should allow when balance sufficient', () => {
      const g = createGuard({ minReserveBalance: 1000 });
      const result = g.checkReserveBalance(1500);
      expect(result.allowed).toBe(true);
    });
  });

  describe('signal confidence check', () => {
    it('should block low confidence signals', () => {
      const result = guard.checkSignalConfidence(30); // < 50%
      expect(result.allowed).toBe(false);
      expect(result.reasonCode).toBe(GuardReasonCode.LOW_CONFIDENCE);
    });

    it('should allow high confidence signals', () => {
      const result = guard.checkSignalConfidence(70);
      expect(result.allowed).toBe(true);
    });
  });

  describe('circuit breaker', () => {
    it('should track circuit state', () => {
      expect(guard.isCircuitOpen()).toBe(false);
      
      guard.openCircuit();
      expect(guard.isCircuitOpen()).toBe(true);
      
      guard.closeCircuit();
      expect(guard.isCircuitOpen()).toBe(false);
    });

    it('should emit circuit events', () => {
      const openHandler = vi.fn();
      const closeHandler = vi.fn();
      
      guard.on('circuit:opened', openHandler);
      guard.on('circuit:closed', closeHandler);
      
      guard.openCircuit();
      expect(openHandler).toHaveBeenCalledTimes(1);
      
      guard.closeCircuit();
      expect(closeHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('API rate limiting', () => {
    it('should track API calls', () => {
      guard.recordAPICall();
      guard.recordAPICall();
      
      const result = guard.checkAPIRateLimit();
      expect(result.allowed).toBe(true);
    });

    it('should block when rate limit exceeded', () => {
      const g = createGuard({ maxAPICallsPerMinute: 2 });
      
      g.recordAPICall();
      g.recordAPICall();
      
      const result = g.checkAPIRateLimit();
      expect(result.allowed).toBe(false);
      expect(result.reasonCode).toBe(GuardReasonCode.API_RATE_LIMIT);
    });
  });

  describe('position size calculation', () => {
    it('should calculate position size based on risk', () => {
      // Risk: 2% of 10000 = $200
      // Stop loss: 2% of price 50000 = $1000
      // Position size = 200 / 1000 = 0.2
      const size = guard.calculatePositionSize(10000, 50000);
      expect(size).toBe(0.2);
    });
  });

  describe('retry logic', () => {
    it('should allow retry within limit', () => {
      expect(guard.shouldRetry(1)).toBe(true);
      expect(guard.shouldRetry(2)).toBe(true);
    });

    it('should block retry after limit', () => {
      expect(guard.shouldRetry(3)).toBe(false);
    });

    it('should get order timeout', () => {
      expect(guard.getOrderTimeout()).toBe(30000);
    });

    it('should check partial fills', () => {
      expect(guard.isPartialFillsEnabled()).toBe(true);
    });
  });

  describe('correlation check', () => {
    it('should allow uncorrelated positions', () => {
      const result = guard.checkCorrelation(['BTC/USD', 'ETH/USD'], 'SOL/USD');
      expect(result.allowed).toBe(true);
    });

    it('should block highly correlated positions', () => {
      const g = createGuard({ maxCorrelation: 0.3 });
      const result = g.checkCorrelation(['BTC/USD', 'BTC/EUR'], 'BTC/GBP');
      expect(result.allowed).toBe(false);
      expect(result.reasonCode).toBe(GuardReasonCode.CORRELATION);
    });
  });

  describe('news blackout', () => {
    it('should allow when no blackout', () => {
      const result = guard.checkNewsBlackout();
      expect(result.allowed).toBe(true);
    });

    it('should block during news blackout', () => {
      const g = createGuard({
        newsBlackout: true,
        newsBlackoutPeriods: [
          { start: Date.now() - 3600000, end: Date.now() + 3600000, reason: 'Test' }
        ]
      });
      
      const result = g.checkNewsBlackout();
      expect(result.allowed).toBe(false);
      expect(result.reasonCode).toBe(GuardReasonCode.NEWS_BLACKOUT);
    });
  });

  describe('createGuard factory', () => {
    it('should create guard with config', () => {
      const g = createGuard({ maxPositions: 10, maxDailyLoss: 5000 });
      const config = g.getConfig();
      
      expect(config.maxPositions).toBe(10);
      expect(config.maxDailyLoss).toBe(5000);
    });
  });

  describe('daily reset', () => {
    it('should track daily trades', () => {
      guard.recordTrade();
      guard.recordTrade();
      guard.recordTrade();
      
      // Manually invoke check to trigger reset check
      guard.checkNewPosition(0, 10000, 0);
    });
  });
});
