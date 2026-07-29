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
  /** AgentGuard configuration (optional) */
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

// ============================================================================
// AgentGuard - Trading Protections
// ============================================================================

export interface GuardConfig {
  /** Maximum number of open positions (default: 5) */
  maxPositions?: number;
  /** Maximum daily loss in quote currency (default: 1000) */
  maxDailyLoss?: number;
  /** Maximum daily trades (default: 20) */
  maxDailyTrades?: number;
  /** Stop loss percentage (default: 2%) */
  stopLossPercent?: number;
  /** Take profit percentage (default: 5%) */
  takeProfitPercent?: number;
  /** Risk per trade as % of portfolio (default: 2%) */
  riskPerTrade?: number;
  /** Warmup ticks before trading (default: 5) */
  warmupTicks?: number;
  /** Maximum slippage % (default: 1%) */
  maxSlippage?: number;
  /** Trading hours - start hour (0-23, default: 0 = all day) */
  tradingStartHour?: number;
  /** Trading hours - end hour (0-23, default: 24 = all day) */
  tradingEndHour?: number;
  /** Trading hours - timezone (default: 'UTC') */
  tradingTimezone?: string;
  /** Enable DST handling for trading hours (default: true) */
  enableDST?: boolean;
  /** Custom trading schedule by day of week (0=Sun, 6=Sat) */
  tradingSchedule?: TradingSchedule;
  /** Enable circuit breaker on exchange failures (default: true) */
  enableCircuitBreaker?: boolean;
  /** Circuit breaker failure threshold (default: 5) */
  circuitFailureThreshold?: number;
  /** Max drawdown % from peak (default: 20%) */
  maxDrawdownPercent?: number;
  /** Order timeout in ms (default: 30000 = 30s) */
  orderTimeoutMs?: number;
  /** Enable order retry on failure (default: true) */
  enableOrderRetry?: boolean;
  /** Max retry attempts (default: 3) */
  maxRetryAttempts?: number;
  /** Enable partial fill handling (default: true) */
  allowPartialFills?: number;
  /** Max staleness age for prices in ms (default: 60000 = 1min) */
  maxPriceStalenessMs?: number;
  /** Emergency stop - kill all trading (default: false) */
  emergencyStop?: boolean;
  /** Skip weekend trading (default: false) */
  skipWeekends?: boolean;
  /** Market types to trade (default: all) */
  markets?: ('crypto' | 'forex' | 'stock' | 'futures')[];
  /** Min signal confidence 0-100 (default: 50) */
  minSignalConfidence?: number;
  /** Max % of portfolio in single position (default: 30%) */
  maxPositionConcentration?: number;
  /** Max leverage (default: 1) */
  maxLeverage?: number;
  /** News blackout - no trading during major events (default: false) */
  newsBlackout?: boolean;
  /** Min volatility for trades (ATR as % of price) */
  minVolatilityPercent?: number;
  /** Max volatility - reduce size in high vol */
  maxVolatilityPercent?: number;
  /** Min reserve balance - keep cash on hand (default: 0) */
  minReserveBalance?: number;
  /** Max correlation between positions (0-1, default: 0.7) */
  maxCorrelation?: number;
  /** Require backtest validation before trading new strategies (default: false) */
  requireBacktest?: boolean;
  /** Max API calls per minute (default: 120) */
  maxAPICallsPerMinute?: number;
  /** News blackout events (list of event times or keywords) */
  newsBlackoutPeriods?: NewsBlackoutPeriod[];
}

/** Single trading window */
export interface TradingWindow {
  startHour: number;
  endHour: number;
}

/** Custom trading schedule by day of week */
export interface TradingSchedule {
  /** Map of day (0-6) to trading windows. Null = no trading that day. Array for multiple windows. */
  [day: number]: TradingWindow | TradingWindow[] | null;
}

/** News blackout period */
export interface NewsBlackoutPeriod {
  /** Start time (ISO string or timestamp) */
  start: number | string;
  /** End time (ISO string or timestamp) */
  end: number | string;
  /** Optional reason/description */
  reason?: string;
}

export interface GuardResult {
  allowed: boolean;
  reason: string;
  reasonCode: GuardReasonCode;
}

export enum GuardReasonCode {
  OK = 'ok',
  MAX_POSITIONS = 'max_positions',
  MAX_DAILY_LOSS = 'max_daily_loss',
  MAX_DAILY_TRADES = 'max_daily_trades',
  STOP_LOSS = 'stop_loss',
  TAKE_PROFIT = 'take_profit',
  WARMUP = 'warmup',
  SLIPPAGE = 'slippage',
  TRADING_HOURS = 'trading_hours',
  CIRCUIT_BREAKER = 'circuit_breaker',
  MAX_DRAWDOWN = 'max_drawdown',
  ORDER_TIMEOUT = 'order_timeout',
  PRICE_STALE = 'price_stale',
  EMERGENCY_STOP = 'emergency_stop',
  WEEKEND = 'weekend',
  MARKET_CLOSED = 'market_closed',
  // New reason codes
  LOW_CONFIDENCE = 'low_confidence',
  CONCENTRATION = 'concentration',
  LEVERAGE = 'leverage',
  NEWS_BLACKOUT = 'news_blackout',
  LOW_VOLATILITY = 'low_volatility',
  HIGH_VOLATILITY = 'high_volatility',
  // New
  RESERVE_BALANCE = 'reserve_balance',
  CORRELATION = 'correlation',
  BACKTEST_REQUIRED = 'backtest_required',
  API_RATE_LIMIT = 'api_rate_limit',
  TRADING_DAY_CLOSED = 'trading_day_closed',
}

export class AgentGuard {
  private config: Required<GuardConfig>;
  private tickCount: number = 0;
  private dailyLoss: number = 0;
  private dailyTrades: number = 0;
  private lastResetDate: string = '';
  private circuitOpen: boolean = false;
  
  // New: Drawdown tracking
  private peakValue: number = 0;
  private currentDrawdown: number = 0;
  
  // New: Price staleness tracking
  private lastPriceUpdate: Map<string, number> = new Map();
  
  // New: API rate limiting
  private apiCallTimestamps: number[] = [];
  
  constructor(config: GuardConfig = {}) {
    this.config = {
      maxPositions: config.maxPositions ?? 5,
      maxDailyLoss: config.maxDailyLoss ?? 1000,
      maxDailyTrades: config.maxDailyTrades ?? 20,
      stopLossPercent: config.stopLossPercent ?? 2,
      takeProfitPercent: config.takeProfitPercent ?? 5,
      riskPerTrade: config.riskPerTrade ?? 2,
      warmupTicks: config.warmupTicks ?? 5,
      maxSlippage: config.maxSlippage ?? 1,
      tradingStartHour: config.tradingStartHour ?? 0,
      tradingEndHour: config.tradingEndHour ?? 24,
      enableCircuitBreaker: config.enableCircuitBreaker ?? true,
      circuitFailureThreshold: config.circuitFailureThreshold ?? 5,
      // New configs
      maxDrawdownPercent: config.maxDrawdownPercent ?? 20,
      orderTimeoutMs: config.orderTimeoutMs ?? 30000,
      enableOrderRetry: config.enableOrderRetry ?? true,
      maxRetryAttempts: config.maxRetryAttempts ?? 3,
      allowPartialFills: config.allowPartialFills ?? 1, // 1 = enabled, 0 = disabled
      maxPriceStalenessMs: config.maxPriceStalenessMs ?? 60000,
      emergencyStop: config.emergencyStop ?? false,
      skipWeekends: config.skipWeekends ?? false,
      markets: config.markets ?? ['crypto', 'forex', 'stock', 'futures'],
      // New timezone configs
      tradingTimezone: config.tradingTimezone ?? 'UTC',
      enableDST: config.enableDST ?? true,
      // New guard configs
      minSignalConfidence: config.minSignalConfidence ?? 50,
      maxPositionConcentration: config.maxPositionConcentration ?? 30,
      maxLeverage: config.maxLeverage ?? 1,
      newsBlackout: config.newsBlackout ?? false,
      minVolatilityPercent: config.minVolatilityPercent ?? 0,
      maxVolatilityPercent: config.maxVolatilityPercent ?? 100,
      // New: Reserve, correlation, backtest, API rate
      minReserveBalance: config.minReserveBalance ?? 0,
      maxCorrelation: config.maxCorrelation ?? 0.7,
      requireBacktest: config.requireBacktest ?? false,
      maxAPICallsPerMinute: config.maxAPICallsPerMinute ?? 120,
      // Trading schedule
      tradingSchedule: config.tradingSchedule ?? null,
      // News blackout
      newsBlackoutPeriods: config.newsBlackoutPeriods ?? [],
    };
  }
  
  /**
   * Check if a new position should be allowed
   */
  checkNewPosition(
    currentPositions: number,
    portfolioValue: number,
    dailyPnl: number
  ): GuardResult {
    // Reset daily counters if new day
    this.resetDailyIfNeeded();
    
    // Check emergency stop
    if (this.config.emergencyStop) {
      return {
        allowed: false,
        reason: 'Emergency stop is active - all trading halted',
        reasonCode: GuardReasonCode.EMERGENCY_STOP,
      };
    }
    
    // Check warmup
    if (this.tickCount < this.config.warmupTicks) {
      return {
        allowed: false,
        reason: `Warmup: waiting ${this.config.warmupTicks - this.tickCount} more ticks`,
        reasonCode: GuardReasonCode.WARMUP,
      };
    }
    
    // Check max positions
    if (currentPositions >= this.config.maxPositions) {
      return {
        allowed: false,
        reason: `Max positions (${this.config.maxPositions}) reached`,
        reasonCode: GuardReasonCode.MAX_POSITIONS,
      };
    }
    
    // Check max daily trades
    if (this.dailyTrades >= this.config.maxDailyTrades) {
      return {
        allowed: false,
        reason: `Max daily trades (${this.config.maxDailyTrades}) reached`,
        reasonCode: GuardReasonCode.MAX_DAILY_TRADES,
      };
    }
    
    // Check max daily loss
    if (dailyPnl <= -this.config.maxDailyLoss) {
      return {
        allowed: false,
        reason: `Max daily loss ($${this.config.maxDailyLoss}) reached`,
        reasonCode: GuardReasonCode.MAX_DAILY_LOSS,
      };
    }
    
    // Check max drawdown
    this.updateDrawdown(portfolioValue);
    if (this.currentDrawdown >= this.config.maxDrawdownPercent) {
      return {
        allowed: false,
        reason: `Max drawdown (${this.config.maxDrawdownPercent}%) exceeded - current: ${this.currentDrawdown.toFixed(1)}%`,
        reasonCode: GuardReasonCode.MAX_DRAWDOWN,
      };
    }
    
    // Check trading hours (includes weekend check if enabled)
    if (!this.isWithinTradingHours()) {
      const hour = new Date().getHours();
      if (this.config.skipWeekends && (new Date().getDay() === 0 || new Date().getDay() === 6)) {
        return {
          allowed: false,
          reason: 'Weekend - trading disabled',
          reasonCode: GuardReasonCode.WEEKEND,
        };
      }
      return {
        allowed: false,
        reason: `Outside trading hours (${this.config.tradingStartHour}:00-${this.config.tradingEndHour}:00)`,
        reasonCode: GuardReasonCode.TRADING_HOURS,
      };
    }
    
    // Check circuit breaker
    if (this.circuitOpen) {
      return {
        allowed: false,
        reason: 'Circuit breaker is open - exchange experiencing issues',
        reasonCode: GuardReasonCode.CIRCUIT_BREAKER,
      };
    }
    
    return {
      allowed: true,
      reason: 'All checks passed',
      reasonCode: GuardReasonCode.OK,
    };
  }
  
  /**
   * Update portfolio value for drawdown tracking
   */
  updateDrawdown(currentValue: number): void {
    if (currentValue > this.peakValue) {
      this.peakValue = currentValue;
    }
    if (this.peakValue > 0) {
      this.currentDrawdown = ((this.peakValue - currentValue) / this.peakValue) * 100;
    }
  }
  
  /**
   * Check if price is stale for a symbol
   */
  checkPriceStaleness(symbol: string, priceTimestamp: number): GuardResult {
    const now = Date.now();
    const age = now - priceTimestamp;
    
    if (age > this.config.maxPriceStalenessMs) {
      return {
        allowed: false,
        reason: `Price stale: ${Math.round(age / 1000)}s old (max ${this.config.maxPriceStalenessMs / 1000}s)`,
        reasonCode: GuardReasonCode.PRICE_STALE,
      };
    }
    
    return {
      allowed: true,
      reason: 'Price is fresh',
      reasonCode: GuardReasonCode.OK,
    };
  }
  
  /**
   * Record price update for staleness tracking
   */
  recordPriceUpdate(symbol: string, timestamp: number): void {
    this.lastPriceUpdate.set(symbol, timestamp);
  }
  
  /**
   * Enable/disable emergency stop
   */
  setEmergencyStop(enabled: boolean): void {
    this.config.emergencyStop = enabled;
  }
  
  /**
   * Get current drawdown %
   */
  getCurrentDrawdown(): number {
    return this.currentDrawdown;
  }
  
  /**
   * Reset drawdown tracking (e.g., start of new session)
   */
  resetDrawdown(): void {
    this.peakValue = 0;
    this.currentDrawdown = 0;
  }
  
  /**
   * Check if order should be retried
   */
  shouldRetry(attemptCount: number): boolean {
    return this.config.enableOrderRetry && attemptCount < this.config.maxRetryAttempts;
  }
  
  /**
   * Get order timeout
   */
  getOrderTimeout(): number {
    return this.config.orderTimeoutMs;
  }
  
  /**
   * Check if partial fills allowed
   */
  isPartialFillsEnabled(): boolean {
    return this.config.allowPartialFills > 0;
  }
  
  /**
   * Check if position should be closed due to stop loss
   */
  checkStopLoss(position: Position): GuardResult {
    const pnlPercent = position.pnlPercent;
    
    if (pnlPercent <= -this.config.stopLossPercent) {
      return {
        allowed: false,
        reason: `Stop loss triggered: ${pnlPercent.toFixed(2)}% <= -${this.config.stopLossPercent}%`,
        reasonCode: GuardReasonCode.STOP_LOSS,
      };
    }
    
    return { allowed: true, reason: 'No stop loss', reasonCode: GuardReasonCode.OK };
  }
  
  /**
   * Check if position should be closed due to take profit
   */
  checkTakeProfit(position: Position): GuardResult {
    const pnlPercent = position.pnlPercent;
    
    if (pnlPercent >= this.config.takeProfitPercent) {
      return {
        allowed: false,
        reason: `Take profit triggered: ${pnlPercent.toFixed(2)}% >= ${this.config.takeProfitPercent}%`,
        reasonCode: GuardReasonCode.TAKE_PROFIT,
      };
    }
    
    return { allowed: true, reason: 'No take profit', reasonCode: GuardReasonCode.OK };
  }
  
  /**
   * Check slippage before order execution
   */
  checkSlippage(orderPrice: number, currentPrice: number): GuardResult {
    const slippage = Math.abs((orderPrice - currentPrice) / currentPrice) * 100;
    
    if (slippage > this.config.maxSlippage) {
      return {
        allowed: false,
        reason: `Slippage too high: ${slippage.toFixed(2)}% > ${this.config.maxSlippage}%`,
        reasonCode: GuardReasonCode.SLIPPAGE,
      };
    }
    
    return { allowed: true, reason: 'Slippage acceptable', reasonCode: GuardReasonCode.OK };
  }
  
  /**
   * Calculate position size based on risk %
   */
  calculatePositionSize(portfolioValue: number, entryPrice: number): number {
    const riskAmount = portfolioValue * (this.config.riskPerTrade / 100);
    // Size = risk / (entry * stopLoss%)
    const size = riskAmount / (entryPrice * (this.config.stopLossPercent / 100));
    return size;
  }
  
  /**
   * Record a trade (for daily limits)
   */
  recordTrade(): void {
    this.dailyTrades++;
  }
  
  /**
   * Record a loss (for daily loss limit)
   */
  recordLoss(amount: number): void {
    this.dailyLoss += Math.abs(amount);
  }
  
  /**
   * Record a profit (for daily loss calculation)
   */
  recordProfit(amount: number): void {
    this.dailyLoss -= amount;
  }
  
  /**
   * Increment tick count
   */
  tick(): void {
    this.tickCount++;
  }
  
  /**
   * Get current tick count
   */
  getTickCount(): number {
    return this.tickCount;
  }
  
  /**
   * Get config
   */
  getConfig(): Required<GuardConfig> {
    return { ...this.config };
  }
  
  /**
   * Open circuit breaker
   */
  openCircuit(): void {
    this.circuitOpen = true;
  }
  
  /**
   * Close circuit breaker
   */
  closeCircuit(): void {
    this.circuitOpen = false;
  }
  
  /**
   * Check if circuit is open
   */
  isCircuitOpen(): boolean {
    return this.circuitOpen;
  }
  
  private resetDailyIfNeeded(): void {
    const today = new Date().toISOString().split('T')[0];
    if (today !== this.lastResetDate) {
      this.dailyLoss = 0;
      this.dailyTrades = 0;
      this.lastResetDate = today;
    }
  }
  
  /**
   * Check if current time is within trading hours (with timezone & DST support)
   */
  isWithinTradingHours(): boolean {
    try {
      // Get current time in the configured timezone
      const now = new Date();
      
      // Create a date in the target timezone
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: this.config.tradingTimezone,
        hour: 'numeric',
        hour12: false,
        weekday: 'short',
      });
      
      // Get hour in target timezone
      const hourStr = formatter.format(now).replace(/[^0-9]/g, '');
      const hour = parseInt(hourStr, 10);
      
      // Check if within hours
      if (hour < this.config.tradingStartHour || hour >= this.config.tradingEndHour) {
        return false;
      }
      
      // Weekend check
      if (this.config.skipWeekends) {
        const day = now.getDay();
        if (day === 0 || day === 6) { // Sunday = 0, Saturday = 6
          return false;
        }
      }
      
      return true;
    } catch (e) {
      // If timezone is invalid, fallback to UTC
      console.warn(`Invalid timezone ${this.config.tradingTimezone}, falling back to UTC`);
      const hour = new Date().getUTCHours();
      return hour >= this.config.tradingStartHour && hour < this.config.tradingEndHour;
    }
  }
  
  /**
   * Check signal confidence
   */
  checkSignalConfidence(confidence: number): GuardResult {
    if (confidence < this.config.minSignalConfidence) {
      return {
        allowed: false,
        reason: `Signal confidence ${confidence}% below minimum ${this.config.minSignalConfidence}%`,
        reasonCode: GuardReasonCode.LOW_CONFIDENCE,
      };
    }
    return { allowed: true, reason: 'OK', reasonCode: GuardReasonCode.OK };
  }
  
  /**
   * Check position concentration
   */
  checkPositionConcentration(positionValue: number, portfolioValue: number): GuardResult {
    if (portfolioValue <= 0) {
      return { allowed: true, reason: 'OK', reasonCode: GuardReasonCode.OK };
    }
    
    const concentrationPercent = (positionValue / portfolioValue) * 100;
    if (concentrationPercent > this.config.maxPositionConcentration) {
      return {
        allowed: false,
        reason: `Position concentration ${concentrationPercent.toFixed(1)}% exceeds max ${this.config.maxPositionConcentration}%`,
        reasonCode: GuardReasonCode.CONCENTRATION,
      };
    }
    return { allowed: true, reason: 'OK', reasonCode: GuardReasonCode.OK };
  }
  
  /**
   * Check leverage
   */
  checkLeverage(leverage: number): GuardResult {
    if (leverage > this.config.maxLeverage) {
      return {
        allowed: false,
        reason: `Leverage ${leverage}x exceeds max ${this.config.maxLeverage}x`,
        reasonCode: GuardReasonCode.LEVERAGE,
      };
    }
    return { allowed: true, reason: 'OK', reasonCode: GuardReasonCode.OK };
  }
  
  /**
   * Check volatility
   */
  checkVolatility(volatilityPercent: number): GuardResult {
    if (this.config.minVolatilityPercent > 0 && volatilityPercent < this.config.minVolatilityPercent) {
      return {
        allowed: false,
        reason: `Volatility ${volatilityPercent.toFixed(2)}% below minimum ${this.config.minVolatilityPercent}%`,
        reasonCode: GuardReasonCode.LOW_VOLATILITY,
      };
    }
    if (volatilityPercent > this.config.maxVolatilityPercent) {
      return {
        allowed: false,
        reason: `Volatility ${volatilityPercent.toFixed(2)}% exceeds maximum ${this.config.maxVolatilityPercent}%`,
        reasonCode: GuardReasonCode.HIGH_VOLATILITY,
      };
    }
    return { allowed: true, reason: 'OK', reasonCode: GuardReasonCode.OK };
  }
  
  /**
   * Check reserve balance - keep cash on hand
   */
  checkReserveBalance(availableBalance: number): GuardResult {
    if (availableBalance < this.config.minReserveBalance) {
      return {
        allowed: false,
        reason: `Available balance $${availableBalance.toFixed(2)} below minimum reserve $${this.config.minReserveBalance}`,
        reasonCode: GuardReasonCode.RESERVE_BALANCE,
      };
    }
    return { allowed: true, reason: 'OK', reasonCode: GuardReasonCode.OK };
  }
  
  /**
   * Check correlation between positions (simplified)
   * In production, you'd calculate actual correlation matrix
   */
  checkCorrelation(positionSymbols: string[], newSymbol: string): GuardResult {
    if (positionSymbols.length === 0) {
      return { allowed: true, reason: 'OK', reasonCode: GuardReasonCode.OK };
    }
    
    // Simplified: Check if new symbol is in same "sector" as existing
    // In production, use actual price correlation
    const correlatedSymbols = positionSymbols.filter(s => {
      // Same base asset = high correlation (e.g., BTC/USD vs BTC/EUR)
      const base1 = s.split('/')[0];
      const base2 = newSymbol.split('/')[0];
      return base1 === base2;
    });
    
    // If too many correlated positions, block
    const correlationRatio = correlatedSymbols.length / positionSymbols.length;
    if (correlationRatio > this.config.maxCorrelation) {
      return {
        allowed: false,
        reason: `Correlation ${(correlationRatio * 100).toFixed(0)}% exceeds max ${(this.config.maxCorrelation * 100).toFixed(0)}%`,
        reasonCode: GuardReasonCode.CORRELATION,
      };
    }
    return { allowed: true, reason: 'OK', reasonCode: GuardReasonCode.OK };
  }
  
  /**
   * Check if news blackout is active
   */
  checkNewsBlackout(): GuardResult {
    if (!this.config.newsBlackout) {
      return { allowed: true, reason: 'OK', reasonCode: GuardReasonCode.OK };
    }
    
    const now = Date.now();
    for (const period of this.config.newsBlackoutPeriods) {
      const start = typeof period.start === 'string' ? new Date(period.start).getTime() : period.start;
      const end = typeof period.end === 'string' ? new Date(period.end).getTime() : period.end;
      
      if (now >= start && now <= end) {
        return {
          allowed: false,
          reason: `News blackout active: ${period.reason || 'Major event'}`,
          reasonCode: GuardReasonCode.NEWS_BLACKOUT,
        };
      }
    }
    return { allowed: true, reason: 'OK', reasonCode: GuardReasonCode.OK };
  }
  
  /**
   * Check API rate limit
   */
  checkAPIRateLimit(): GuardResult {
    const limit = this.config.maxAPICallsPerMinute;
    if (limit <= 0) {
      return { allowed: true, reason: 'OK', reasonCode: GuardReasonCode.OK };
    }
    
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute window
    
    // Clean old timestamps
    this.apiCallTimestamps = this.apiCallTimestamps.filter(ts => now - ts < windowMs);
    
    if (this.apiCallTimestamps.length >= limit) {
      return {
        allowed: false,
        reason: `API rate limit: ${this.apiCallTimestamps.length}/${limit} calls in last minute`,
        reasonCode: GuardReasonCode.API_RATE_LIMIT,
      };
    }
    
    return { allowed: true, reason: 'OK', reasonCode: GuardReasonCode.OK };
  }
  
  /**
   * Record an API call
   */
  recordAPICall(): void {
    this.apiCallTimestamps.push(Date.now());
  }
  
  /**
   * Check trading schedule (custom days/hours)
   */
  checkTradingSchedule(): GuardResult {
    const schedule = this.config.tradingSchedule;
    if (!schedule) {
      // Use simple hours if no custom schedule
      if (this.isWithinTradingHours()) {
        return { allowed: true, reason: 'OK', reasonCode: GuardReasonCode.OK };
      }
      return {
        allowed: false,
        reason: `Outside trading hours (${this.config.tradingStartHour}:00-${this.config.tradingEndHour}:00)`,
        reasonCode: GuardReasonCode.TRADING_HOURS,
      };
    }
    
    // Check custom schedule
    const now = new Date();
    const day = now.getDay();
    const hour = now.getHours();
    
    const daySchedule = schedule[day];
    if (!daySchedule) {
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      return {
        allowed: false,
        reason: `${dayNames[day]} - trading not scheduled`,
        reasonCode: GuardReasonCode.TRADING_DAY_CLOSED,
      };
    }
    
    // Handle multiple windows (array) or single window
    const windows = Array.isArray(daySchedule) ? daySchedule : [daySchedule];
    
    // Check if current hour falls within any window
    const withinWindow = windows.some(w => hour >= w.startHour && hour < w.endHour);
    
    if (!withinWindow) {
      const windowStr = windows.map(w => `${w.startHour}:00-${w.endHour}:00`).join(', ');
      return {
        allowed: false,
        reason: `Outside trading hours. Available: ${windowStr}`,
        reasonCode: GuardReasonCode.TRADING_HOURS,
      };
    }
    
    return { allowed: true, reason: 'OK', reasonCode: GuardReasonCode.OK };
  }
}

// Factory
export function createAgentGuard(config?: GuardConfig): AgentGuard {
  return new AgentGuard(config);
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
  private positions: Map<string, Position> = new Map();
  private dailyTrades: number = 0;
  private dailyPnl: number = 0;
  private guard: AgentGuard;
  private qos: QoSManager;
  private backtest: import('./backtest').BacktestValidator | null = null;
  private news: import('./news').NewsService | null = null;
  
  constructor(config: AgentConfig) {
    super();
    this.config = {
      tickInterval: config.tickInterval ?? 60000,
      paperMode: config.paperMode ?? true,
      ...config,
    };
    
    // Create scheduler
    this.scheduler = createScheduler({ enableHeartbeat: false });
    
    // Create guard with config or defaults
    this.guard = createAgentGuard(config.guard);
    
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
    if (closePositions && this.positions.size > 0) {
      const connector = this.config.connectors[0];
      
      for (const [symbol, position] of this.positions) {
        try {
          const currentPrice = await connector.getPrice(symbol);
          await this.closePosition(symbol, currentPrice, 'Graceful shutdown');
        } catch (e) {
          this.emit('agent:error', { 
            error: `Failed to close position ${symbol}: ${e}`, 
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
    return Array.from(this.positions.values());
  }
  
  /**
   * Get position for a symbol
   */
  getPosition(symbol: string): Position | undefined {
    return this.positions.get(symbol);
  }
  
  /**
   * Get the agent guard
   */
  getGuard(): AgentGuard {
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
    return {
      emergencyStop: (this.guard as any).config?.emergencyStop ?? false,
      drawdown: this.guard.getCurrentDrawdown(),
      peakValue: (this.guard as any).peakValue ?? 0,
      dailyTrades: this.dailyTrades,
      dailyLoss: this.dailyPnl,
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
    
    // Calculate positions value and P&L
    for (const position of this.positions.values()) {
      const currentPrice = await connector.getPrice(position.symbol);
      position.currentPrice = currentPrice;
      
      // Record price for staleness tracking
      this.guard.recordPriceUpdate(position.symbol, Date.now());
      
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
    
    // Update drawdown tracking
    this.guard.updateDrawdown(totalValue);
    
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
  
  /**
   * Log audit event
   */
  private async logAudit(
    eventType: AuditEventType,
    details: Record<string, any>,
    riskLevel: RiskLevel = 'low'
  ): Promise<void> {
    try {
      await logAuditEvent(
        eventType,
        'trading-agent',
        { 
          ...details,
          tick: this.tickCount,
          positions: this.positions.size,
          dailyTrades: this.dailyTrades,
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
    for (const [symbol, position] of this.positions) {
      // Check stop loss
      const stopLossResult = this.guard.checkStopLoss(position);
      if (!stopLossResult.allowed) {
        const connector = this.config.connectors[0];
        const currentPrice = await connector.getPrice(symbol);
        await this.closePosition(symbol, currentPrice, stopLossResult.reason);
        continue;
      }
      
      // Check take profit
      const takeProfitResult = this.guard.checkTakeProfit(position);
      if (!takeProfitResult.allowed) {
        const connector = this.config.connectors[0];
        const currentPrice = await connector.getPrice(symbol);
        await this.closePosition(symbol, currentPrice, takeProfitResult.reason);
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
    const position = this.positions.get(signal.symbol);
    const positionSize = position ? position.amount * position.entryPrice : 0;
    
    // Get portfolio value
    const portfolio = await this.getPortfolio();
    
    // Check position concentration
    const orderValue = signal.price * (signal.price > 0 ? (100 / signal.price) : 0);
    const concentrationCheck = this.guard.checkPositionConcentration(orderValue, portfolio.totalValue);
    if (!concentrationCheck.allowed) {
      return {
        valid: false,
        action: 'block',
        reason: concentrationCheck.reason,
      };
    }
    
    // Check correlation with existing positions
    const positionSymbols = Array.from(this.positions.keys());
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
      dailyTradeCount: this.dailyTrades,
      dailyLoss: this.dailyPnl,
      portfolioValue: portfolio.totalValue,
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
    const portfolio = await this.getPortfolio();
    const guardResult = this.guard.checkNewPosition(
      this.positions.size,
      portfolio.totalValue,
      portfolio.dailyPnl
    );
    
    if (!guardResult.allowed) {
      this.emit('signal:blocked', { signal, guardResult });
      this.emit('guard:blocked', { guardResult });
      return;
    }
    
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
      // Execute order with circuit breaker protection
      const result = await this.qos.executeWithBreaker(
        `connector:${connector.name}`,
        () => connector.placeOrder(order)
      );
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
      
      // Record trade in guard
      this.guard.recordTrade();
      
      this.emit('order:placed', { execution });
      this.emit('position:opened', { position });
      
      // Audit log
      await this.logAudit('trade_executed', {
        symbol: position.symbol,
        side: position.side,
        amount: position.amount,
        entryPrice: position.entryPrice,
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
      
      // Record profit/loss in guard
      if (pnl < 0) {
        this.guard.recordLoss(pnl);
      } else {
        this.guard.recordProfit(pnl);
      }
      
      // Close position
      position.closedAt = Date.now();
      this.positions.delete(symbol);
      
      this.emit('order:filled', { execution });
      this.emit('position:closed', { position, pnl });
      
      // Audit log
      await this.logAudit('trade_executed', {
        symbol: position.symbol,
        side: position.side,
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
