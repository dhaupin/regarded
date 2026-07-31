/**
 * QoS - Quality of Service & Circuit Breaker
 * 
 * Circuit breaker pattern, backpressure, recursion control.
 * Inspired by Vant's QoS module.
 * Uses: cache, error, event, storage
 */

import { LRUCache } from './cache';
import { errors, createError, ErrorCode } from './error';
import { EventEmitter } from './event';
import { type Storage, createJSONStorage } from './storage';

export enum CircuitState {
  CLOSED = 'closed',      // Normal operation
  OPEN = 'open',           // Failing, reject requests
  HALF_OPEN = 'half_open', // Testing if service recovered
}

export interface QoSEvents {
  'qos:circuit-open': { breaker: string; failureCount: number };
  'qos:circuit-closed': { breaker: string };
  'qos:circuit-half-open': { breaker: string };
  'qos:rate-limited': { key: string; limit: number; current: number };
  'qos:rejected': { breaker: string; reason: string };
}

export interface CircuitBreakerConfig {
  /** Failure threshold to open circuit */
  failureThreshold: number;
  /** Success threshold to close circuit from half-open */
  successThreshold: number;
  /** Timeout in ms before trying half-open */
  timeoutMs: number;
  /** Max concurrent requests */
  maxConcurrent: number;
  /** Max queue size when at capacity */
  maxQueueSize: number;
}

export interface CircuitMetrics {
  state: CircuitState;
  failures: number;
  successes: number;
  totalRequests: number;
  rejectedRequests: number;
  lastFailureTime: number;
  lastSuccessTime: number;
}

/**
 * Circuit Breaker
 */
export class CircuitBreaker extends EventEmitter<Omit<QoSEvents, 'qos:rate-limited'>> {
  private config: CircuitBreakerConfig;
  private state: CircuitState = CircuitState.CLOSED;
  private failures = 0;
  private successes = 0;
  private totalRequests = 0;
  private rejectedRequests = 0;
  private lastFailureTime = 0;
  private lastSuccessTime = 0;
  private openedAt = 0;
  private concurrentRequests = 0;
  private queue: Array<() => void> = [];
  private name = 'default';
  private storage?: Storage;
  
  constructor(config: Partial<CircuitBreakerConfig> = {}, name?: string, storage?: Storage) {
    super();
    this.config = {
      failureThreshold: config.failureThreshold ?? 5,
      successThreshold: config.successThreshold ?? 2,
      timeoutMs: config.timeoutMs ?? 30000,
      maxConcurrent: config.maxConcurrent ?? 10,
      maxQueueSize: config.maxQueueSize ?? 100,
    };
    this.name = name || 'default';
    this.storage = storage;
  }

  /**
   * Get storage key
   */
  private getStorageKey(): string {
    return `qos:breaker:${this.name}`;
  }

  /**
   * Save circuit breaker state
   */
  async save(): Promise<void> {
    if (!this.storage) return;
    
    const state = {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      totalRequests: this.totalRequests,
      rejectedRequests: this.rejectedRequests,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      openedAt: this.openedAt,
    };
    
    const jsonStorage = createJSONStorage(this.storage, this.getStorageKey());
    await jsonStorage.save(state);
  }

  /**
   * Load circuit breaker state
   */
  async load(): Promise<boolean> {
    if (!this.storage) return false;
    
    type CircuitStateType = {
      state: CircuitState;
      failures: number;
      successes: number;
      totalRequests: number;
      rejectedRequests: number;
      lastFailureTime: number;
      lastSuccessTime: number;
      openedAt: number;
    };
    
    const jsonStorage = createJSONStorage<CircuitStateType>(this.storage, this.getStorageKey());
    const state = await jsonStorage.load();
    
    if (!state) return false;
    
    try {
      this.state = state.state;
      this.failures = state.failures;
      this.successes = state.successes;
      this.totalRequests = state.totalRequests;
      this.rejectedRequests = state.rejectedRequests;
      this.lastFailureTime = state.lastFailureTime;
      this.lastSuccessTime = state.lastSuccessTime;
      this.openedAt = state.openedAt;
      return true;
    } catch (error) {
      console.error('Failed to load circuit breaker state:', error);
      return false;
    }
  }
  
  /**
   * Check if request can proceed
   */
  canExecute(): boolean {
    if (this.state === CircuitState.CLOSED) {
      return this.concurrentRequests < this.config.maxConcurrent;
    }
    
    if (this.state === CircuitState.HALF_OPEN) {
      return this.concurrentRequests < 1; // Only 1 at a time in half-open
    }
    
    // OPEN - check if timeout has passed
    if (Date.now() - this.openedAt >= this.config.timeoutMs) {
      this.state = CircuitState.HALF_OPEN;
      return true;
    }
    
    return false;
  }
  
  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;
    
    // Check if we can execute
    if (!this.canExecute()) {
      this.rejectedRequests++;
      throw errors.rateLimited();
    }
    
    // Check queue
    if (this.concurrentRequests >= this.config.maxConcurrent) {
      if (this.queue.length >= this.config.maxQueueSize) {
        this.rejectedRequests++;
        throw errors.rateLimited();
      }
      
      // Queue the request
      return new Promise((resolve, reject) => {
        this.queue.push(async () => {
          try {
            const result = await this.execute(fn);
            resolve(result);
          } catch (e) {
            reject(e);
          }
        });
      });
    }
    
    this.concurrentRequests++;
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    } finally {
      this.concurrentRequests--;
      this.processQueue();
    }
  }
  
  /**
   * Record success
   */
  private onSuccess(): void {
    this.successes++;
    this.lastSuccessTime = Date.now();
    
    if (this.state === CircuitState.HALF_OPEN) {
      if (this.successes >= this.config.successThreshold) {
        this.reset();
      }
    }
  }
  
  /**
   * Record failure
   */
  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.state === CircuitState.CLOSED) {
      if (this.failures >= this.config.failureThreshold) {
        this.open();
      }
    } else if (this.state === CircuitState.HALF_OPEN) {
      this.open(); // Go back to open on failure in half-open
    }
  }
  
  /**
   * Open circuit
   */
  private open(): void {
    this.state = CircuitState.OPEN;
    this.openedAt = Date.now();
    this.emit('qos:circuit-open', { breaker: this.name, failureCount: this.failures });
  }
  
  /**
   * Reset circuit
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.openedAt = 0;
    this.emit('qos:circuit-closed', { breaker: this.name });
  }
  
  /**
   * Process queued requests
   */
  private processQueue(): void {
    while (this.queue.length > 0 && this.canExecute()) {
      const next = this.queue.shift();
      if (next) next();
    }
  }
  
  /**
   * Get metrics
   */
  getMetrics(): CircuitMetrics {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      totalRequests: this.totalRequests,
      rejectedRequests: this.rejectedRequests,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
    };
  }
  
  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }
  
  /**
   * Force state (for testing/admin)
   */
  setState(state: CircuitState): void {
    this.state = state;
    if (state === CircuitState.OPEN) {
      this.openedAt = Date.now();
    }
  }
}

/**
 * Recursion Guard - prevent infinite recursion
 */
export class RecursionGuard {
  private executing = new Map<string, number>();
  private maxDepth: number;
  
  constructor(maxDepth: number = 10) {
    this.maxDepth = maxDepth;
  }
  
  /**
   * Check if function can be executed
   */
  canExecute(key: string): boolean {
    const depth = this.executing.get(key) || 0;
    return depth < this.maxDepth;
  }
  
  /**
   * Execute with recursion protection
   */
  async execute<T>(key: string, fn: () => Promise<T>): Promise<T> {
    if (!this.canExecute(key)) {
      throw createError({
        code: ErrorCode.RATE_LIMITED,
        message: `Recursion depth exceeded for: ${key}`,
        statusCode: 429,
      });
    }
    
    const depth = (this.executing.get(key) || 0) + 1;
    this.executing.set(key, depth);
    
    try {
      return await fn();
    } finally {
      this.executing.set(key, depth - 1);
      if (depth === 1) {
        this.executing.delete(key);
      }
    }
  }
  
  /**
   * Get current depth for key
   */
  getDepth(key: string): number {
    return this.executing.get(key) || 0;
  }
  
  /**
   * Reset all guards
   */
  reset(): void {
    this.executing.clear();
  }
}

/**
 * Rate Limiter - Token bucket algorithm
 */
export class RateLimiter {
  private tokens: number;
  private maxTokens: number;
  private refillRate: number; // tokens per ms
  private lastRefill: number;
  
  constructor(maxTokens: number = 100, refillRate: number = 10) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.refillRate = refillRate;
    this.lastRefill = Date.now();
  }
  
  /**
   * Try to consume tokens
   */
  tryConsume(tokens: number = 1): boolean {
    this.refill();
    
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    
    return false;
  }
  
  /**
   * Refill tokens based on time elapsed
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const newTokens = elapsed * this.refillRate;
    
    this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
    this.lastRefill = now;
  }
  
  /**
   * Get available tokens
   */
  getAvailableTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }
  
  /**
   * Reset limiter
   */
  reset(): void {
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
  }
}

/**
 * QoS Manager - coordinates all QoS components
 */
export class QoSManager extends EventEmitter<QoSEvents> {
  private breakers = new Map<string, CircuitBreaker>();
  private limiters = new Map<string, RateLimiter>();
  private recursionGuard = new RecursionGuard();
  
  constructor() {
    super();
  }
  
  /**
   * Get or create circuit breaker
   */
  getBreaker(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker(config, name));
    }
    return this.breakers.get(name)!;
  }
  
  /**
   * Get or create rate limiter
   */
  getLimiter(name: string, maxTokens?: number, refillRate?: number): RateLimiter {
    if (!this.limiters.has(name)) {
      this.limiters.set(name, new RateLimiter(maxTokens, refillRate));
    }
    return this.limiters.get(name)!;
  }
  
  /**
   * Get recursion guard
   */
  getRecursionGuard(): RecursionGuard {
    return this.recursionGuard;
  }
  
  /**
   * Execute with circuit breaker
   */
  async executeWithBreaker<T>(name: string, fn: () => Promise<T>, config?: Partial<CircuitBreakerConfig>): Promise<T> {
    const breaker = this.getBreaker(name, config);
    return breaker.execute(fn);
  }
  
  /**
   * Check rate limit
   */
  checkRateLimit(name: string, cost: number = 1, maxTokens?: number, refillRate?: number): boolean {
    const limiter = this.getLimiter(name, maxTokens, refillRate);
    const consumed = limiter.tryConsume(cost);
    
    if (!consumed) {
      this.emit('qos:rate-limited', { 
        key: name, 
        limit: maxTokens ?? (limiter as any).maxTokens, 
        current: limiter.getAvailableTokens() 
      });
    }
    
    return consumed;
  }
  
  /**
   * Get all metrics
   */
  getAllMetrics(): Record<string, CircuitMetrics> {
    const metrics: Record<string, CircuitMetrics> = {};
    for (const [name, breaker] of this.breakers) {
      metrics[name] = breaker.getMetrics();
    }
    return metrics;
  }
  
  /**
   * Reset all
   */
  reset(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
    for (const limiter of this.limiters.values()) {
      limiter.reset();
    }
    this.recursionGuard.reset();
  }
}

/**
 * Create QoS Manager
 */
export function createQoSManager(): QoSManager {
  return new QoSManager();
}
