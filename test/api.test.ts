/**
 * API Module Tests
 */

import { describe, it, expect } from 'vitest';
import {
  json,
  error,
  success,
  parseQuery,
  toSnakeCase,
  toCamelCase,
  paginate,
  healthCheck,
  notFound,
  Router,
} from '../lib/api';

describe('API Response Helpers', () => {
  it('should create JSON response', () => {
    const res = json({ foo: 'bar' }, 200);
    expect(res).toBeDefined();
    expect(res.status).toBe(200);
  });

  it('should create error response', () => {
    const res = error('INVALID_REQUEST', 'Invalid request', 400);
    expect(res.status).toBe(400);
  });

  it('should create success response', () => {
    const res = success({ result: true });
    expect(res.status).toBe(200);
  });
});

describe('Query Parser', () => {
  it('should parse query string', () => {
    const req = new Request('http://test.com?foo=bar&baz=qux');
    const query = parseQuery(req as any);
    expect(query.foo).toBe('bar');
    expect(query.baz).toBe('qux');
  });

  it('should return empty object for no query', () => {
    const req = new Request('http://test.com');
    const query = parseQuery(req as any);
    expect(Object.keys(query).length).toBe(0);
  });
});

describe('Case Transformers', () => {
  it('should convert to snake_case', () => {
    const result = toSnakeCase({ userName: 'test', emailAddress: 'test@test.com' });
    expect(result).toEqual({ user_name: 'test', email_address: 'test@test.com' });
  });

  it('should convert to camelCase', () => {
    const result = toCamelCase({ user_name: 'test', email_address: 'test@test.com' });
    expect(result).toEqual({ userName: 'test', emailAddress: 'test@test.com' });
  });

  it('should handle nested objects', () => {
    const result = toSnakeCase({ userInfo: { userName: 'test' } });
    expect(result).toEqual({ user_info: { user_name: 'test' } });
  });
});

describe('Pagination', () => {
  const items = Array.from({ length: 100 }, (_, i) => ({ id: i }));

  it('should paginate items', () => {
    const result = paginate(items, 1, 10);
    expect(result.items.length).toBe(10);
    expect(result.meta.page).toBe(1);
    expect(result.meta.total).toBe(100);
    expect(result.meta.totalPages).toBe(10);
  });

  it('should handle custom page size', () => {
    const result = paginate(items, 1, 25);
    expect(result.items.length).toBe(25);
    expect(result.meta.pageSize).toBe(25);
  });

  it('should handle page out of bounds', () => {
    const result = paginate(items, 999, 10);
    expect(result.items.length).toBe(0);
  });
});

describe('Router', () => {
  let router: Router;

  beforeEach(() => {
    router = new Router();
  });

  it('should create router', () => {
    expect(router).toBeDefined();
  });

  it('should register and match routes', async () => {
    let matched = false;
    router.get('/test', async () => {
      matched = true;
      return json({ ok: true });
    });

    const req = new Request('http://test.com/test');
    const res = await router.handle(req as any, {}, {} as any);
    expect(matched).toBe(true);
    expect(res.status).toBe(200);
  });

  it('should match route with path params', async () => {
    router.get('/users/:id', async (req) => {
      return json({ userId: (req as any).params?.id });
    });

    const req = new Request('http://test.com/users/123');
    const res = await router.handle(req as any, {}, {} as any);
    const data = await res.json();
    expect(data.userId).toBe('123');
  });

  it('should return 404 for unmatched routes', async () => {
    router.get('/existing', async () => json({ ok: true }));

    const req = new Request('http://test.com/notfound');
    const res = await router.handle(req as any, {}, {} as any);
    expect(res.status).toBe(404);
  });
});

describe('Health Check', () => {
  it('should return healthy response', async () => {
    const handler = healthCheck();
    const req = new Request('http://test.com/health');
    const res = await handler(req as any, {}, {} as any);
    expect(res.status).toBe(200);
  });
});

describe('Not Found', () => {
  it('should return 404 response', async () => {
    const handler = notFound();
    const req = new Request('http://test.com/notfound');
    const res = await handler(req as any, {}, {} as any);
    expect(res.status).toBe(404);
  });
});
