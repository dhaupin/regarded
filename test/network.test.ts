/**
 * Network Module Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Network, NetworkError, createNetwork } from '../lib/network';
import { QoSManager } from '../lib/qos';

describe('Network', () => {
  let network: Network;

  beforeEach(() => {
    network = new Network({
      defaultTimeout: 5000,
      defaultRetries: 2,
      cacheResponses: false,
    });
  });

  it('should create network client', () => {
    expect(network).toBeDefined();
  });

  it('should build URL with query params', async () => {
    // We'll test the URL building through the request method
    const mockFetch = vi.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve('{"ok":true}'),
      } as any)
    );

    const result = await network.get('https://api.example.com', { foo: 'bar' });
    
    expect(mockFetch).toHaveBeenCalled();
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('foo=bar');
    
    mockFetch.mockRestore();
  });

  it('should make GET request', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve('{"data":"test"}'),
      } as any)
    );

    const result = await network.get('https://api.example.com/data');
    
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.data).toEqual({ data: 'test' });
    
    mockFetch.mockRestore();
  });

  it('should make POST request', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 201,
        statusText: 'Created',
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve('{"id":123}'),
      } as any)
    );

    const result = await network.post('https://api.example.com/data', { name: 'test' });
    
    expect(result.ok).toBe(true);
    expect(result.status).toBe(201);
    
    mockFetch.mockRestore();
  });

  it('should make PUT request', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve('{}'),
      } as any)
    );

    const result = await network.put('https://api.example.com/data/1', { name: 'updated' });
    
    expect(result.ok).toBe(true);
    
    mockFetch.mockRestore();
  });

  it('should make DELETE request', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 204,
        statusText: 'No Content',
        headers: new Headers({}),
        text: () => Promise.resolve(''),
      } as any)
    );

    const result = await network.delete('https://api.example.com/data/1');
    
    expect(result.ok).toBe(true);
    expect(result.status).toBe(204);
    
    mockFetch.mockRestore();
  });

  it('should handle HTTP errors', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve('{"error":"Not found"}'),
      } as any)
    );

    const result = await network.get('https://api.example.com/notfound');
    
    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
    
    mockFetch.mockRestore();
  });

  it('should handle network errors', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.reject(new Error('Network error'))
    );

    const result = await network.get('https://api.example.com/data');
    
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    
    mockFetch.mockRestore();
  });

  it('should handle non-JSON responses', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'text/html' }),
        text: () => Promise.resolve('<html>Hello</html>'),
      } as any)
    );

    const result = await network.get('https://example.com');
    
    expect(result.ok).toBe(true);
    expect(result.data).toBeUndefined(); // Non-JSON not parsed
    
    mockFetch.mockRestore();
  });

  it('should track duration', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve('{}'),
      } as any)
    );

    const result = await network.get('https://api.example.com/data');
    
    // Duration may be 0 in mocked environment
    expect(result.duration).toBeGreaterThanOrEqual(0);
    
    mockFetch.mockRestore();
  });

  it('should use custom headers', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve('{}'),
      } as any)
    );

    await network.get('https://api.example.com/data', undefined, {
      headers: { 'Authorization': 'Bearer token123' },
    });
    
    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers).toHaveProperty('Authorization', 'Bearer token123');
    
    mockFetch.mockRestore();
  });

  describe('NetworkError', () => {
    it('should create network error', () => {
      const error = new NetworkError('Timeout', 408, 'https://api.example.com');
      
      expect(error.message).toBe('Timeout');
      expect(error.status).toBe(408);
      expect(error.url).toBe('https://api.example.com');
    });
  });

  describe('QoS Integration', () => {
    it('should accept custom QoS manager', () => {
      const qos = new QoSManager();
      const net = new Network({}, qos);
      
      expect(net.getQoS()).toBe(qos);
    });
  });
});
