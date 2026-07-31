/**
 * Regarded API Server
 * 
 * Cloudflare Workers entry point using Hono framework.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { timing } from 'hono/timing';
import type { Context } from 'hono';

// Import routes
import { authRoutes } from './routes/auth';
import { apiRoutes } from './routes/api';
import { webhookRoutes } from './routes/webhooks';

// ============================================================================
// App
// ============================================================================

const app = new Hono<{ Bindings: Env }>();

// ============================================================================
// Middleware
// ============================================================================

// Timing header
app.use('*', timing());

// CORS
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Logger
app.use('*', logger());

// ============================================================================
// Routes
// ============================================================================

// Health check
app.get('/health', (c: Context) => {
  return c.json({
    status: 'ok',
    timestamp: Date.now(),
    version: '0.1.0',
  });
});

// Auth routes
app.route('/auth', authRoutes);

// API routes
app.route('/api', apiRoutes);

// Webhook routes
app.route('/webhooks', webhookRoutes);

// ============================================================================
// 404 Handler
// ============================================================================

app.notFound((c: Context) => {
  return c.json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'The requested resource was not found',
    },
  }, 404);
});

// ============================================================================
// Error Handler
// ============================================================================

app.onError((err: Error, c: Context) => {
  console.error('Server error:', err);
  
  return c.json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: err.message || 'An internal server error occurred',
    },
  }, 500);
});

// ============================================================================
// Export
// ============================================================================

export default app;
