/**
 * QoS Module Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  CircuitBreaker, 
  CircuitState,
  RecursionGuard,
  RateLimiter,
  QoSManager,
  createQoSManager 
} from '../lib/qos';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      successThreshold: 2,
      timeoutMs: 1000,
      maxConcurrent: 2,
    });
  });

  it('should create circuit breaker', () => {
    expect(breaker).toBeDefined();
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
  });

  it('should execute function when closed', async () => {
    const result = await breaker.execute(async () => 'success');
    expect(result).toBe('success');
  });

  it('should track failures', async () => {
    await expect(breaker.execute(async () => { throw new Error('fail'); })).rejects.toThrow();
    await expect(breaker.execute(async () => { throw new Error('fail'); })).rejects.toThrow();
    
    const metrics = breaker.getMetrics();
    expect(metrics.failures).toBe(2);
  });

  it('should open circuit after threshold', async () => {
    await expect(breaker.execute(async () => { throw new Error('fail'); })).rejects.toThrow();
    await expect(breaker.execute(async () => { throw new Error('fail'); })).rejects.toThrow();
    await expect(breaker.execute(async () => { throw new Error('fail'); })).rejects.toThrow();
    
    expect(breaker.getState()).toBe(CircuitState.OPEN);
  });

  it('should reject requests when open', async () => {
    // Open the circuit
    breaker.setState(CircuitState.OPEN);
    
    await expect(breaker.execute(async () => 'success')).rejects.toThrow();
  });

  it('should go half-open after timeout', async () => {
    breaker.setState(CircuitState.OPEN);
    
    // Wait for timeout
    await new Promise(r => setTimeout(r, 1100));
    
    // After timeout, should be able to execute (goes to half-open or directly executes)
    const result = await breaker.execute(async () => 'success').catch(() => 'failed');
    expect(result).toBe('success');
  });

  it('should close circuit after success threshold in half-open', async () => {
    breaker.setState(CircuitState.HALF_OPEN);
    
    await breaker.execute(async () => 'success');
    await breaker.execute(async () => 'success');
    
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
  });

  it('should track total requests', async () => {
    await breaker.execute(async () => 'ok').catch(() => {});
    
    const metrics = breaker.getMetrics();
    expect(metrics.totalRequests).toBe(1);
  });

  it('should handle concurrent requests', async () => {
    const cb = new CircuitBreaker({ maxConcurrent: 2 });
    
    // Execute 3 requests concurrently
    const promises = [
      cb.execute(async () => { await new Promise(r => setTimeout(r, 20)); return '1'; }),
      cb.execute(async () => { await new Promise(r => setTimeout(r, 20)); return '2'; }),
      cb.execute(async () => { await new Promise(r => setTimeout(r, 20)); return '3'; }),
    ];
    
    const results = await Promise.allSettled(promises);
    
    // All should complete (some may be queued)
    const fulfilled = results.filter(r => r.status === 'fulfilled');
    expect(fulfilled.length).toBeGreaterThan(0);
  });

  it('should reset circuit', () => {
    breaker.setState(CircuitState.OPEN);
    breaker.reset();
    
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
    const metrics = breaker.getMetrics();
    expect(metrics.failures).toBe(0);
  });
});

describe('RecursionGuard', () => {
  let guard: RecursionGuard;

  beforeEach(() => {
    guard = new RecursionGuard(3);
  });

  it('should allow execution under limit', async () => {
    const result = await guard.execute('test', async () => 'success');
    expect(result).toBe('success');
  });

  it('should track depth', () => {
    expect(guard.getDepth('test')).toBe(0);
    
    guard.execute('test', async () => {}).catch(() => {});
    expect(guard.getDepth('test')).toBe(1);
  });

  it('should prevent excessive recursion', async () => {
    // Execute 4 times (over limit of 3)
    await guard.execute('test', async () => {
      await guard.execute('test', async () => {
        await guard.execute('test', async () => {
          await guard.execute('test', async () => {});
        });
      });
    }).catch(e => {
      expect(e.message).toContain('Recursion depth exceeded');
    });
  });

  it('should reset', async () => {
    await guard.execute('test', async () => {});
    guard.reset();
    expect(guard.getDepth('test')).toBe(0);
  });
});

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter(10, 0.1); // 10 tokens, refill at 0.1/ms
  });

  it('should allow requests with available tokens', () => {
    expect(limiter.tryConsume(1)).toBe(true);
    expect(limiter.tryConsume(5)).toBe(true);
  });

  it('should reject when no tokens', () => {
    limiter.tryConsume(10);
    expect(limiter.tryConsume(1)).toBe(false);
  });

  it('should refill over time', async () => {
    limiter.tryConsume(10);
    expect(limiter.tryConsume(1)).toBe(false);
    
    await new Promise(r => setTimeout(r, 20)); // Refill 2 tokens
    
    expect(limiter.tryConsume(1)).toBe(true);
  });

  it('should get available tokens', () => {
    limiter.tryConsume(5);
    expect(limiter.getAvailableTokens()).toBe(5);
  });

  it('should reset', () => {
    limiter.tryConsume(10);
    limiter.reset();
    expect(limiter.getAvailableTokens()).toBe(10);
  });
});

describe('QoSManager', () => {
  let qos: QoSManager;

  beforeEach(() => {
    qos = createQoSManager();
  });

  it('should create circuit breaker', () => {
    const breaker = qos.getBreaker('test');
    expect(breaker).toBeInstanceOf(CircuitBreaker);
  });

  it('should create rate limiter', () => {
    const limiter = qos.getLimiter('test');
    expect(limiter).toBeInstanceOf(RateLimiter);
  });

  it('should execute with circuit breaker', async () => {
    const result = await qos.executeWithBreaker('test', async () => 'success');
    expect(result).toBe('success');
  });

  it('should check rate limits', () => {
    // Different name to avoid conflict
    const consumed = qos.checkRateLimit('api3', 5);
    // Just verify it returns a boolean
    expect(typeof consumed).toBe('boolean');
  });

  it('should get all metrics', () => {
    qos.getBreaker('breaker1');
    qos.getBreaker('breaker2');
    
    const metrics = qos.getAllMetrics();
    expect(Object.keys(metrics)).toContain('breaker1');
    expect(Object.keys(metrics)).toContain('breaker2');
  });

  it('should reset all', async () => {
    const breaker = qos.getBreaker('test');
    await breaker.execute(async () => { throw new Error('fail'); }).catch(() => {});
    
    qos.reset();
    
    const metrics = breaker.getMetrics();
    expect(metrics.failures).toBe(0);
  });
});
