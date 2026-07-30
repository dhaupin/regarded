/**
 * Backtest Validator
 * 
 * Validates strategies against historical data before allowing live trading.
 */

import type { Candle, CandleInterval, PatternType, PatternResult } from './types';
import type { ExchangeConnector } from './types';
import { calculateIndicator } from './indicators';
import { detectPattern } from './patterns';

export interface BacktestConfig {
  /** Minimum backtest periods required */
  minPeriods: number;
  /** Minimum win rate required (0-1) */
  minWinRate: number;
  /** Maximum drawdown allowed (0-1) */
  maxDrawdown: number;
  /** Minimum profit factor required */
  minProfitFactor: number;
  /** Maximum consecutive losses allowed */
  maxConsecutiveLosses: number;
}

export interface BacktestResult {
  valid: boolean;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalProfit: number;
  totalLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  averageWin: number;
  averageLoss: number;
  errors: string[];
}

export interface StrategyAnalyzer {
  analyze: (
    symbol: string,
    interval: CandleInterval,
    candles: Candle[],
    indicators: Record<string, number | number[] | undefined>,
    pattern?: PatternResult
  ) => Promise<{ signal: 'buy' | 'sell' | 'hold'; strength: number; reason: string }>;
}

const DEFAULT_CONFIG: BacktestConfig = {
  minPeriods: 100,
  minWinRate: 0.4,
  maxDrawdown: 0.25,
  minProfitFactor: 1.2,
  maxConsecutiveLosses: 5,
};

export class BacktestValidator {
  private config: BacktestConfig;

  constructor(config: Partial<BacktestConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Run backtest on historical data
   */
  async runBacktest(
    connector: ExchangeConnector,
    symbol: string,
    interval: CandleInterval,
    strategy: StrategyAnalyzer
  ): Promise<BacktestResult> {
    const candles = await connector.getCandles(symbol, interval, this.config.minPeriods * 2);
    
    if (candles.length < this.config.minPeriods) {
      return {
        valid: false,
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        totalProfit: 0,
        totalLoss: 0,
        profitFactor: 0,
        maxDrawdown: 0,
        maxConsecutiveWins: 0,
        maxConsecutiveLosses: 0,
        averageWin: 0,
        averageLoss: 0,
        errors: [`Insufficient data: ${candles.length} < ${this.config.minPeriods} periods`],
      };
    }

    const trades: { entry: number; exit: number; side: 'buy' | 'sell' }[] = [];
    let consecutiveWins = 0;
    let consecutiveLosses = 0;
    let maxConsecutiveWins = 0;
    let maxConsecutiveLosses = 0;

    // Simulate trading
    for (let i = this.config.minPeriods; i < candles.length; i++) {
      const historicalCandles = candles.slice(0, i);
      const currentCandle = candles[i];
      
      // Calculate indicators
      const indicators: Record<string, number | number[] | undefined> = {};
      try {
        const rsi = calculateIndicator('rsi', historicalCandles, { period: 14 });
        indicators.rsi = rsi?.value;
        
        const macd = calculateIndicator('macd', historicalCandles, { fast: 12, slow: 26, signal: 9 });
        indicators.macd = macd?.value;
        indicators.macdSignal = macd?.metadata?.signal;
        
        const bb = calculateIndicator('bollinger', historicalCandles, { period: 20, stdDev: 2 });
        indicators.bbUpper = bb?.metadata?.upper;
        indicators.bbMiddle = bb?.metadata?.middle;
        indicators.bbLower = bb?.metadata?.lower;
      } catch (e) {
        // Skip if indicators fail
        continue;
      }

      const pattern = detectPattern('humps', historicalCandles);
      
      try {
        const result = await strategy.analyze(symbol, interval, historicalCandles, indicators, pattern);
        
        if (result.signal !== 'hold' && i + 1 < candles.length) {
          const exitPrice = candles[i + 1].close;
          const entryPrice = currentCandle.close;
          const pnl = result.signal === 'buy' 
            ? exitPrice - entryPrice 
            : entryPrice - exitPrice;
          
          trades.push({
            entry: entryPrice,
            exit: exitPrice,
            side: result.signal,
          });
          
          // Track consecutive wins/losses
          if (pnl > 0) {
            consecutiveWins++;
            consecutiveLosses = 0;
            maxConsecutiveWins = Math.max(maxConsecutiveWins, consecutiveWins);
          } else if (pnl < 0) {
            consecutiveLosses++;
            consecutiveWins = 0;
            maxConsecutiveLosses = Math.max(maxConsecutiveLosses, consecutiveLosses);
          } else {
            consecutiveWins = 0;
            consecutiveLosses = 0;
          }
        }
      } catch (e) {
        // Skip if strategy fails
      }
    }

    return this.calculateResults(trades, maxConsecutiveWins, maxConsecutiveLosses);
  }

  private calculateResults(
    trades: { entry: number; exit: number; side: 'buy' | 'sell' }[],
    maxConsecutiveWins: number,
    maxConsecutiveLosses: number
  ): BacktestResult {
    let totalProfit = 0;
    let totalLoss = 0;
    let winningTrades = 0;
    let losingTrades = 0;
    let peak = 0;
    let maxDrawdown = 0;
    let equity = 10000; // Start with $10k

    for (const trade of trades) {
      const pnl = trade.side === 'buy' 
        ? trade.exit - trade.entry 
        : trade.entry - trade.exit;
      
      const pnlPercent = pnl / trade.entry;
      equity *= (1 + pnlPercent);
      
      if (pnl > 0) {
        totalProfit += pnl;
        winningTrades++;
      } else if (pnl < 0) {
        totalLoss += Math.abs(pnl);
        losingTrades++;
      }
      
      // Track drawdown
      if (equity > peak) peak = equity;
      const drawdown = (peak - equity) / peak;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }

    const totalTrades = trades.length;
    const winRate = totalTrades > 0 ? winningTrades / totalTrades : 0;
    const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? Infinity : 0;
    const averageWin = winningTrades > 0 ? totalProfit / winningTrades : 0;
    const averageLoss = losingTrades > 0 ? totalLoss / losingTrades : 0;

    const errors: string[] = [];
    if (totalTrades < 10) errors.push(`Too few trades: ${totalTrades}`);
    if (winRate < this.config.minWinRate) errors.push(`Win rate too low: ${(winRate * 100).toFixed(1)}% < ${(this.config.minWinRate * 100).toFixed(0)}%`);
    if (maxDrawdown > this.config.maxDrawdown) errors.push(`Max drawdown too high: ${(maxDrawdown * 100).toFixed(1)}% > ${(this.config.maxDrawdown * 100).toFixed(0)}%`);
    if (profitFactor < this.config.minProfitFactor && profitFactor !== Infinity) errors.push(`Profit factor too low: ${profitFactor.toFixed(2)} < ${this.config.minProfitFactor}`);
    if (maxConsecutiveLosses > this.config.maxConsecutiveLosses) errors.push(`Too many consecutive losses: ${maxConsecutiveLosses} > ${this.config.maxConsecutiveLosses}`);

    return {
      valid: errors.length === 0,
      totalTrades,
      winningTrades,
      losingTrades,
      winRate,
      totalProfit,
      totalLoss,
      profitFactor: profitFactor === Infinity ? 999 : profitFactor,
      maxDrawdown,
      maxConsecutiveWins,
      maxConsecutiveLosses,
      averageWin,
      averageLoss,
      errors,
    };
  }

  /**
   * Quick validation - just check if we have enough data
   */
  async validateDataAvailability(
    connector: ExchangeConnector,
    symbol: string,
    interval: CandleInterval
  ): Promise<{ available: boolean; periods: number; error?: string }> {
    try {
      const candles = await connector.getCandles(symbol, interval, this.config.minPeriods);
      return {
        available: candles.length >= this.config.minPeriods,
        periods: candles.length,
      };
    } catch (e) {
      return {
        available: false,
        periods: 0,
        error: String(e),
      };
    }
  }
}

export function createBacktestValidator(config?: Partial<BacktestConfig>): BacktestValidator {
  return new BacktestValidator(config);
}
