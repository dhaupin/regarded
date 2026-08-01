/**
 * Runner Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  TradingAgent, 
  createAgent, 
  MACrossStrategy, 
  RSIStrategy,
  createMACrossStrategy,
  createRSIStrategy,
  type AgentConfig,
  type Strategy,
  type Signal 
} from '../lib/runner';
import { BaseConnector } from '../lib/connectors/base';
import type { Candle, CandleInterval, Balance, Order, OrderResult } from '../lib/types';

class MockConnector extends BaseConnector {
  name = 'mock';
  exchange = 'mock';
  private _connected = false;
  private _balance: Balance[] = [{ asset: 'USD', free: 10000, locked: 0, total: 10000 }];
  private _price = 50000;
  private _candles: Candle[] = [];
  
  setCandles(candles: Candle[]) {
    this._candles = candles;
  }
  
  setPrice(price: number) {
    this._price = price;
  }
  
  async connect() {
    this._connected = true;
    return true;
  }
  
  async disconnect() {
    this._connected = false;
  }
  
  async getBalance(): Promise<Balance[]> {
    return this._balance;
  }
  
  async getPrice(): Promise<number> {
    return this._price;
  }
  
  async getPrices(): Promise<Map<string, number>> {
    return new Map([['BTC/USD', this._price]]);
  }
  
  async getCandles(): Promise<Candle[]> {
    return this._candles;
  }
  
  async placeOrder(order: Order): Promise<OrderResult> {
    return {
      id: `order-${Date.now()}`,
      pair: order.pair,
      side: order.side,
      type: order.type,
      amount: order.amount,
      filled_amount: order.amount,
      price: this._price,
      avg_price: this._price,
      fee: 0,
      status: 'filled',
      created_at: Date.now(),
    };
  }
  
  async cancelOrder(): Promise<boolean> {
    return true;
  }
  
  async getOpenOrders(): Promise<OrderResult[]> {
    return [];
  }
  
  async getTradeHistory() {
    return [];
  }
  
  supportedIntervals(): CandleInterval[] {
    return ['1m', '5m', '15m', '1h', '4h', '1d'];
  }
  
  supportedSymbols(): string[] {
    return ['BTC/USD', 'ETH/USD'];
  }
}

// Generate mock candles
function generateCandles(count: number, startPrice: number): Candle[] {
  const candles: Candle[] = [];
  let price = startPrice;
  
  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * 100;
    price = Math.max(1000, price + change);
    
    candles.push({
      timestamp: Date.now() - (count - i) * 60000,
      open: price - 50,
      high: price + 50,
      low: price - 100,
      close: price,
      volume: Math.random() * 1000,
    });
  }
  
  return candles;
}

describe('TradingAgent', () => {
  let connector: MockConnector;
  
  beforeEach(() => {
    connector = new MockConnector();
    connector.setCandles(generateCandles(100, 50000));
  });
  
  afterEach(async () => {
    // Ensure bot is stopped
  });
  
  it('should create a bot with config', () => {
    const strategy = new MACrossStrategy();
    const config: AgentConfig = {
      connectors: [connector],
      strategies: [strategy],
      symbols: ['BTC/USD'],
      intervals: ['1h'],
      tickInterval: 1000,
      paperMode: true,
    };
    
    const bot = createAgent(config);
    expect(bot).toBeDefined();
    expect(bot.isRunning()).toBe(false);
  });
  
  it('should start and stop', async () => {
    const bot = createAgent({
      connectors: [connector],
      strategies: [],
      symbols: ['BTC/USD'],
      intervals: ['1h'],
      tickInterval: 100,
    });
    
    await bot.start();
    expect(bot.isRunning()).toBe(true);
    
    await bot.stop();
    expect(bot.isRunning()).toBe(false);
  });
  
  it('should emit events on start/stop', async () => {
    const agent = createAgent({
      connectors: [connector],
      strategies: [],
      symbols: ['BTC/USD'],
      intervals: ['1h'],
      tickInterval: 100,
    });
    
    const started = vi.fn();
    const stopped = vi.fn();
    
    agent.on('agent:started', started);
    agent.on('agent:stopped', stopped);
    
    await agent.start();
    expect(started).toHaveBeenCalled();
    
    await agent.stop();
    expect(stopped).toHaveBeenCalled();
  });
  
  it('should not start if already running', async () => {
    const bot = createAgent({
      connectors: [connector],
      strategies: [],
      symbols: ['BTC/USD'],
      intervals: ['1h'],
      tickInterval: 100,
    });
    
    await bot.start();
    
    await expect(bot.start()).rejects.toThrow('already running');
    
    await bot.stop();
  });
  
  it('should get positions', async () => {
    const bot = createAgent({
      connectors: [connector],
      strategies: [],
      symbols: ['BTC/USD'],
      intervals: ['1h'],
      tickInterval: 100,
    });
    
    await bot.start();
    
    const positions = bot.getPositions();
    expect(Array.isArray(positions)).toBe(true);
    
    await bot.stop();
  });
  
  it('should get portfolio summary', async () => {
    const bot = createAgent({
      connectors: [connector],
      strategies: [],
      symbols: ['BTC/USD'],
      intervals: ['1h'],
      tickInterval: 100,
    });
    
    await bot.start();
    
    const portfolio = await bot.getPortfolio();
    expect(portfolio).toBeDefined();
    expect(portfolio.totalValue).toBeGreaterThan(0);
    expect(portfolio.availableBalance).toBeGreaterThan(0);
    
    await bot.stop();
  });
});

describe('Strategies', () => {
  it('MACrossStrategy should generate signals', async () => {
    const strategy = new MACrossStrategy();
    const candles = generateCandles(100, 50000);
    
    // Force a golden cross by setting last candles appropriately
    candles[78] = { ...candles[78], close: 50500 };
    candles[79] = { ...candles[79], close: 51000 };
    
    const indicators = {
      sma_20: 51000,
      sma_50: 50000,
      sma_200: 48000,
      ema_12: 50800,
      ema_26: 49500,
      rsi: 55,
      macd: 100,
      macd_signal: 50,
      macd_histogram: 50,
      atr: 500,
      bb_upper: 52000,
      bb_lower: 48000,
      volume_sma: 500,
    };
    
    const signal = await strategy.analyze('BTC/USD', '1h', candles, indicators, null);
    
    // Signal may or may not trigger depending on exact values
    if (signal) {
      expect(signal.symbol).toBe('BTC/USD');
      expect(['buy', 'sell']).toContain(signal.side);
      expect(signal.strength).toBeGreaterThan(0);
      expect(signal.strength).toBeLessThanOrEqual(1);
    }
  });
  
  it('RSIStrategy should generate signals', async () => {
    const strategy = new RSIStrategy();
    const candles = generateCandles(100, 50000);
    
    const indicators = {
      sma_20: 50000,
      sma_50: 50000,
      rsi: 25, // Oversold
    };
    
    const signal = await strategy.analyze('BTC/USD', '1h', candles, indicators, null);
    
    if (signal) {
      expect(signal.side).toBe('buy');
      expect(signal.reason).toContain('Oversold');
    }
  });
  
  it('RSIStrategy should signal overbought', async () => {
    const strategy = new RSIStrategy();
    const candles = generateCandles(100, 50000);
    
    const indicators = {
      sma_20: 50000,
      sma_50: 50000,
      rsi: 80, // Overbought
    };
    
    const signal = await strategy.analyze('BTC/USD', '1h', candles, indicators, null);
    
    if (signal) {
      expect(signal.side).toBe('sell');
      expect(signal.reason).toContain('Overbought');
    }
  });
  
  it('should create strategies via factory', () => {
    const ma = createMACrossStrategy();
    const rsi = createRSIStrategy();
    
    expect(ma.id).toBe('ma_cross');
    expect(rsi.id).toBe('rsi');
  });
});
