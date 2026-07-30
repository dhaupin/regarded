/**
 * Discord Adapter
 * 
 * Discord bot and webhook notification adapter.
 * Uses: base, network, error, event, utils
 */

import { BaseAdapter, type AdapterConfig, type SendOptions, type AdapterResult, type AdapterStatus, registerAdapter } from './base';
import { createNetwork } from '../network';
import { createError, ErrorCode, errors } from '../error';

export interface DiscordAdapterConfig extends AdapterConfig {
  /** Bot token */
  botToken?: string;
  /** Channel ID */
  channelId?: string;
  /** Webhook URL (simpler, no bot needed) */
  webhookUrl?: string;
}

export class DiscordAdapter extends BaseAdapter {
  readonly name = 'Discord';
  readonly type: 'discord' = 'discord';
  
  private botToken?: string;
  private channelId?: string;
  private webhookUrl?: string;
  private network = createNetwork({});

  constructor(config: DiscordAdapterConfig) {
    super(config);
    this.botToken = config.botToken;
    this.channelId = config.channelId;
    this.webhookUrl = config.webhookUrl;
  }

  /**
   * Get adapter status
   */
  status(): AdapterStatus {
    return {
      connected: this.connected,
      type: this.type,
      name: this.name,
    };
  }

  /**
   * Send a message
   */
  async send(message: string, options?: SendOptions): Promise<AdapterResult> {
    // Try webhook first (simpler)
    if (this.webhookUrl) {
      return this.sendViaWebhook(message);
    }

    // Fall back to bot API
    if (!this.botToken || !this.channelId) {
      return { success: false, error: 'Discord not configured' };
    }

    return this.sendViaBot(message, options);
  }

  /**
   * Send via webhook
   */
  private async sendViaWebhook(message: string): Promise<AdapterResult> {
    const destination = this.defaultDestination || 'webhook';
    
    try {
      const embed: any = {
        description: message,
        timestamp: new Date().toISOString(),
        color: 0x5865F2, // Discord blurple
      };

      const response = await this.network.post(this.webhookUrl!, {
        body: JSON.stringify({ embeds: [embed] }),
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        this.emit('adapter:message-sent', {
          adapter: this.name,
          destination,
        });
        return { success: true };
      } else {
        return { success: false, error: `HTTP ${response.status}` };
      }
    } catch (e: any) {
      this.emit('adapter:message-failed', {
        adapter: this.name,
        destination,
        error: e.message,
      });
      return { success: false, error: e.message };
    }
  }

  /**
   * Send via bot API
   */
  private async sendViaBot(message: string, options?: SendOptions): Promise<AdapterResult> {
    const destination = options?.destination || this.channelId || this.defaultDestination;
    
    if (!destination) {
      return { success: false, error: 'No destination specified' };
    }

    try {
      const embed: any = {
        description: message,
        timestamp: new Date().toISOString(),
        color: 0x5865F2,
      };

      const response = await this.network.post(
        `https://discord.com/api/v10/channels/${destination}/messages`,
        {
          body: JSON.stringify({ embeds: [embed] }),
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bot ${this.botToken}`,
          },
        }
      );

      if (response.ok) {
        const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
        this.emit('adapter:message-sent', {
          adapter: this.name,
          destination,
          messageId: data.id,
        });
        return { success: true, messageId: data.id };
      } else {
        const errData = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
        return { success: false, error: errData.message || 'Failed' };
      }
    } catch (e: any) {
      this.emit('adapter:message-failed', {
        adapter: this.name,
        destination,
        error: e.message,
      });
      return { success: false, error: e.message };
    }
  }

  /**
   * Test connection
   */
  async ping(): Promise<boolean> {
    if (this.webhookUrl) {
      // Test webhook with a probe request
      this.connected = true;
      return true;
    }

    if (!this.botToken) {
      return false;
    }

    try {
      const response = await this.network.get('https://discord.com/api/v10/users/@me', undefined, {
        headers: { 'Authorization': `Bot ${this.botToken}` },
      });
      this.connected = response.ok;
      return response.ok;
    } catch (e) {
      this.connected = false;
      return false;
    }
  }

  /**
   * Send embed with custom title
   */
  async sendEmbed(title: string, message: string, options?: SendOptions): Promise<AdapterResult> {
    const embed = {
      title,
      description: message,
      timestamp: new Date().toISOString(),
      color: 0x5865F2,
    };

    if (this.webhookUrl) {
      try {
        const response = await this.network.post(this.webhookUrl, {
          body: JSON.stringify({ embeds: [embed] }),
          headers: { 'Content-Type': 'application/json' },
        });
        return { success: response.ok };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    }

    return this.send(`**${title}**\n${message}`, options);
  }
}

/**
 * Create Discord adapter
 */
export function createDiscordAdapter(config: DiscordAdapterConfig): DiscordAdapter {
  return new DiscordAdapter(config);
}
