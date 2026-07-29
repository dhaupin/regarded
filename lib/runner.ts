/**
 * Trading Agent Runner
 * 
 * Core execution engine for the regarded trading platform.
 * Agent-first design - works standalone or with Vant/Hermes.
 * Coordinates strategies, connectors, rules, and position management.
 * 
 * @example
 * import { TradingAgent, createAgent } from './runner';
 * 
 * const agent = createAgent({
 *   connectors: [new KrakenConnector()],
 *   strategies: [new MACrossStrategy()],
 * });
 * 
 * await agent.start();
 * // Agent is now running strategies on schedule
 * await agent.stop();
 */

import { EventEmitter } from './event';
import type { ExchangeConnector, Order, OrderResult, Trade, Candle, CandleInterval, Balance } from './types';
import { calculateIndicator, IndicatorType } from './indicators';
import { detectPattern, PatternType } from './patterns';
import { createRulesValidator, ValidationResult, OrderContext } from './rules';
import { Scheduler, createScheduler, Job } from './scheduler';

// ============================================================================
// Types
// ============================================================================

export interface AgentConfig {
  /** Connectors to use for trading */
  connectors: ExchangeConnector[];
  /** Strategies to run */
  strategies: Strategy[];
  /** Trading pairs to watch */
  symbols: string[];
  /** Timeframes for analysis */
  intervals: CandleInterval[];
  /** Run interval in ms (default: 60000 = 1min) */
  tickInterval?: number;
  /** Paper trading mode */
  paperMode?: boolean;
  /** Custom rules validator (optional) */
  validator?: ReturnType<typeof createRulesValidator>;
}

export interface Signal {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  strength: number; // 0-1
  price: number;
  reason: string;
  indicators: Record<string, number>;
  pattern?: PatternType;
  timestamp: number;
}

export interface Position {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  entryPrice: number;
  amount: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  openedAt: number;
  closedAt?: number;
}

export interface TradeExecution {
  signal: Signal;
  order: Order;
  result?: OrderResult;
  error?: string;
  timestamp: number;
}

export interface PortfolioSummary {
  totalValue: number;
  availableBalance: number;
  positionsValue: number;
  totalPnl: number;
  totalPnlPercent: number;
  positions: Position[];
  dailyPnl: number;
  dailyTrades: number;
}

// Strategy interface
export interface Strategy {
  /** Unique strategy identifier */
  id: string;
  /** Human-readable name */
  name: string;
  
  /**
   * Generate trading signals
   * @param symbol Trading pair
   * @param interval Timeframe
   * @param candles Price history
   * @param indicators Pre-calculated indicators
   * @param pattern Detected pattern (if any)
   * @returns Trading signal or null
   */
  analyze(
    symbol: string,
    interval: CandleInterval,
    candles: Candle[],
    indicators: Record<string, number>,
    pattern: PatternType | null
  ): Promise<Signal | null>;
  
  /**
   * Optional: Get strategy parameters
   */
  getParams?(): Record<string, any>;
}

// ============================================================================
// Events
// ============================================================================

export interface RunnerEvents {
  'agent:started': { config: AgentConfig };
  'agent:stopped': {};
  'agent:error': { error: string; timestamp: number };
  'tick:start': { timestamp: number; tick: number };
  'tick:complete': { timestamp: number; tick: number; duration: number };
  'signal:generated': { signal: Signal; strategy: string };
  'signal:validated': { signal: Signal; result: ValidationResult };
  'order:placed': { execution: TradeExecution };
  'order:filled': { execution: TradeExecution };
  'order:cancelled': { execution: TradeExecution };
  'order:failed': { execution: TradeExecution };
  'position:opened': { position: Position };
  'position:closed': { position: Position; pnl: number };
  'position:updated': { position: Position };
  'portfolio:update': { summary: PortfolioSummary };
}

// ============================================================================
// TradingAgent
// ============================================================================

export class TradingAgent extends EventEmitter<RunnerEvents> {
  private config: AgentConfig;
  private running: boolean = false;
  private tickCount: number = 0;
  private scheduler: Scheduler;
  private positions: Map<string, Position> = new Map();
  private dailyTrades: number = 0;
  private dailyPnl: number = 0;
  
  constructor(config: AgentConfig) {
    super();
    this.config = {
      tickInterval: config.tickInterval ?? 60000,
      paperMode: config.paperMode ?? true,
      ...config,
    };
    
    // Create scheduler
    this.scheduler = createScheduler({ enableHeartbeat: false });
    
    // Set paper mode on all connectors
    for (const connector of this.config.connectors) {
      connector.setPaperMode(this.config.paperMode!);
    }
  }
  
  /**
   * Start the trading agent
   */
  async start(): Promise<void> {
    if (this.running) {
      throw new Error('Agent is already running');
    }
    
    this.running = true;
    this.tickCount = 0;
    
    // Connect all connectors
    for (const connector of this.config.connectors) {
      try {
        await connector.connect({} as any);
      } catch (e) {
        this.emit('agent:error', { 
          error: `Failed to connect ${connector.name}: ${e}`, 
          timestamp: Date.now() 
        });
      }
    }
    
    // Start the tick loop
    this.scheduleTick();
    
    this.emit('agent:started', { config: this.config });
  }
  
  /**
   * Stop the trading bot
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }
    
    this.running = false;
    
    // Stop scheduler
    await this.scheduler.stop();
    
    // Disconnect all connectors
    for (const connector of this.config.connectors) {
      try {
        await connector.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
    }
    
    this.emit('agent:stopped', {});
  }
  
  /**
   * Check if bot is running
   */
  isRunning(): boolean {
    return this.running;
  }
  
  /**
   * Get current positions
   */
  getPositions(): Position[] {
    return Array.from(this.positions.values());
  }
  
  /**
   * Get position for a symbol
   */
  getPosition(symbol: string): Position | undefined {
    return this.positions.get(symbol);
  }
  
  /**
   * Get portfolio summary
   */
  async getPortfolio(): Promise<PortfolioSummary> {
    let totalValue = 0;
    let positionsValue = 0;
    let totalPnl = 0;
    
    // Get balances from first connector
    const connector = this.config.connectors[0];
    const balances = await connector.getBalance();
    
    const availableBalance = balances.reduce((sum, b) => sum + b.available, 0);
    
    // Calculate positions value and P&L
    for (const position of this.positions.values()) {
      const currentPrice = await connector.getPrice(position.symbol);
      position.currentPrice = currentPrice;
      
      const positionValue = position.amount * currentPrice;
      positionsValue += positionValue;
      
      const pnl = position.side === 'long'
        ? (currentPrice - position.entryPrice) * position.amount
        : (position.entryPrice - currentPrice) * position.amount;
      
      position.pnl = pnl;
      position.pnlPercent = (pnl / (position.entryPrice * position.amount)) * 100;
      totalPnl += pnl;
    }
    
    totalValue = availableBalance + positionsValue;
    const totalPnlPercent = totalValue > 0 ? (totalPnl / (totalValue - totalPnl)) * 100 : 0;
    
    return {
      totalValue,
      availableBalance,
      positionsValue,
      totalPnl,
      totalPnlPercent,
      positions: Array.from(this.positions.values()),
      dailyPnl: this.dailyPnl,
      dailyTrades: this.dailyTrades,
    };
  }
  
  // ===========================================================================
  // Private Methods
  // ===========================================================================
  
  private scheduleTick(): void {
    if (!this.running) return;
    
    this.tickCount++;
    const tickStart = Date.now();
    
    this.emit('tick:start', { timestamp: tickStart, tick: this.tickCount });
    
    // Run the main tick
    this.runTick().then(() => {
      const duration = Date.now() - tickStart;
      this.emit('tick:complete', { 
        timestamp: Date.now(), 
        tick: this.tickCount, 
        duration 
      });
      
      // Schedule next tick
      setTimeout(() => this.scheduleTick(), this.config.tickInterval);
    }).catch((error) => {
      this.emit('agent:error', { 
        error: `Tick error: ${error}`, 
        timestamp: Date.now() 
      });
      
      // Still schedule next tick
      setTimeout(() => this.scheduleTick(), this.config.tickInterval);
    });
  }
  
  private async runTick(): Promise<void> {
    // For each symbol and strategy
    for (const symbol of this.config.symbols) {
      for (const strategy of this.config.strategies) {
        for (const interval of this.config.intervals) {
          await this.runStrategy(strategy, symbol, interval);
        }
      }
    }
    
    // Update portfolio
    const summary = await this.getPortfolio();
    this.emit('portfolio:update', { summary });
  }
  
  private async runStrategy(
    strategy: Strategy,
    symbol: string,
    interval: CandleInterval
  ): Promise<void> {
    try {
      // Get connector (use first one for now)
      const connector = this.config.connectors[0];
      
      // Fetch candles
      const candles = await connector.getCandles(symbol, interval, 100);
      if (candles.length < 20) return;
      
      // Calculate indicators
      const indicators = await this.calculateIndicators(candles);
      
      // Detect pattern
      const pattern = detectPattern(candles);
      
      // Run strategy analysis
      const signal = await strategy.analyze(symbol, interval, candles, indicators, pattern);
      
      if (signal) {
        this.emit('signal:generated', { signal, strategy: strategy.id });
        
        // Validate signal
        const validation = await this.validateSignal(signal);
        this.emit('signal:validated', { signal, result: validation });
        
        if (validation.valid) {
          await this.executeSignal(signal);
        }
      }
    } catch (error) {
      // Strategy error - log but continue
      this.emit('agent:error', { 
        error: `Strategy ${strategy.id} error: ${error}`, 
        timestamp: Date.now() 
      });
    }
  }
  
  private async calculateIndicators(candles: Candle[]): Promise<Record<string, number>> {
    const closes = candles.map(c => c.close);
    
    return {
      // Moving averages
      sma_20: calculateIndicator(closes, 'sma', 20),
      sma_50: calculateIndicator(closes, 'sma', 50),
      sma_200: calculateIndicator(closes, 'sma', 200),
      ema_12: calculateIndicator(closes, 'ema', 12),
      ema_26: calculateIndicator(closes, 'ema', 26),
      
      // Momentum
      rsi: calculateIndicator(closes, 'rsi', 14),
      macd: calculateIndicator(closes, 'macd', 12, 26, 9).macd,
      macd_signal: calculateIndicator(closes, 'macd', 12, 26, 9).signal,
      macd_histogram: calculateIndicator(closes, 'macd', 12, 26, 9).histogram,
      
      // Volatility
      atr: calculateIndicator(candles, 'atr', 14),
      bb_upper: calculateIndicator(closes, 'bb', 20, 2).upper,
      bb_lower: calculateIndicator(closes, 'bb', 20, 2).lower,
      
      // Volume
      volume_sma: calculateIndicator(candles.map(c => c.volume), 'sma', 20),
    };
  }
  
  private async validateSignal(signal: Signal): Promise<ValidationResult> {
    const connector = this.config.connectors[0];
    
    // Get balance
    const balances = await connector.getBalance();
    const balance = balances.find(b => b.asset === signal.symbol.split('/')[1]);
    const availableBalance = balance?.available ?? 0;
    
    // Get position
    const position = this.positions.get(signal.symbol);
    const positionSize = position ? position.amount * position.entryPrice : 0;
    
    // Build context
    const context: OrderContext = {
      order: {
        pair: signal.symbol,
        side: signal.side,
        type: 'market',
        amount: signal.price > 0 ? (100 / signal.price) : 0, // ~$100 per trade
        price: signal.price,
      },
      exchange: connector.exchange,
      connectorName: connector.name,
      availableBalance,
      currentPrice: signal.price,
      positionSize,
      dailyTradeCount: this.dailyTrades,
      dailyLoss: this.dailyPnl,
      portfolioValue: await this.getPortfolio().then(p => p.totalValue),
    };
    
    // Use connector's validator if available
    if ('validateOrder' in connector) {
      return (connector as any).validateOrder(context.order);
    }
    
    // Otherwise just allow
    return { valid: true, action: 'allow' };
  }
  
  private async executeSignal(signal: Signal): Promise<void> {
    const connector = this.config.connectors[0];
    
    // Check for existing position
    const existingPosition = this.positions.get(signal.symbol);
    
    // If we have a position and signal is opposite, close it
    if (existingPosition) {
      const shouldClose = 
        (existingPosition.side === 'long' && signal.side === 'sell') ||
        (existingPosition.side === 'short' && signal.side === 'buy');
      
      if (shouldClose) {
        await this.closePosition(signal.symbol, signal.price);
      }
    }
    
    // Open new position if no existing
    if (!this.positions.has(signal.symbol)) {
      await this.openPosition(signal);
    }
  }
  
  private async openPosition(signal: Signal): Promise<void> {
    const connector = this.config.connectors[0];
    
    const order: Order = {
      pair: signal.symbol,
      side: signal.side,
      type: 'market',
      amount: signal.price > 0 ? (100 / signal.price) : 0, // ~$100
      price: signal.price,
    };
    
    const execution: TradeExecution = {
      signal,
      order,
      timestamp: Date.now(),
    };
    
    try {
      const result = await connector.placeOrder(order);
      execution.result = result;
      
      // Create position
      const position: Position = {
        id: result.id,
        symbol: signal.symbol,
        side: signal.side === 'buy' ? 'long' : 'short',
        entryPrice: result.avg_price,
        amount: result.filled_amount,
        currentPrice: result.avg_price,
        pnl: 0,
        pnlPercent: 0,
        openedAt: Date.now(),
      };
      
      this.positions.set(signal.symbol, position);
      this.dailyTrades++;
      
      this.emit('order:placed', { execution });
      this.emit('position:opened', { position });
      
    } catch (error) {
      execution.error = String(error);
      this.emit('order:failed', { execution });
    }
  }
  
  private async closePosition(symbol: string, currentPrice: number): Promise<void> {
    const position = this.positions.get(symbol);
    if (!position) return;
    
    const connector = this.config.connectors[0];
    
    const order: Order = {
      pair: symbol,
      side: position.side === 'long' ? 'sell' : 'buy',
      type: 'market',
      amount: position.amount,
      price: currentPrice,
    };
    
    const signal: Signal = {
      id: 'close',
      symbol,
      side: order.side as 'buy' | 'sell',
      strength: 1,
      price: currentPrice,
      reason: 'Signal reversal',
      indicators: {},
      timestamp: Date.now(),
    };
    
    const execution: TradeExecution = {
      signal,
      order,
      timestamp: Date.now(),
    };
    
    try {
      const result = await connector.placeOrder(order);
      execution.result = result;
      
      // Calculate P&L
      const pnl = position.side === 'long'
        ? (currentPrice - position.entryPrice) * position.amount
        : (position.entryPrice - currentPrice) * position.amount;
      
      this.dailyPnl += pnl;
      
      // Close position
      position.closedAt = Date.now();
      this.positions.delete(symbol);
      
      this.emit('order:filled', { execution });
      this.emit('position:closed', { position, pnl });
      
    } catch (error) {
      execution.error = String(error);
      this.emit('order:failed', { execution });
    }
  }
}

// ============================================================================
// Strategy Implementations
// ============================================================================

/**
 * Example: Moving Average Crossover Strategy
 */
export class MACrossStrategy implements Strategy {
  id = 'ma_cross';
  name = 'Moving Average Crossover';
  
  async analyze(
    symbol: string,
    interval: CandleInterval,
    candles: Candle[],
    indicators: Record<string, number>,
    pattern: PatternType | null
  ): Promise<Signal | null> {
    const sma20 = indicators.sma_20;
    const sma50 = indicators.sma_50;
    
    if (!sma20 || !sma50) return null;
    
    const currentPrice = candles[candles.length - 1].close;
    
    // Golden cross (bullish)
    if (sma20 > sma50 && sma20 - sma50 < sma20 * 0.01) {
      return {
        id: `${symbol}-${Date.now()}`,
        symbol,
        side: 'buy',
        strength: 0.8,
        price: currentPrice,
        reason: `Golden cross: SMA20 (${sma20.toFixed(2)}) > SMA50 (${sma50.toFixed(2)})`,
        indicators: { sma20, sma50 },
        pattern,
        timestamp: Date.now(),
      };
    }
    
    // Death cross (bearish)
    if (sma20 < sma50 && sma50 - sma20 < sma50 * 0.01) {
      return {
        id: `${symbol}-${Date.now()}`,
        symbol,
        side: 'sell',
        strength: 0.8,
        price: currentPrice,
        reason: `Death cross: SMA20 (${sma20.toFixed(2)}) < SMA50 (${sma50.toFixed(2)})`,
        indicators: { sma20, sma50 },
        pattern,
        timestamp: Date.now(),
      };
    }
    
    return null;
  }
}

/**
 * Example: RSI Strategy
 */
export class RSIStrategy implements Strategy {
  id = 'rsi';
  name = 'RSI Overbought/Oversold';
  
  async analyze(
    symbol: string,
    interval: CandleInterval,
    candles: Candle[],
    indicators: Record<string, number>,
    pattern: PatternType | null
  ): Promise<Signal | null> {
    const rsi = indicators.rsi;
    const currentPrice = candles[candles.length - 1].close;
    
    if (!rsi) return null;
    
    // Oversold - potential buy
    if (rsi < 30) {
      return {
        id: `${symbol}-${Date.now()}`,
        symbol,
        side: 'buy',
        strength: (30 - rsi) / 30,
        price: currentPrice,
        reason: `Oversold: RSI (${rsi.toFixed(1)}) < 30`,
        indicators: { rsi },
        pattern,
        timestamp: Date.now(),
      };
    }
    
    // Overbought - potential sell
    if (rsi > 70) {
      return {
        id: `${symbol}-${Date.now()}`,
        symbol,
        side: 'sell',
        strength: (rsi - 70) / 30,
        price: currentPrice,
        reason: `Overbought: RSI (${rsi.toFixed(1)}) > 70`,
        indicators: { rsi },
        pattern,
        timestamp: Date.now(),
      };
    }
    
    return null;
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createAgent(config: AgentConfig): TradingAgent {
  return new TradingAgent(config);
}

/**
 * @deprecated Use createAgent instead
 */
export const createBot = createAgent;

/**
 * @deprecated Use TradingAgent instead
 */
export const TradingBot = TradingAgent;

export function createMACrossStrategy(): Strategy {
  return new MACrossStrategy();
}

export function createRSIStrategy(): Strategy {
  return new RSIStrategy();
}

// Re-export types
export type { CandleInterval, Order, OrderResult, Trade, Balance };
