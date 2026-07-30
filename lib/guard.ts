/**
 * Guard Module
 * 
 * Pre-trade risk checks and trading protections.
 * Uses: event (for emit), error (for validation errors)
 */

import { EventEmitter } from './event';
import { createError, ErrorCode } from './error';
import { logAuditEvent } from './audit';
import { type Storage, createJSONStorage } from './storage';

// ============================================================================
// Types
// ============================================================================

/** Guard configuration */
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
  tradingSchedule?: TradingSchedule | null;
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

/** State to persist for guard */
export interface GuardState {
  dailyLoss: number;
  dailyTrades: number;
  lastResetDate: string;
  circuitOpen: boolean;
  peakValue: number;
  currentDrawdown: number;
  consecutiveLosses: number;
  warmingUp: boolean;
}

/** Guard result */
export interface GuardResult {
  allowed: boolean;
  reason: string;
  reasonCode: GuardReasonCode;
}

/** Guard reason codes */
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

/** Position for guard checks */
export interface GuardPosition {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  entryPrice: number;
  amount: number;
  currentPrice?: number;
  pnl?: number;
  pnlPercent?: number;
  openedAt: number;
  closedAt?: number;
}

// ============================================================================
// Events
// ============================================================================

export interface GuardEvents {
  'guard:blocked': { result: GuardResult };
  'guard:passed': { result: GuardResult };
  'circuit:opened': {};
  'circuit:closed': {};
}

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_CONFIG: Required<GuardConfig> = {
  maxPositions: 5,
  maxDailyLoss: 1000,
  maxDailyTrades: 20,
  stopLossPercent: 2,
  takeProfitPercent: 5,
  riskPerTrade: 2,
  warmupTicks: 5,
  maxSlippage: 1,
  tradingStartHour: 0,
  tradingEndHour: 24,
  tradingTimezone: 'UTC',
  enableDST: true,
  tradingSchedule: null,
  enableCircuitBreaker: true,
  circuitFailureThreshold: 5,
  maxDrawdownPercent: 20,
  orderTimeoutMs: 30000,
  enableOrderRetry: true,
  maxRetryAttempts: 3,
  allowPartialFills: 1,
  maxPriceStalenessMs: 60000,
  emergencyStop: false,
  skipWeekends: false,
  markets: ['crypto', 'forex', 'stock', 'futures'],
  minSignalConfidence: 50,
  maxPositionConcentration: 30,
  maxLeverage: 1,
  newsBlackout: false,
  minVolatilityPercent: 0,
  maxVolatilityPercent: 100,
  minReserveBalance: 0,
  maxCorrelation: 0.7,
  requireBacktest: false,
  maxAPICallsPerMinute: 120,
  newsBlackoutPeriods: [],
};

// ============================================================================
// Guard Class
// ============================================================================

export class Guard extends EventEmitter<GuardEvents> {
  private config: Required<GuardConfig>;
  private storage?: Storage;
  private userId?: string;
  private tickCount: number = 0;
  private dailyLoss: number = 0;
  private dailyTrades: number = 0;
  private lastResetDate: string = new Date().toISOString().split('T')[0];
  private circuitOpen: boolean = false;
  
  // Drawdown tracking
  private peakValue: number = 0;
  private currentDrawdown: number = 0;
  
  // Consecutive losses for circuit breaker
  private consecutiveLosses: number = 0;
  
  // Price staleness tracking
  private lastPriceUpdate: Map<string, number> = new Map();
  
  // API rate limiting
  private apiCallTimestamps: number[] = [];

  // Warmup state
  private warmingUp: boolean = true;
  
  // Dynamic news blackout periods (from news service)
  private dynamicBlackouts: NewsBlackoutPeriod[] = [];

  constructor(config: GuardConfig = {}, storage?: Storage, userId?: string) {
    super();
    this.config = {
      maxPositions: config.maxPositions ?? DEFAULT_CONFIG.maxPositions,
      maxDailyLoss: config.maxDailyLoss ?? DEFAULT_CONFIG.maxDailyLoss,
      maxDailyTrades: config.maxDailyTrades ?? DEFAULT_CONFIG.maxDailyTrades,
      stopLossPercent: config.stopLossPercent ?? DEFAULT_CONFIG.stopLossPercent,
      takeProfitPercent: config.takeProfitPercent ?? DEFAULT_CONFIG.takeProfitPercent,
      riskPerTrade: config.riskPerTrade ?? DEFAULT_CONFIG.riskPerTrade,
      warmupTicks: config.warmupTicks ?? DEFAULT_CONFIG.warmupTicks,
      maxSlippage: config.maxSlippage ?? DEFAULT_CONFIG.maxSlippage,
      tradingStartHour: config.tradingStartHour ?? DEFAULT_CONFIG.tradingStartHour,
      tradingEndHour: config.tradingEndHour ?? DEFAULT_CONFIG.tradingEndHour,
      tradingTimezone: config.tradingTimezone ?? DEFAULT_CONFIG.tradingTimezone,
      enableDST: config.enableDST ?? DEFAULT_CONFIG.enableDST,
      tradingSchedule: config.tradingSchedule ?? DEFAULT_CONFIG.tradingSchedule,
      enableCircuitBreaker: config.enableCircuitBreaker ?? DEFAULT_CONFIG.enableCircuitBreaker,
      circuitFailureThreshold: config.circuitFailureThreshold ?? DEFAULT_CONFIG.circuitFailureThreshold,
      maxDrawdownPercent: config.maxDrawdownPercent ?? DEFAULT_CONFIG.maxDrawdownPercent,
      orderTimeoutMs: config.orderTimeoutMs ?? DEFAULT_CONFIG.orderTimeoutMs,
      enableOrderRetry: config.enableOrderRetry ?? DEFAULT_CONFIG.enableOrderRetry,
      maxRetryAttempts: config.maxRetryAttempts ?? DEFAULT_CONFIG.maxRetryAttempts,
      allowPartialFills: config.allowPartialFills ?? DEFAULT_CONFIG.allowPartialFills,
      maxPriceStalenessMs: config.maxPriceStalenessMs ?? DEFAULT_CONFIG.maxPriceStalenessMs,
      emergencyStop: config.emergencyStop ?? DEFAULT_CONFIG.emergencyStop,
      skipWeekends: config.skipWeekends ?? DEFAULT_CONFIG.skipWeekends,
      markets: config.markets ?? DEFAULT_CONFIG.markets,
      minSignalConfidence: config.minSignalConfidence ?? DEFAULT_CONFIG.minSignalConfidence,
      maxPositionConcentration: config.maxPositionConcentration ?? DEFAULT_CONFIG.maxPositionConcentration,
      maxLeverage: config.maxLeverage ?? DEFAULT_CONFIG.maxLeverage,
      newsBlackout: config.newsBlackout ?? DEFAULT_CONFIG.newsBlackout,
      minVolatilityPercent: config.minVolatilityPercent ?? DEFAULT_CONFIG.minVolatilityPercent,
      maxVolatilityPercent: config.maxVolatilityPercent ?? DEFAULT_CONFIG.maxVolatilityPercent,
      minReserveBalance: config.minReserveBalance ?? DEFAULT_CONFIG.minReserveBalance,
      maxCorrelation: config.maxCorrelation ?? DEFAULT_CONFIG.maxCorrelation,
      requireBacktest: config.requireBacktest ?? DEFAULT_CONFIG.requireBacktest,
      maxAPICallsPerMinute: config.maxAPICallsPerMinute ?? DEFAULT_CONFIG.maxAPICallsPerMinute,
      newsBlackoutPeriods: config.newsBlackoutPeriods ?? DEFAULT_CONFIG.newsBlackoutPeriods,
    };
    this.storage = storage;
    this.userId = userId;
  }
  
  // ============================================================================
  // Persistence
  // ============================================================================

  /**
   * Get storage key for this guard
   */
  private getStorageKey(): string {
    if (!this.userId) return 'guard:default';
    return `guard:${this.userId}`;
  }

  /**
   * Save guard state to storage
   */
  async save(): Promise<void> {
    if (!this.storage) return;
    
    this.resetDailyIfNeeded();
    
    const state: GuardState = {
      dailyLoss: this.dailyLoss,
      dailyTrades: this.dailyTrades,
      lastResetDate: this.lastResetDate,
      circuitOpen: this.circuitOpen,
      peakValue: this.peakValue,
      currentDrawdown: this.currentDrawdown,
      consecutiveLosses: this.consecutiveLosses,
      warmingUp: this.warmingUp,
    };
    
    // Use JSON storage helper
    const jsonStorage = createJSONStorage<GuardState>(this.storage, this.getStorageKey());
    await jsonStorage.save(state);
    
    logAuditEvent('guard_saved' as any, 'guard', { 
      userId: this.userId,
      circuitOpen: state.circuitOpen 
    });
  }

  /**
   * Load guard state from storage
   */
  async load(): Promise<boolean> {
    if (!this.storage) return false;
    
    // Use JSON storage helper
    const jsonStorage = createJSONStorage<GuardState>(this.storage, this.getStorageKey());
    const state = await jsonStorage.load();
    
    if (!state) return false;
    
    try {
      this.dailyLoss = state.dailyLoss;
      this.dailyTrades = state.dailyTrades;
      this.lastResetDate = state.lastResetDate;
      this.circuitOpen = state.circuitOpen;
      this.peakValue = state.peakValue;
      this.currentDrawdown = state.currentDrawdown;
      this.consecutiveLosses = state.consecutiveLosses;
      this.warmingUp = state.warmingUp;
      
      // Check if we need to reset daily (new day)
      this.resetDailyIfNeeded();
      
      logAuditEvent('guard_loaded' as any, 'guard', { 
        userId: this.userId,
        circuitOpen: this.circuitOpen 
      });
      
      return true;
    } catch (error) {
      console.error('Failed to load guard state:', error);
      return false;
    }
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
      const result = {
        allowed: false,
        reason: 'Emergency stop is active - all trading halted',
        reasonCode: GuardReasonCode.EMERGENCY_STOP,
      };
      this.emit('guard:blocked', { result });
      logAuditEvent('guard_blocked' as any, 'guard', { reasonCode: result.reasonCode, reason: result.reason });
      return result;
    }
    
    // Check warmup
    if (this.tickCount < this.config.warmupTicks) {
      const result = {
        allowed: false,
        reason: `Warmup: waiting ${this.config.warmupTicks - this.tickCount} more ticks`,
        reasonCode: GuardReasonCode.WARMUP,
      };
      this.emit('guard:blocked', { result });
      return result;
    }
    
    // Check max positions
    if (currentPositions >= this.config.maxPositions) {
      const result = {
        allowed: false,
        reason: `Max positions (${this.config.maxPositions}) reached`,
        reasonCode: GuardReasonCode.MAX_POSITIONS,
      };
      this.emit('guard:blocked', { result });
      logAuditEvent('guard_blocked' as any, 'guard', { reasonCode: result.reasonCode, reason: result.reason, currentPositions, maxPositions: this.config.maxPositions });
      return result;
    }
    
    // Check max daily trades
    if (this.dailyTrades >= this.config.maxDailyTrades) {
      const result = {
        allowed: false,
        reason: `Max daily trades (${this.config.maxDailyTrades}) reached`,
        reasonCode: GuardReasonCode.MAX_DAILY_TRADES,
      };
      this.emit('guard:blocked', { result });
      logAuditEvent('guard_blocked' as any, 'guard', { reasonCode: result.reasonCode, reason: result.reason, dailyTrades: this.dailyTrades, maxDailyTrades: this.config.maxDailyTrades });
      return result;
    }
    
    // Check max daily loss
    if (dailyPnl <= -this.config.maxDailyLoss) {
      const result = {
        allowed: false,
        reason: `Max daily loss ($${this.config.maxDailyLoss}) reached`,
        reasonCode: GuardReasonCode.MAX_DAILY_LOSS,
      };
      this.emit('guard:blocked', { result });
      logAuditEvent('guard_blocked' as any, 'guard', { reasonCode: result.reasonCode, reason: result.reason, dailyPnl, maxDailyLoss: this.config.maxDailyLoss });
      return result;
    }
    
    // Check max drawdown
    this.updateDrawdown(portfolioValue);
    if (this.currentDrawdown >= this.config.maxDrawdownPercent) {
      const result = {
        allowed: false,
        reason: `Max drawdown (${this.config.maxDrawdownPercent}%) exceeded - current: ${this.currentDrawdown.toFixed(1)}%`,
        reasonCode: GuardReasonCode.MAX_DRAWDOWN,
      };
      this.emit('guard:blocked', { result });
      logAuditEvent('guard_blocked' as any, 'guard', { reasonCode: result.reasonCode, reason: result.reason, currentDrawdown: this.currentDrawdown, maxDrawdownPercent: this.config.maxDrawdownPercent });
      return result;
    }
    
    // Check trading hours (includes weekend check if enabled)
    if (!this.isWithinTradingHours()) {
      const hour = new Date().getHours();
      if (this.config.skipWeekends && (new Date().getDay() === 0 || new Date().getDay() === 6)) {
        const result = {
          allowed: false,
          reason: 'Weekend - trading disabled',
          reasonCode: GuardReasonCode.WEEKEND,
        };
        this.emit('guard:blocked', { result });
        return result;
      }
      const result = {
        allowed: false,
        reason: `Outside trading hours (${this.config.tradingStartHour}:00-${this.config.tradingEndHour}:00)`,
        reasonCode: GuardReasonCode.TRADING_HOURS,
      };
      this.emit('guard:blocked', { result });
      return result;
    }
    
    // Check circuit breaker
    if (this.circuitOpen) {
      const result = {
        allowed: false,
        reason: 'Circuit breaker is open - exchange experiencing issues',
        reasonCode: GuardReasonCode.CIRCUIT_BREAKER,
      };
      this.emit('guard:blocked', { result });
      return result;
    }
    
    const result = {
      allowed: true,
      reason: 'All checks passed',
      reasonCode: GuardReasonCode.OK,
    };
    this.emit('guard:passed', { result });
    return result;
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
    logAuditEvent('emergency_stop_changed' as any, 'guard', { enabled });
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
  checkStopLoss(position: GuardPosition): GuardResult {
    const pnlPercent = position.pnlPercent ?? 0;
    
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
  checkTakeProfit(position: GuardPosition): GuardResult {
    const pnlPercent = position.pnlPercent ?? 0;
    
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
   * Get current daily trade count (for debugging)
   */
  getDailyTrades(): number {
    return this.dailyTrades;
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
    this.emit('circuit:opened', {});
    logAuditEvent('circuit_opened' as any, 'guard', { circuitOpen: this.circuitOpen });
  }
  
  /**
   * Close circuit breaker
   */
  closeCircuit(): void {
    this.circuitOpen = false;
    this.emit('circuit:closed', {});
    logAuditEvent('circuit_closed' as any, 'guard', { circuitOpen: this.circuitOpen });
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
   * Check if news blackout is active (both configured and dynamic)
   */
  checkNewsBlackout(): GuardResult {
    if (!this.config.newsBlackout) {
      return { allowed: true, reason: 'OK', reasonCode: GuardReasonCode.OK };
    }
    
    const now = Date.now();
    
    // Check configured blackouts
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
    
    // Check dynamic blackouts (from news service)
    for (const period of this.dynamicBlackouts) {
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
   * Add a dynamic news blackout period (e.g., from news service)
   */
  addNewsBlackoutPeriod(period: NewsBlackoutPeriod): void {
    this.dynamicBlackouts.push(period);
    logAuditEvent('news_blackout_added' as any, 'guard', {
      start: period.start,
      end: period.end,
      reason: period.reason,
    });
  }
  
  /**
   * Clear all dynamic news blackout periods (keeps configured ones)
   */
  clearDynamicBlackouts(): void {
    const originalCount = this.dynamicBlackouts.length;
    this.dynamicBlackouts = [];
    if (originalCount > 0) {
      logAuditEvent('news_blackouts_cleared' as any, 'guard', { count: originalCount });
    }
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

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a Guard instance with optional config
 */
export function createGuard(config?: GuardConfig, storage?: Storage, userId?: string): Guard {
  return new Guard(config, storage, userId);
}
