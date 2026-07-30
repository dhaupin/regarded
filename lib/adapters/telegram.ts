/**
 * Telegram Adapter
 * 
 * Telegram bot notification adapter.
 * Uses: base, network, error, event, utils
 */

import { BaseAdapter, type AdapterConfig, type SendOptions, type AdapterResult, type AdapterStatus, registerAdapter } from './base';
import { createNetwork } from '../network';
import { createError, ErrorCode } from '../error';
import { safeJsonParse } from '../utils';

export interface TelegramAdapterConfig extends AdapterConfig {
  /** Bot token from @BotFather */
  botToken?: string;
  /** Default chat ID */
  chatId?: string;
}

export class TelegramAdapter extends BaseAdapter {
  readonly name = 'Telegram';
  readonly type: 'telegram' = 'telegram';
  
  private botToken?: string;
  private chatId?: string;
  private network = createNetwork({});
  private offset = 0;

  constructor(config: TelegramAdapterConfig) {
    super(config);
    this.botToken = config.botToken;
    this.chatId = config.chatId || config.defaultDestination;
  }

  /**
   * Set bot token
   */
  setToken(token: string): void {
    this.botToken = token;
  }

  /**
   * Set default chat
   */
  setChat(chatId: string): void {
    this.chatId = chatId;
    this.defaultDestination = chatId;
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
   * Get API base URL
   */
  private getApiBase(): string {
    if (!this.botToken) {
      throw createError({
        code: ErrorCode.CONFIGURATION_ERROR,
        message: 'Telegram bot token not configured',
      });
    }
    return `https://api.telegram.org/bot${this.botToken}`;
  }

  /**
   * Make API request
   */
  private async api<T>(method: string, params?: Record<string, any>): Promise<T> {
    const url = `${this.getApiBase()}/${method}`;
    const result = await this.network.post(url, {
      body: params ? JSON.stringify(params) : undefined,
      headers: { 'Content-Type': 'application/json' },
    });

    if (!result.ok) {
      const error = safeJsonParse(result.data as string) as any;
      throw createError({
        code: ErrorCode.API_RESPONSE_ERROR,
        message: `Telegram API error: ${error?.description || result.statusText}`,
      });
    }

    const data = safeJsonParse(result.data as string) as any;
    return data.result;
  }

  /**
   * Send a message
   */
  async send(message: string, options?: SendOptions): Promise<AdapterResult> {
    const destination = options?.destination || this.chatId || this.defaultDestination;
    
    if (!destination) {
      return { success: false, error: 'No destination specified' };
    }

    try {
      const result = await this.api<any>('sendMessage', {
        chat_id: destination,
        text: message,
        parse_mode: options?.parseMode || 'Markdown',
        ...(options?.replyTo && { reply_to_message_id: options?.replyTo }),
      });

      this.emit('adapter:message-sent', {
        adapter: this.name,
        destination,
        messageId: String(result.message_id),
      });

      return { success: true, messageId: String(result.message_id) };
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
    try {
      await this.api<any>('getMe');
      this.connected = true;
      return true;
    } catch (e) {
      this.connected = false;
      return false;
    }
  }

  /**
   * Send HTML message
   */
  async sendHTML(html: string, options?: SendOptions): Promise<AdapterResult> {
    return this.send(html, { ...options, parseMode: 'HTML' });
  }

  /**
   * Send Markdown message
   */
  async sendMarkdown(md: string, options?: SendOptions): Promise<AdapterResult> {
    return this.send(md, { ...options, parseMode: 'Markdown' });
  }
}

/**
 * Create Telegram adapter
 */
export function createTelegramAdapter(config: TelegramAdapterConfig): TelegramAdapter {
  return new TelegramAdapter(config);
}
