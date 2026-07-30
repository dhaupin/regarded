/**
 * API Module
 * 
 * HTTP handlers, hooks, and transforms for Cloudflare Pages/Workers.
 * Used by the web app backend.
 */

import { Request, Response } from '@cloudflare/workers-types';

// ============================================================================
// Request/Response Types
// ============================================================================

export interface ApiRequest {
  // Base request properties
  url: string;
  method: string;
  headers: Headers;
  body: any;
  json: () => Promise<any>;
  formData: () => Promise<FormData>;
  text: () => Promise<string>;
  params?: Record<string, string>;
  query?: Record<string, string>;
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

export interface ApiResponse {
  success: boolean;
  data?: any;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    page?: number;
    total?: number;
    [key: string]: any;
  };
}

export type Handler = (req: ApiRequest, env: any, ctx: any) => Promise<Response>;

// ============================================================================
// HTTP Helpers
// ============================================================================

/**
 * Create JSON response
 */
export function json(data: any, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Create error response
 */
export function error(code: string, message: string, status: number = 400, details?: any): Response {
  return json({ success: false, error: { code, message, details } }, status);
}

/**
 * Create success response
 */
export function success(data: any, meta?: any): Response {
  return json({ success: true, data, meta });
}

// ============================================================================
// Request Parsing
// ============================================================================

/**
 * Parse JSON body
 */
export async function parseBody(req: ApiRequest): Promise<any> {
  const contentType = req.headers.get('content-type') || '';
  
  if (contentType.includes('application/json')) {
    return req.json();
  }
  
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const formData = await req.formData();
    const obj: Record<string, any> = {};
    for (const [key, value] of formData) {
      obj[key] = value;
    }
    return obj;
  }
  
  return null;
}

/**
 * Parse query params
 */
export function parseQuery(req: ApiRequest): Record<string, string> {
  const url = new URL(req.url);
  const query: Record<string, string> = {};
  for (const [key, value] of url.searchParams) {
    query[key] = value;
  }
  return query;
}

// ============================================================================
// Middleware
// ============================================================================

/**
 * Auth middleware
 */
export function withAuth(handler: Handler): Handler {
  return async (req: ApiRequest, env: any, ctx: any) => {
    const authHeader = req.headers.get('authorization');
    
    if (!authHeader?.startsWith('Bearer ')) {
      return error('UNAUTHORIZED', 'Missing auth token', 401);
    }
    
    const token = authHeader.slice(7);
    
    // Verify token (simplified - use real JWT verification)
    // In production, verify JWT and attach user to request
    try {
      // const payload = await verifyJWT(token);
      // req.user = payload;
    } catch {
      return error('UNAUTHORIZED', 'Invalid token', 401);
    }
    
    return handler(req, env, ctx);
  };
}

/**
 * CORS middleware
 */
export function withCORS(handler: Handler, options: { origin?: string } = {}): Handler {
  return async (req: ApiRequest, env: any, ctx: any) => {
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': options.origin || '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }
    
    const response = await handler(req, env, ctx);
    
    response.headers.set('Access-Control-Allow-Origin', options.origin || '*');
    
    return response;
  };
}

/**
 * Rate limit middleware
 */
export function withRateLimit(handler: Handler, limit: number, windowMs: number): Handler {
  const requests = new Map<string, number[]>();
  
  return async (req: ApiRequest, env: any, ctx: any) => {
    const ip = req.headers.get('cf-connecting-ip') || 'unknown';
    const now = Date.now();
    
    const userRequests = requests.get(ip) || [];
    const recentRequests = userRequests.filter(t => now - t < windowMs);
    
    if (recentRequests.length >= limit) {
      return error('RATE_LIMITED', 'Too many requests', 429);
    }
    
    recentRequests.push(now);
    requests.set(ip, recentRequests);
    
    return handler(req, env, ctx);
  };
}

// ============================================================================
// Router
// ============================================================================

interface Route {
  method: string;
  path: string;
  handler: Handler;
  middleware?: Handler[];
}

/**
 * Simple router
 */
export class Router {
  private routes: Route[] = [];
  
  /**
   * Register GET route
   */
  get(path: string, handler: Handler, ...middleware: Handler[]): this {
    this.routes.push({ method: 'GET', path, handler, middleware });
    return this;
  }
  
  /**
   * Register POST route
   */
  post(path: string, handler: Handler, ...middleware: Handler[]): this {
    this.routes.push({ method: 'POST', path, handler, middleware });
    return this;
  }
  
  /**
   * Register PUT route
   */
  put(path: string, handler: Handler, ...middleware: Handler[]): this {
    this.routes.push({ method: 'PUT', path, handler, middleware });
    return this;
  }
  
  /**
   * Register DELETE route
   */
  delete(path: string, handler: Handler, ...middleware: Handler[]): this {
    this.routes.push({ method: 'DELETE', path, handler, middleware });
    return this;
  }
  
  /**
   * Handle request
   */
  async handle(req: ApiRequest, env: any, ctx: any): Promise<Response> {
    const url = new URL(req.url);
    const method = req.method;
    const path = url.pathname;
    
    // Find matching route
    for (const route of this.routes) {
      if (route.method !== method) continue;
      
      const match = this.matchPath(route.path, path);
      if (match) {
        req.params = match.params;
        
        // Run middleware
        if (route.middleware) {
          for (const mw of route.middleware) {
            const mwRes = await mw(req, env, ctx);
            if (mwRes) return mwRes;
          }
        }
        
        return route.handler(req, env, ctx);
      }
    }
    
    return error('NOT_FOUND', `Route ${method} ${path} not found`, 404);
  }
  
  /**
   * Match path with params
   */
  private matchPath(routePath: string, reqPath: string): { params: Record<string, string> } | null {
    const routeParts = routePath.split('/');
    const reqParts = reqPath.split('/');
    
    if (routeParts.length !== reqParts.length) return null;
    
    const params: Record<string, string> = {};
    
    for (let i = 0; i < routeParts.length; i++) {
      if (routeParts[i].startsWith(':')) {
        params[routeParts[i].slice(1)] = reqParts[i];
      } else if (routeParts[i] !== reqParts[i]) {
        return null;
      }
    }
    
    return { params };
  }
}

// ============================================================================
// Common Handlers
// ============================================================================

/**
 * Health check handler
 */
export function healthCheck(): Handler {
  return () => Promise.resolve(success({ status: 'ok', timestamp: Date.now() }));
}

/**
 * Not found handler
 */
export function notFound(): Handler {
  return () => Promise.resolve(error('NOT_FOUND', 'Resource not found', 404));
}

// ============================================================================
// Transform Helpers
// ============================================================================

/**
 * Transform camelCase to snake_case
 */
export function toSnakeCase(obj: any): any {
  if (Array.isArray(obj)) return obj.map(toSnakeCase);
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k.replace(/[A-Z]/g, m => `_${m.toLowerCase()}`), toSnakeCase(v)])
    );
  }
  return obj;
}

/**
 * Transform snake_case to camelCase
 */
export function toCamelCase(obj: any): any {
  if (Array.isArray(obj)) return obj.map(toCamelCase);
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k.replace(/_([a-z])/g, m => m[1].toUpperCase()), toCamelCase(v)])
    );
  }
  return obj;
}

/**
 * Paginate results
 */
export function paginate<T>(items: T[], page: number = 1, pageSize: number = 20): { items: T[]; meta: { page: number; pageSize: number; total: number; totalPages: number } } {
  const total = items.length;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  
  return {
    items: items.slice(start, start + pageSize),
    meta: { page, pageSize, total, totalPages },
  };
}
