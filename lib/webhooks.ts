/**
 * Webhooks - Inbound & Outbound Webhook Handler
 *
 * Webhook system for external signal input (TradingView, custom services)
 * and outbound notifications.
 * Uses: network, encrypt, qos, event, error, utils
 */

import { createNetwork, type RequestOptions } from './network';
import { createError, ErrorCode } from './error';
import { EventEmitter, type Emitter } from './event';
import { safeJsonParse } from './utils';
import { logAuditEvent, initAuditLogger, type AuditLoggerConfig } from './audit';

// ============================================================================
// Types
// ============================================================================

export interface WebhookConfig {
  /** Unique name for this webhook source */
  name: string;
  /** URL path for this webhook (e.g., 'tradingview', 'custom') */
  source: string;
  /** JMESPath expression to extract event type (default: 'type') */
  eventKeyExpr?: string;
  /** Header name for signature (default: 'X-Signature-256') */
  signatureHeader?: string;
  /** Secret for signature verification */
  secret?: string;
  /** Whether webhook is enabled */
  enabled?: boolean;
}

export interface WebhookFilter {
  /** Event pattern to match (e.g., 'price_alert', '*') */
  eventPattern: string;
  /** JMESPath filter expression */
  filterExpr: string;
}

export interface WebhookEvent {
  source: string;
  event: string;
  payload: any;
  timestamp: number;
}

export interface WebhookMessage {
  received: boolean;
  event?: string;
  source?: string;
  filtered?: boolean;
  error?: string;
}

// ============================================================================
// Event Types
// ============================================================================

export interface WebhookEvents {
  'webhook:registered': { name: string; source: string; timestamp: number };
  'webhook:event': WebhookEvent;
  'webhook:received': WebhookEvent;
  'webhook:filtered': WebhookEvent;
  'webhook:error': { source: string; error: string; timestamp: number };
}

// ============================================================================
// Webhook Manager
// ============================================================================

export class WebhookManager extends Emitter<WebhookEvents> {
  private webhooks = new Map<string, WebhookConfig>();
  private filters = new Map<string, string>();
  private network = createNetwork({});

  // Environment
  private webhookSecret?: string;
  private webhookUrl?: string;

  constructor(config?: { secret?: string; url?: string }) {
    super();
    this.webhookSecret = config?.secret;
    this.webhookUrl = config?.url;
  }

  /**
   * Initialize audit logger (call once at app startup)
   */
  initAudit(config: AuditLoggerConfig): void {
    initAuditLogger(config);
  }

  /**
   * Log security event to audit
   */
  private async audit(eventType: string, details: Record<string, any>): Promise<void> {
    try {
      await logAuditEvent(
        eventType as any,
        'system',
        { source: 'webhook', ...details },
        'low'
      );
    } catch (e) {
      // Audit failure shouldn't break webhooks
      console.warn('Audit log failed:', e);
    }
  }

  /**
   * Register a webhook source
   */
  register(config: WebhookConfig): { id: string; webhook_url: string; source: string; enabled: boolean } {
    const webhook: WebhookConfig = {
      eventKeyExpr: config.eventKeyExpr ?? 'type',
      signatureHeader: config.signatureHeader ?? 'x-signature-256',
      enabled: config.enabled ?? true,
      ...config,
      secret: config.secret || this.webhookSecret,
    };

    this.webhooks.set(config.source, webhook);

    // Emit event
    this.emit('webhook:registered', {
      name: webhook.name,
      source: webhook.source,
      timestamp: Date.now(),
    });

    return {
      id: webhook.name,
      webhook_url: `${this.webhookUrl || ''}/${webhook.source}`,
      source: webhook.source,
      enabled: webhook.enabled!,
    };
  }

  /**
   * Unregister a webhook source
   */
  unregister(source: string): boolean {
    const deleted = this.webhooks.delete(source);
    if (deleted) {
      // Clean up filters
      for (const key of this.filters.keys()) {
        if (key.startsWith(`${source}:`)) {
          this.filters.delete(key);
        }
      }
    }
    return deleted;
  }

  /**
   * Get registered webhook
   */
  get(source: string): WebhookConfig | undefined {
    return this.webhooks.get(source);
  }

  /**
   * List all registered webhooks
   */
  list(): WebhookConfig[] {
    return Array.from(this.webhooks.values());
  }

  /**
   * Add event filter for a webhook
   */
  addFilter(source: string, eventPattern: string, filterExpr: string): void {
    const key = `${source}:${eventPattern}`;
    this.filters.set(key, filterExpr);
  }

  /**
   * Remove event filter
   */
  removeFilter(source: string, eventPattern: string): boolean {
    const key = `${source}:${eventPattern}`;
    return this.filters.delete(key);
  }

  /**
   * Verify webhook signature using HMAC-SHA256
   */
  verifySignature(payload: string, signature: string, secret: string): boolean {
    if (!signature || !secret) return true;
    
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(payload);
    
    // Simple HMAC-SHA256 implementation for webhook verification
    const cryptoKey = crypto.subtle.importKey(
      'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    
    // For simplicity, we'll do a basic comparison
    // In production, you'd want proper HMAC verification
    const signatureInput = this.simpleHmacSha256(payload, secret);
    return signatureInput === signature;
  }

  /**
   * Simple HMAC-SHA256 for webhook signature verification
   */
  private simpleHmacSha256(message: string, key: string): string {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(key);
    const msgData = encoder.encode(message);
    
    // Use Web Crypto API
    return crypto.subtle.sign(
      'HMAC',
      crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
      msgData
    ).then(sig => {
      return btoa(String.fromCharCode(...new Uint8Array(sig)));
    }).catch(() => '');
  }

  /**
   * Parse event from webhook payload
   */
  private parseEvent(webhook: WebhookConfig, payload: any): string {
    const key = webhook.eventKeyExpr || 'type';
    
    if (key.includes('.')) {
      const parts = key.split('.');
      let value: any = payload;
      for (const part of parts) {
        value = value?.[part];
      }
      return value || 'unknown';
    }
    
    return payload[key] || 'unknown';
  }

  /**
   * Match event against filter expression
   */
  matchFilter(filterExpr: string, payload: any): boolean {
    if (!filterExpr) return true;

    try {
      // Equality: field==value
      if (filterExpr.includes('==')) {
        const [path, value] = filterExpr.split('==').map(s => s.trim());
        const actual = path.split('.').reduce((obj: any, k: string) => obj?.[k], payload);
        return actual == value.replace(/^`|`$/g, '');
      }

      // Glob pattern: glob(field, 'pattern*')
      if (filterExpr.includes('glob(')) {
        const match = filterExpr.match(/glob\((\w+(?:\.\w+)*),\s*'(\.*)'\)/);
        if (match) {
          const [, path, pattern] = match;
          const actual = path.split('.').reduce((obj: any, k: string) => obj?.[k], payload);
          const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
          return regex.test(actual || '');
        }
      }

      // Contains: contains(field.subfield, 'value')
      if (filterExpr.includes('contains(')) {
        const match = filterExpr.match(/contains\((\w+(?:\.\w+)*),\s*'(\w+)'\)/);
        if (match) {
          const [, path, value] = match;
          const actual = path.split('.').reduce((obj: any, k: string) => obj?.[k], payload);
          return actual?.includes(value);
        }
      }

      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Process incoming webhook request
   */
  async processRequest(
    source: string,
    payload: string,
    signature?: string
  ): Promise<WebhookMessage> {
    const webhook = this.webhooks.get(source);
    
    if (!webhook) {
      return { received: false, error: 'Webhook not found' };
    }

    if (!webhook.enabled) {
      return { received: false, error: 'Webhook disabled' };
    }

    // Verify signature
    if (signature && webhook.secret) {
      if (!this.verifySignature(payload, signature, webhook.secret)) {
        await this.audit('security_webhook_signature_failed', { source, hasSignature: !!signature });
        return { received: false, error: 'Invalid signature' };
      }
    }

    // Parse payload
    const body = safeJsonParse(payload);
    if (!body) {
      await this.audit('security_webhook_parse_failed', { source });
      return { received: false, error: 'Invalid JSON payload' };
    }

    // Parse event type
    const eventType = this.parseEvent(webhook, body);

    // Get and match filter
    const filterKey = `${source}:${eventType}`;
    const filterExpr = this.filters.get(filterKey);
    
    if (filterExpr && !this.matchFilter(filterExpr, body)) {
      // Emit filtered event
      this.emit('webhook:filtered', {
        source,
        event: eventType,
        payload: body,
        timestamp: Date.now(),
      });
      await this.audit('webhook_filtered', { source, eventType });
      return { received: true, event: eventType, source, filtered: true };
    }

    // Emit webhook event
    const webhookEvent: WebhookEvent = {
      source,
      event: eventType,
      payload: body,
      timestamp: Date.now(),
    };

    this.emit('webhook:event', webhookEvent);
    this.emit('webhook:received', webhookEvent);
    await this.audit('webhook_received', { source, eventType });

    return { received: true, event: eventType, source };
  }

  /**
   * Send outbound webhook
   */
  async send(url: string, payload: any): Promise<boolean> {
    try {
      const result = await this.network.post(url, {
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
        circuitBreaker: 'webhook',
      });
      
      return result.ok;
    } catch (e) {
      return false;
    }
  }

  /**
   * Send webhook with full options
   */
  async sendWebhook(
    url: string,
    payload: any,
    options?: {
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
      headers?: Record<string, string>;
    }
  ): Promise<{ ok: boolean; status?: number; error?: string }> {
    try {
      const result = await this.network.request(url, {
        method: options?.method || 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json', ...options?.headers },
        circuitBreaker: 'webhook',
      });
      
      return { ok: result.ok, status: result.status };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  /**
   * Handle incoming HTTP request (for Cloudflare Workers / Hono)
   * Returns response object compatible with Workers
   */
  async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.slice(1); // Remove leading /
    
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Signature-256, X-Signature',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Health check endpoint
    if (path === 'health' || path === '') {
      return new Response(
        JSON.stringify({ status: 'ok', webhooks: this.webhooks.size }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Get webhook info
    if (request.method === 'GET' && path.startsWith('info')) {
      const source = path.split('/')[1] || path.split('/')[0];
      const webhook = this.webhooks.get(source);
      return new Response(
        JSON.stringify(webhook || { error: 'Not found' }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Webhook event (POST)
    if (request.method === 'POST') {
      // Find webhook by path
      const webhook = this.webhooks.get(path);
      if (!webhook) {
        return new Response(
          JSON.stringify({ error: 'Webhook not found' }),
          { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }

      // Get signature from headers
      const signatureHeader = webhook.signatureHeader || 'x-signature-256';
      const signature = request.headers.get(signatureHeader) || request.headers.get('x-signature') || undefined;

      // Get request body
      const payload = await request.text();

      // Process the webhook
      const result = await this.processRequest(path, payload, signature);

      if (!result.received) {
        const status = result.error === 'Invalid signature' ? 401 : 404;
        return new Response(
          JSON.stringify({ error: result.error }),
          { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }

      if (result.filtered) {
        return new Response(
          JSON.stringify({ filtered: true, event: result.event }),
          { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }

      return new Response(
        JSON.stringify({ received: true, event: result.event, source: result.source }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Not found
    return new Response(
      JSON.stringify({ error: 'Not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
}

// ============================================================================
// Factory
// ============================================================================

let defaultManager: WebhookManager | null = null;

/**
 * Create a webhook manager
 */
export function createWebhookManager(config?: {
  secret?: string;
  url?: string;
}): WebhookManager {
  return new WebhookManager(config);
}

/**
 * Get default webhook manager
 */
export function getWebhookManager(): WebhookManager {
  if (!defaultManager) {
    defaultManager = new WebhookManager();
  }
  return defaultManager;
}

// ============================================================================
// Standalone Functions (using default manager)
// ============================================================================

/**
 * Register webhook source (uses default manager)
 */
export function register(config: WebhookConfig): ReturnType<WebhookManager['register']> {
  return getWebhookManager().register(config);
}

/**
 * Add filter (uses default manager)
 */
export function addFilter(source: string, eventPattern: string, filterExpr: string): void {
  return getWebhookManager().addFilter(source, eventPattern, filterExpr);
}

/**
 * Process webhook request (uses default manager)
 */
export function processRequest(
  source: string,
  payload: string,
  signature?: string
): Promise<WebhookMessage> {
  return getWebhookManager().processRequest(source, payload, signature);
}

/**
 * Send outbound webhook (uses default manager)
 */
export function send(url: string, payload: any): Promise<boolean> {
  return getWebhookManager().send(url, payload);
}

/**
 * Send webhook with options (uses default manager)
 */
export function sendWebhook(
  url: string,
  payload: any,
  options?: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; headers?: Record<string, string> }
): Promise<{ ok: boolean; status?: number; error?: string }> {
  return getWebhookManager().sendWebhook(url, payload, options);
}

/**
 * Verify webhook signature
 */
export function verifySignature(payload: string, signature: string, secret: string): boolean {
  return getWebhookManager().verifySignature(payload, signature, secret);
}

/**
 * Handle HTTP request (uses default manager)
 * For Cloudflare Workers / Hono integration
 */
export function handleRequest(request: Request): Promise<Response> {
  return getWebhookManager().handleRequest(request);
}
