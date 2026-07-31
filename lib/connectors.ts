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
import { logAuditEvent } from './audit';

// Re-export for convenience
export { BaseConnector } from './connectors/base';
export { KrakenConnector } from './connectors/kraken';
export { SolanaConnector } from './connectors/solana';
export { JupiterConnector } from './connectors/jupiter';

// Re-export types
export type { ConnectorConfig, ConnectorStatus } from './connectors/base';

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
  psychologyRule,
} from './rules';

export interface ConnectorEvents {
  'connector:connected': { exchange: string; name: string };
  'connector:disconnected': { exchange: string; name: string };
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
  private connectorMap = new Map<string, new (config?: import('./connectors/base').ConnectorConfig) => ExchangeConnector>();
  
  constructor() {
    this.register('kraken', KrakenConnector);
    this.register('solana', SolanaConnector);
    this.register('jupiter', JupiterConnector);
  }
  
  register(exchange: string, cls: new (config?: import('./connectors/base').ConnectorConfig) => ExchangeConnector): void {
    this.connectorMap.set(exchange.toLowerCase(), cls);
  }
  
  get(exchange: string): (new (config?: import('./connectors/base').ConnectorConfig) => ExchangeConnector) | undefined {
    return this.connectorMap.get(exchange.toLowerCase());
  }
  
  create(exchange: string, config?: import('./connectors/base').ConnectorConfig): ExchangeConnector | undefined {
    const cls = this.get(exchange);
    return cls ? new cls(config) : undefined;
  }
  
  has(exchange: string): boolean {
    return this.connectorMap.has(exchange.toLowerCase());
  }
  
  list(): string[] {
    return Array.from(this.connectorMap.keys());
  }
}

// Default registry instance
export const connectorRegistry = new ConnectorRegistry();

// Convenience functions (mirror adapters pattern)
export function register(exchange: string, cls: new (config?: import('./connectors/base').ConnectorConfig) => ExchangeConnector): void {
  connectorRegistry.register(exchange, cls);
}

export function get(exchange: string): (new (config?: import('./connectors/base').ConnectorConfig) => ExchangeConnector) | undefined {
  return connectorRegistry.get(exchange);
}

export function has(exchange: string): boolean {
  return connectorRegistry.has(exchange);
}

export function list(): string[] {
  return connectorRegistry.list();
}

export function createConnector(exchange: string, config?: import('./connectors/base').ConnectorConfig): ExchangeConnector | undefined {
  return connectorRegistry.create(exchange, config);
}

// Backwards compatibility - deprecated, use connectorRegistry
/** @deprecated Use connectorRegistry instead */
export const connectors = connectorRegistry;
