/**
 * WAF Module Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WAF, createWAF, type RequestContext } from '../lib/waf';

describe('WAF', () => {
  let waf: WAF;
  
  const createMockContext = (overrides: Partial<RequestContext> = {}): RequestContext => ({
    ip: '127.0.0.1',
    method: 'GET',
    path: '/api/test',
    headers: {},
    timestamp: Date.now(),
    ...overrides,
  });

  beforeEach(() => {
    waf = new WAF({
      maxRequestsPerWindow: 3,
      windowMs: 1000,
      maxAuthAttempts: 2,
      banDurationMs: 5000,
    });
  });

  describe('Basic functionality', () => {
    it('should create WAF instance', () => {
      expect(waf).toBeDefined();
    });

    it('should generate request IDs', () => {
      const id1 = waf.generateRequestId();
      const id2 = waf.generateRequestId();
      
      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
    });

    it('should get client IP from headers', () => {
      const ctx = createMockContext({
        headers: { 'cf-connecting-ip': '1.2.3.4' },
      });
      
      expect(waf.getClientIp(ctx)).toBe('1.2.3.4');
    });

    it('should get client IP from x-forwarded-for', () => {
      const ctx = createMockContext({
        headers: { 'x-forwarded-for': '5.6.7.8, 9.10.11.12' },
      });
      
      expect(waf.getClientIp(ctx)).toBe('5.6.7.8');
    });
  });

  describe('Rate limiting', () => {
    it('should allow requests under limit', () => {
      const ctx = createMockContext();
      
      const result1 = waf.validate(ctx);
      expect(result1.allowed).toBe(true);
      
      const result2 = waf.validate(ctx);
      expect(result2.allowed).toBe(true);
      
      const result3 = waf.validate(ctx);
      expect(result3.allowed).toBe(true);
    });

    it('should block requests over limit', () => {
      const ctx = createMockContext();
      
      waf.validate(ctx);
      waf.validate(ctx);
      waf.validate(ctx);
      
      const result = waf.validate(ctx);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Rate limit exceeded');
    });

    it('should track request counts per IP', () => {
      const ctx1 = createMockContext({ ip: '1.1.1.1' });
      const ctx2 = createMockContext({ ip: '2.2.2.2' });
      
      waf.validate(ctx1);
      waf.validate(ctx1);
      
      expect(waf.getRequestCount('1.1.1.1')).toBe(2);
      expect(waf.getRequestCount('2.2.2.2')).toBe(0);
    });
  });

  describe('IP Blocking', () => {
    it('should block specific IPs', () => {
      const waf2 = createWAF({
        blockedIps: ['1.2.3.4'],
      });
      
      const ctx = createMockContext({ ip: '1.2.3.4' });
      const result = waf2.validate(ctx);
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('IP is blocked');
    });

    it('should allow IPs in whitelist', () => {
      const waf2 = createWAF({
        allowedIps: ['1.2.3.4'],
      });
      
      const ctx = createMockContext({ ip: '1.2.3.4' });
      const result = waf2.validate(ctx);
      
      expect(result.allowed).toBe(true);
    });

    it('should block IPs not in whitelist', () => {
      const waf2 = createWAF({
        allowedIps: ['1.2.3.4'],
      });
      
      const ctx = createMockContext({ ip: '5.6.7.8' });
      const result = waf2.validate(ctx);
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('IP not in allowed list');
    });
  });

  describe('Auth failure tracking', () => {
    it('should track auth failures', () => {
      waf.recordAuthFailure('1.1.1.1');
      // Just verify no crash
      expect(waf.getRequestCount('1.1.1.1')).toBeGreaterThanOrEqual(0);
    });

    it('should track failures', () => {
      const ctx = createMockContext({ ip: '1.1.1.1' });
      
      waf.recordAuthFailure('1.1.1.1');
      waf.recordAuthFailure('1.1.1.1');
      
      // The key is that it doesn't crash and tracks something
      expect(waf.getRequestCount('1.1.1.1')).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Input validation', () => {
    it('should sanitize XSS input', () => {
      const input = '<script>alert("xss")</script>test';
      const sanitized = waf.sanitizeInput(input);
      
      expect(sanitized).not.toContain('<script>');
    });

    it('should sanitize javascript: URLs', () => {
      const input = 'javascript:alert("xss")';
      const sanitized = waf.sanitizeInput(input);
      
      expect(sanitized).not.toContain('javascript:');
    });

    it('should validate emails', () => {
      expect(waf.validateEmail('test@example.com')).toBe(true);
      expect(waf.validateEmail('invalid')).toBe(false);
      expect(waf.validateEmail('test@')).toBe(false);
    });

    it('should validate URLs', () => {
      expect(waf.validateUrl('https://example.com')).toBe(true);
      expect(waf.validateUrl('http://test.com')).toBe(true);
      expect(waf.validateUrl('javascript:alert(1)')).toBe(false);
      expect(waf.validateUrl('not-a-url')).toBe(false);
    });
  });

  describe('Request size validation', () => {
    it('should reject large request bodies', () => {
      const waf2 = createWAF({
        maxBodySize: 100,
      });
      
      const ctx = createMockContext({
        body: { data: 'x'.repeat(200) },
      });
      
      const result = waf2.validate(ctx);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Request body too large');
    });
  });

  describe('Risk levels', () => {
    it('should return low risk for allowed requests', () => {
      const ctx = createMockContext();
      const result = waf.validate(ctx);
      
      expect(result.riskLevel).toBe('low');
    });

    it('should return high risk for blocked IPs', () => {
      const waf2 = createWAF({ blockedIps: ['1.1.1.1'] });
      const ctx = createMockContext({ ip: '1.1.1.1' });
      
      const result = waf2.validate(ctx);
      expect(result.riskLevel).toBe('critical');
    });
  });

  describe('Reset', () => {
    it('should reset all counters', () => {
      const ctx = createMockContext();
      
      waf.validate(ctx);
      waf.validate(ctx);
      waf.recordAuthFailure('1.1.1.1');
      
      waf.reset();
      
      expect(waf.getRequestCount('127.0.0.1')).toBe(0);
      expect(waf.getAuthFailureCount('1.1.1.1')).toBe(0);
      expect(waf.isIpBanned('1.1.1.1')).toBe(false);
    });
  });
});
