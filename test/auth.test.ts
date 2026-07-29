/**
 * Auth Module Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AuthManager } from '../lib/auth';

describe('AuthManager', () => {
  let auth: AuthManager;

  beforeEach(() => {
    auth = new AuthManager({
      jwtSecret: 'test-secret',
      jwtExpiryMs: 900000,
      refreshTokenExpiryMs: 604800000,
      maxAttempts: 3,
      lockoutDurationMs: 60000,
    });
  });

  it('should create auth manager with config', () => {
    expect(auth).toBeDefined();
  });

  it('should track failed attempts', () => {
    const identifier = 'test-ip';
    
    const locked1 = auth.recordFailedAttempt(identifier);
    expect(locked1).toBe(false);
    
    const locked2 = auth.recordFailedAttempt(identifier);
    expect(locked2).toBe(false);
    
    const locked3 = auth.recordFailedAttempt(identifier);
    expect(locked3).toBe(true); // Now locked after 3 attempts
  });

  it('should lock out after max attempts', () => {
    const identifier = 'test-ip';
    
    auth.recordFailedAttempt(identifier);
    auth.recordFailedAttempt(identifier);
    auth.recordFailedAttempt(identifier);
    
    expect(auth.isLockedOut(identifier)).toBe(true);
  });

  it('should release lockout after duration', async () => {
    const auth2 = new AuthManager({
      jwtSecret: 'test',
      jwtExpiryMs: 1000,
      refreshTokenExpiryMs: 1000,
      maxAttempts: 2,
      lockoutDurationMs: 100,
    });
    
    const identifier = 'test-ip';
    auth2.recordFailedAttempt(identifier);
    auth2.recordFailedAttempt(identifier);
    
    expect(auth2.isLockedOut(identifier)).toBe(true);
    
    await new Promise(r => setTimeout(r, 150));
    
    expect(auth2.isLockedOut(identifier)).toBe(false);
  });

  it('should clear failed attempts', () => {
    const identifier = 'test-ip';
    
    auth.recordFailedAttempt(identifier);
    auth.recordFailedAttempt(identifier);
    auth.clearFailedAttempts(identifier);
    
    expect(auth.isLockedOut(identifier)).toBe(false);
  });

  it('should create sessions', () => {
    const session = auth.createSession('user-123');
    
    expect(session.id).toBeDefined();
    expect(session.user_id).toBe('user-123');
    expect(session.expires_at).toBeGreaterThan(Date.now());
  });

  it('should generate refresh tokens', () => {
    const token1 = auth.generateRefreshToken();
    const token2 = auth.generateRefreshToken();
    
    expect(token1).toBeDefined();
    expect(token2).toBeDefined();
    expect(token1).not.toBe(token2);
  });
});
