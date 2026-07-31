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

export interface AdapterRegistry {
  [key: string]: BaseAdapter;
}

const adapters: AdapterRegistry = {};

/**
 * Register an adapter
 */
export function registerAdapter(name: string, adapter: BaseAdapter): void {
  adapters[name] = adapter;
  adapter.emit('adapter:connected', { adapter: name });
}

/**
 * Get registered adapter by name
 */
export function getAdapter(name: string): BaseAdapter | undefined {
  return adapters[name];
}

/**
 * Get all registered adapters
 */
export function getAllAdapters(): BaseAdapter[] {
  return Object.values(adapters);
}

/**
 * Unregister an adapter
 */
export function unregisterAdapter(name: string): boolean {
  const adapter = adapters[name];
  if (adapter) {
    adapter.emit('adapter:disconnected', { adapter: name });
    delete adapters[name];
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
