/**
 * Base Connector Class
 * 
 * Abstract base class for all exchange connectors.
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
} from '../../types';
import { EventEmitter } from '../event';

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
  
  constructor() {
    super();
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
