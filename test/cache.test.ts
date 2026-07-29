/**
 * Cache Module Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LRUCache, createCache } from '../lib/cache';

describe('LRUCache', () => {
  let cache: LRUCache<string>;

  beforeEach(() => {
    cache = new LRUCache<string>(3, 1000);
  });

  it('should store and retrieve values', () => {
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  it('should return undefined for missing keys', () => {
    expect(cache.get('nonexistent')).toBeUndefined();
  });

  it('should track size', () => {
    expect(cache.size()).toBe(0);
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    expect(cache.size()).toBe(2);
  });

  it('should evict least recently used', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3');
    
    // Access key1 to make it most recently used
    cache.get('key1');
    
    // Add new key, should evict key2 (LRU)
    cache.set('key4', 'value4');
    
    expect(cache.get('key1')).toBe('value1');  // Accessed, so preserved
    expect(cache.get('key2')).toBeUndefined(); // LRU, evicted
    expect(cache.get('key3')).toBe('value3'); // Middle, preserved
    expect(cache.get('key4')).toBe('value4'); // New, preserved
  });

  it('should respect max size', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3');
    cache.set('key4', 'value4');
    
    expect(cache.size()).toBe(3);
  });

  it('should check existence with has()', () => {
    cache.set('key1', 'value1');
    expect(cache.has('key1')).toBe(true);
    expect(cache.has('key2')).toBe(false);
  });

  it('should delete entries', () => {
    cache.set('key1', 'value1');
    expect(cache.delete('key1')).toBe(true);
    expect(cache.delete('key1')).toBe(false);
    expect(cache.get('key1')).toBeUndefined();
  });

  it('should clear all entries', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.clear();
    
    expect(cache.size()).toBe(0);
  });

  it('should respect TTL and expire entries', async () => {
    const cache2 = new LRUCache<string>(10, 50);
    cache2.set('key1', 'value1');
    
    expect(cache2.get('key1')).toBe('value1');
    
    await new Promise(r => setTimeout(r, 60));
    
    expect(cache2.get('key1')).toBeUndefined();
  });

  it('should cleanup expired entries', async () => {
    const cache2 = new LRUCache<string>(10, 50);
    cache2.set('key1', 'value1');
    cache2.set('key2', 'value2');
    
    await new Promise(r => setTimeout(r, 60));
    
    const cleaned = cache2.cleanup();
    expect(cleaned).toBe(2);
  });

  it('should return all keys', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    
    const keys = cache.keys();
    expect(keys).toContain('key1');
    expect(keys).toContain('key2');
  });

  it('should return all values', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    
    const values = cache.values();
    expect(values).toContain('value1');
    expect(values).toContain('value2');
  });

  describe('createCache', () => {
    it('should create cache with options', () => {
      const cache = createCache<string>(100, 5000);
      cache.set('test', 'value');
      expect(cache.get('test')).toBe('value');
    });
  });
});
