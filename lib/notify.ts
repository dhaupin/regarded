/**
 * Notify - Unified Notification System
 *
 * Multi-channel notification system (Telegram, Discord, Slack, Webhook).
 * Uses: event, error, utils
 */

import { EventEmitter } from './event';
import { createError, ErrorCode, errors } from './error';

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
  /** Extra metadata */
  metadata?: Record<string, any>;
}

export interface NotificationResult {
  success: boolean;
  channel: NotificationChannel;
  messageId?: string;
  error?: string;
}

export interface ChannelConfig {
  /** Channel type */
  type: NotificationChannel;
  /** Whether channel is enabled */
  enabled?: boolean;
  /** Channel-specific config */
  config: TelegramConfig | DiscordConfig | SlackConfig | WebhookConfig;
}

export interface TelegramConfig {
  /** Bot token */
  botToken?: string;
  /** Default chat ID */
  chatId?: string;
}

export interface DiscordConfig {
  /** Bot token */
  botToken?: string;
  /** Channel ID */
  channelId?: string;
  /** Webhook URL (simpler option) */
  webhookUrl?: string;
}

export interface SlackConfig {
  /** Bot token */
  botToken?: string;
  /** Channel ID */
  channelId?: string;
  /** Incoming webhook URL */
  webhookUrl?: string;
}

export interface WebhookConfig {
  /** Webhook URL */
  url: string;
  /** Secret for signing */
  secret?: string;
}

// ============================================================================
// Event Types
// ============================================================================

export interface NotifyEvents {
  'notify:sent': { channel: NotificationChannel; message: string; messageId?: string };
  'notify:error': { channel: NotificationChannel; message: string; error: string };
  'notify:channelregistered': { channel: NotificationChannel };
}

// ============================================================================
// Notify Manager
// ============================================================================

export class NotifyManager extends EventEmitter<NotifyEvents> {
  private channels = new Map<NotificationChannel, ChannelConfig>();
  private telegram?: TelegramConfig;
  private discord?: DiscordConfig;
  private slack?: SlackConfig;
  private webhooks: Map<string, WebhookConfig> = new Map();

  constructor(config?: {
    telegram?: TelegramConfig;
    discord?: DiscordConfig;
    slack?: SlackConfig;
  }) {
    super();
    this.telegram = config?.telegram;
    this.discord = config?.discord;
    this.slack = config?.slack;
  }

  /**
   * Register a notification channel
   */
  registerChannel(config: ChannelConfig): void {
    this.channels.set(config.type, config);
    this.emit('notify:channelregistered', { channel: config.type });
  }

  /**
   * Register Telegram config
   */
  setTelegram(config: TelegramConfig): void {
    this.telegram = config;
    this.registerChannel({ type: 'telegram', enabled: true, config });
  }

  /**
   * Register Discord config
   */
  setDiscord(config: DiscordConfig): void {
    this.discord = config;
    this.registerChannel({ type: 'discord', enabled: true, config });
  }

  /**
   * Register Slack config
   */
  setSlack(config: SlackConfig): void {
    this.slack = config;
    this.registerChannel({ type: 'slack', enabled: true, config });
  }

  /**
   * Register a webhook
   */
  registerWebhook(name: string, config: WebhookConfig): void {
    this.webhooks.set(name, config);
  }

  /**
   * Get channel config
   */
  getChannel(type: NotificationChannel): ChannelConfig | undefined {
    return this.channels.get(type);
  }

  /**
   * List registered channels
   */
  listChannels(): NotificationChannel[] {
    return Array.from(this.channels.keys());
  }

  /**
   * Send notification
   */
  async notify(payload: NotificationPayload): Promise<NotificationResult> {
    const channel = payload.channel || 'telegram';
    
    try {
      switch (channel) {
        case 'telegram':
          return await this.sendTelegram(payload);
        case 'discord':
          return await this.sendDiscord(payload);
        case 'slack':
          return await this.sendSlack(payload);
        case 'webhook':
          return await this.sendWebhook(payload);
        default:
          return { success: false, channel, error: 'Unknown channel' };
      }
    } catch (e: any) {
      return { success: false, channel, error: e.message };
    }
  }

  /**
   * Send to multiple channels
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
   * Send Telegram notification
   */
  private async sendTelegram(payload: NotificationPayload): Promise<NotificationResult> {
    if (!this.telegram?.botToken || !this.telegram?.chatId) {
      return { success: false, channel: 'telegram', error: 'Telegram not configured' };
    }

    const text = payload.title ? `*${payload.title}*\n${payload.message}` : payload.message;
    
    try {
      const response = await fetch(`https://api.telegram.org/bot${this.telegram.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.telegram.chatId,
          text,
          parse_mode: 'Markdown',
        }),
      });

      const data = await response.json();
      
      if (data.ok) {
        this.emit('notify:sent', { channel: 'telegram', message: payload.message, messageId: String(data.result.message_id) });
        return { success: true, channel: 'telegram', messageId: String(data.result.message_id) };
      } else {
        return { success: false, channel: 'telegram', error: data.description };
      }
    } catch (e: any) {
      return { success: false, channel: 'telegram', error: e.message };
    }
  }

  /**
   * Send Discord notification
   */
  private async sendDiscord(payload: NotificationPayload): Promise<NotificationResult> {
    const embed: any = {
      title: payload.title,
      description: payload.message,
      timestamp: new Date().toISOString(),
      color: 0x5865F2, // Discord blurple
    };

    // Use webhook if available, otherwise bot API
    if (this.discord?.webhookUrl) {
      try {
        const response = await fetch(this.discord.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ embeds: [embed] }),
        });

        if (response.ok) {
          this.emit('notify:sent', { channel: 'discord', message: payload.message });
          return { success: true, channel: 'discord' };
        } else {
          return { success: false, channel: 'discord', error: 'Webhook failed' };
        }
      } catch (e: any) {
        return { success: false, channel: 'discord', error: e.message };
      }
    }

    if (!this.discord?.botToken || !this.discord?.channelId) {
      return { success: false, channel: 'discord', error: 'Discord not configured' };
    }

    try {
      const response = await fetch(`https://discord.com/api/v10/channels/${this.discord.channelId}/messages`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bot ${this.discord.botToken}`,
        },
        body: JSON.stringify({ embeds: [embed] }),
      });

      const data = await response.json();
      
      if (response.ok) {
        this.emit('notify:sent', { channel: 'discord', message: payload.message, messageId: data.id });
        return { success: true, channel: 'discord', messageId: data.id };
      } else {
        return { success: false, channel: 'discord', error: data.message || 'Failed' };
      }
    } catch (e: any) {
      return { success: false, channel: 'discord', error: e.message };
    }
  }

  /**
   * Send Slack notification
   */
  private async sendSlack(payload: NotificationPayload): Promise<NotificationResult> {
    // Use webhook if available
    if (this.slack?.webhookUrl) {
      try {
        const blocks: any[] = [];
        
        if (payload.title) {
          blocks.push({
            type: 'header',
            text: { type: 'plain_text', text: payload.title },
          });
        }
        
        blocks.push({
          type: 'section',
          text: { type: 'mrkdwn', text: payload.message },
        });

        const response = await fetch(this.slack.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blocks }),
        });

        if (response.ok) {
          this.emit('notify:sent', { channel: 'slack', message: payload.message });
          return { success: true, channel: 'slack' };
        } else {
          return { success: false, channel: 'slack', error: 'Webhook failed' };
        }
      } catch (e: any) {
        return { success: false, channel: 'slack', error: e.message };
      }
    }

    if (!this.slack?.botToken || !this.slack?.channelId) {
      return { success: false, channel: 'slack', error: 'Slack not configured' };
    }

    // Bot API method (more complex, basic implementation)
    return { success: false, channel: 'slack', error: 'Bot API not implemented, use webhook' };
  }

  /**
   * Send webhook notification
   */
  private async sendWebhook(payload: NotificationPayload): Promise<NotificationResult> {
    // Find first configured webhook
    const webhook = this.webhooks.values().next().value;
    
    if (!webhook) {
      return { success: false, channel: 'webhook', error: 'No webhooks configured' };
    }

    try {
      const body: any = {
        title: payload.title,
        message: payload.message,
        timestamp: new Date().toISOString(),
        metadata: payload.metadata,
      };

      // Add signature if secret is configured
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (response.ok) {
        this.emit('notify:sent', { channel: 'webhook', message: payload.message });
        return { success: true, channel: 'webhook' };
      } else {
        return { success: false, channel: 'webhook', error: `HTTP ${response.status}` };
      }
    } catch (e: any) {
      return { success: false, channel: 'webhook', error: e.message };
    }
  }

  /**
   * Send to a named webhook
   */
  async sendToWebhook(name: string, payload: NotificationPayload): Promise<NotificationResult> {
    const webhook = this.webhooks.get(name);
    
    if (!webhook) {
      return { success: false, channel: 'webhook', error: `Webhook '${name}' not found` };
    }

    try {
      const body: any = {
        title: payload.title,
        message: payload.message,
        timestamp: new Date().toISOString(),
        metadata: payload.metadata,
      };

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        this.emit('notify:sent', { channel: 'webhook', message: payload.message });
        return { success: true, channel: 'webhook' };
      } else {
        return { success: false, channel: 'webhook', error: `HTTP ${response.status}` };
      }
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
export function createNotifyManager(config?: {
  telegram?: TelegramConfig;
  discord?: DiscordConfig;
  slack?: SlackConfig;
}): NotifyManager {
  return new NotifyManager(config);
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
