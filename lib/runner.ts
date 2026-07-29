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
import { QoSManager, createQoSManager, CircuitState } from './qos';
import { logAuditEvent, AuditEventType, RiskLevel } from './audit';
import { createError, ErrorCode } from './error';
import { createMarketPsychology, PsychologyConfig, PsychologyResult, NewsAnalysis, createNewsAnalysis } from './psy';
import { Portfolio, createPortfolio, type Position } from './portfolio';
import { Guard, createGuard, GuardConfig, GuardResult, GuardReasonCode, type TradingWindow, type TradingSchedule, type NewsBlackoutPeriod } from './guard';

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
  /** Guard configuration (optional) */
  guard?: GuardConfig;
  /** Backtest validator for strategy validation (optional) */
  backtest?: {
    /** Enable backtest validation */
    enabled: boolean;
    /** Custom validator instance */
    validator?: import('./backtest').BacktestValidator;
    /** Config for default validator */
    config?: Partial<import('./backtest').BacktestConfig>;
  };
  /** News service for market news (optional) */
  news?: {
    /** Enable news service */
    enabled: boolean;
    /** Custom news service instance */
    service?: import('./news').NewsService;
    /** Config for default service */
    config?: Partial<import('./news').NewsConfig>;
  };
  /** Market psychology analysis (optional) */
  psychology?: {
    /** Enable psychology analysis */
    enabled: boolean;
    /** Custom psychology instance */
    service?: import('./psy').MarketPsychology;
    /** Config for default service */
    config?: Partial<import('./psy').PsychologyConfig>;
  };
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

// Re-export Position from portfolio for backwards compatibility
export type { Position } from './portfolio';

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
  'signal:blocked': { signal: Signal; guardResult: GuardResult };
  'order:placed': { execution: TradeExecution };
  'order:filled': { execution: TradeExecution };
  'order:cancelled': { execution: TradeExecution };
  'order:failed': { execution: TradeExecution };
  'position:opened': { position: Position };
  'position:closed': { position: Position; pnl: number };
  'position:updated': { position: Position };
  'position:stopped': { position: Position; reason: string };
  'position:taken': { position: Position; reason: string };
  'portfolio:update': { summary: PortfolioSummary };
  'guard:blocked': { guardResult: GuardResult };
}

// ============================================================================
// TradingAgent
// ============================================================================

export class TradingAgent extends EventEmitter<RunnerEvents> {
  private config: AgentConfig;
  private running: boolean = false;
  private tickCount: number = 0;
  private scheduler: Scheduler;
  private portfolio: Portfolio;
  private guard: Guard;
  private qos: QoSManager;
  private backtest: import('./backtest').BacktestValidator | null = null;
  private news: import('./news').NewsService | null = null;
  private psychology: import('./psy').MarketPsychology | null = null;
  
  constructor(config: AgentConfig) {
    super();
    this.config = {
      tickInterval: config.tickInterval ?? 60000,
      paperMode: config.paperMode ?? true,
      ...config,
    };
    
    // Create scheduler
    this.scheduler = createScheduler({ enableHeartbeat: false });
    
    // Create portfolio with guard config
    this.portfolio = createPortfolio({
      maxPositions: config.guard?.maxPositions ?? 5,
      maxDailyLoss: config.guard?.maxDailyLoss ?? 1000,
      maxDailyTrades: config.guard?.maxDailyTrades ?? 20,
    });
    
    // Create guard with config or defaults
    this.guard = createGuard(config.guard);
    
    // Create QoS manager for circuit breaker
    this.qos = createQoSManager();
    
    // Initialize backtest validator if configured
    if (config.backtest?.enabled) {
      if (config.backtest.validator) {
        this.backtest = config.backtest.validator;
      } else if (config.backtest.config) {
        const { createBacktestValidator } = require('./backtest');
        this.backtest = createBacktestValidator(config.backtest.config);
      }
    }
    
    // Initialize news service if configured
    if (config.news?.enabled) {
      if (config.news.service) {
        this.news = config.news.service;
      } else if (config.news.config) {
        const { createNewsService } = require('./news');
        this.news = createNewsService(config.news.config);
      }
    }
    
    // Initialize psychology service if configured
    if (config.psychology?.enabled) {
      if (config.psychology.service) {
        this.psychology = config.psychology.service;
      } else if (config.psychology.config) {
        this.psychology = createMarketPsychology(config.psychology.config);
      } else {
        this.psychology = createMarketPsychology();
      }
    }
    
    // Set up circuit breaker event handlers
    this.qos.on('qos:circuit-open', ({ breaker }) => {
      this.guard.openCircuit();
      this.emit('agent:error', { 
        error: `Circuit breaker opened for ${breaker}`, 
        timestamp: Date.now() 
      });
    });
    
    this.qos.on('qos:circuit-closed', ({ breaker }) => {
      this.guard.closeCircuit();
    });
    
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
      throw createError({
        code: ErrorCode.INVALID_INPUT,
        message: 'Agent is already running',
        statusCode: 400,
      });
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
   * Stop the trading agent
   * @param closePositions If true, close all open positions before stopping (default: true)
   */
  async stop(closePositions: boolean = true): Promise<void> {
    if (!this.running) {
      return;
    }
    
    this.running = false;
    
    // Stop scheduler
    await this.scheduler.stop();
    
    // Graceful shutdown: close all positions
    const positions = this.portfolio.getAllPositions();
    if (closePositions && positions.length > 0) {
      const connector = this.config.connectors[0];
      
      for (const position of positions) {
        try {
          const currentPrice = await connector.getPrice(position.symbol);
          await this.closePosition(position.symbol, currentPrice, 'Graceful shutdown');
        } catch (e) {
          this.emit('agent:error', { 
            error: `Failed to close position ${position.symbol}: ${e}`, 
            timestamp: Date.now() 
          });
        }
      }
    }
    
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
    return this.portfolio.getAllPositions();
  }
  
  /**
   * Get position for a symbol
   */
  getPosition(symbol: string): Position | undefined {
    return this.portfolio.getPosition(symbol);
  }
  
  /**
   * Get the agent guard
   */
  getGuard(): Guard {
    return this.guard;
  }
  
  /**
   * Get the QoS manager
   */
  getQoS(): QoSManager {
    return this.qos;
  }
  
  /**
   * Get the backtest validator (if enabled)
   */
  getBacktest(): import('./backtest').BacktestValidator | null {
    return this.backtest;
  }
  
  /**
   * Get the news service (if enabled)
   */
  getNews(): import('./news').NewsService | null {
    return this.news;
  }
  
  /**
   * Emergency stop - immediately halt all trading
   */
  emergencyStop(): void {
    this.guard.setEmergencyStop(true);
    this.emit('guard:triggered', { 
      reason: 'emergency_stop', 
      message: 'Emergency stop activated - all trading halted' 
    });
  }
  
  /**
   * Resume trading after emergency stop
   */
  resumeTrading(): void {
    this.guard.setEmergencyStop(false);
    this.emit('guard:resumed', { 
      message: 'Emergency stop deactivated - trading resumed' 
    });
  }
  
  /**
   * Get guard status
   */
  getGuardStatus(): {
    emergencyStop: boolean;
    drawdown: number;
    peakValue: number;
    dailyTrades: number;
    dailyLoss: number;
  } {
    const dailyStats = this.portfolio.getDailyStats();
    return {
      emergencyStop: (this.guard as any).config?.emergencyStop ?? false,
      drawdown: this.guard.getCurrentDrawdown(),
      peakValue: (this.guard as any).peakValue ?? 0,
      dailyTrades: dailyStats.trades,
      dailyLoss: dailyStats.pnl,
    };
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
    
    // Get positions and update prices
    const positions = this.portfolio.getAllPositions();
    
    for (const position of positions) {
      const currentPrice = await connector.getPrice(position.symbol);
      
      // Update price in portfolio
      this.portfolio.updatePrices(new Map([[position.symbol, currentPrice]]));
      
      // Record price for staleness tracking
      this.guard.recordPriceUpdate(position.symbol, Date.now());
      
      const positionValue = position.amount * currentPrice;
      positionsValue += positionValue;
      
      totalPnl += position.unrealizedPnl || 0;
    }
    
    totalValue = availableBalance + positionsValue;
    const totalPnlPercent = totalValue > 0 ? (totalPnl / (totalValue - totalPnl || 1)) * 100 : 0;
    
    // Update drawdown tracking
    this.guard.updateDrawdown(totalValue);
    
    const dailyStats = this.portfolio.getDailyStats();
    
    return {
      totalValue,
      availableBalance,
      positionsValue,
      totalPnl,
      totalPnlPercent,
      positions: this.portfolio.getAllPositions(),
      dailyPnl: dailyStats.pnl,
      dailyTrades: dailyStats.trades,
    };
  }
  
  // ===========================================================================
  // Private Methods
  // ===========================================================================
  
  /**
   * Log audit event
   */
  private async logAudit(
    eventType: AuditEventType,
    details: Record<string, any>,
    riskLevel: RiskLevel = 'low'
  ): Promise<void> {
    try {
      const dailyStats = this.portfolio.getDailyStats();
      await logAuditEvent(
        eventType,
        'trading-agent',
        { 
          ...details,
          tick: this.tickCount,
          positions: this.portfolio.getPositionsCount(),
          dailyTrades: dailyStats.trades,
        },
        riskLevel
      );
    } catch (e) {
      // Don't fail the trade if audit logging fails
      console.error('Audit logging failed:', e);
    }
  }
  
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
    // Increment guard tick counter
    this.guard.tick();
    
    // Check stop loss / take profit on existing positions
    await this.checkPositionGuards();
    
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
  
  /**
   * Check stop loss and take profit on all positions
   */
  private async checkPositionGuards(): Promise<void> {
    const positions = this.portfolio.getAllPositions();
    for (const position of positions) {
      // Check stop loss
      const stopLossResult = this.guard.checkStopLoss(position);
      if (!stopLossResult.allowed) {
        const connector = this.config.connectors[0];
        const currentPrice = await connector.getPrice(position.symbol);
        await this.closePosition(position.symbol, currentPrice, stopLossResult.reason);
        continue;
      }
      
      // Check take profit
      const takeProfitResult = this.guard.checkTakeProfit(position);
      if (!takeProfitResult.allowed) {
        const connector = this.config.connectors[0];
        const currentPrice = await connector.getPrice(position.symbol);
        await this.closePosition(position.symbol, currentPrice, takeProfitResult.reason);
      }
    }
  }
  
  private async runStrategy(
    strategy: Strategy,
    symbol: string,
    interval: CandleInterval
  ): Promise<void> {
    try {
      // Get connector (use first one for now)
      const connector = this.config.connectors[0];
      
      // Fetch candles with circuit breaker protection
      const candles = await this.qos.executeWithBreaker(
        `connector:${connector.name}`,
        () => connector.getCandles(symbol, interval, 100)
      );
      
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
    
    // Check trading schedule
    const scheduleCheck = this.guard.checkTradingSchedule();
    if (!scheduleCheck.allowed) {
      return {
        valid: false,
        action: 'block',
        reason: scheduleCheck.reason,
      };
    }
    
    // Check dynamic news blackout if news service is enabled
    if (this.news) {
      const symbols = signal.symbol.split('/');
      const newsBlackout = await this.news.isNewsBlackoutPeriod(symbols);
      if (newsBlackout.blackout) {
        return {
          valid: false,
          action: 'block',
          reason: newsBlackout.reason || 'News blackout active',
        };
      }
    }
    
    // Check backtest if enabled (for new strategies)
    if (this.backtest && this.config.guard?.requireBacktest) {
      // Run quick backtest validation
      const connector = this.config.connectors[0];
      const dataCheck = await this.backtest.validateDataAvailability(connector, signal.symbol, '1h');
      if (!dataCheck.available) {
        return {
          valid: false,
          action: 'block',
          reason: `Backtest: insufficient data (${dataCheck.periods} periods)`,
        };
      }
    }
    
    // Check signal confidence (strength 0-1 -> 0-100%)
    const confidencePercent = (signal.strength || 0.5) * 100;
    const confidenceCheck = this.guard.checkSignalConfidence(confidencePercent);
    if (!confidenceCheck.allowed) {
      return {
        valid: false,
        action: 'block',
        reason: confidenceCheck.reason,
      };
    }
    
    // Check news blackout
    const newsCheck = this.guard.checkNewsBlackout();
    if (!newsCheck.allowed) {
      return {
        valid: false,
        action: 'block',
        reason: newsCheck.reason,
      };
    }
    
    // Check market psychology if enabled
    if (this.psychology) {
      try {
        // Get recent news for the symbol
        const recentNews = await this.news?.getNews({ 
          symbols: [signal.symbol],
          since: Date.now() - 48 * 60 * 60 * 1000, // last 48 hours
        });
        
        // Get recent candles for momentum analysis
        const candles = await connector.getCandles(signal.symbol, '1h', 24);
        
        if (recentNews && recentNews.length > 0) {
          const latestNews = recentNews[0];
          const priceAtNews = latestNews.publishedAt 
            ? (await connector.getCandles(signal.symbol, '1h', 1)).slice(-1)[0]?.close || signal.price
            : signal.price;
          
          const analysis = createNewsAnalysis(
            signal.symbol,
            { publishedAt: latestNews.publishedAt, sentiment: latestNews.sentiment },
            priceAtNews,
            signal.price
          );
          
          const psyResult = await this.psychology.analyze(
            analysis,
            candles.length > 0 ? candles : undefined,
            this.config.userId
          );
          
          if (!psyResult.overall.allowed) {
            return {
              valid: false,
              action: 'block',
              reason: `Psychology: ${psyResult.overall.reason}`,
            };
          }
        } else if (candles.length > 0) {
          // No news but have candles - check momentum exhaustion
          const momentumResult = await this.psychology.analyzeMomentumExhaustion(
            candles,
            this.config.userId
          );
          
          if (!momentumResult.allowed) {
            return {
              valid: false,
              action: 'block',
              reason: `Psychology: ${momentumResult.reason}`,
            };
          }
        }
      } catch (error) {
        // Don't block trades if psychology analysis fails - log and continue
        console.warn('Psychology analysis failed:', error);
      }
    }
    
    // Check API rate limit
    const rateLimitCheck = this.guard.checkAPIRateLimit();
    if (!rateLimitCheck.allowed) {
      return {
        valid: false,
        action: 'block',
        reason: rateLimitCheck.reason,
      };
    }
    
    // Check price staleness before validating
    const lastUpdate = (this.guard as any).lastPriceUpdate?.get(signal.symbol) ?? 0;
    const stalenessCheck = this.guard.checkPriceStaleness(signal.symbol, lastUpdate);
    if (!stalenessCheck.allowed) {
      return {
        valid: false,
        action: 'block',
        reason: stalenessCheck.reason,
      };
    }
    
    // Get balance
    const balances = await connector.getBalance();
    const balance = balances.find(b => b.asset === signal.symbol.split('/')[1]);
    const availableBalance = balance?.available ?? 0;
    
    // Check reserve balance
    const reserveCheck = this.guard.checkReserveBalance(availableBalance);
    if (!reserveCheck.allowed) {
      return {
        valid: false,
        action: 'block',
        reason: reserveCheck.reason,
      };
    }
    
    // Get position
    const position = this.portfolio.getPosition(signal.symbol);
    const positionSize = position ? position.amount * position.entryPrice : 0;
    
    // Get portfolio value
    const portfolioSummary = await this.getPortfolio();
    const dailyStats = this.portfolio.getDailyStats();
    
    // Check position concentration
    const orderValue = signal.price * (signal.price > 0 ? (100 / signal.price) : 0);
    const concentrationCheck = this.guard.checkPositionConcentration(orderValue, portfolioSummary.totalValue);
    if (!concentrationCheck.allowed) {
      return {
        valid: false,
        action: 'block',
        reason: concentrationCheck.reason,
      };
    }
    
    // Check correlation with existing positions
    const positionSymbols = this.portfolio.getAllPositions().map(p => p.symbol);
    const correlationCheck = this.guard.checkCorrelation(positionSymbols, signal.symbol);
    if (!correlationCheck.allowed) {
      return {
        valid: false,
        action: 'block',
        reason: correlationCheck.reason,
      };
    }
    
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
      dailyTradeCount: dailyStats.trades,
      dailyLoss: dailyStats.pnl,
      portfolioValue: portfolioSummary.totalValue,
    };
    
    // Run custom rules validator if provided
    if (this.config.validator) {
      const result = await this.config.validator.validate(context);
      if (!result.valid || result.action === 'block') {
        return result;
      }
      // If modify, apply changes to signal
      if (result.action === 'modify' && result.modifiedOrder) {
        signal.price = result.modifiedOrder.price ?? signal.price;
      }
    }
    
    // Use connector's validator if available
    if ('validateOrder' in connector) {
      return (connector as any).validateOrder(context.order);
    }
    
    // Otherwise just allow
    return { valid: true, action: 'allow' };
  }
  
  private async executeSignal(signal: Signal): Promise<void> {
    const connector = this.config.connectors[0];
    
    // Check guard before executing
    const portfolioSummary = await this.getPortfolio();
    const guardResult = this.guard.checkNewPosition(
      this.portfolio.getPositionsCount(),
      portfolioSummary.totalValue,
      portfolioSummary.dailyPnl
    );
    
    if (!guardResult.allowed) {
      this.emit('signal:blocked', { signal, guardResult });
      this.emit('guard:blocked', { guardResult });
      return;
    }
    
    // Check for existing position
    const existingPosition = this.portfolio.getPosition(signal.symbol);
    
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
    if (!this.portfolio.hasPosition(signal.symbol)) {
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
      // Execute order with circuit breaker protection
      const result = await this.qos.executeWithBreaker(
        `connector:${connector.name}`,
        () => connector.placeOrder(order)
      );
      execution.result = result;
      
      // Open position in portfolio
      const positionResult = await this.portfolio.openPosition({
        id: result.id,
        symbol: signal.symbol,
        side: signal.side === 'buy' ? 'long' : 'short',
        entryPrice: result.avg_price,
        amount: result.filled_amount,
      });
      
      if (!positionResult.success) {
        throw new Error(positionResult.error || 'Failed to open position');
      }
      
      // Record trade in guard
      this.guard.recordTrade();
      
      this.emit('order:placed', { execution });
      this.emit('position:opened', { position: positionResult.position! });
      
      // Audit log
      await this.logAudit('trade_executed', {
        symbol: positionResult.position!.symbol,
        side: positionResult.position!.side,
        amount: positionResult.position!.amount,
        entryPrice: positionResult.position!.entryPrice,
      }, 'medium');
      
    } catch (error) {
      execution.error = String(error);
      this.emit('order:failed', { execution });
      
      // Audit log failure
      await this.logAudit('trade_executed', {
        symbol: signal.symbol,
        error: String(error),
      }, 'high');
    }
  }
  
  private async closePosition(symbol: string, currentPrice: number, reason: string = 'Signal reversal'): Promise<void> {
    const position = this.portfolio.getPosition(symbol);
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
      
      // Close position via portfolio
      const closeResult = await this.portfolio.closePosition(symbol, currentPrice, reason);
      
      if (!closeResult.success) {
        throw new Error(closeResult.error || 'Failed to close position');
      }
      
      // Record profit/loss in guard
      const pnl = closeResult.pnl || 0;
      if (pnl < 0) {
        this.guard.recordLoss(pnl);
      } else {
        this.guard.recordProfit(pnl);
      }
      
      this.emit('order:filled', { execution });
      this.emit('position:closed', { position: closeResult.position!, pnl });
      
      // Audit log
      await this.logAudit('trade_executed', {
        symbol: closeResult.position!.symbol,
        side: closeResult.position!.side,
        exitPrice: currentPrice,
        pnl: pnl,
        reason: reason,
      }, pnl < 0 ? 'medium' : 'low');
      
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

export function createMACrossStrategy(): Strategy {
  return new MACrossStrategy();
}

export function createRSIStrategy(): Strategy {
  return new RSIStrategy();
}

// Re-export types
export type { CandleInterval, Order, OrderResult, Trade, Balance };
