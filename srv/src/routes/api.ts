/**
 * API Routes
 * 
 * Main API endpoints for trading, strategies, rules, etc.
 */

import { Hono } from 'hono';
import type { Context } from 'hono';

export const apiRoutes = new Hono<{ Bindings: Env }>();

// ============================================================================
// Connectors
// ============================================================================

// List connectors
apiRoutes.get('/connectors', async (c: Context) => {
  // TODO: Get user connectors from D2
  
  return c.json({
    success: true,
    data: {
      items: [
        { id: '1', exchange: 'kraken', label: 'Main Kraken', paper: true },
        { id: '2', exchange: 'solana', label: 'Solana Wallet', paper: true },
      ],
      total: 2,
    },
  });
});

// Get connector
apiRoutes.get('/connectors/:id', async (c: Context) => {
  const id = c.req.param('id');
  
  return c.json({
    success: true,
    data: {
      id,
      exchange: 'kraken',
      label: 'Main Kraken',
      paper: true,
      created_at: Date.now(),
    },
  });
});

// ============================================================================
// Strategies
// ============================================================================

// List strategies
apiRoutes.get('/strategies', async (c: Context) => {
  return c.json({
    success: true,
    data: {
      items: [],
      total: 0,
    },
  });
});

// Create strategy
apiRoutes.post('/strategies', async (c: Context) => {
  const body = await c.req.json();
  
  return c.json({
    success: true,
    data: {
      id: crypto.randomUUID(),
      ...body,
      created_at: Date.now(),
      updated_at: Date.now(),
    },
  }, 201);
});

// ============================================================================
// Rules
// ============================================================================

// List rules
apiRoutes.get('/rules', async (c: Context) => {
  return c.json({
    success: true,
    data: {
      items: [],
      total: 0,
    },
  });
});

// Create rule
apiRoutes.post('/rules', async (c: Context) => {
  const body = await c.req.json();
  
  return c.json({
    success: true,
    data: {
      id: crypto.randomUUID(),
      ...body,
      created_at: Date.now(),
      updated_at: Date.now(),
    },
  }, 201);
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
