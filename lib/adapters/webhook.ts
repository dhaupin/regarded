/**
 * Webhook Adapter
 * 
 * Generic webhook notification adapter.
 * Uses: base, network, error, event, utils
 */

import { BaseAdapter, type AdapterConfig, type SendOptions, type AdapterResult, type AdapterStatus } from './base';
import { createNetwork } from '../network';
import { createError, ErrorCode } from '../error';

export interface WebhookAdapterConfig extends AdapterConfig {
  /** Webhook URL */
  url: string;
  /** Secret for HMAC signing */
  secret?: string;
  /** Custom headers */
  headers?: Record<string, string>;
}

export class WebhookAdapter extends BaseAdapter {
  readonly name: string;
  readonly type: 'webhook' = 'webhook';
  
  private url: string;
  private secret?: string;
  private customHeaders?: Record<string, string>;
  private network = createNetwork({});

  constructor(name: string, config: WebhookAdapterConfig) {
    super(config);
    this.name = name;
    this.url = config.url;
    this.secret = config.secret;
    this.customHeaders = config.headers;
    this.connected = true; // Webhooks don't need connection test
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
    const payload: any = {
      text: message,
      timestamp: new Date().toISOString(),
      adapter: this.name,
    };

    // Add metadata
    if (options?.metadata) {
      payload.metadata = options.metadata;
    }

    try {
      // Build headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...this.customHeaders,
      };

      // Add HMAC signature if secret is configured
      if (this.secret) {
        const signature = await this.generateSignature(JSON.stringify(payload));
        headers['X-Signature-256'] = signature;
      }

      const response = await this.network.post(this.url, {
        body: JSON.stringify(payload),
        headers,
      });

      if (response.ok) {
        this.emit('adapter:message-sent', {
          adapter: this.name,
          destination: this.url,
        });
        return { success: true };
      } else {
        return { success: false, error: `HTTP ${response.status}` };
      }
    } catch (e: any) {
      this.emit('adapter:message-failed', {
        adapter: this.name,
        destination: this.url,
        error: e.message,
      });
      return { success: false, error: e.message };
    }
  }

  /**
   * Generate HMAC-SHA256 signature
   */
  private async generateSignature(payload: string): Promise<string> {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(this.secret);
    const msgData = encoder.encode(payload);
    
    const signature = await crypto.subtle.sign(
      'HMAC',
      await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
      msgData
    );
    
    return btoa(String.fromCharCode(...new Uint8Array(signature)));
  }

  /**
   * Test connection (probe webhook)
   */
  async ping(): Promise<boolean> {
    try {
      // Send a test ping
      const response = await this.network.post(this.url, {
        body: JSON.stringify({ type: 'ping', timestamp: Date.now() }),
        headers: { 'Content-Type': 'application/json' },
      });
      
      // Webhooks typically return 200 OK, but some might return 405 Method Not Allowed
      // Consider it connected if we get any response
      this.connected = response.status < 500;
      return this.connected;
    } catch (e) {
      this.connected = false;
      return false;
    }
  }

  /**
   * Send raw JSON payload
   */
  async sendJson(payload: Record<string, any>): Promise<AdapterResult> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...this.customHeaders,
      };

      if (this.secret) {
        const signature = await this.generateSignature(JSON.stringify(payload));
        headers['X-Signature-256'] = signature;
      }

      const response = await this.network.post(this.url, {
        body: JSON.stringify(payload),
        headers,
      });

      return { 
        success: response.ok, 
        error: response.ok ? undefined : `HTTP ${response.status}` 
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Update webhook URL
   */
  setUrl(url: string): void {
    this.url = url;
  }

  /**
   * Update secret
   */
  setSecret(secret: string): void {
    this.secret = secret;
  }
}

/**
 * Create webhook adapter
 */
export function createWebhookAdapter(name: string, config: WebhookAdapterConfig): WebhookAdapter {
  return new WebhookAdapter(name, config);
}
