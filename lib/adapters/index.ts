/**
 * Adapters - Notification & Messaging Adapters
 *
 * Multi-channel notification system adapters.
 * Like connectors/, but for external messaging services instead of exchanges.
 *
 * @example
 * import { createTelegramAdapter, createDiscordAdapter, registerAdapter, broadcast } from './adapters';
 *
 * // Create and register adapters
 * const telegram = createTelegramAdapter({ botToken: '...', chatId: '...' });
 * registerAdapter('main', telegram);
 *
 * // Send to specific adapter
 * const adapter = getAdapter('main');
 * await adapter?.send('Hello!');
 *
 * // Broadcast to all adapters
 * await broadcast('Hello everyone!');
 */

export {
  BaseAdapter,
  type AdapterConfig,
  type SendOptions,
  type AdapterResult,
  type AdapterStatus,
  type AdapterType,
  type AdapterEvents,
  registerAdapter,
  getAdapter,
  getAllAdapters,
  unregisterAdapter,
  broadcast,
} from './base';

export {
  TelegramAdapter,
  createTelegramAdapter,
  type TelegramAdapterConfig,
} from './telegram';

export {
  DiscordAdapter,
  createDiscordAdapter,
  type DiscordAdapterConfig,
} from './discord';

export {
  SlackAdapter,
  createSlackAdapter,
  type SlackAdapterConfig,
} from './slack';

export {
  WebhookAdapter,
  createWebhookAdapter,
  type WebhookAdapterConfig,
} from './webhook';

// ============================================================================
// Factory Functions
// ============================================================================

import { TelegramAdapter, type TelegramAdapterConfig } from './telegram';
import { DiscordAdapter, type DiscordAdapterConfig } from './discord';
import { SlackAdapter, type SlackAdapterConfig } from './slack';
import { WebhookAdapter, type WebhookAdapterConfig } from './webhook';
import { BaseAdapter, registerAdapter } from './base';

/**
 * Create adapter by type
 */
export function createAdapter(
  type: 'telegram',
  config: TelegramAdapterConfig
): TelegramAdapter;
export function createAdapter(
  type: 'discord',
  config: DiscordAdapterConfig
): DiscordAdapter;
export function createAdapter(
  type: 'slack',
  config: SlackAdapterConfig
): SlackAdapter;
export function createAdapter(
  type: 'webhook',
  name: string,
  config: WebhookAdapterConfig
): WebhookAdapter;
export function createAdapter(
  type: 'telegram' | 'discord' | 'slack' | 'webhook',
  ...args: any[]
): BaseAdapter {
  switch (type) {
    case 'telegram': {
      const config = args[0] as TelegramAdapterConfig;
      return new TelegramAdapter(config);
    }
    case 'discord': {
      const config = args[0] as DiscordAdapterConfig;
      return new DiscordAdapter(config);
    }
    case 'slack': {
      const config = args[0] as SlackAdapterConfig;
      return new SlackAdapter(config);
    }
    case 'webhook': {
      const name = args[0] as string;
      const config = args[1] as WebhookAdapterConfig;
      return new WebhookAdapter(name, config);
    }
    default:
      throw new Error(`Unknown adapter type: ${type}`);
  }
}

/**
 * Create and register adapter
 */
export function createAndRegister(
  name: string,
  type: 'telegram' | 'discord' | 'slack' | 'webhook',
  ...args: any[]
): BaseAdapter {
  const adapter = createAdapter(type, ...args);
  registerAdapter(name, adapter);
  return adapter;
}
