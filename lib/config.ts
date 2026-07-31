/**
 * Config Module
 * 
 * Configuration registry and encrypted secrets storage.
 * Emits events: config:updated, secret:added, secret:removed
 */

import { EventEmitter } from './event';
import type { GlobalConfig, UserConfig, StrategyConfig, SecretsCategory, SecretsMetadata, UserPreferences, KVNamespace } from './types';
import { encrypt, decrypt, generateToken } from './encrypt';
import { logAuditEvent } from './audit';

export interface ConfigEvents {
  'config:updated': { userId?: string; keys: string[] };
  'secret:added': { userId: string; category: string; label: string };
  'secret:removed': { userId: string; secretId: string };
}

export const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
  supported_exchanges: ['kraken', 'solana', 'jupiter'],
  supported_intervals: ['1m', '5m', '15m', '30m', '1h', '4h', '1d'],
  default_indicators: ['rsi', 'kdj', 'boll', 'macd'],
  rate_limits: { window_seconds: 60, max_requests: 100 },
};

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  default_pairs: ['SOL/USD'],
  default_intervals: ['5m', '15m', '1h'],
  auto_save_trades: true,
};

/**
 * Config Manager
 */
export class ConfigManager extends EventEmitter<ConfigEvents> {
  private kv: any; // KVNamespace from @cloudflare/workers-types
  
  constructor(kv: any) {
    super();
    this.kv = kv;
  }
  
  /**
   * Get global config
   */
  async getGlobalConfig(): Promise<GlobalConfig> {
    const cached = await this.kv.get('config:global');
    return cached ? JSON.parse(cached) : DEFAULT_GLOBAL_CONFIG;
  }
  
  /**
   * Update global config
   */
  async updateGlobalConfig(config: Partial<GlobalConfig>): Promise<GlobalConfig> {
    const current = await this.getGlobalConfig();
    const updated = { ...current, ...config };
    await this.kv.put('config:global', JSON.stringify(updated));
    
    // Emit event
    this.emit('config:updated', { keys: Object.keys(config) });
    
    // Audit log
    logAuditEvent('config_updated' as any, 'global', {
      keys: Object.keys(config),
    }, 'medium').catch(() => {});
    
    return updated;
  }
  
  /**
   * Get user config
   */
  async getUserConfig(userId: string): Promise<UserConfig> {
    const cached = await this.kv.get(`config:user:${userId}`);
    return cached ? JSON.parse(cached) : { user_id: userId, preferences: DEFAULT_USER_PREFERENCES, secrets_ref: '' };
  }
  
  /**
   * Update user config
   */
  async updateUserConfig(userId: string, preferences: Partial<UserPreferences>): Promise<UserConfig> {
    const current = await this.getUserConfig(userId);
    const updated: UserConfig = {
      ...current,
      user_id: userId,
      preferences: { ...current.preferences, ...preferences },
    };
    await this.kv.put(`config:user:${userId}`, JSON.stringify(updated));
    
    // Emit event
    this.emit('config:updated', { userId, keys: Object.keys(preferences) });
    
    // Audit log
    logAuditEvent('config_updated' as any, userId, {
      keys: Object.keys(preferences),
    }, 'low').catch(() => {});
    
    return updated;
  }
  
  /**
   * Store encrypted secret
   */
  async storeSecret(userId: string, category: SecretsCategory, label: string, data: string, userSecret: string): Promise<SecretsMetadata> {
    const encrypted = await encrypt(data, userSecret);
    const secretId = generateToken(16);
    const storageKey = `secret:${userId}:${secretId}`;
    
    await this.kv.put(storageKey, JSON.stringify(encrypted));
    
    // Emit event
    this.emit('secret:added', { userId, category, label });
    
    // Audit log
    logAuditEvent('secret_added' as any, userId, {
      category,
      label,
      secretId,
    }, 'high').catch(() => {});
    
    return {
      id: secretId,
      user_id: userId,
      category,
      label,
      encrypted_ref: storageKey,
      created_at: Date.now(),
      updated_at: Date.now(),
    };
  }
  
  /**
   * Get secret
   */
  async getSecret(userId: string, secretId: string, userSecret: string): Promise<string | null> {
    const storageKey = `secret:${userId}:${secretId}`;
    const encryptedData = await this.kv.get(storageKey);
    if (!encryptedData) return null;
    
    return decrypt(JSON.parse(encryptedData), userSecret);
  }
  
  /**
   * Delete secret
   */
  async deleteSecret(userId: string, secretId: string): Promise<void> {
    await this.kv.delete(`secret:${userId}:${secretId}`);
    
    // Emit event
    this.emit('secret:removed', { userId, secretId });
    
    // Audit log
    logAuditEvent('secret_removed' as any, userId, { secretId }, 'high').catch(() => {});
  }
}

export function createConfigManager(kv: KVNamespace): ConfigManager {
  return new ConfigManager(kv);
}
