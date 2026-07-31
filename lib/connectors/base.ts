/**
 * Base Connector Class
 * 
 * Abstract base class for all exchange connectors.
 * Uses: event, rules, utils
 */

import type {
  ExchangeConnector,
  Balance,
  Candle,
  CandleInterval,
  Order,
  OrderResult,
  Trade,
  EncryptedSecrets,
} from '../types';
import { EventEmitter } from '../event';
import { 
  RulesValidator, 
  ValidationResult, 
  OrderContext, 
  createRulesValidator,
  defaultPreRules,
  defaultPostRules 
} from '../rules';
import { parsePair } from '../utils';

export interface ConnectorEvents {
  'connector:order-placed': { orderId: string; exchange: string; symbol: string; side: string; amount: number };
  'connector:order-filled': { orderId: string; exchange: string; symbol: string; filledAmount: number; price: number };
  'connector:order-cancelled': { orderId: string; exchange: string; symbol: string };
  'connector:order-failed': { orderId: string; exchange: string; error: string };
  'connector:balance-update': { exchange: string; asset: string; available: number; locked: number };
  'connector:price-update': { exchange: string; symbol: string; price: number; volume: number };
  'connector:error': { exchange: string; error: string };
}

export abstract class BaseConnector extends EventEmitter<ConnectorEvents> implements ExchangeConnector {
  abstract name: string;
  abstract exchange: string;
  protected connected: boolean = false;
  protected paperMode: boolean = true;
  protected validator: RulesValidator;
  protected dailyTradeCount: number = 0;
  protected dailyLoss: number = 0;
  
  constructor() {
    super();
    // Default validator with global rules
    this.validator = createRulesValidator({
      globalPreRules: defaultPreRules,
      globalPostRules: defaultPostRules,
      connectorRules: [],
    });
  }
  
  /**
   * Validate an order before placing
   * Runs pre-trade validation pipeline: global pre-rules → connector rules
   */
  async validateOrder(order: Order): Promise<ValidationResult> {
    // Get current price
    const currentPrice = await this.getPrice(order.pair);
    
    // Get balance
    const balances = await this.getBalance();
    const { base, quote } = parsePair(order.pair);
    
    let availableBalance = 0;
    for (const bal of balances) {
      if (bal.asset === quote) {
        availableBalance = bal.free;
      }
    }
    
    // Build context
    const context: OrderContext = {
      order,
      exchange: this.exchange,
      connectorName: this.name,
      availableBalance,
      currentPrice,
      positionSize: 0, // Would need position tracking
      dailyTradeCount: this.dailyTradeCount,
      dailyLoss: this.dailyLoss,
      portfolioValue: balances.reduce((sum, b) => sum + (b.free + b.locked), 0),
    };
    
    return this.validator.validatePreTrade(context);
  }
  
  /**
   * Validate after trade execution
   * Runs post-trade validation pipeline: connector rules → global post-rules
   */
  async validatePostTrade(order: Order, filledPrice: number): Promise<ValidationResult> {
    const currentPrice = await this.getPrice(order.pair);
    
    // Calculate slippage
    const expectedPrice = order.price ?? currentPrice;
    const slippage = order.type === 'market' 
      ? (filledPrice - expectedPrice) / expectedPrice 
      : 0;
    
    const balances = await this.getBalance();
    
    const context: OrderContext = {
      order,
      exchange: this.exchange,
      connectorName: this.name,
      availableBalance: balances[0]?.free ?? 0,
      currentPrice,
      positionSize: 0,
      dailyTradeCount: this.dailyTradeCount,
      dailyLoss: this.dailyLoss,
      portfolioValue: balances.reduce((sum, b) => sum + (b.free + b.locked), 0),
      slippage,
      filledPrice,
    };
    
    // Update daily stats
    this.dailyTradeCount++;
    
    return this.validator.validatePostTrade(context);
  }
  
  /**
   * Add a custom rule for this connector
   */
  addValidationRule(rule: import('../rules').ValidationRule): void {
    this.validator.addConnectorRule(rule);
  }
  
  /**
   * Enable/disable a validation rule
   */
  setValidationRuleEnabled(ruleId: string, enabled: boolean): void {
    this.validator.setRuleEnabled(ruleId, enabled);
  }
  
  abstract connect(credentials: EncryptedSecrets): Promise<boolean>;
  abstract disconnect(): Promise<void>;
  abstract getBalance(): Promise<Balance[]>;
  abstract getPrice(symbol: string): Promise<number>;
  abstract getPrices(symbols: string[]): Promise<Map<string, number>>;
  abstract getCandles(symbol: string, interval: CandleInterval, limit: number): Promise<Candle[]>;
  abstract placeOrder(order: Order): Promise<OrderResult>;
  abstract cancelOrder(orderId: string): Promise<boolean>;
  abstract getOpenOrders(pair?: string): Promise<OrderResult[]>;
  abstract getTradeHistory(pair?: string, limit?: number): Promise<Trade[]>;
  
  isConnected(): boolean {
    return this.connected;
  }
  
  supportsPaperTrading(): boolean {
    return true;
  }
  
  setPaperMode(enabled: boolean): void {
    this.paperMode = enabled;
  }
  
  isPaperMode(): boolean {
    return this.paperMode;
  }
  
  abstract supportedIntervals(): CandleInterval[];
  abstract supportedSymbols(): string[];
}
