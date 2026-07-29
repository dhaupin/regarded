/**
 * Regarded Library
 * 
 * Core modules for the trading bot platform.
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

// Storage
export * from './storage';

// Connectors
export * from './connectors';

// Indicators
export * from './indicators';

// Patterns
export * from './patterns';

// Rules
export * from './rules';

// Utils
export * from './utils';

// Event System
export * from './event';

// Cache
export * from './cache';

// API / HTTP Handlers
export * from './api';

// Runner / Trading Bot
export * from './runner';
