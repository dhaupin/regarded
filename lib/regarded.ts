/**
 * Regarded Library
 * 
 * Core modules for the trading agent platform.
 * 
 * @example
 * import { createConnector, createRulesEngine, calculateIndicator } from './lib/regarded';
 */

// Re-export types (explicit to avoid conflicts)
export type { Position, Strategy, ApiResponse as RpcResponse } from './types';

// Error handling (explicit to avoid conflicts)
export { RegardedError, ErrorCode, isOperationalError, createError as errors } from './error';

// Security
export * from './encrypt';
export * from './audit';
export { ValidationResult as WafValidationResult } from './waf';

// QoS / Circuit Breaker
export * from './qos';

// Network
export * from './network';

// Scheduler / Heartbeat
export * from './scheduler';

// Auth
export * from './auth';

// Config
export { ConfigManager } from './config';

// Utils & Storage
export * from './storage';
export * from './utils';

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

// Market Psychology
export * from './psy';

// Notify - Unified notification system
export * from './notify';

// Adapters - Notification adapters (telegram, discord, slack, webhook)
// Also re-export webhook/telegram types for backwards compatibility
export * from './adapters';
export type { WebhookConfig, WebhookEvent, WebhookFilter, WebhookMessage } from './adapters/webhook';
export type { TelegramMessage, TelegramUpdate, TelegramChat, TelegramUser, TelegramCallbackQuery, SendMessageOptions, InlineKeyboardButton, InlineKeyboardMarkup } from './adapters/telegram';

// Portfolio / Position Management
export * from './portfolio';

// Guard / Risk Management
export * from './guard';

// Runner / Trading Agent
export * from './runner';
