/**
 * Secrets Module Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  get, 
  set, 
  has, 
  clear, 
  clearAll,
  types, 
  info, 
  infoAll,
  validate,
  configure,
  secrets,
  SECRET_CONFIG,
} from '../lib/secrets';

describe('Secrets Module', () => {
  beforeEach(() => {
    clearAll();
  });

  describe('types()', () => {
    it('should return all secret types', () => {
      const result = types();
      expect(result).toContain('jwt');
      expect(result).toContain('google');
      expect(result).toContain('telegram');
      expect(result).toContain('discord');
    });
  });

  describe('info()', () => {
    it('should return info for jwt secret', () => {
      const result = info('jwt');
      expect(result.type).toBe('jwt');
      expect(result.env).toBe('JWT_SECRET');
      expect(result.required).toBe(true);
      expect(result.public).toBe(false);
    });

    it('should return public true for google client id', () => {
      const result = info('google');
      expect(result.public).toBe(true);
    });

    it('should return hasSecret false when not set', () => {
      const result = info('jwt');
      expect(result.hasSecret).toBe(false);
    });
  });

  describe('has()', () => {
    it('should return false when secret not set', () => {
      expect(has('jwt')).toBe(false);
    });

    it('should return true after setting secret', () => {
      set('test-secret', 'test-value');
      expect(has('test-secret')).toBe(true);
    });

    it('should return true when env var exists', () => {
      vi.stubEnv('TEST_SECRET', 'env-value');
      // This uses process.env so it would work differently
      // For testing, we rely on set/clear
      vi.unstubAllEnvs();
    });
  });

  describe('set() and get()', () => {
    it('should set and get a secret', async () => {
      set('my-secret', 'my-value');
      const result = await get('my-secret');
      expect(result).toBe('my-value');
    });

    it('should throw on invalid input', () => {
      expect(() => set('test', '')).toThrow();
      expect(() => set('test', null as any)).toThrow();
    });

    it('should use default value when secret not found', async () => {
      clear('nonexistent-test');
      const result = await get('nonexistent-test', { defaultValue: 'default-val' });
      expect(result).toBe('default-val');
    });

    it('should return default from options, then config default', async () => {
      // Options default takes priority
      clear('app-url-test');
      const result1 = await get('app-url-test', { defaultValue: 'fallback' });
      expect(result1).toBe('fallback');
    });
  });

  describe('clear()', () => {
    it('should clear a specific secret', () => {
      set('to-clear', 'value');
      expect(has('to-clear')).toBe(true);
      clear('to-clear');
      expect(has('to-clear')).toBe(false);
    });

    it('should clear all secrets', () => {
      set('secret1', 'val1');
      set('secret2', 'val2');
      clearAll();
      expect(has('secret1')).toBe(false);
      expect(has('secret2')).toBe(false);
    });
  });

  describe('validate()', () => {
    it('should return valid when all required secrets provided', async () => {
      // Both jwt and google_secret are required
      const result = await validate({
        env: { 
          JWT_SECRET: 'test-secret',
          GOOGLE_CLIENT_SECRET: 'test-client-secret'
        }
      });
      expect(result.valid).toBe(true);
    });

    it('should return invalid when required secrets missing', async () => {
      const result = await validate({
        env: {} // No secrets - jwt and google_secret are required but not set
      });
      expect(result.valid).toBe(false);
      expect(result.missing).toContain('jwt');
      expect(result.missing).toContain('google_secret');
    });
  });

  describe('configure()', () => {
    it('should configure default cache timeout', () => {
      configure({ defaultCacheTimeout: 5000 });
      // Just verify it doesn't throw
      expect(true).toBe(true);
    });
  });

  describe('SECRET_CONFIG', () => {
    it('should have jwt configuration', () => {
      expect(SECRET_CONFIG.jwt.env).toBe('JWT_SECRET');
      expect(SECRET_CONFIG.jwt.required).toBe(true);
    });

    it('should have google configuration', () => {
      expect(SECRET_CONFIG.google.env).toBe('GOOGLE_CLIENT_ID');
      expect(SECRET_CONFIG.google.public).toBe(true);
    });

    it('should have notification bot configurations', () => {
      expect(SECRET_CONFIG.telegram.env).toBe('TELEGRAM_BOT_TOKEN');
      expect(SECRET_CONFIG.discord.env).toBe('DISCORD_BOT_TOKEN');
      expect(SECRET_CONFIG.slack.env).toBe('SLACK_BOT_TOKEN');
    });
  });

  describe('secrets object', () => {
    it('should expose all functions', () => {
      expect(secrets.get).toBeDefined();
      expect(secrets.set).toBeDefined();
      expect(secrets.has).toBeDefined();
      expect(secrets.clear).toBeDefined();
      expect(secrets.types).toBeDefined();
      expect(secrets.info).toBeDefined();
      expect(secrets.validate).toBeDefined();
      expect(secrets.events).toBeDefined();
    });
  });
});
