/**
 * Regarded Library
 * 
 * Core modules for the trading agent platform.
 * 
 * @example
 * import { createConnector, createRulesEngine, calculateIndicator } from './lib/regarded';
 */

// Re-export types
export * from './types';

// Error handling
export * from './error';

// Security
export * from './encrypt';
export * from './audit';
export * from './waf';

// QoS / Circuit Breaker
export * from './qos';

// Network
export * from './network';

// Scheduler / Heartbeat
export * from './scheduler';

// Auth
export * from './auth';

// Config
export * from './config';

// Utils & Storage (combined)
export * from './storage';

// Connectors
export * from './connectors';

// Indicators
export * from './indicators';

// Patterns
export * from './patterns';

// Rules
export * from './rules';

// Event System
export * from './event';

// Cache
export * from './cache';

// API / HTTP Handlers
export * from './api';

// Backtest Validator
export * from './backtest';

// News Service
export * from './news';

// Runner / Trading Agent
export * from './runner';
