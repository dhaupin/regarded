/**
 * Notify - Unified Notification System
 *
 * Canonical notification handler that uses adapters internally.
 * Provides a simple API while leveraging the adapters system.
 * Uses: event, adapters
 */

import { EventEmitter } from './event';
import { 
  registerAdapter, getAdapter, getAllAdapters, 
  type BaseAdapter, type SendOptions, type AdapterType 
} from './adapters';
import { 
  createTelegramAdapter, type TelegramAdapterConfig,
  createDiscordAdapter, type DiscordAdapterConfig,
  createSlackAdapter, type SlackAdapterConfig,
  createWebhookAdapter, type WebhookAdapterConfig,
} from './adapters';

// ============================================================================
// Types
// ============================================================================

export type NotificationChannel = 'telegram' | 'discord' | 'slack' | 'webhook';

export interface NotificationPayload {
  /** Message title */
  title?: string;
  /** Message body */
  message: string;
  /** Channel to send to */
  channel?: NotificationChannel;
  /** Adapter name (for named adapters) */
  adapter?: string;
  /** Extra metadata */
  metadata?: Record<string, any>;
}

export interface NotificationResult {
  success: boolean;
  channel: NotificationChannel;
  messageId?: string;
  error?: string;
}

export interface TelegramConfig extends TelegramAdapterConfig {}
export interface DiscordConfig extends DiscordAdapterConfig {}
export interface SlackConfig extends SlackAdapterConfig {}
export interface WebhookConfig extends WebhookAdapterConfig {}

// ============================================================================
// Event Types
// ============================================================================

export interface NotifyEvents {
  'notify:sent': { channel: NotificationChannel; message: string; messageId?: string; adapter?: string };
  'notify:error': { channel: NotificationChannel; message: string; error: string; adapter?: string };
  'notify:channelregistered': { channel: NotificationChannel; adapter: string };
}

// ============================================================================
// Notify Manager
// ============================================================================

export class NotifyManager extends EventEmitter<NotifyEvents> {
  private channelToAdapter = new Map<NotificationChannel, string>();

  constructor() {
    super();
  }

  /**
   * Register Telegram adapter
   */
  setTelegram(config: TelegramConfig): void {
    const adapter = createTelegramAdapter(config);
    registerAdapter('telegram', adapter);
    this.channelToAdapter.set('telegram', 'telegram');
    this.emit('notify:channelregistered', { channel: 'telegram', adapter: 'telegram' });
  }

  /**
   * Register Discord adapter
   */
  setDiscord(config: DiscordConfig): void {
    const adapter = createDiscordAdapter(config);
    registerAdapter('discord', adapter);
    this.channelToAdapter.set('discord', 'discord');
    this.emit('notify:channelregistered', { channel: 'discord', adapter: 'discord' });
  }

  /**
   * Register Slack adapter
   */
  setSlack(config: SlackConfig): void {
    const adapter = createSlackAdapter(config);
    registerAdapter('slack', adapter);
    this.channelToAdapter.set('slack', 'slack');
    this.emit('notify:channelregistered', { channel: 'slack', adapter: 'slack' });
  }

  /**
   * Register webhook adapter
   */
  registerWebhook(name: string, config: WebhookConfig): void {
    const adapter = createWebhookAdapter(name, config);
    registerAdapter(name, adapter);
    this.channelToAdapter.set('webhook', name);
    this.emit('notify:channelregistered', { channel: 'webhook', adapter: name });
  }

  /**
   * Get registered adapter name for a channel
   */
  getAdapterName(channel: NotificationChannel): string | undefined {
    return this.channelToAdapter.get(channel);
  }

  /**
   * List registered channels
   */
  listChannels(): NotificationChannel[] {
    return Array.from(this.channelToAdapter.keys());
  }

  /**
   * Send notification using adapters
   */
  async notify(payload: NotificationPayload): Promise<NotificationResult> {
    const channel = payload.channel || 'telegram';
    const adapterName = payload.adapter || this.channelToAdapter.get(channel);
    
    if (!adapterName) {
      return { success: false, channel, error: `No adapter registered for channel: ${channel}` };
    }

    const adapter = getAdapter(adapterName);
    if (!adapter) {
      return { success: false, channel, error: `Adapter '${adapterName}' not found` };
    }

    // Format message with title if present
    const message = payload.title ? `*${payload.title}*\n${payload.message}` : payload.message;

    try {
      const result = await adapter.send(message, {
        destination: payload.adapter ? undefined : undefined,
        metadata: payload.metadata,
      });

      if (result.success) {
        this.emit('notify:sent', { 
          channel, 
          message: payload.message, 
          messageId: result.messageId,
          adapter: adapterName,
        });
      } else {
        this.emit('notify:error', { 
          channel, 
          message: payload.message, 
          error: result.error || 'Unknown error',
          adapter: adapterName,
        });
      }

      return { 
        success: result.success, 
        channel, 
        messageId: result.messageId, 
        error: result.error 
      };
    } catch (e: any) {
      return { success: false, channel, error: e.message };
    }
  }

  /**
   * Send to all registered channels
   */
  async notifyAll(payload: NotificationPayload): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];
    
    for (const channel of this.listChannels()) {
      const result = await this.notify({ ...payload, channel });
      results.push(result);
    }
    
    return results;
  }

  /**
   * Send to named adapter
   */
  async sendToAdapter(adapterName: string, message: string): Promise<NotificationResult> {
    const adapter = getAdapter(adapterName);
    
    if (!adapter) {
      return { success: false, channel: 'telegram', error: `Adapter '${adapterName}' not found` };
    }

    try {
      const result = await adapter.send(message);
      return { 
        success: result.success, 
        channel: adapter.type,
        messageId: result.messageId, 
        error: result.error 
      };
    } catch (e: any) {
      return { success: false, channel: adapter.type, error: e.message };
    }
  }

  /**
   * Send to named webhook (legacy function, use sendToAdapter instead)
   */
  async sendToWebhook(name: string, payload: NotificationPayload): Promise<NotificationResult> {
    const adapter = getAdapter(name);
    
    if (!adapter) {
      return { success: false, channel: 'webhook', error: `Webhook adapter '${name}' not found` };
    }

    const message = payload.title ? `*${payload.title}*\n${payload.message}` : payload.message;
    
    try {
      const result = await adapter.send(message, { metadata: payload.metadata });
      return { 
        success: result.success, 
        channel: 'webhook',
        messageId: result.messageId, 
        error: result.error 
      };
    } catch (e: any) {
      return { success: false, channel: 'webhook', error: e.message };
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

let defaultManager: NotifyManager | null = null;

/**
 * Create a notify manager
 */
export function createNotifyManager(): NotifyManager {
  return new NotifyManager();
}

/**
 * Get default notify manager
 */
export function getNotifyManager(): NotifyManager {
  if (!defaultManager) {
    defaultManager = new NotifyManager();
  }
  return defaultManager;
}

// ============================================================================
// Standalone Functions
// ============================================================================

/**
 * Send notification (uses default manager)
 */
export async function notify(payload: NotificationPayload): Promise<NotificationResult> {
  return getNotifyManager().notify(payload);
}

/**
 * Send to multiple channels (uses default manager)
 */
export async function notifyAll(payload: NotificationPayload): Promise<NotificationResult[]> {
  return getNotifyManager().notifyAll(payload);
}

/**
 * Set Telegram config (uses default manager)
 */
export function setTelegram(config: TelegramConfig): void {
  return getNotifyManager().setTelegram(config);
}

/**
 * Set Discord config (uses default manager)
 */
export function setDiscord(config: DiscordConfig): void {
  return getNotifyManager().setDiscord(config);
}

/**
 * Set Slack config (uses default manager)
 */
export function setSlack(config: SlackConfig): void {
  return getNotifyManager().setSlack(config);
}

/**
 * Register webhook (uses default manager)
 */
export function registerWebhook(name: string, config: WebhookConfig): void {
  return getNotifyManager().registerWebhook(name, config);
}

/**
 * Send to named webhook (uses default manager)
 */
export async function sendToWebhook(name: string, payload: NotificationPayload): Promise<NotificationResult> {
  return getNotifyManager().sendToWebhook(name, payload);
}
