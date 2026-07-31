/**
 * Slack Adapter
 * 
 * Slack webhook and bot notification adapter.
 * Uses: base, network, error, event, utils
 */

import { BaseAdapter, type AdapterConfig, type SendOptions, type AdapterResult, type AdapterStatus, registerAdapter } from './base';
import { createNetwork } from '../network';
import { createError, ErrorCode, errors } from '../error';

export interface SlackAdapterConfig extends AdapterConfig {
  /** Bot token (for bot API) */
  botToken?: string;
  /** Channel ID */
  channelId?: string;
  /** Incoming webhook URL */
  webhookUrl?: string;
}

export class SlackAdapter extends BaseAdapter {
  readonly name = 'Slack';
  readonly type: 'slack' = 'slack';
  
  private botToken?: string;
  private channelId?: string;
  private webhookUrl?: string;
  private network = createNetwork({});

  constructor(config: SlackAdapterConfig) {
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
    // Use webhook if available
    if (this.webhookUrl) {
      return this.sendViaWebhook(message, options);
    }

    // Fall back to bot API
    if (!this.botToken || !this.channelId) {
      return { success: false, error: 'Slack not configured' };
    }

    return this.sendViaBot(message, options);
  }

  /**
   * Send via incoming webhook
   */
  private async sendViaWebhook(message: string, options?: SendOptions): Promise<AdapterResult> {
    const destination = this.defaultDestination || 'webhook';
    
    try {
      const blocks: any[] = [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: message },
        },
      ];

      // Add metadata if present
      if (options?.metadata) {
        blocks.push({
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: `\`\`\`${JSON.stringify(options.metadata)}\`\`\`` },
          ],
        });
      }

      const response = await this.network.post(this.webhookUrl!, {
        body: JSON.stringify({ blocks }),
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
      const response = await this.network.post('https://slack.com/api/chat.postMessage', {
        body: JSON.stringify({
          channel: destination,
          text: message,
          mrkdwn: true,
        }),
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.botToken}`,
        },
      });

      const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
      
      if (data.ok) {
        this.emit('adapter:message-sent', {
          adapter: this.name,
          destination,
          messageId: data.ts,
        });
        return { success: true, messageId: data.ts };
      } else {
        return { success: false, error: data.error };
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
      this.connected = true;
      return true;
    }

    if (!this.botToken) {
      return false;
    }

    try {
      const response = await this.network.get('https://slack.com/api/auth.test', undefined, {
        headers: { 'Authorization': `Bearer ${this.botToken}` },
      });
      const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
      this.connected = data.ok;
      return data.ok;
    } catch (e) {
      this.connected = false;
      return false;
    }
  }

  /**
   * Build inline keyboard
   */
  inlineKeyboard(rows: { text: string; url?: string; callback?: string }[][]) {
    return {
      blocks: rows.map(row => ({
        type: 'actions',
        elements: row.map(btn => ({
          type: 'button',
          text: { type: 'plain_text', text: btn.text },
          ...(btn.url && { url: btn.url }),
          ...(btn.callback && { action_id: btn.callback }),
        })),
      })),
    };
  }
}

/**
 * Create Slack adapter
 */
export function createSlackAdapter(config: SlackAdapterConfig): SlackAdapter {
  return new SlackAdapter(config);
}
