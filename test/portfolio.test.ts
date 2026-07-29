/**
 * Portfolio Module Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Portfolio, createPortfolio, type Position } from '../lib/portfolio';

describe('Portfolio', () => {
  let portfolio: Portfolio;

  beforeEach(() => {
    portfolio = new Portfolio({
      maxPositions: 3,
      maxPositionSize: 10000,
      maxDailyLoss: 1000,
      maxDailyTrades: 10,
    });
  });

  describe('openPosition', () => {
    it('should open a long position', async () => {
      const result = await portfolio.openPosition({
        id: 'pos-1',
        symbol: 'BTC/USD',
        side: 'long',
        entryPrice: 50000,
        amount: 0.1,
      });

      expect(result.success).toBe(true);
      expect(result.position).toBeDefined();
      expect(result.position!.symbol).toBe('BTC/USD');
      expect(result.position!.side).toBe('long');
      expect(result.position!.entryPrice).toBe(50000);
      expect(result.position!.amount).toBe(0.1);
    });

    it('should open a short position', async () => {
      const result = await portfolio.openPosition({
        id: 'pos-1',
        symbol: 'SOL/USD',
        side: 'short',
        entryPrice: 100,
        amount: 10,
      });

      expect(result.success).toBe(true);
      expect(result.position!.side).toBe('short');
    });

    it('should reject when max positions reached', async () => {
      await portfolio.openPosition({ id: '1', symbol: 'A', side: 'long', entryPrice: 100, amount: 1 });
      await portfolio.openPosition({ id: '2', symbol: 'B', side: 'long', entryPrice: 100, amount: 1 });
      await portfolio.openPosition({ id: '3', symbol: 'C', side: 'long', entryPrice: 100, amount: 1 });

      const result = await portfolio.openPosition({
        id: '4',
        symbol: 'D',
        side: 'long',
        entryPrice: 100,
        amount: 1,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Max positions');
    });

    it('should reject when position size exceeds limit', async () => {
      const result = await portfolio.openPosition({
        id: 'pos-1',
        symbol: 'BTC/USD',
        side: 'long',
        entryPrice: 50000,
        amount: 1, // $50k > $10k limit
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('exceeds max');
    });

    it('should respect stop loss and take profit', async () => {
      const result = await portfolio.openPosition({
        id: 'pos-1',
        symbol: 'BTC/USD',
        side: 'long',
        entryPrice: 50000,
        amount: 0.1,
        stopLoss: 45000,
        takeProfit: 55000,
      });

      expect(result.success).toBe(true);
      expect(result.position!.stopLoss).toBe(45000);
      expect(result.position!.takeProfit).toBe(55000);
    });
  });

  describe('closePosition', () => {
    it('should close position and calculate profit', async () => {
      await portfolio.openPosition({
        id: 'pos-1',
        symbol: 'BTC/USD',
        side: 'long',
        entryPrice: 50000,
        amount: 0.1,
      });

      const result = await portfolio.closePosition('BTC/USD', 55000, 'Take profit');

      expect(result.success).toBe(true);
      expect(result.pnl).toBe(500); // (55000 - 50000) * 0.1 = 500
      expect(result.position!.closedAt).toBeDefined();
    });

    it('should calculate profit for short position', async () => {
      await portfolio.openPosition({
        id: 'pos-1',
        symbol: 'BTC/USD',
        side: 'short',
        entryPrice: 50000,
        amount: 0.1,
      });

      const result = await portfolio.closePosition('BTC/USD', 45000, 'Buy to cover');

      expect(result.success).toBe(true);
      expect(result.pnl).toBe(500); // (50000 - 45000) * 0.1 = 500
    });

    it('should calculate loss for long position', async () => {
      await portfolio.openPosition({
        id: 'pos-1',
        symbol: 'BTC/USD',
        side: 'long',
        entryPrice: 50000,
        amount: 0.1,
      });

      const result = await portfolio.closePosition('BTC/USD', 45000, 'Stop loss');

      expect(result.success).toBe(true);
      expect(result.pnl).toBe(-500);
    });

    it('should return error for non-existent position', async () => {
      const result = await portfolio.closePosition('NONEXISTENT', 50000);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No open position');
    });
  });

  describe('updatePosition', () => {
    it('should update stop loss', async () => {
      await portfolio.openPosition({
        id: 'pos-1',
        symbol: 'BTC/USD',
        side: 'long',
        entryPrice: 50000,
        amount: 0.1,
      });

      const updated = portfolio.updatePosition('BTC/USD', {
        stopLoss: 48000,
      });

      expect(updated).toBe(true);
      const position = portfolio.getPosition('BTC/USD');
      expect(position!.stopLoss).toBe(48000);
    });

    it('should return false for non-existent position', async () => {
      const updated = portfolio.updatePosition('NONEXISTENT', { stopLoss: 48000 });
      expect(updated).toBe(false);
    });
  });

  describe('updatePrices', () => {
    it('should update current prices and unrealized P&L', async () => {
      await portfolio.openPosition({
        id: 'pos-1',
        symbol: 'BTC/USD',
        side: 'long',
        entryPrice: 50000,
        amount: 0.1,
      });

      portfolio.updatePrices(new Map([['BTC/USD', 55000]]));

      const position = portfolio.getPosition('BTC/USD');
      expect(position!.currentPrice).toBe(55000);
      expect(position!.unrealizedPnl).toBe(500);
    });

    it('should calculate unrealized P&L for short', async () => {
      await portfolio.openPosition({
        id: 'pos-1',
        symbol: 'BTC/USD',
        side: 'short',
        entryPrice: 50000,
        amount: 0.1,
      });

      portfolio.updatePrices(new Map([['BTC/USD', 45000]]));

      const position = portfolio.getPosition('BTC/USD');
      expect(position!.unrealizedPnl).toBe(500);
    });
  });

  describe('queries', () => {
    it('should get position by symbol', async () => {
      await portfolio.openPosition({
        id: 'pos-1',
        symbol: 'BTC/USD',
        side: 'long',
        entryPrice: 50000,
        amount: 0.1,
      });

      const position = portfolio.getPosition('BTC/USD');
      expect(position).toBeDefined();
      expect(position!.id).toBe('pos-1');
    });

    it('should return undefined for missing position', () => {
      expect(portfolio.getPosition('NONEXISTENT')).toBeUndefined();
    });

    it('should get all positions', async () => {
      await portfolio.openPosition({ id: '1', symbol: 'A', side: 'long', entryPrice: 100, amount: 1 });
      await portfolio.openPosition({ id: '2', symbol: 'B', side: 'long', entryPrice: 100, amount: 1 });

      const positions = portfolio.getAllPositions();
      expect(positions).toHaveLength(2);
    });

    it('should check position existence', async () => {
      await portfolio.openPosition({ id: '1', symbol: 'BTC/USD', side: 'long', entryPrice: 100, amount: 1 });

      expect(portfolio.hasPosition('BTC/USD')).toBe(true);
      expect(portfolio.hasPosition('NONEXISTENT')).toBe(false);
    });
  });

  describe('P&L calculations', () => {
    it('should track unrealized P&L', async () => {
      await portfolio.openPosition({
        id: 'pos-1',
        symbol: 'BTC/USD',
        side: 'long',
        entryPrice: 50000,
        amount: 0.1,
      });

      portfolio.updatePrices(new Map([['BTC/USD', 55000]]));

      expect(portfolio.getUnrealizedPnl()).toBe(500);
    });

    it('should track realized P&L', async () => {
      await portfolio.openPosition({
        id: 'pos-1',
        symbol: 'BTC/USD',
        side: 'long',
        entryPrice: 50000,
        amount: 0.1,
      });

      await portfolio.closePosition('BTC/USD', 55000);

      expect(portfolio.getRealizedPnl()).toBe(500);
    });

    it('should track daily P&L', async () => {
      await portfolio.openPosition({ id: '1', symbol: 'A', side: 'long', entryPrice: 100, amount: 1 });
      await portfolio.closePosition('A', 110); // +10

      await portfolio.openPosition({ id: '2', symbol: 'B', side: 'long', entryPrice: 100, amount: 1 });
      await portfolio.closePosition('B', 90); // -10

      expect(portfolio.getDailyPnl()).toBe(0);
    });

    it('should calculate total exposure', async () => {
      await portfolio.openPosition({
        id: 'pos-1',
        symbol: 'BTC/USD',
        side: 'long',
        entryPrice: 50000,
        amount: 0.1,
      });

      expect(portfolio.getTotalExposure()).toBe(5000);
    });
  });

  describe('risk checks', () => {
    it('should allow position within limits', () => {
      const result = portfolio.canOpenPosition(5000);
      expect(result.allowed).toBe(true);
    });

    it('should block position exceeding size limit', () => {
      const result = portfolio.canOpenPosition(20000);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('exceeds max');
    });

    it('should block when daily loss limit breached', async () => {
      // Open and close with loss
      await portfolio.openPosition({ id: '1', symbol: 'A', side: 'long', entryPrice: 100, amount: 1 });
      await portfolio.closePosition('A', 50); // -50

      // Try to open another - should fail (daily loss > $1000)
      const result = portfolio.canOpenPosition(1000);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('daily loss');
    });

    it('should check stop loss trigger', async () => {
      await portfolio.openPosition({
        id: 'pos-1',
        symbol: 'BTC/USD',
        side: 'long',
        entryPrice: 50000,
        amount: 0.1,
        stopLoss: 45000,
      });

      const result = portfolio.checkStopLossTakeProfit('BTC/USD', 44000);
      expect(result.triggered).toBe('stop_loss');
      expect(result.reason).toContain('Stop loss');
    });

    it('should check take profit trigger', async () => {
      await portfolio.openPosition({
        id: 'pos-1',
        symbol: 'BTC/USD',
        side: 'long',
        entryPrice: 50000,
        amount: 0.1,
        takeProfit: 55000,
      });

      const result = portfolio.checkStopLossTakeProfit('BTC/USD', 56000);
      expect(result.triggered).toBe('take_profit');
      expect(result.reason).toContain('Take profit');
    });

    it('should return null when no triggers', async () => {
      await portfolio.openPosition({
        id: 'pos-1',
        symbol: 'BTC/USD',
        side: 'long',
        entryPrice: 50000,
        amount: 0.1,
        stopLoss: 45000,
        takeProfit: 55000,
      });

      const result = portfolio.checkStopLossTakeProfit('BTC/USD', 50000);
      expect(result.triggered).toBeNull();
    });
  });

  describe('stats', () => {
    it('should track position count', async () => {
      expect(portfolio.getPositionsCount()).toBe(0);

      await portfolio.openPosition({ id: '1', symbol: 'A', side: 'long', entryPrice: 100, amount: 1 });
      await portfolio.openPosition({ id: '2', symbol: 'B', side: 'long', entryPrice: 100, amount: 1 });

      expect(portfolio.getPositionsCount()).toBe(2);
    });

    it('should calculate win rate', async () => {
      await portfolio.openPosition({ id: '1', symbol: 'A', side: 'long', entryPrice: 100, amount: 1 });
      await portfolio.closePosition('A', 110); // win

      await portfolio.openPosition({ id: '2', symbol: 'B', side: 'long', entryPrice: 100, amount: 1 });
      await portfolio.closePosition('B', 90); // loss

      const stats = portfolio.getStats();
      expect(stats.winRate).toBe(0.5);
      expect(stats.winningTrades).toBe(1);
      expect(stats.losingTrades).toBe(1);
    });

    it('should return full stats', async () => {
      await portfolio.openPosition({ id: '1', symbol: 'A', side: 'long', entryPrice: 100, amount: 1 });
      await portfolio.closePosition('A', 110);

      const stats = portfolio.getStats();
      expect(stats.totalRealizedPnl).toBe(10);
      expect(stats.dailyTrades).toBe(1);
      expect(stats.positionsCount).toBe(0);
    });
  });

  describe('daily reset', () => {
    it('should reset daily counters', async () => {
      await portfolio.openPosition({ id: '1', symbol: 'A', side: 'long', entryPrice: 100, amount: 1 });
      await portfolio.closePosition('A', 110);

      expect(portfolio.getDailyPnl()).toBe(10);
      expect(portfolio.getDailyStats().trades).toBe(1);

      portfolio.resetDaily();

      expect(portfolio.getDailyPnl()).toBe(0);
      expect(portfolio.getDailyStats().trades).toBe(0);
    });
  });

  describe('events', () => {
    it('should emit position:opened', async () => {
      const handler = vi.fn();
      portfolio.on('position:opened', handler);

      await portfolio.openPosition({
        id: 'pos-1',
        symbol: 'BTC/USD',
        side: 'long',
        entryPrice: 50000,
        amount: 0.1,
      });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].position.symbol).toBe('BTC/USD');
    });

    it('should emit position:closed with P&L', async () => {
      const handler = vi.fn();
      portfolio.on('position:closed', handler);

      await portfolio.openPosition({
        id: 'pos-1',
        symbol: 'BTC/USD',
        side: 'long',
        entryPrice: 50000,
        amount: 0.1,
      });
      await portfolio.closePosition('BTC/USD', 55000);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].pnl).toBe(500);
    });

    it('should emit risk:breached when daily loss limit hit', async () => {
      const handler = vi.fn();
      portfolio.on('risk:breached', handler);

      // Create large loss to breach limit
      await portfolio.openPosition({ id: '1', symbol: 'A', side: 'long', entryPrice: 100, amount: 10 });
      await portfolio.closePosition('A', 1); // -990 (breaches $1000 limit)

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('createPortfolio factory', () => {
    it('should create portfolio with config', () => {
      const p = createPortfolio({ maxPositions: 10 });
      expect(p.getConfig().maxPositions).toBe(10);
    });
  });
});
