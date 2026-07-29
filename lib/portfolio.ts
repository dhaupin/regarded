/**
 * Portfolio Module
 * 
 * Position tracking, P&L management, and risk controls.
 * Uses: event (emit position events), audit (log trades), error (validation)
 */

import { EventEmitter } from './event';
import { logAuditEvent } from './audit';
import { createError, ErrorCode } from './error';
import type { Order, OrderSide } from './types';

// ============================================================================
// Types
// ============================================================================

export interface Position {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  entryPrice: number;
  amount: number;
  currentPrice?: number;
  unrealizedPnl?: number;
  realizedPnl?: number;
  stopLoss?: number;
  takeProfit?: number;
  openedAt: number;
  closedAt?: number;
  metadata?: Record<string, any>;
}

export interface PortfolioConfig {
  /** Maximum number of concurrent positions */
  maxPositions?: number;
  /** Maximum position size in USD */
  maxPositionSize?: number;
  /** Maximum daily loss in USD before stopping */
  maxDailyLoss?: number;
  /** Maximum daily trades */
  maxDailyTrades?: number;
}

export interface PortfolioStats {
  totalRealizedPnl: number;
  totalUnrealizedPnl: number;
  totalExposure: number;
  dailyPnl: number;
  dailyTrades: number;
  winRate: number;
  positionsCount: number;
  winningTrades: number;
  losingTrades: number;
}

export interface RiskCheckResult {
  allowed: boolean;
  reason?: string;
  details?: Record<string, any>;
}

export interface PositionOpenResult {
  success: boolean;
  position?: Position;
  error?: string;
}

export interface PositionCloseResult {
  success: boolean;
  position?: Position;
  pnl?: number;
  error?: string;
}

// ============================================================================
// Events
// ============================================================================

export interface PortfolioEvents {
  'position:opened': { position: Position };
  'position:closed': { position: Position; pnl: number };
  'position:updated': { position: Position };
  'position:error': { symbol: string; error: string };
  'daily:reset': {};
  'risk:breached': { type: string; details: Record<string, any> };
}

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_CONFIG: Required<PortfolioConfig> = {
  maxPositions: 5,
  maxPositionSize: 100000, // $100k
  maxDailyLoss: 5000, // $5k
  maxDailyTrades: 20,
};

// ============================================================================
// Portfolio Class
// ============================================================================

export class Portfolio extends EventEmitter<PortfolioEvents> {
  private positions: Map<string, Position> = new Map();
  private config: Required<PortfolioConfig>;
  
  // Daily tracking
  private dailyPnl: number = 0;
  private dailyTrades: number = 0;
  private dailyWins: number = 0;
  private dailyLosses: number = 0;
  
  // Historical stats
  private totalRealizedPnl: number = 0;
  private totalWinningTrades: number = 0;
  private totalLosingTrades: number = 0;

  constructor(config: PortfolioConfig = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get configuration
   */
  getConfig(): Readonly<Required<PortfolioConfig>> {
    return { ...this.config };
  }

  // ============================================================================
  // Position Management
  // ============================================================================

  /**
   * Open a new position
   */
  async openPosition(params: {
    id: string;
    symbol: string;
    side: 'long' | 'short';
    entryPrice: number;
    amount: number;
    stopLoss?: number;
    takeProfit?: number;
    metadata?: Record<string, any>;
  }): Promise<PositionOpenResult> {
    const { id, symbol, side, entryPrice, amount, stopLoss, takeProfit, metadata } = params;

    // Check position limit
    if (this.positions.size >= this.config.maxPositions) {
      const error = createError({
        code: ErrorCode.VALIDATION_FAILED,
        message: `Max positions (${this.config.maxPositions}) reached`,
        statusCode: 400,
      });
      
      this.emit('position:error', { symbol, error: error.message });
      return { success: false, error: error.message };
    }

    // Check position size limit
    const positionValue = entryPrice * amount;
    if (positionValue > this.config.maxPositionSize) {
      const error = createError({
        code: ErrorCode.VALIDATION_FAILED,
        message: `Position size $${positionValue} exceeds max $${this.config.maxPositionSize}`,
        statusCode: 400,
      });
      
      this.emit('position:error', { symbol, error: error.message });
      return { success: false, error: error.message };
    }

    // Check daily trade limit
    if (this.dailyTrades >= this.config.maxDailyTrades) {
      const error = createError({
        code: ErrorCode.RATE_LIMITED,
        message: `Daily trade limit (${this.config.maxDailyTrades}) reached`,
        statusCode: 429,
      });
      
      this.emit('position:error', { symbol, error: error.message });
      return { success: false, error: error.message };
    }

    // Check daily loss limit
    if (this.dailyPnl <= -this.config.maxDailyLoss) {
      const error = createError({
        code: ErrorCode.VALIDATION_FAILED,
        message: `Daily loss limit $${this.config.maxDailyLoss} breached`,
        statusCode: 400,
      });
      
      this.emit('risk:breached', { 
        type: 'daily_loss_limit', 
        details: { dailyPnl: this.dailyPnl, limit: this.config.maxDailyLoss } 
      });
      
      this.emit('position:error', { symbol, error: error.message });
      return { success: false, error: error.message };
    }

    // Create position
    const position: Position = {
      id,
      symbol,
      side,
      entryPrice,
      amount,
      currentPrice: entryPrice,
      unrealizedPnl: 0,
      realizedPnl: 0,
      stopLoss,
      takeProfit,
      openedAt: Date.now(),
      metadata,
    };

    this.positions.set(symbol, position);
    this.dailyTrades++;

    // Emit events
    this.emit('position:opened', { position });

    // Audit log
    logAuditEvent('position_opened' as any, symbol, {
      positionId: id,
      side,
      entryPrice,
      amount,
      positionValue,
      stopLoss,
      takeProfit,
    }, 'medium').catch(() => {});

    return { success: true, position };
  }

  /**
   * Close an existing position
   */
  async closePosition(symbol: string, exitPrice: number, reason: string = 'Signal'): Promise<PositionCloseResult> {
    const position = this.positions.get(symbol);
    
    if (!position) {
      const error = `No open position for ${symbol}`;
      this.emit('position:error', { symbol, error });
      return { success: false, error };
    }

    // Calculate P&L
    const pnl = position.side === 'long'
      ? (exitPrice - position.entryPrice) * position.amount
      : (position.entryPrice - exitPrice) * position.amount;

    // Update position
    position.currentPrice = exitPrice;
    position.realizedPnl = pnl;
    position.closedAt = Date.now();

    // Update daily stats
    this.dailyPnl += pnl;
    this.totalRealizedPnl += pnl;

    if (pnl > 0) {
      this.dailyWins++;
      this.totalWinningTrades++;
    } else {
      this.dailyLosses++;
      this.totalLosingTrades++;
    }

    // Remove from active positions
    this.positions.delete(symbol);

    // Emit events
    this.emit('position:closed', { position, pnl });

    // Audit log
    logAuditEvent('position_closed' as any, symbol, {
      positionId: position.id,
      side: position.side,
      entryPrice: position.entryPrice,
      exitPrice,
      amount: position.amount,
      pnl,
      reason,
    }, pnl < 0 ? 'medium' : 'low').catch(() => {});

    return { success: true, position, pnl };
  }

  /**
   * Update position (stop loss, take profit, etc)
   */
  updatePosition(symbol: string, updates: Partial<Position>): boolean {
    const position = this.positions.get(symbol);
    if (!position) return false;

    Object.assign(position, updates);
    this.emit('position:updated', { position });

    return true;
  }

  /**
   * Update current price for all positions (mark to market)
   */
  updatePrices(prices: Map<string, number>): void {
    for (const [symbol, price] of prices) {
      const position = this.positions.get(symbol);
      if (position) {
        position.currentPrice = price;
        
        // Calculate unrealized P&L
        position.unrealizedPnl = position.side === 'long'
          ? (price - position.entryPrice) * position.amount
          : (position.entryPrice - price) * position.amount;
      }
    }
  }

  // ============================================================================
  // Queries
  // ============================================================================

  /**
   * Get position by symbol
   */
  getPosition(symbol: string): Position | undefined {
    return this.positions.get(symbol);
  }

  /**
   * Get all open positions
   */
  getAllPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  /**
   * Get number of open positions
   */
  getPositionsCount(): number {
    return this.positions.size;
  }

  /**
   * Check if has position for symbol
   */
  hasPosition(symbol: string): boolean {
    return this.positions.has(symbol);
  }

  // ============================================================================
  // P&L Calculations
  // ============================================================================

  /**
   * Get total unrealized P&L (mark to market)
   */
  getUnrealizedPnl(): number {
    let total = 0;
    for (const position of this.positions.values()) {
      total += position.unrealizedPnl || 0;
    }
    return total;
  }

  /**
   * Get total realized P&L
   */
  getRealizedPnl(): number {
    return this.totalRealizedPnl;
  }

  /**
   * Get daily P&L
   */
  getDailyPnl(): number {
    return this.dailyPnl;
  }

  /**
   * Get total exposure (sum of all position values)
   */
  getTotalExposure(): number {
    let total = 0;
    for (const position of this.positions.values()) {
      const price = position.currentPrice || position.entryPrice;
      total += price * position.amount;
    }
    return total;
  }

  /**
   * Get total position value in USD
   */
  getTotalValue(): number {
    return this.getTotalExposure() + this.getUnrealizedPnl();
  }

  // ============================================================================
  // Risk Checks
  // ============================================================================

  /**
   * Check if can open new position (risk checks)
   */
  canOpenPosition(positionValue: number): RiskCheckResult {
    // Check position limit
    if (this.positions.size >= this.config.maxPositions) {
      return {
        allowed: false,
        reason: `Max positions (${this.config.maxPositions}) reached`,
        details: { currentPositions: this.positions.size },
      };
    }

    // Check position size
    if (positionValue > this.config.maxPositionSize) {
      return {
        allowed: false,
        reason: `Position size $${positionValue} exceeds max $${this.config.maxPositionSize}`,
        details: { positionValue, maxSize: this.config.maxPositionSize },
      };
    }

    // Check daily loss limit
    if (this.dailyPnl <= -this.config.maxDailyLoss) {
      return {
        allowed: false,
        reason: `Daily loss limit $${this.config.maxDailyLoss} breached`,
        details: { dailyPnl: this.dailyPnl, limit: this.config.maxDailyLoss },
      };
    }

    // Check daily trade limit
    if (this.dailyTrades >= this.config.maxDailyTrades) {
      return {
        allowed: false,
        reason: `Daily trade limit (${this.config.maxDailyTrades}) reached`,
        details: { dailyTrades: this.dailyTrades },
      };
    }

    return { allowed: true };
  }

  /**
   * Check stop loss / take profit triggers
   */
  checkStopLossTakeProfit(symbol: string, currentPrice: number): {
    triggered: 'stop_loss' | 'take_profit' | null;
    reason: string;
  } {
    const position = this.positions.get(symbol);
    if (!position) return { triggered: null, reason: '' };

    // Check stop loss
    if (position.stopLoss) {
      const stopTriggered = position.side === 'long'
        ? currentPrice <= position.stopLoss
        : currentPrice >= position.stopLoss;
      
      if (stopTriggered) {
        return {
          triggered: 'stop_loss',
          reason: `Stop loss triggered at $${currentPrice} (stop: $${position.stopLoss})`,
        };
      }
    }

    // Check take profit
    if (position.takeProfit) {
      const tpTriggered = position.side === 'long'
        ? currentPrice >= position.takeProfit
        : currentPrice <= position.takeProfit;
      
      if (tpTriggered) {
        return {
          triggered: 'take_profit',
          reason: `Take profit triggered at $${currentPrice} (target: $${position.takeProfit})`,
        };
      }
    }

    return { triggered: null, reason: '' };
  }

  // ============================================================================
  // Stats
  // ============================================================================

  /**
   * Get portfolio statistics
   */
  getStats(): PortfolioStats {
    const totalTrades = this.totalWinningTrades + this.totalLosingTrades;
    const winRate = totalTrades > 0 
      ? this.totalWinningTrades / totalTrades 
      : 0;

    return {
      totalRealizedPnl: this.totalRealizedPnl,
      totalUnrealizedPnl: this.getUnrealizedPnl(),
      totalExposure: this.getTotalExposure(),
      dailyPnl: this.dailyPnl,
      dailyTrades: this.dailyTrades,
      winRate,
      positionsCount: this.positions.size,
      winningTrades: this.totalWinningTrades,
      losingTrades: this.totalLosingTrades,
    };
  }

  /**
   * Reset daily counters (call at start of trading day)
   */
  resetDaily(): void {
    this.dailyPnl = 0;
    this.dailyTrades = 0;
    this.dailyWins = 0;
    this.dailyLosses = 0;
    
    this.emit('daily:reset', {});
    
    logAuditEvent('daily_reset' as any, 'portfolio', {
      previousPnl: this.dailyPnl,
    }, 'low').catch(() => {});
  }

  /**
   * Get daily stats
   */
  getDailyStats(): {
    pnl: number;
    trades: number;
    wins: number;
    losses: number;
  } {
    return {
      pnl: this.dailyPnl,
      trades: this.dailyTrades,
      wins: this.dailyWins,
      losses: this.dailyLosses,
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createPortfolio(config?: PortfolioConfig): Portfolio {
  return new Portfolio(config);
}
