/**
 * API Routes
 * 
 * Main API endpoints for trading, strategies, rules, etc.
 */

import { Hono } from 'hono';
import type { Context } from 'hono';

// Helper to get user ID from request (simplified for demo)
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

// Helper to list items from KV
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

// Helper to get item from KV
async function getKVItem(c: Context, key: string): Promise<any | null> {
  const value = await c.env.KV.get(key);
  return value ? JSON.parse(value) : null;
}

// Helper to save item to KV
async function saveKVItem(c: Context, key: string, data: any): Promise<void> {
  await c.env.KV.put(key, JSON.stringify(data));
}

// Helper to delete item from KV
async function deleteKVItem(c: Context, key: string): Promise<void> {
  await c.env.KV.delete(key);
}

export const apiRoutes = new Hono<{ Bindings: Env }>();

// ============================================================================
// Connectors
// ============================================================================

// List connectors
apiRoutes.get('/connectors', async (c: Context) => {
  const userId = await getUserId(c);
  if (!userId) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401);
  }

  const items = await listKVItems(c, `connector:${userId}:`);
  
  return c.json({
    success: true,
    data: {
      items: items.map(i => ({
        id: i.id,
        exchange: i.exchange,
        label: i.label,
        paper: i.paperMode,
        status: 'connected',
      })),
      total: items.length,
    },
  });
});

// Create connector
apiRoutes.post('/connectors', async (c: Context) => {
  const userId = await getUserId(c);
  if (!userId) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401);
  }

  const body = await c.req.json();
  const id = crypto.randomUUID();
  
  const connector = {
    id,
    userId,
    exchange: body.exchange || 'kraken',
    label: body.label || '',
    paperMode: body.paperMode ?? true,
    apiKey: body.apiKey, // In production, encrypt this
    apiSecret: body.apiSecret, // In production, encrypt this
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  
  await saveKVItem(c, `connector:${userId}:${id}`, connector);
  
  return c.json({
    success: true,
    data: {
      id: connector.id,
      exchange: connector.exchange,
      label: connector.label,
      paper: connector.paperMode,
      status: 'connected',
    },
  }, 201);
});

// Get connector
apiRoutes.get('/connectors/:id', async (c: Context) => {
  const userId = await getUserId(c);
  if (!userId) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401);
  }

  const id = c.req.param('id');
  const connector = await getKVItem(c, `connector:${userId}:${id}`);
  
  if (!connector) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Connector not found' } }, 404);
  }
  
  return c.json({
    success: true,
    data: {
      id: connector.id,
      exchange: connector.exchange,
      label: connector.label,
      paper: connector.paperMode,
      created_at: connector.createdAt,
    },
  });
});

// Update connector
apiRoutes.put('/connectors/:id', async (c: Context) => {
  const userId = await getUserId(c);
  if (!userId) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401);
  }

  const id = c.req.param('id');
  const existing = await getKVItem(c, `connector:${userId}:${id}`);
  
  if (!existing) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Connector not found' } }, 404);
  }

  const body = await c.req.json();
  const updated = {
    ...existing,
    ...body,
    updatedAt: Date.now(),
  };
  
  await saveKVItem(c, `connector:${userId}:${id}`, updated);
  
  return c.json({
    success: true,
    data: {
      id: updated.id,
      exchange: updated.exchange,
      label: updated.label,
      paper: updated.paperMode,
    },
  });
});

// Delete connector
apiRoutes.delete('/connectors/:id', async (c: Context) => {
  const userId = await getUserId(c);
  if (!userId) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401);
  }

  const id = c.req.param('id');
  await deleteKVItem(c, `connector:${userId}:${id}`);
  
  return c.json({ success: true });
});

// ============================================================================
// Strategies
// ============================================================================

// List strategies
apiRoutes.get('/strategies', async (c: Context) => {
  const userId = await getUserId(c);
  if (!userId) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401);
  }

  const items = await listKVItems(c, `strategy:${userId}:`);
  
  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
    },
  });
});

// Create strategy
apiRoutes.post('/strategies', async (c: Context) => {
  const userId = await getUserId(c);
  if (!userId) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401);
  }

  const body = await c.req.json();
  const id = crypto.randomUUID();
  
  const strategy = {
    id,
    userId,
    name: body.name || 'Untitled Strategy',
    indicators: body.indicators || [],
    intervals: body.intervals || ['1h'],
    symbols: body.symbols || [],
    enabled: body.enabled ?? true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  
  await saveKVItem(c, `strategy:${userId}:${id}`, strategy);
  
  return c.json({ success: true, data: strategy }, 201);
});

// Get strategy
apiRoutes.get('/strategies/:id', async (c: Context) => {
  const userId = await getUserId(c);
  if (!userId) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401);
  }

  const id = c.req.param('id');
  const strategy = await getKVItem(c, `strategy:${userId}:${id}`);
  
  if (!strategy) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Strategy not found' } }, 404);
  }
  
  return c.json({ success: true, data: strategy });
});

// Update strategy
apiRoutes.put('/strategies/:id', async (c: Context) => {
  const userId = await getUserId(c);
  if (!userId) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401);
  }

  const id = c.req.param('id');
  const existing = await getKVItem(c, `strategy:${userId}:${id}`);
  
  if (!existing) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Strategy not found' } }, 404);
  }

  const body = await c.req.json();
  const updated = { ...existing, ...body, updatedAt: Date.now() };
  await saveKVItem(c, `strategy:${userId}:${id}`, updated);
  
  return c.json({ success: true, data: updated });
});

// Delete strategy
apiRoutes.delete('/strategies/:id', async (c: Context) => {
  const userId = await getUserId(c);
  if (!userId) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401);
  }

  const id = c.req.param('id');
  await deleteKVItem(c, `strategy:${userId}:${id}`);
  
  return c.json({ success: true });
});

// ============================================================================
// Rules
// ============================================================================

// List rules
apiRoutes.get('/rules', async (c: Context) => {
  const userId = await getUserId(c);
  if (!userId) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401);
  }

  const items = await listKVItems(c, `rule:${userId}:`);
  
  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
    },
  });
});

// Create rule
apiRoutes.post('/rules', async (c: Context) => {
  const userId = await getUserId(c);
  if (!userId) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401);
  }

  const body = await c.req.json();
  const id = crypto.randomUUID();
  
  const rule = {
    id,
    userId,
    name: body.name || 'Untitled Rule',
    conditions: body.conditions || [],
    triggers: body.triggers || [],
    condition_logic: body.condition_logic || 'and',
    enabled: body.enabled ?? true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  
  await saveKVItem(c, `rule:${userId}:${id}`, rule);
  
  return c.json({ success: true, data: rule }, 201);
});

// Get rule
apiRoutes.get('/rules/:id', async (c: Context) => {
  const userId = await getUserId(c);
  if (!userId) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401);
  }

  const id = c.req.param('id');
  const rule = await getKVItem(c, `rule:${userId}:${id}`);
  
  if (!rule) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Rule not found' } }, 404);
  }
  
  return c.json({ success: true, data: rule });
});

// Update rule
apiRoutes.put('/rules/:id', async (c: Context) => {
  const userId = await getUserId(c);
  if (!userId) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401);
  }

  const id = c.req.param('id');
  const existing = await getKVItem(c, `rule:${userId}:${id}`);
  
  if (!existing) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Rule not found' } }, 404);
  }

  const body = await c.req.json();
  const updated = { ...existing, ...body, updatedAt: Date.now() };
  await saveKVItem(c, `rule:${userId}:${id}`, updated);
  
  return c.json({ success: true, data: updated });
});

// Delete rule
apiRoutes.delete('/rules/:id', async (c: Context) => {
  const userId = await getUserId(c);
  if (!userId) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401);
  }

  const id = c.req.param('id');
  await deleteKVItem(c, `rule:${userId}:${id}`);
  
  return c.json({ success: true });
});

// ============================================================================
// Trades
// ============================================================================

// List trades
apiRoutes.get('/trades', async (c: Context) => {
  const page = parseInt(c.req.query('page') || '1');
  const pageSize = parseInt(c.req.query('page_size') || '20');
  
  return c.json({
    success: true,
    data: {
      items: [],
      total: 0,
      page,
      page_size: pageSize,
      has_more: false,
    },
  });
});

// ============================================================================
// Positions
// ============================================================================

// Get positions
apiRoutes.get('/positions', async (c: Context) => {
  return c.json({
    success: true,
    data: {
      items: [],
      total: 0,
    },
  });
});

// ============================================================================
// Agent
// ============================================================================

// Start agent
apiRoutes.post('/agent/start', async (c: Context) => {
  const body = await c.req.json();
  
  return c.json({
    success: true,
    data: {
      running: true,
      tick_interval: body.tick_interval || 60000,
    },
  });
});

// Stop agent
apiRoutes.post('/agent/stop', async (c: Context) => {
  return c.json({
    success: true,
    data: {
      running: false,
    },
  });
});

// Get agent status
apiRoutes.get('/agent/status', async (c: Context) => {
  return c.json({
    success: true,
    data: {
      running: false,
      positions: 0,
      trades_today: 0,
      pnl_today: 0,
    },
  });
});

// ============================================================================
// Config
// ============================================================================

// Get user config
apiRoutes.get('/config', async (c: Context) => {
  return c.json({
    success: true,
    data: {
      theme: 'dark',
      timezone: 'UTC',
      notifications: {
        trade_executed: true,
        rule_triggered: true,
        position_closed: true,
        error_alerts: true,
      },
    },
  });
});

// Update user config
apiRoutes.put('/config', async (c: Context) => {
  const body = await c.req.json();
  
  return c.json({
    success: true,
    data: body,
  });
});
