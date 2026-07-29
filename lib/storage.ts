/**
 * Storage Module
 *
 * Provides storage abstractions for KV, D2, and other backends.
 * Used by portfolio, guard, and other modules for state persistence.
 */

import { createError } from './error';

// ============================================================================
// Storage Interfaces
// ============================================================================

/**
 * Key-Value storage interface (compatible with Cloudflare KV)
 */
export interface KVStorage {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
    keys: { name: string }[];
    listComplete: boolean;
    cursor?: string;
  }>;
}

/**
 * Database storage interface (compatible with Cloudflare D2)
 */
export interface D2Storage {
  exec(sql: string): Promise<void>;
  prepare(sql: string): D2Statement;
  dump(): Promise<string>;
}

export interface D2Statement {
  bind(...params: any[]): D2Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<T[]>;
  run(): Promise<{ success: boolean }>;
}

/**
 * Generic storage interface
 */
export interface Storage {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

/**
 * Storage factory options
 */
export interface StorageOptions {
  /** User ID for multi-tenant isolation */
  userId?: string;
  /** Key prefix for namespacing */
  prefix?: string;
}

// ============================================================================
// Storage Implementations
// ============================================================================

/**
 * Create a KV-backed storage wrapper
 */
export function createKVStorage(kv: KVStorage, options: StorageOptions = {}): Storage {
  const { prefix = 'app' } = options;
  
  return {
    async get(key: string): Promise<string | null> {
      const fullKey = `${prefix}:${key}`;
      return kv.get(fullKey);
    },
    
    async put(key: string, value: string): Promise<void> {
      const fullKey = `${prefix}:${key}`;
      await kv.put(fullKey, value);
    },
    
    async delete(key: string): Promise<void> {
      const fullKey = `${prefix}:${key}`;
      await kv.delete(fullKey);
    },
  };
}

/**
 * Create a prefixed storage wrapper (for multi-tenant)
 */
export function createPrefixedStorage(storage: Storage, prefix: string): Storage {
  return {
    async get(key: string): Promise<string | null> {
      return storage.get(`${prefix}:${key}`);
    },
    
    async put(key: string, value: string): Promise<void> {
      return storage.put(`${prefix}:${key}`, value);
    },
    
    async delete(key: string): Promise<void> {
      return storage.delete(`${prefix}:${key}`);
    },
  };
}

/**
 * Create user-scoped storage
 */
export function createUserStorage(storage: Storage, userId: string): Storage {
  return createPrefixedStorage(storage, `user:${userId}`);
}

// ============================================================================
// JSON Storage Helpers
// ============================================================================

/**
 * JSON storage wrapper for type-safe get/put
 */
export function createJSONStorage<T>(storage: Storage, key: string) {
  return {
    /**
     * Load data from storage
     */
    async load(): Promise<T | null> {
      const data = await storage.get(key);
      if (!data) return null;
      try {
        return JSON.parse(data) as T;
      } catch {
        return null;
      }
    },
    
    /**
     * Save data to storage
     */
    async save(data: T): Promise<void> {
      await storage.put(key, JSON.stringify(data));
    },
    
    /**
     * Delete data from storage
     */
    async delete(): Promise<void> {
      await storage.delete(key);
    },
  };
}

// ============================================================================
// D2 Database Helpers
// ============================================================================

/**
 * Initialize database schema
 */
export async function initDatabase(d2: D2Storage): Promise<void> {
  // Users table
  await d2.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      role TEXT DEFAULT 'user',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  
  // Credentials table
  await d2.exec(`
    CREATE TABLE IF NOT EXISTS credentials (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      exchange TEXT NOT NULL,
      name TEXT,
      encrypted_data TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  
  // Strategies table
  await d2.exec(`
    CREATE TABLE IF NOT EXISTS strategies (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      config TEXT,
      enabled INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  
  // Rules table
  await d2.exec(`
    CREATE TABLE IF NOT EXISTS rules (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      strategy_id TEXT,
      name TEXT NOT NULL,
      config TEXT,
      enabled INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (strategy_id) REFERENCES strategies(id)
    )
  `);
  
  // Positions table
  await d2.exec(`
    CREATE TABLE IF NOT EXISTS positions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      strategy_id TEXT,
      pair TEXT NOT NULL,
      side TEXT NOT NULL,
      entry_price REAL NOT NULL,
      amount REAL NOT NULL,
      current_price REAL,
      unrealized_pnl REAL DEFAULT 0,
      opened_at INTEGER NOT NULL,
      closed_at INTEGER,
      status TEXT DEFAULT 'open',
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  
  // Trades table
  await d2.exec(`
    CREATE TABLE IF NOT EXISTS trades (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      position_id TEXT,
      pair TEXT NOT NULL,
      side TEXT NOT NULL,
      price REAL NOT NULL,
      amount REAL NOT NULL,
      fee REAL DEFAULT 0,
      pnl REAL,
      executed_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (position_id) REFERENCES positions(id)
    )
  `);
  
  // Audit log table
  await d2.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT NOT NULL,
      resource_type TEXT,
      resource_id TEXT,
      details TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at INTEGER NOT NULL
    )
  `);
}

// ============================================================================
// Cache Storage (LRU with TTL)
// ============================================================================

/**
 * In-memory cache with TTL support
 */
export class CacheStorage<T> {
  private cache = new Map<string, { value: T; expiresAt: number }>();
  private maxSize: number;
  private defaultTTL: number;
  
  constructor(options: { maxSize?: number; defaultTTL?: number } = {}) {
    this.maxSize = options.maxSize ?? 1000;
    this.defaultTTL = options.defaultTTL ?? 60 * 1000; // 1 minute default
  }
  
  /**
   * Get value from cache
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.value;
  }
  
  /**
   * Set value in cache
   */
  set(key: string, value: T, ttl?: number): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    
    const expiresAt = Date.now() + (ttl ?? this.defaultTTL);
    this.cache.set(key, { value, expiresAt });
  }
  
  /**
   * Delete value from cache
   */
  delete(key: string): void {
    this.cache.delete(key);
  }
  
  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }
  
  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }
}
