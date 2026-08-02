/**
 * Secrets Manager
 * 
 * Centralized runtime secrets management for regarded.
 * Inspired by Vant's secret.js module.
 * 
 * Features:
 * - Secret type → environment variable mapping
 * - In-memory cache with configurable timeout (like sudo)
 * - Events integration
 * - Platform-agnostic (works with Cloudflare, Vercel, Netlify)
 * 
 * Usage:
 *   import { secrets } from './lib/secrets';
 *   const jwtSecret = await secrets.get('jwt');
 *   const hasTelegram = secrets.has('telegram');
 */

import { EventEmitter } from './event';
import { createError, ErrorCode } from './error';

// ============================================================================
// Types
// ============================================================================

export interface SecretConfig {
  /** Environment variable name */
  env: string;
  /** Is this a public value (not a secret) */
  public?: boolean;
  /** Is this secret required */
  required?: boolean;
  /** Description for docs */
  description?: string;
  /** Default value if not set */
  default?: string;
  /** Cache timeout in ms (0 = no cache, -1 = no expiry) */
  cacheTimeout?: number;
}

export interface SecretCacheEntry {
  value: string;
  timestamp: number;
}

export interface SecretsEvents {
  'secret:accessed': { type: string; source: 'cache' | 'env' | 'kv' };
  'secret:missing': { type: string };
  'secret:loaded': { type: string; source: 'env' | 'kv' };
  'secret:cleared': { type: string };
  'secret:error': { type: string; error: string };
}

// ============================================================================
// Secret Configuration
// ============================================================================

/** Secret type → environment variable mapping */
export const SECRET_CONFIG: Record<string, SecretConfig> = {
  // Auth secrets
  jwt: {
    env: 'JWT_SECRET',
    required: true,
    description: 'JWT signing secret',
    cacheTimeout: 60000, // 1 minute cache
  },
  google: {
    env: 'GOOGLE_CLIENT_ID',
    public: true,
    description: 'Google OAuth client ID',
    cacheTimeout: 300000, // 5 minutes
  },
  google_secret: {
    env: 'GOOGLE_CLIENT_SECRET',
    required: true,
    description: 'Google OAuth client secret',
    cacheTimeout: 60000,
  },

  // Notification bots
  telegram: {
    env: 'TELEGRAM_BOT_TOKEN',
    description: 'Telegram bot token',
    cacheTimeout: 300000,
  },
  discord: {
    env: 'DISCORD_BOT_TOKEN',
    description: 'Discord bot token',
    cacheTimeout: 300000,
  },
  slack: {
    env: 'SLACK_BOT_TOKEN',
    description: 'Slack bot token',
    cacheTimeout: 300000,
  },

  // Exchange API (user-provided, stored encrypted)
  exchange_kraken: {
    env: 'KRAKEN_API_KEY',
    description: 'Kraken API key (user-provided, stored encrypted)',
  },
  exchange_solana: {
    env: 'SOLANA_PRIVATE_KEY',
    description: 'Solana private key (user-provided, stored encrypted)',
  },

  // App config
  app_url: {
    env: 'APP_URL',
    description: 'Application URL',
    default: 'http://localhost:8787',
    cacheTimeout: 300000,
  },
  node_env: {
    env: 'NODE_ENV',
    description: 'Node environment',
    default: 'development',
    cacheTimeout: 300000,
  },
};

// ============================================================================
// Cache
// ============================================================================

const _cache = new Map<string, SecretCacheEntry>();
let _defaultCacheTimeout = 60000; // 1 minute default

// ============================================================================
// Events
// ============================================================================

const _emitter = new EventEmitter<SecretsEvents>();

export const secretsEvents = {
  on: <K extends keyof SecretsEvents>(event: K, callback: (data: SecretsEvents[K]) => void) => 
    _emitter.on(event, callback),
  once: <K extends keyof SecretsEvents>(event: K, callback: (data: SecretsEvents[K]) => void) => 
    _emitter.once(event, callback),
  off: <K extends keyof SecretsEvents>(event: K, callback: (data: SecretsEvents[K]) => void) => 
    _emitter.off(event, callback),
  emit: <K extends keyof SecretsEvents>(event: K, data: SecretsEvents[K]) => 
    _emitter.emit(event, data),
};

// ============================================================================
// Internal Helpers
// ============================================================================

function _getConfig(type: string): SecretConfig {
  return SECRET_CONFIG[type] || { 
    env: `SECRET_${type.toUpperCase()}`,
    description: `Secret for ${type}`,
  };
}

function _isCacheExpired(type: string, entry: SecretCacheEntry): boolean {
  const config = _getConfig(type);
  const timeout = config.cacheTimeout ?? _defaultCacheTimeout;
  
  // No expiry
  if (timeout === -1) return false;
  
  // No cache
  if (timeout === 0) return true;
  
  return Date.now() - entry.timestamp > timeout;
}

function _emit(event: keyof SecretsEvents, data: SecretsEvents[typeof event]) {
  try {
    _emitter.emit(event, data);
  } catch (e) {
    console.error('[secrets] Event emission error:', e);
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Get a secret value (sync - from cache only)
 * Use this for synchronous access to cached secrets
 * 
 * @param type - Secret type
 * @returns Secret value from cache, or undefined if not cached
 */
export function getCached(type: string): string | undefined {
  const entry = _cache.get(type);
  if (!entry) return undefined;
  if (_isCacheExpired(type, entry)) {
    _cache.delete(type);
    return undefined;
  }
  _emit('secret:accessed', { type, source: 'cache' });
  return entry.value;
}

/**
 * Get a secret value
 * Priority: cache → env var → KV (optional) → error
 * 
 * @param type - Secret type (e.g., 'jwt', 'telegram')
 * @param options - Options for retrieval
 * @returns Secret value or throws if required and missing
 */
export async function get(
  type: string, 
  options: {
    /** Override env var lookup (for platform bindings) */
    env?: Record<string, string>;
    /** Custom KV store for runtime secrets */
    kv?: { get(key: string): Promise<string | null> };
    /** Force prompt (not implemented - for CLI use) */
    forcePrompt?: boolean;
    /** Default value if not found */
    defaultValue?: string;
  } = {}
): Promise<string> {
  const config = _getConfig(type);
  const env = options.env ?? process.env as Record<string, string>;
  
  // 1. Check cache
  const cached = getCached(type);
  if (cached !== undefined) {
    return cached;
  }
  
  // 2. Check environment variable
  const envValue = env[config.env];
  if (envValue !== undefined && envValue !== '') {
    // Cache it
    _cache.set(type, { value: envValue, timestamp: Date.now() });
    _emit('secret:loaded', { type, source: 'env' });
    _emit('secret:accessed', { type, source: 'env' });
    return envValue;
  }
  
  // 3. Check KV (optional runtime storage)
  if (options.kv) {
    const kvValue = await options.kv.get(`secret:${type}`);
    if (kvValue) {
      _cache.set(type, { value: kvValue, timestamp: Date.now() });
      _emit('secret:loaded', { type, source: 'kv' });
      _emit('secret:accessed', { type, source: 'kv' });
      return kvValue;
    }
  }
  
  // 4. Check default value in options first
  if (options.defaultValue !== undefined) {
    _cache.set(type, { value: options.defaultValue, timestamp: Date.now() });
    return options.defaultValue;
  }
  
  // 5. Check config default
  if (config.default !== undefined) {
    _cache.set(type, { value: config.default, timestamp: Date.now() });
    _emit('secret:loaded', { type, source: 'env' });
    return config.default;
  }
  
  // 6. Required but not found
  if (config.required) {
    _emit('secret:missing', { type });
    _emit('secret:error', { type, error: `Required secret '${type}' (${config.env}) is not set` });
    throw createError({
      code: ErrorCode.SECRETS_MISSING,
      message: `Required secret '${type}' is not configured`,
      statusCode: 500,
      details: { envVar: config.env, type },
    });
  }
  
  return '';
}

/**
 * Set a secret programmatically (for runtime storage)
 * Does NOT persist to env - use for KV storage
 */
export function set(type: string, value: string): void {
  const config = _getConfig(type);
  
  // Validate
  if (!value || typeof value !== 'string') {
    throw createError({
      code: ErrorCode.INVALID_INPUT,
      message: 'Secret value must be a non-empty string',
    });
  }
  
  // Cache with no expiry (until restart or explicit clear)
  _cache.set(type, { value, timestamp: Date.now() });
  _emit('secret:loaded', { type, source: 'kv' });
}

/**
 * Check if a secret is available (cached or env, not expired)
 */
export function has(type: string): boolean {
  const config = _getConfig(type);
  const envValue = process.env[config.env];
  
  if (envValue !== undefined && envValue !== '') return true;
  
  if (!_cache.has(type)) return false;
  
  return !_isCacheExpired(type, _cache.get(type)!);
}

/**
 * Clear a specific secret from cache
 */
export function clear(type: string): void {
  _cache.delete(type);
  _emit('secret:cleared', { type });
}

/**
 * Clear all secrets from cache
 */
export function clearAll(): void {
  _cache.clear();
  _emit('secret:cleared', { type: 'all' });
}

/**
 * Get all available secret types
 */
export function types(): string[] {
  return Object.keys(SECRET_CONFIG);
}

/**
 * Get secret config info (without secrets)
 */
export function info(type: string): {
  type: string;
  env: string;
  required: boolean;
  public: boolean;
  description?: string;
  hasSecret: boolean;
} {
  const config = _getConfig(type);
  return {
    type,
    env: config.env,
    required: config.required ?? false,
    public: config.public ?? false,
    description: config.description,
    hasSecret: has(type),
  };
}

/**
 * Get all secret infos
 */
export function infoAll(): ReturnType<typeof info>[] {
  return types().map(info);
}

/**
 * Validate required secrets are configured
 * Useful for startup checks
 */
export async function validate(options: {
  env?: Record<string, string>;
  kv?: { get(key: string): Promise<string | null> };
} = {}): Promise<{
  valid: boolean;
  missing: string[];
  errors: Array<{ type: string; env: string }>;
}> {
  const errors: Array<{ type: string; env: string }> = [];
  const missing: string[] = [];
  
  for (const [type, config] of Object.entries(SECRET_CONFIG)) {
    if (!config.required) continue;
    
    try {
      await get(type, options);
    } catch (e) {
      errors.push({ type, env: config.env });
      missing.push(type);
    }
  }
  
  return {
    valid: errors.length === 0,
    missing,
    errors,
  };
}

/**
 * Configure secret defaults
 */
export function configure(options: {
  defaultCacheTimeout?: number;
}): void {
  if (options.defaultCacheTimeout !== undefined) {
    _defaultCacheTimeout = options.defaultCacheTimeout;
  }
}

// ============================================================================
// Export
// ============================================================================

export const secrets = {
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
  events: secretsEvents,
  SECRET_CONFIG,
};

export default secrets;
