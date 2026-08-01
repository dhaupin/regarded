/**
 * Adapters Tests
 * 
 * Tests for the notification adapters system.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BaseAdapter,
  registerAdapter,
  getAdapter,
  getAllAdapters,
  unregisterAdapter,
  broadcast,
  type AdapterConfig,
  type SendOptions,
  type AdapterResult,
  type AdapterStatus,
} from '../lib/adapters/base';
import {
  createTelegramAdapter,
  type TelegramAdapterConfig,
} from '../lib/adapters/telegram';
import {
  createDiscordAdapter,
  type DiscordAdapterConfig,
} from '../lib/adapters/discord';
import {
  createSlackAdapter,
  type SlackAdapterConfig,
} from '../lib/adapters/slack';
import {
  createWebhookAdapter,
  type WebhookAdapterConfig,
} from '../lib/adapters/webhook';
import { createAdapter, createAndRegister } from '../lib/adapters';

// ============================================================================
// Mock Adapter for Testing
// ============================================================================

class MockAdapter extends BaseAdapter {
  readonly name = 'Mock';
  readonly type = 'telegram' as const;
  
  private mockResponses: Map<string, AdapterResult> = new Map();
  
  constructor(config?: AdapterConfig) {
    super(config);
  }
  
  setMockResponse(message: string, result: AdapterResult): void {
    this.mockResponses.set(message, result);
  }
  
  status(): AdapterStatus {
    return {
      connected: this.connected,
      type: this.type,
      name: this.name,
    };
  }
  
  async send(message: string, options?: SendOptions): Promise<AdapterResult> {
    const mockResult = this.mockResponses.get(message);
    if (mockResult) {
      return mockResult;
    }
    return { success: true, messageId: 'mock-id-' + Date.now() };
  }
  
  async ping(): Promise<boolean> {
    return true;
  }
}

// ============================================================================
// Base Adapter Tests
// ============================================================================

describe('BaseAdapter', () => {
  let adapter: MockAdapter;
  
  beforeEach(() => {
    adapter = new MockAdapter();
  });
  
  it('should create adapter with config', () => {
    const config: AdapterConfig = {
      enabled: true,
      defaultDestination: 'chat123',
    };
    const testAdapter = new MockAdapter(config);
    testAdapter.connected = true;
    
    expect(testAdapter.getDefaultDestination()).toBe('chat123');
    expect(testAdapter.isReady()).toBe(true);
  });
  
  it('should enable and disable adapter', () => {
    adapter.connected = true;
    adapter.disable();
    expect(adapter.isReady()).toBe(false);
    
    adapter.enable();
    expect(adapter.isReady()).toBe(true);
  });
  
  it('should set default destination', () => {
    adapter.setDefaultDestination('new-chat');
    expect(adapter.getDefaultDestination()).toBe('new-chat');
  });
  
  it('should return status', () => {
    adapter.connected = true;
    const status = adapter.status();
    
    expect(status.name).toBe('Mock');
    expect(status.type).toBe('telegram');
    expect(status.connected).toBe(true);
  });
});

// ============================================================================
// Adapter Registry Tests
// ============================================================================

describe('AdapterRegistry', () => {
  let adapter1: MockAdapter;
  let adapter2: MockAdapter;
  
  beforeEach(() => {
    // Clear registry
    const adapters = getAllAdapters();
    for (const a of adapters) {
      unregisterAdapter(a.name);
    }
    
    adapter1 = new MockAdapter();
    adapter1.name = 'TestAdapter1';
    adapter1.type = 'telegram';
    
    adapter2 = new MockAdapter();
    adapter2.name = 'TestAdapter2';
    adapter2.type = 'discord';
  });
  
  it('should register and retrieve adapter', () => {
    registerAdapter('test1', adapter1);
    
    const retrieved = getAdapter('test1');
    expect(retrieved).toBe(adapter1);
  });
  
  it('should get all registered adapters', () => {
    registerAdapter('test1', adapter1);
    registerAdapter('test2', adapter2);
    
    const all = getAllAdapters();
    expect(all).toHaveLength(2);
  });
  
  it('should unregister adapter', () => {
    registerAdapter('test1', adapter1);
    unregisterAdapter('test1');
    
    const retrieved = getAdapter('test1');
    expect(retrieved).toBeUndefined();
  });
  
  it('should return false when unregistering non-existent', () => {
    const result = unregisterAdapter('non-existent');
    expect(result).toBe(false);
  });
  
  it('should broadcast to all ready adapters', async () => {
    adapter1.connected = true;
    adapter2.connected = true;
    
    registerAdapter('test1', adapter1);
    registerAdapter('test2', adapter2);
    
    const results = await broadcast('Hello');
    
    expect(results.size).toBe(2);
    expect(results.get('TestAdapter1')?.success).toBe(true);
    expect(results.get('TestAdapter2')?.success).toBe(true);
  });
  
  it('should not broadcast to disabled adapters', async () => {
    adapter1.connected = true;
    adapter1.disable();
    adapter2.connected = true;
    
    registerAdapter('test1', adapter1);
    registerAdapter('test2', adapter2);
    
    const results = await broadcast('Hello');
    
    // Only adapter2 should be called
    expect(results.size).toBe(1);
    expect(results.has('TestAdapter2')).toBe(true);
  });
});

// ============================================================================
// Telegram Adapter Tests
// ============================================================================

describe('TelegramAdapter', () => {
  let adapter: ReturnType<typeof createTelegramAdapter>;
  
  beforeEach(() => {
    const config: TelegramAdapterConfig = {
      botToken: 'test-token',
      chatId: 'test-chat',
      enabled: true,
    };
    adapter = createTelegramAdapter(config);
  });
  
  it('should create adapter with config', () => {
    expect(adapter.name).toBe('Telegram');
    expect(adapter.type).toBe('telegram');
  });
  
  it('should set token and chat', () => {
    adapter.setToken('new-token');
    adapter.setChat('new-chat');
    
    expect(adapter.getDefaultDestination()).toBe('new-chat');
  });
  
  it('should send message without destination when default is set', async () => {
    const result = await adapter.send('Test message');
    
    // Will fail due to network but that's expected
    expect(result.success).toBe(false); // No network in test
  });
  
  it('should reject when no destination', async () => {
    const noDestAdapter = createTelegramAdapter({ botToken: 'test' });
    const result = await noDestAdapter.send('Test');
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('destination');
  });
  
  it('should send HTML', async () => {
    const result = await adapter.send('<b>Bold</b>', { parseMode: 'HTML' });
    expect(result.success).toBe(false); // Network error expected
  });
  
  it('should send Markdown', async () => {
    const result = await adapter.send('*Bold*', { parseMode: 'Markdown' });
    expect(result.success).toBe(false); // Network error expected
  });
});

// ============================================================================
// Discord Adapter Tests
// ============================================================================

describe('DiscordAdapter', () => {
  let adapter: ReturnType<typeof createDiscordAdapter>;
  
  beforeEach(() => {
    const config: DiscordAdapterConfig = {
      botToken: 'test-token',
      channelId: 'test-channel',
      enabled: true,
    };
    adapter = createDiscordAdapter(config);
  });
  
  it('should create adapter with config', () => {
    expect(adapter.name).toBe('Discord');
    expect(adapter.type).toBe('discord');
  });
  
  it('should reject when no destination', async () => {
    const noDestAdapter = createDiscordAdapter({});
    const result = await noDestAdapter.send('Test');
    
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// Slack Adapter Tests
// ============================================================================

describe('SlackAdapter', () => {
  let adapter: ReturnType<typeof createSlackAdapter>;
  
  beforeEach(() => {
    const config: SlackAdapterConfig = {
      botToken: 'test-token',
      channelId: 'test-channel',
      enabled: true,
    };
    adapter = createSlackAdapter(config);
  });
  
  it('should create adapter with config', () => {
    expect(adapter.name).toBe('Slack');
    expect(adapter.type).toBe('slack');
  });
  
  it('should reject when no destination', async () => {
    const noDestAdapter = createSlackAdapter({});
    const result = await noDestAdapter.send('Test');
    
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// Webhook Adapter Tests
// ============================================================================

describe('WebhookAdapter', () => {
  let adapter: ReturnType<typeof createWebhookAdapter>;
  
  beforeEach(() => {
    const config: WebhookAdapterConfig = {
      url: 'https://example.com/webhook',
      enabled: true,
    };
    adapter = createWebhookAdapter('test-webhook', config);
  });
  
  it('should create adapter with config', () => {
    expect(adapter.name).toBe('test-webhook');
    expect(adapter.type).toBe('webhook');
  });
  
  it('should send webhook', async () => {
    const result = await adapter.send('Test message');
    // Will fail due to network
    expect(result.success).toBe(false);
  });
  
  it('should handle custom headers', async () => {
    const config: WebhookAdapterConfig = {
      url: 'https://example.com/webhook',
      headers: {
        'X-Custom': 'value',
      },
    };
    const customAdapter = createWebhookAdapter('custom', config);
    const result = await customAdapter.send('Test');
    
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// Adapter Events Tests
// ============================================================================

describe('AdapterEvents', () => {
  it('should emit message-sent event', async () => {
    const adapter = new MockAdapter();
    adapter.name = 'EventTest';
    adapter.type = 'telegram';
    
    const callback = vi.fn();
    adapter.on('adapter:message-sent', callback);
    
    // Manually emit since we can't actually send
    adapter.emit('adapter:message-sent', {
      adapter: 'EventTest',
      destination: 'chat123',
      messageId: 'msg-123',
    });
    
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({
      adapter: 'EventTest',
      destination: 'chat123',
      messageId: 'msg-123',
    });
  });
  
  it('should emit message-failed event', async () => {
    const adapter = new MockAdapter();
    adapter.name = 'EventTest';
    adapter.type = 'telegram';
    
    const callback = vi.fn();
    adapter.on('adapter:message-failed', callback);
    
    adapter.emit('adapter:message-failed', {
      adapter: 'EventTest',
      destination: 'chat123',
      error: 'Network error',
    });
    
    expect(callback).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// Factory Functions Tests
// ============================================================================

describe('Adapter Factory', () => {
  beforeEach(() => {
    // Clear registry
    const adapters = getAllAdapters();
    for (const a of adapters) {
      unregisterAdapter(a.name);
    }
  });
  
  it('should create and register adapter', () => {
    const adapter = createAndRegister('factory-test', 'telegram', {
      botToken: 'test',
      chatId: 'test',
    });
    
    expect(adapter).toBeDefined();
    expect(getAdapter('factory-test')).toBe(adapter);
  });
  
  it('should create adapter by type', () => {
    const telegramAdapter = createAdapter('telegram', {
      botToken: 'test',
      chatId: 'test',
    });
    
    expect(telegramAdapter.name).toBe('Telegram');
  });
});
