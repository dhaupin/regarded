/**
 * LRU Cache
 * 
 * LRU (Least Recently Used) cache with TTL support.
 * Inspired by Vant's cache module.
 */

interface CacheEntry<T> {
  value: T;
  timestamp: number;
  expiresAt?: number;
}

/**
 * LRU Cache with TTL
 */
export class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private maxSize: number;
  private defaultTTL: number;
  
  /**
   * @param maxSize - Maximum number of entries
   * @param defaultTTL - Default TTL in milliseconds (0 = no expiry)
   */
  constructor(maxSize: number = 1000, defaultTTL: number = 3600000) {
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;
  }
  
  /**
   * Get a value
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    
    // Check expiration
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    
    // Move to end (most recently used) - delete and re-insert
    this.cache.delete(key);
    this.cache.set(key, entry);
    
    return entry.value;
  }
  
  /**
   * Set a value
   */
  set(key: string, value: T, ttl?: number): void {
    // If key exists, delete first to update position
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    
    // Remove oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    
    const ttlMs = ttl ?? this.defaultTTL;
    const expiresAt = ttlMs > 0 ? Date.now() + ttlMs : undefined;
    
    this.cache.set(key, { value, timestamp: Date.now(), expiresAt });
  }
  
  /**
   * Check if key exists (and not expired)
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }
  
  /**
   * Delete a key
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }
  
  /**
   * Clear all entries
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
  
  /**
   * Get all keys
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }
  
  /**
   * Get all values
   */
  values(): T[] {
    return Array.from(this.cache.values()).map(e => e.value);
  }
  
  /**
   * Clean up expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    
    return cleaned;
  }
}

/**
 * Create a new cache instance
 */
export function createCache<T>(maxSize?: number, defaultTTL?: number): LRUCache<T> {
  return new LRUCache<T>(maxSize, defaultTTL);
}

// Pre-configured caches for common use cases
export const candleCache = new LRUCache<any[]>(500, 300000); // 5 min TTL
export const priceCache = new LRUCache<number>(100, 60000); // 1 min TTL
export const indicatorCache = new LRUCache<any>(200, 120000); // 2 min TTL
