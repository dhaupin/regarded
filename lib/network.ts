/**
 * Network - HTTP Client with retry, timeout, and circuit breaker
 * 
 * Common interface for HTTP requests used by connectors.
 * Inspired by Vant's network module.
 * Uses: qos, cache, error, event, utils
 */

import { CircuitBreaker, QoSManager, createQoSManager } from './qos';
import { LRUCache } from './cache';
import { createError, ErrorCode, isOperationalError, toRegardedError } from './error';
import { EventEmitter } from './event';
import { safeJsonParse } from './utils';

export interface NetworkEvents {
  'network:request': { url: string; method: string; duration: number; status: number };
  'network:error': { url: string; error: string; retry: number };
  'network:retry': { url: string; attempt: number; error: string };
  'network:timeout': { url: string; timeout: number };
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  circuitBreaker?: string;
}

export interface RequestResult<T = any> {
  ok: boolean;
  status: number;
  statusText: string;
  data?: T;
  error?: string;
  headers?: Record<string, string>;
  duration: number;
}

export interface NetworkConfig {
  defaultTimeout: number;
  defaultRetries: number;
  defaultRetryDelay: number;
  maxConcurrentPerHost: number;
  cacheResponses: boolean;
  cacheTTL: number;
}

const DEFAULT_CONFIG: NetworkConfig = {
  defaultTimeout: 30000,
  defaultRetries: 3,
  defaultRetryDelay: 1000,
  maxConcurrentPerHost: 10,
  cacheResponses: true,
  cacheTTL: 60000,
};

/**
 * Network Client
 */
export class Network extends EventEmitter<NetworkEvents> {
  private config: NetworkConfig;
  private qos: QoSManager;
  private responseCache = new LRUCache<RequestResult>(1000, 60000);
  
  constructor(config: Partial<NetworkConfig> = {}, qos?: QoSManager) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.qos = qos || createQoSManager();
  }
  
  /**
   * Build URL with query params
   */
  private buildUrl(url: string, params?: Record<string, string>): string {
    if (!params) return url;
    
    const urlObj = new URL(url);
    for (const [key, value] of Object.entries(params)) {
      urlObj.searchParams.set(key, value);
    }
    return urlObj.toString();
  }
  
  /**
   * Make HTTP request
   */
  async request<T = any>(url: string, options: RequestOptions = {}): Promise<RequestResult<T>> {
    const startTime = Date.now();
    const method = options.method || 'GET';
    const timeout = options.timeout ?? this.config.defaultTimeout;
    const retries = options.retries ?? this.config.defaultRetries;
    const retryDelay = options.retryDelay ?? this.config.defaultRetryDelay;
    
    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const result = await this.doRequest<T>(url, method, options, timeout);
        result.duration = Date.now() - startTime;
        
        // Emit request event
        this.emit('network:request', { url, method, duration: result.duration, status: result.status });
        
        return result;
      } catch (error) {
        lastError = error as Error;
        
        // Emit error event
        this.emit('network:error', { url, error: (error as Error).message, retry: attempt });
        
        // Emit retry event if we'll retry
        if (attempt < retries) {
          this.emit('network:retry', { url, attempt: attempt + 1, error: (error as Error).message });
        }
        
        // Don't retry on client errors (4xx)
        if (error instanceof NetworkError && error.status >= 400 && error.status < 500) {
          throw error;
        }
        
        // Wait before retry
        if (attempt < retries) {
          await this.sleep(retryDelay * (attempt + 1));
        }
      }
    }
    
    return {
      ok: false,
      status: 0,
      statusText: 'Max retries exceeded',
      error: lastError?.message,
      duration: Date.now() - startTime,
    };
  }
  
  /**
   * Execute single request
   */
  private async doRequest<T>(
    url: string, 
    method: string, 
    options: RequestOptions, 
    timeout: number
  ): Promise<RequestResult<T>> {
    const host = new URL(url).host;
    const breakerName = `network:${host}`;
    
    // Use circuit breaker if specified
    const executeFn = async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      try {
        const response = await fetch(url, {
          method,
          headers: options.headers,
          body: options.body ? JSON.stringify(options.body) : undefined,
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        const data = await response.text();
        const parsed = safeJsonParse<T>(data, undefined as unknown as T);
        
        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          headers[key] = value;
        });
        
        return {
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          data: parsed,
          headers,
          duration: 0,
        };
      } catch (error) {
        clearTimeout(timeoutId);
        
        if (error instanceof Error && error.name === 'AbortError') {
          this.emit('network:timeout', { url, timeout });
          throw new NetworkError('Request timeout', 408, url);
        }
        throw error;
      }
    };
    
    // Execute with circuit breaker
    if (options.circuitBreaker) {
      return await this.qos.executeWithBreaker(
        `${options.circuitBreaker}:${host}`,
        executeFn,
        { failureThreshold: 5, timeoutMs: 30000 }
      );
    }
    
    return await executeFn();
  }
  
  /**
   * GET request
   */
  async get<T = any>(url: string, params?: Record<string, string>, options: RequestOptions = {}): Promise<RequestResult<T>> {
    const finalUrl = this.buildUrl(url, params);
    return this.request<T>(finalUrl, { ...options, method: 'GET' });
  }
  
  /**
   * POST request
   */
  async post<T = any>(url: string, body?: any, options: RequestOptions = {}): Promise<RequestResult<T>> {
    return this.request<T>(url, { 
      ...options, 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json', ...options.headers },
      body,
    });
  }
  
  /**
   * PUT request
   */
  async put<T = any>(url: string, body?: any, options: RequestOptions = {}): Promise<RequestResult<T>> {
    return this.request<T>(url, { 
      ...options, 
      method: 'PUT', 
      headers: { 'Content-Type': 'application/json', ...options.headers },
      body,
    });
  }
  
  /**
   * DELETE request
   */
  async delete<T = any>(url: string, options: RequestOptions = {}): Promise<RequestResult<T>> {
    return this.request<T>(url, { ...options, method: 'DELETE' });
  }
  
  /**
   * Get cached response
   */
  getCached(url: string): RequestResult | undefined {
    return this.responseCache.get(url);
  }
  
  /**
   * Cache response
   */
  cacheResponse(url: string, result: RequestResult, ttl?: number): void {
    if (this.config.cacheResponses) {
      this.responseCache.set(url, result, ttl ?? this.config.cacheTTL);
    }
  }
  
  /**
   * Clear cache
   */
  clearCache(): void {
    this.responseCache.clear();
  }
  
  /**
   * Get QoS manager
   */
  getQoS(): QoSManager {
    return this.qos;
  }
  
  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Network Error - extends RegardedError with HTTP details
 */
export class NetworkError extends Error {
  status: number;
  url: string;
  
  constructor(message: string, status: number, url: string) {
    super(message);
    this.name = 'NetworkError';
    this.status = status;
    this.url = url;
  }
  
  /**
   * Convert to RegardedError
   */
  toRegardedError(): ReturnType<typeof createError> {
    return createError({
      code: this.status >= 500 ? ErrorCode.EXCHANGE_ERROR : ErrorCode.INVALID_INPUT,
      message: this.message,
      statusCode: this.status,
      details: { url: this.url },
    });
  }
}

/**
 * Create Network client
 */
export function createNetwork(config?: Partial<NetworkConfig>, qos?: QoSManager): Network {
  return new Network(config, qos);
}
