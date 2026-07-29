/**
 * Regarded Library Tests
 * 
 * Main entry point exports verification
 */

import { describe, it, expect } from 'vitest';

describe('Regarded Library', () => {
  it('should export all modules', async () => {
    // Test that main exports work
    const { encrypt, decrypt } = await import('../lib/encrypt');
    expect(encrypt).toBeDefined();
    expect(decrypt).toBeDefined();
    
    const { AuthManager } = await import('../lib/auth');
    expect(AuthManager).toBeDefined();
    
    const { LRUCache, createCache } = await import('../lib/cache');
    expect(LRUCache).toBeDefined();
    expect(createCache).toBeDefined();
    
    const { EventEmitter, events } = await import('../lib/event');
    expect(EventEmitter).toBeDefined();
    expect(events).toBeDefined();
    
    const { createConnector } = await import('../lib/connectors');
    expect(createConnector).toBeDefined();
    
    const { createIndicator, calculateIndicator } = await import('../lib/indicators');
    expect(createIndicator).toBeDefined();
    expect(calculateIndicator).toBeDefined();
    
    const { detectPattern, patterns } = await import('../lib/patterns');
    expect(detectPattern).toBeDefined();
    expect(patterns).toBeDefined();
    
    const { createRulesEngine } = await import('../lib/rules');
    expect(createRulesEngine).toBeDefined();
    
    const { Router, json, success, error } = await import('../lib/api');
    expect(Router).toBeDefined();
    expect(json).toBeDefined();
    expect(success).toBeDefined();
    expect(error).toBeDefined();
  });

  it('should export types', async () => {
    const types = await import('../lib/types');
    expect(types).toBeDefined();
  });
});
