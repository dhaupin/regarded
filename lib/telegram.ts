/**
 * Telegram - Telegram Bot Integration
 *
 * Telegram bot wrapper for sending notifications and handling commands.
 * Uses: network, event, error, utils
 */

import { createNetwork } from './network';
import { createError, ErrorCode } from './error';
import { EventEmitter, type Emitter } from './event';
import { safeJsonParse } from './utils';

// ============================================================================
// Types
// ============================================================================

export interface TelegramConfig {
  /** Bot token from @BotFather */
  botToken?: string;
  /** Default chat ID for sending messages */
  defaultChatId?: string;
}

export interface SendMessageOptions {
  /** Parse mode: 'Markdown' or 'HTML' */
  parse_mode?: 'Markdown' | 'HTML';
  /** Inline keyboard markup */
  reply_markup?: InlineKeyboardMarkup;
  /** Reply to message ID */
  reply_to?: number;
  /** Disable web page preview */
  disable_web_page_preview?: boolean;
}

export interface InlineKeyboardButton {
  text: string;
  url?: string;
  callback_data?: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

export interface ReplyKeyboardMarkup {
  keyboard: string[][];
  resize_keyboard?: boolean;
  one_time_keyboard?: boolean;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface TelegramMessage {
  message_id: number;
  chat: TelegramChat;
  from?: TelegramUser;
  text?: string;
  date: number;
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

// ============================================================================
// Event Types
// ============================================================================

export interface TelegramEvents {
  'telegram:message': { chat: number; from?: TelegramUser; text?: string; message: TelegramMessage };
  'telegram:callback': { chat: number; from: TelegramUser; data?: string; message?: TelegramMessage };
  'telegram:command': { chat: number; from?: TelegramUser; command: string; args: string[] };
  'telegram:sent': { chatId: number; messageId?: number; textLength: number; timestamp: number };
  'telegram:error': { error: string; timestamp: number };
}

// ============================================================================
// Telegram Bot
// ============================================================================

export class TelegramBot extends Emitter<TelegramEvents> {
  private botToken?: string;
  private defaultChatId?: string;
  private network = createNetwork({});
  private offset = 0;
  private polling = false;
  private commandHandlers = new Map<string, (ctx: CommandContext) => void | Promise<void>>();
  private messageHandlers: ((ctx: MessageContext) => void | Promise<void>)[] = [];

  constructor(config?: TelegramConfig) {
    super();
    this.botToken = config?.botToken;
    this.defaultChatId = config?.defaultChatId;
  }

  /**
   * Set bot token
   */
  setToken(token: string): void {
    this.botToken = token;
  }

  /**
   * Set default chat ID
   */
  setDefaultChat(chatId: string | number): void {
    this.defaultChatId = String(chatId);
  }

  /**
   * Get API base URL
   */
  private getApiBase(): string {
    if (!this.botToken) {
      throw createError({
        code: ErrorCode.CONFIGURATION_ERROR,
        message: 'Telegram bot token not set',
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
   * Send message to chat
   */
  async send(
    chatId: string | number,
    text: string,
    options?: SendMessageOptions
  ): Promise<TelegramMessage> {
    const result = await this.api<TelegramMessage>('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: options?.parse_mode || 'Markdown',
      ...(options?.reply_markup && { reply_markup: options.reply_markup }),
      ...(options?.reply_to && { reply_to_message_id: options.reply_to }),
      ...(options?.disable_web_page_preview && { disable_web_page_preview: true }),
    });

    // Emit sent event
    this.emit('telegram:sent', {
      chatId: Number(chatId),
      messageId: result.message_id,
      textLength: text.length,
      timestamp: Date.now(),
    });

    return result;
  }

  /**
   * Send HTML message
   */
  sendHTML(chatId: string | number, html: string, options?: Omit<SendMessageOptions, 'parse_mode'>): Promise<TelegramMessage> {
    return this.send(chatId, html, { ...options, parse_mode: 'HTML' });
  }

  /**
   * Send Markdown message
   */
  sendMarkdown(chatId: string | number, md: string, options?: Omit<SendMessageOptions, 'parse_mode'>): Promise<TelegramMessage> {
    return this.send(chatId, md, { ...options, parse_mode: 'Markdown' });
  }

  /**
   * Send message to default chat
   */
  async notify(text: string, options?: SendMessageOptions): Promise<TelegramMessage | undefined> {
    if (!this.defaultChatId) {
      throw createError({
        code: ErrorCode.CONFIGURATION_ERROR,
        message: 'Default chat ID not set',
      });
    }
    return this.send(this.defaultChatId, text, options);
  }

  /**
   * Send photo
   */
  async sendPhoto(chatId: string | number, photo: string, caption?: string): Promise<TelegramMessage> {
    return this.api<TelegramMessage>('sendPhoto', {
      chat_id: chatId,
      photo,
      ...(caption && { caption }),
    });
  }

  /**
   * Send location
   */
  async sendLocation(chatId: string | number, latitude: number, longitude: number): Promise<TelegramMessage> {
    return this.api<TelegramMessage>('sendLocation', {
      chat_id: chatId,
      latitude,
      longitude,
    });
  }

  /**
   * Answer callback query
   */
  async answerCallback(callbackId: string, text?: string, showAlert?: boolean): Promise<boolean> {
    await this.api<boolean>('answerCallbackQuery', {
      callback_query_id: callbackId,
      ...(text && { text }),
      ...(showAlert && { show_alert: showAlert }),
    });
    return true;
  }

  /**
   * Edit message text
   */
  async editMessageText(
    chatId: string | number,
    messageId: number,
    text: string,
    options?: { parse_mode?: 'Markdown' | 'HTML'; reply_markup?: InlineKeyboardMarkup }
  ): Promise<TelegramMessage> {
    return this.api<TelegramMessage>('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: options?.parse_mode,
      ...(options?.reply_markup && { reply_markup: options.reply_markup }),
    });
  }

  /**
   * Delete message
   */
  async deleteMessage(chatId: string | number, messageId: number): Promise<boolean> {
    return this.api<boolean>('deleteMessage', {
      chat_id: chatId,
      message_id: messageId,
    });
  }

  /**
   * Register command handler
   */
  onCommand(command: string, handler: (ctx: CommandContext) => void | Promise<void>): void {
    this.commandHandlers.set(command.toLowerCase(), handler);
  }

  /**
   * Register message handler
   */
  onMessage(handler: (ctx: MessageContext) => void | Promise<void>): void {
    this.messageHandlers.push(handler);
  }

  /**
   * Process incoming update
   */
  private processUpdate(update: TelegramUpdate): void {
    const message = update.message || update.edited_message;
    const chat = message?.chat;

    if (!chat) {
      // Handle callback query
      if (update.callback_query) {
        const cb = update.callback_query;
        this.emit('telegram:callback', {
          chat: cb.message?.chat.id || 0,
          from: cb.from,
          data: cb.data,
          message: cb.message,
        });

        // Handle as command if callback_data matches
        if (cb.data && this.commandHandlers.has(cb.data)) {
          this.commandHandlers.get(cb.data)!({
            chat: cb.message?.chat.id || 0,
            from: cb.from,
            command: cb.data,
            args: [],
          });
        }
        return;
      }
      return;
    }

    // Handle commands
    if (message?.text?.startsWith('/')) {
      const parts = message.text.slice(1).split(' ');
      const cmd = parts[0].toLowerCase();
      const args = parts.slice(1);

      // Emit command event
      this.emit('telegram:command', {
        chat: chat.id,
        from: message.from,
        command: cmd,
        args,
      });

      // Call handler if exists
      if (this.commandHandlers.has(cmd)) {
        this.commandHandlers.get(cmd)!({
          chat: chat.id,
          from: message.from,
          command: cmd,
          args,
        });
      }
      return;
    }

    // Emit message event
    this.emit('telegram:message', {
      chat: chat.id,
      from: message.from,
      text: message.text,
      message,
    });

    // Call message handlers
    for (const handler of this.messageHandlers) {
      handler({
        chat: chat.id,
        from: message.from,
        text: message.text,
        message,
      });
    }
  }

  /**
   * Start polling for updates
   */
  async startPolling(timeout: number = 60): Promise<void> {
    if (!this.botToken) {
      throw createError({
        code: ErrorCode.CONFIGURATION_ERROR,
        message: 'Telegram bot token not set',
      });
    }

    this.polling = true;

    while (this.polling) {
      try {
        const updates = await this.api<TelegramUpdate[]>('getUpdates', {
          offset: this.offset + 1,
          timeout,
          allowed_updates: ['message', 'edited_message', 'callback_query'],
        });

        for (const update of updates) {
          this.offset = update.update_id;
          this.processUpdate(update);
        }
      } catch (e: any) {
        this.emit('telegram:error', {
          error: e.message,
          timestamp: Date.now(),
        });
        // Wait before retry
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  }

  /**
   * Stop polling
   */
  stopPolling(): void {
    this.polling = false;
  }

  /**
   * Build inline keyboard
   */
  inlineKeyboard(rows: InlineKeyboardButton[][]): InlineKeyboardMarkup {
    return { inline_keyboard: rows };
  }

  /**
   * Build reply keyboard
   */
  replyKeyboard(rows: string[][], options?: { resize?: boolean; oneTime?: boolean }): ReplyKeyboardMarkup {
    return {
      keyboard: rows,
      resize_keyboard: options?.resize ?? true,
      one_time_keyboard: options?.oneTime ?? false,
    };
  }

  /**
   * Remove keyboard
   */
  removeKeyboard(chatId: string | number): Promise<boolean> {
    return this.api<boolean>('sendMessage', {
      chat_id: chatId,
      text: ' ',
      reply_markup: { remove_keyboard: true },
    });
  }
}

// ============================================================================
// Context Types
// ============================================================================

export interface CommandContext {
  chat: number;
  from?: TelegramUser;
  command: string;
  args: string[];
}

export interface MessageContext {
  chat: number;
  from?: TelegramUser;
  text?: string;
  message: TelegramMessage;
}

// ============================================================================
// Factory
// ============================================================================

let defaultBot: TelegramBot | null = null;

/**
 * Create a Telegram bot
 */
export function createTelegramBot(config?: TelegramConfig): TelegramBot {
  return new TelegramBot(config);
}

/**
 * Get default Telegram bot
 */
export function getTelegramBot(): TelegramBot {
  if (!defaultBot) {
    defaultBot = new TelegramBot();
  }
  return defaultBot;
}

// ============================================================================
// Standalone Functions (using default bot)
// ============================================================================

/**
 * Send message (uses default bot)
 */
export function send(chatId: string | number, text: string, options?: SendMessageOptions): Promise<TelegramMessage> {
  return getTelegramBot().send(chatId, text, options);
}

/**
 * Send HTML message (uses default bot)
 */
export function sendHTML(chatId: string | number, html: string): Promise<TelegramMessage> {
  return getTelegramBot().sendHTML(chatId, html);
}

/**
 * Send Markdown message (uses default bot)
 */
export function sendMarkdown(chatId: string | number, md: string): Promise<TelegramMessage> {
  return getTelegramBot().sendMarkdown(chatId, md);
}

/**
 * Send notification to default chat (uses default bot)
 */
export function notify(text: string, options?: SendMessageOptions): Promise<TelegramMessage | undefined> {
  return getTelegramBot().notify(text, options);
}

/**
 * Register command handler (uses default bot)
 */
export function onCommand(command: string, handler: (ctx: CommandContext) => void | Promise<void>): void {
  return getTelegramBot().onCommand(command, handler);
}

/**
 * Register message handler (uses default bot)
 */
export function onMessage(handler: (ctx: MessageContext) => void | Promise<void>): void {
  return getTelegramBot().onMessage(handler);
}

/**
 * Build inline keyboard
 */
export function inlineKeyboard(rows: InlineKeyboardButton[][]): InlineKeyboardMarkup {
  return { inline_keyboard: rows };
}

/**
 * Build reply keyboard
 */
export function replyKeyboard(rows: string[][], options?: { resize?: boolean; oneTime?: boolean }) {
  return getTelegramBot().replyKeyboard(rows, options);
}
