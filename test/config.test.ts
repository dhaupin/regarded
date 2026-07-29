/**
 * Config Module Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_GLOBAL_CONFIG,
  DEFAULT_USER_PREFERENCES,
  ConfigManager,
  createConfigManager,
} from '../lib/config';

// Mock KVNamespace for testing
const createMockKV = (initialData: Record<string, string> = {}) => ({
  get: async (key: string) => initialData[key] || null,
  put: async (key: string, value: string) => {
    initialData[key] = value;
  },
  list: async () => ({ keys: [] }),
  delete: async () => {},
  getWithMetadata: async () => ({ value: null, metadata: null }),
});

describe('DEFAULT_GLOBAL_CONFIG', () => {
  it('should have supported exchanges', () => {
    expect(DEFAULT_GLOBAL_CONFIG.supported_exchanges).toContain('kraken');
    expect(DEFAULT_GLOBAL_CONFIG.supported_exchanges).toContain('solana');
    expect(DEFAULT_GLOBAL_CONFIG.supported_exchanges).toContain('jupiter');
  });

  it('should have supported intervals', () => {
    expect(DEFAULT_GLOBAL_CONFIG.supported_intervals).toContain('1m');
    expect(DEFAULT_GLOBAL_CONFIG.supported_intervals).toContain('1h');
    expect(DEFAULT_GLOBAL_CONFIG.supported_intervals).toContain('1d');
  });

  it('should have default indicators', () => {
    expect(DEFAULT_GLOBAL_CONFIG.default_indicators).toContain('rsi');
    expect(DEFAULT_GLOBAL_CONFIG.default_indicators).toContain('macd');
  });

  it('should have rate limits', () => {
    expect(DEFAULT_GLOBAL_CONFIG.rate_limits.window_seconds).toBe(60);
    expect(DEFAULT_GLOBAL_CONFIG.rate_limits.max_requests).toBe(100);
  });
});

describe('DEFAULT_USER_PREFERENCES', () => {
  it('should have default pairs', () => {
    expect(DEFAULT_USER_PREFERENCES.default_pairs).toContain('SOL/USD');
  });

  it('should have default intervals', () => {
    expect(DEFAULT_USER_PREFERENCES.default_intervals).toContain('5m');
    expect(DEFAULT_USER_PREFERENCES.default_intervals).toContain('15m');
  });

  it('should have auto save trades enabled', () => {
    expect(DEFAULT_USER_PREFERENCES.auto_save_trades).toBe(true);
  });
});

describe('ConfigManager', () => {
  let manager: ConfigManager;
  let mockKV: ReturnType<typeof createMockKV>;

  beforeEach(() => {
    mockKV = createMockKV();
    manager = new ConfigManager(mockKV as any);
  });

  it('should create config manager', () => {
    expect(manager).toBeDefined();
  });

  describe('getGlobalConfig', () => {
    it('should return default config when none stored', async () => {
      const config = await manager.getGlobalConfig();
      expect(config).toEqual(DEFAULT_GLOBAL_CONFIG);
    });

    it('should return stored config', async () => {
      const customConfig = { ...DEFAULT_GLOBAL_CONFIG, supported_exchanges: ['binance'] as any };
      await mockKV.put('config:global', JSON.stringify(customConfig));
      
      const config = await manager.getGlobalConfig();
      expect(config.supported_exchanges).toContain('binance');
    });
  });

  describe('updateGlobalConfig', () => {
    it('should update global config', async () => {
      const updated = await manager.updateGlobalConfig({ 
        rate_limits: { window_seconds: 30, max_requests: 50 } 
      });
      expect(updated.rate_limits.window_seconds).toBe(30);
      expect(updated.rate_limits.max_requests).toBe(50);
    });

    it('should merge with existing config', async () => {
      await manager.updateGlobalConfig({ rate_limits: { window_seconds: 30, max_requests: 50 } } as any);
      const config = await manager.getGlobalConfig();
      expect(config.supported_exchanges).toEqual(DEFAULT_GLOBAL_CONFIG.supported_exchanges);
    });
  });

  describe('getUserConfig', () => {
    it('should return default user config when none stored', async () => {
      const config = await manager.getUserConfig('user-123');
      expect(config.user_id).toBe('user-123');
      expect(config.preferences).toEqual(DEFAULT_USER_PREFERENCES);
    });

    it('should return stored user config', async () => {
      const customConfig = {
        user_id: 'user-123',
        preferences: { ...DEFAULT_USER_PREFERENCES, default_pairs: ['BTC/USD'] },
        secrets_ref: 'secrets/123',
      };
      await mockKV.put('config:user:user-123', JSON.stringify(customConfig));
      
      const config = await manager.getUserConfig('user-123');
      expect(config.preferences.default_pairs).toContain('BTC/USD');
    });
  });

  describe('updateUserConfig', () => {
    it('should update user config', async () => {
      const updated = await manager.updateUserConfig('user-123', {
        default_pairs: ['BTC/USD', 'ETH/USD'],
      });
      expect(updated.preferences.default_pairs).toContain('BTC/USD');
      expect(updated.preferences.default_pairs).toContain('ETH/USD');
    });
  });

  describe('getSecret', () => {
    it('should return null when no secret stored', async () => {
      const secret = await manager.getSecret('user-123', 'nonexistent', 'user-secret');
      expect(secret).toBeNull();
    });
  });
});

describe('createConfigManager', () => {
  it('should create config manager instance', () => {
    const mockKV = createMockKV();
    const manager = createConfigManager(mockKV as any);
    expect(manager).toBeInstanceOf(ConfigManager);
  });
});
