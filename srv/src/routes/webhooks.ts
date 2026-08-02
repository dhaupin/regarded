/**
 * Webhook Routes
 * 
 * Inbound webhook handlers for external signals (TradingView, custom).
 * Outbound webhook configuration for notifications.
 */

import { Hono } from 'hono';
import type { Context } from 'hono';

// Helper to get user ID from request
async function getUserId(c: Context): Promise<string | null> {
  const auth = c.req.header('Authorization');
  const token = auth?.substring(7);
  if (!token) return null;
  
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return payload.userId || null;
  } catch {
    return null;
  }
}

// Helper to list KV items
async function listKVItems(c: Context, prefix: string): Promise<any[]> {
  const list = await c.env.KV.list({ prefix });
  const items: any[] = [];
  
  for (const key of list.keys) {
    const value = await c.env.KV.get(key.name);
    if (value) {
      items.push(JSON.parse(value));
    }
  }
  
  return items;
}

// Helper to get KV item
async function getKVItem(c: Context, key: string): Promise<any | null> {
  const value = await c.env.KV.get(key);
  return value ? JSON.parse(value) : null;
}

// Helper to save KV item
async function saveKVItem(c: Context, key: string, data: any): Promise<void> {
  await c.env.KV.put(key, JSON.stringify(data));
}

// Helper to delete KV item
async function deleteKVItem(c: Context, key: string): Promise<void> {
  await c.env.KV.delete(key);
}

export const webhookRoutes = new Hono<{ Bindings: Env }>();

// ============================================================================
// Inbound Webhooks (TradingView, custom signals)
// ============================================================================

// TradingView webhook
webhookRoutes.post('/tradingview', async (c: Context) => {
  const body = await c.req.json();
  
  // Validate TradingView webhook format
  const { ticker, action, price } = body;
  
  if (!ticker || !action) {
    return c.json({
      success: false,
      error: { code: 'INVALID_WEBHOOK', message: 'Missing required fields: ticker, action' },
    }, 400);
  }
  
  // Validate action
  const validActions = ['buy', 'sell', 'close', 'close_all'];
  const normalizedAction = action.toLowerCase();
  if (!validActions.includes(normalizedAction)) {
    return c.json({
      success: false,
      error: { code: 'INVALID_ACTION', message: `Invalid action. Must be one of: ${validActions.join(', ')}` },
    }, 400);
  }
  
  // Normalize ticker format (e.g., "BTCUSD" -> "BTC/USD")
  const normalizedTicker = ticker.replace(/USD$/, '/USD').replace(/USDT$/, '/USDT');
  
  // Create signal object for rules engine
  const signal = {
    source: 'tradingview',
    ticker: normalizedTicker,
    action: normalizedAction,
    price: price || null,
    timestamp: Date.now(),
    raw: body,
  };
  
  // Process signal through rules engine (future: integrate with lib/rules)
  // For now, store signal for agent to pick up
  const signalKey = `signal:tradingview:${Date.now()}`;
  await saveKVItem(c, signalKey, signal);
  
  return c.json({
    success: true,
    data: { 
      received: true, 
      ticker: normalizedTicker, 
      action: normalizedAction, 
      price,
      signal_id: signalKey,
    },
  });
});

// Generic signal webhook
webhookRoutes.post('/signal', async (c: Context) => {
  const body = await c.req.json();
  
  // Validate generic signal format
  const { symbol, side, strength, source } = body;
  
  if (!symbol || !side) {
    return c.json({
      success: false,
      error: { code: 'INVALID_SIGNAL', message: 'Missing required fields: symbol, side' },
    }, 400);
  }
  
  // Validate side
  const validSides = ['buy', 'sell', 'long', 'short', 'close'];
  const normalizedSide = side.toLowerCase();
  if (!validSides.includes(normalizedSide)) {
    return c.json({
      success: false,
      error: { code: 'INVALID_SIDE', message: `Invalid side. Must be one of: ${validSides.join(', ')}` },
    }, 400);
  }
  
  // Normalize side
  const action = normalizedSide === 'long' ? 'buy' : normalizedSide === 'short' ? 'sell' : normalizedSide;
  
  // Validate strength (optional)
  let normalizedStrength = 1.0;
  if (strength !== undefined) {
    normalizedStrength = parseFloat(strength);
    if (isNaN(normalizedStrength) || normalizedStrength < 0 || normalizedStrength > 1) {
      return c.json({
        success: false,
        error: { code: 'INVALID_STRENGTH', message: 'Strength must be between 0 and 1' },
      }, 400);
    }
  }
  
  // Create signal object
  const signal = {
    source: source || 'generic',
    symbol,
    action,
    strength: normalizedStrength,
    price: body.price || null,
    timestamp: Date.now(),
    raw: body,
  };
  
  // Store signal for agent
  const signalKey = `signal:generic:${Date.now()}`;
  await saveKVItem(c, signalKey, signal);
  
  return c.json({
    success: true,
    data: { 
      received: true, 
      signal_id: signalKey,
      symbol,
      action,
      strength: normalizedStrength,
    },
  });
});

// ============================================================================
// Outbound Webhook Configuration
// ============================================================================

// List registered webhooks
webhookRoutes.get('/', async (c: Context) => {
  const userId = await getUserId(c);
  if (!userId) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401);
  }
  
  const items = await listKVItems(c, `webhook:${userId}:`);
  
  return c.json({
    success: true,
    data: {
      items: items.map(item => ({
        id: item.id,
        name: item.name,
        url: item.url,
        events: item.events,
        enabled: item.enabled,
        created_at: item.created_at,
      })),
      total: items.length,
    },
  });
});

// Register new webhook
webhookRoutes.post('/', async (c: Context) => {
  const userId = await getUserId(c);
  if (!userId) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401);
  }
  
  const body = await c.req.json();
  const { name, url, events, enabled } = body;
  
  // Validate required fields
  if (!name || !url) {
    return c.json({
      success: false,
      error: { code: 'INVALID_CONFIG', message: 'Missing required fields: name, url' },
    }, 400);
  }
  
  // Validate URL format
  try {
    new URL(url);
  } catch {
    return c.json({
      success: false,
      error: { code: 'INVALID_URL', message: 'Invalid URL format' },
    }, 400);
  }
  
  // Validate events
  const validEvents = ['trade_executed', 'rule_triggered', 'position_opened', 'position_closed', 'error'];
  const webhookEvents = Array.isArray(events) ? events : validEvents;
  const invalidEvents = webhookEvents.filter(e => !validEvents.includes(e));
  if (invalidEvents.length > 0) {
    return c.json({
      success: false,
      error: { code: 'INVALID_EVENTS', message: `Invalid events: ${invalidEvents.join(', ')}. Valid: ${validEvents.join(', ')}` },
    }, 400);
  }
  
  const id = crypto.randomUUID();
  const webhook = {
    id,
    userId,
    name,
    url,
    events: webhookEvents,
    enabled: enabled ?? true,
    created_at: Date.now(),
    updated_at: Date.now(),
  };
  
  // Store in KV
  await saveKVItem(c, `webhook:${userId}:${id}`, webhook);
  
  return c.json({
    success: true,
    data: {
      id: webhook.id,
      name: webhook.name,
      url: webhook.url,
      events: webhook.events,
      enabled: webhook.enabled,
      created_at: webhook.created_at,
    },
  }, 201);
});

// Get webhook by ID
webhookRoutes.get('/:id', async (c: Context) => {
  const userId = await getUserId(c);
  if (!userId) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401);
  }
  
  const id = c.req.param('id');
  const webhook = await getKVItem(c, `webhook:${userId}:${id}`);
  
  if (!webhook) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Webhook not found' } }, 404);
  }
  
  return c.json({
    success: true,
    data: {
      id: webhook.id,
      name: webhook.name,
      url: webhook.url,
      events: webhook.events,
      enabled: webhook.enabled,
      created_at: webhook.created_at,
      updated_at: webhook.updated_at,
    },
  });
});

// Update webhook
webhookRoutes.put('/:id', async (c: Context) => {
  const userId = await getUserId(c);
  if (!userId) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401);
  }
  
  const id = c.req.param('id');
  const existing = await getKVItem(c, `webhook:${userId}:${id}`);
  
  if (!existing) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Webhook not found' } }, 404);
  }
  
  const body = await c.req.json();
  const { name, url, events, enabled } = body;
  
  // Validate URL if provided
  if (url) {
    try {
      new URL(url);
    } catch {
      return c.json({
        success: false,
        error: { code: 'INVALID_URL', message: 'Invalid URL format' },
      }, 400);
    }
  }
  
  const updated = {
    ...existing,
    name: name ?? existing.name,
    url: url ?? existing.url,
    events: events ?? existing.events,
    enabled: enabled !== undefined ? enabled : existing.enabled,
    updated_at: Date.now(),
  };
  
  await saveKVItem(c, `webhook:${userId}:${id}`, updated);
  
  return c.json({
    success: true,
    data: {
      id: updated.id,
      name: updated.name,
      url: updated.url,
      events: updated.events,
      enabled: updated.enabled,
      updated_at: updated.updated_at,
    },
  });
});

// Delete webhook
webhookRoutes.delete('/:id', async (c: Context) => {
  const userId = await getUserId(c);
  if (!userId) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401);
  }
  
  const id = c.req.param('id');
  const existing = await getKVItem(c, `webhook:${userId}:${id}`);
  
  if (!existing) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Webhook not found' } }, 404);
  }
  
  await deleteKVItem(c, `webhook:${userId}:${id}`);
  
  return c.json({ success: true });
});

// Test webhook - send test payload
webhookRoutes.post('/:id/test', async (c: Context) => {
  const userId = await getUserId(c);
  if (!userId) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401);
  }
  
  const id = c.req.param('id');
  const webhook = await getKVItem(c, `webhook:${userId}:${id}`);
  
  if (!webhook) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Webhook not found' } }, 404);
  }
  
  if (!webhook.enabled) {
    return c.json({ success: false, error: { code: 'DISABLED', message: 'Webhook is disabled' } }, 400);
  }
  
  // Send test payload
  const testPayload = {
    event: 'test',
    message: 'This is a test webhook from Regarded',
    timestamp: Date.now(),
    webhook_id: webhook.id,
    webhook_name: webhook.name,
  };
  
  try {
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Test': 'true',
      },
      body: JSON.stringify(testPayload),
    });
    
    if (!response.ok) {
      return c.json({
        success: false,
        error: { 
          code: 'WEBHOOK_FAILED', 
          message: `Webhook returned status ${response.status}`,
          details: { status: response.status },
        },
      }, 400);
    }
    
    return c.json({
      success: true,
      data: { 
        sent: true,
        status: response.status,
        webhook_id: webhook.id,
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: { 
        code: 'WEBHOOK_ERROR', 
        message: error instanceof Error ? error.message : 'Failed to send webhook',
      },
    }, 500);
  }
});
