/**
 * Base Adapter Class
 * 
 * Abstract base class for all notification/messaging adapters.
 * Uses: event, error, utils
 */

import { EventEmitter } from '../event';
import { createError, ErrorCode, errors } from '../error';
import { logAuditEvent, initAuditLogger, type AuditLoggerConfig } from '../audit';

// ============================================================================
// Types
// ============================================================================

export type AdapterType = 'telegram' | 'discord' | 'slack' | 'webhook';

export interface AdapterConfig {
  /** Whether adapter is enabled */
  enabled?: boolean;
  /** Default destination (chat ID, channel, etc.) */
  defaultDestination?: string;
}

export interface SendOptions {
  /** Destination (chat ID, channel, webhook name) */
  destination?: string;
  /** Parse mode for Telegram/Discord */
  parseMode?: 'Markdown' | 'HTML';
  /** Reply to message ID */
  replyTo?: number;
  /** Extra metadata */
  metadata?: Record<string, any>;
}

export interface AdapterResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface AdapterStatus {
  connected: boolean;
  type: AdapterType;
  name: string;
}

// ============================================================================
// Events
// ============================================================================

export interface AdapterEvents {
  'adapter:message-sent': { adapter: string; destination: string; messageId?: string };
  'adapter:message-failed': { adapter: string; destination: string; error: string };
  'adapter:connected': { adapter: string };
  'adapter:disconnected': { adapter: string };
  'adapter:error': { adapter: string; error: string };
}

// ============================================================================
// Base Adapter
// ============================================================================

export abstract class BaseAdapter extends EventEmitter<AdapterEvents> {
  abstract readonly name: string;
  abstract readonly type: AdapterType;
  protected connected: boolean = false;
  protected enabled: boolean = true;
  protected defaultDestination?: string;

  constructor(config?: AdapterConfig) {
    super();
    this.enabled = config?.enabled ?? true;
    this.defaultDestination = config?.defaultDestination;
  }

  /**
   * Initialize audit logger (call once at app startup)
   */
  static initAudit(config: AuditLoggerConfig): void {
    initAuditLogger(config);
  }

  /**
   * Log security event to audit
   */
  protected async audit(eventType: string, details: Record<string, any>): Promise<void> {
    try {
      await logAuditEvent(
        eventType as any,
        'system',
        { adapter: this.name, adapterType: this.type, ...details },
        'low'
      );
    } catch (e) {
      // Audit failure shouldn't break adapters
      console.warn('Audit log failed:', e);
    }
  }

  /**
   * Get adapter status
   */
  abstract status(): AdapterStatus;

  /**
   * Send a message
   */
  abstract send(message: string, options?: SendOptions): Promise<AdapterResult>;

  /**
   * Test the adapter connection
   */
  abstract ping(): Promise<boolean>;

  /**
   * Check if adapter is ready
   */
  isReady(): boolean {
    return this.connected && this.enabled;
  }

  /**
   * Get default destination
   */
  getDefaultDestination(): string | undefined {
    return this.defaultDestination;
  }

  /**
   * Set default destination
   */
  setDefaultDestination(destination: string): void {
    this.defaultDestination = destination;
  }

  /**
   * Enable adapter
   */
  enable(): void {
    this.enabled = true;
  }

  /**
   * Disable adapter
   */
  disable(): void {
    this.enabled = false;
  }
}

// ============================================================================
// Adapter Factory & Registry
// ============================================================================

export interface AdapterRegistryMap {
  [key: string]: BaseAdapter;
}

const adapterMap: AdapterRegistryMap = {};

/**
 * Register an adapter
 */
export function registerAdapter(name: string, adapter: BaseAdapter): void {
  adapterMap[name] = adapter;
  adapter.emit('adapter:connected', { adapter: name });
}

/**
 * Get registered adapter by name
 */
export function getAdapter(name: string): BaseAdapter | undefined {
  return adapterMap[name];
}

/**
 * Get all registered adapters
 */
export function getAllAdapters(): BaseAdapter[] {
  return Object.values(adapterMap);
}

/**
 * Unregister an adapter
 */
export function unregisterAdapter(name: string): boolean {
  const adapter = adapterMap[name];
  if (adapter) {
    adapter.emit('adapter:disconnected', { adapter: name });
    delete adapterMap[name];
    return true;
  }
  return false;
}

/**
 * Send to all registered adapters (broadcast)
 */
export async function broadcast(message: string, options?: SendOptions): Promise<Map<string, AdapterResult>> {
  const results = new Map<string, AdapterResult>();
  
  for (const adapter of getAllAdapters()) {
    if (adapter.isReady()) {
      const result = await adapter.send(message, options);
      results.set(adapter.name, result);
    }
  }
  
  return results;
}

// ============================================================================
// AdapterRegistry Class (mirrors ConnectorRegistry)
// ============================================================================

export class AdapterRegistry {
  private adapters = new Map<string, BaseAdapter>();
  
  /**
   * Register an adapter
   */
  register(name: string, adapter: BaseAdapter): void {
    this.adapters.set(name, adapter);
    adapter.emit('adapter:connected', { adapter: name });
  }
  
  /**
   * Get adapter by name
   */
  get(name: string): BaseAdapter | undefined {
    return this.adapters.get(name);
  }
  
  /**
   * Get all adapters
   */
  getAll(): BaseAdapter[] {
    return Array.from(this.adapters.values());
  }
  
  /**
   * Unregister an adapter
   */
  unregister(name: string): boolean {
    const adapter = this.adapters.get(name);
    if (adapter) {
      adapter.emit('adapter:disconnected', { adapter: name });
      this.adapters.delete(name);
      return true;
    }
    return false;
  }
  
  /**
   * Check if adapter exists
   */
  has(name: string): boolean {
    return this.adapters.has(name);
  }
  
  /**
   * List all adapter names
   */
  list(): string[] {
    return Array.from(this.adapters.keys());
  }
  
  /**
   * Broadcast to all ready adapters
   */
  async broadcast(message: string, options?: SendOptions): Promise<Map<string, AdapterResult>> {
    const results = new Map<string, AdapterResult>();
    
    for (const adapter of this.getAll()) {
      if (adapter.isReady()) {
        const result = await adapter.send(message, options);
        results.set(adapter.name, result);
      }
    }
    
    return results;
  }
}

// Default registry instance
export const adapterRegistry = new AdapterRegistry();

// Convenience functions using default registry
export function register(name: string, adapter: BaseAdapter): void {
  adapterRegistry.register(name, adapter);
}

export function get(name: string): BaseAdapter | undefined {
  return adapterRegistry.get(name);
}

export function getAll(): BaseAdapter[] {
  return adapterRegistry.getAll();
}

export function unregister(name: string): boolean {
  return adapterRegistry.unregister(name);
}

export function has(name: string): boolean {
  return adapterRegistry.has(name);
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an adapter by type - lazy imports to avoid circular deps
 */
export async function createAdapter(
  type: AdapterType, 
  config?: TelegramAdapterConfig | DiscordAdapterConfig | SlackAdapterConfig | WebhookAdapterConfig
): Promise<BaseAdapter | undefined> {
  switch (type) {
    case 'telegram': {
      const { createTelegramAdapter } = await import('./telegram');
      return createTelegramAdapter(config as TelegramAdapterConfig);
    }
    case 'discord': {
      const { createDiscordAdapter } = await import('./discord');
      return createDiscordAdapter(config as DiscordAdapterConfig);
    }
    case 'slack': {
      const { createSlackAdapter } = await import('./slack');
      return createSlackAdapter(config as SlackAdapterConfig);
    }
    case 'webhook': {
      const { createWebhookAdapter } = await import('./webhook');
      return createWebhookAdapter('webhook', config as WebhookAdapterConfig);
    }
    default:
      return undefined;
  }
}

/**
 * Create and register an adapter
 */
export async function createAndRegister(
  name: string, 
  type: AdapterType, 
  config?: TelegramAdapterConfig | DiscordAdapterConfig | SlackAdapterConfig | WebhookAdapterConfig
): Promise<BaseAdapter | undefined> {
  const adapter = await createAdapter(type, config);
  if (adapter) {
    register(name, adapter);
  }
  return adapter;
}

// Type imports for factory functions
import type { TelegramAdapterConfig } from './telegram';
import type { DiscordAdapterConfig } from './discord';
import type { SlackAdapterConfig } from './slack';
import type { WebhookAdapterConfig } from './webhook';
