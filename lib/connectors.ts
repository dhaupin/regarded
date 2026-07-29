/**
 * Exchange Connectors
 * 
 * Factory and registry for exchange connectors.
 */

import type { ExchangeConnector } from './types';
import { KrakenConnector } from './connectors/kraken';
import { SolanaConnector } from './connectors/solana';
import { JupiterConnector } from './connectors/jupiter';
import { EventEmitter } from './event';

// Re-export for convenience
export { BaseConnector } from './connectors/base';
export { KrakenConnector } from './connectors/kraken';
export { SolanaConnector } from './connectors/solana';
export { JupiterConnector } from './connectors/jupiter';

// Re-export validation types
export { 
  ValidationResult, 
  OrderContext, 
  ValidationRule,
  RulesValidator,
  createRulesValidator,
  defaultPreRules,
  defaultPostRules,
  // Individual rules
  maxOrderSizeRule,
  minOrderSizeRule,
  balanceCheckRule,
  priceDeviationRule,
  maxPositionSizeRule,
  maxDailyTradesRule,
  maxDailyLossRule,
  stopLossRequiredRule,
  slippageCheckRule,
  exposureLimitRule,
} from './rules';

export interface ConnectorEvents {
  'connector:order-placed': { orderId: string; exchange: string; symbol: string; side: string; amount: number };
  'connector:order-filled': { orderId: string; exchange: string; symbol: string; filledAmount: number; price: number };
  'connector:order-cancelled': { orderId: string; exchange: string; symbol: string };
  'connector:order-failed': { orderId: string; exchange: string; error: string };
  'connector:balance-update': { exchange: string; asset: string; available: number; locked: number };
  'connector:price-update': { exchange: string; symbol: string; price: number; volume: number };
  'connector:error': { exchange: string; error: string };
};

/**
 * Connector Registry
 */
export class ConnectorRegistry {
  private connectors = new Map<string, new () => ExchangeConnector>();
  
  constructor() {
    this.register('kraken', KrakenConnector);
    this.register('solana', SolanaConnector);
    this.register('jupiter', JupiterConnector);
  }
  
  register(exchange: string, cls: new () => ExchangeConnector): void {
    this.connectors.set(exchange.toLowerCase(), cls);
  }
  
  get(exchange: string): (new () => ExchangeConnector) | undefined {
    return this.connectors.get(exchange.toLowerCase());
  }
  
  create(exchange: string): ExchangeConnector | undefined {
    const cls = this.get(exchange);
    return cls ? new cls() : undefined;
  }
  
  has(exchange: string): boolean {
    return this.connectors.has(exchange.toLowerCase());
  }
  
  list(): string[] {
    return Array.from(this.connectors.keys());
  }
}

export const connectors = new ConnectorRegistry();

export function createConnector(exchange: string): ExchangeConnector | undefined {
  return connectors.create(exchange);
}
