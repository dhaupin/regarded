/**
 * Encrypt Module Tests
 */

import { describe, it, expect } from 'vitest';
import { generateToken, hashSHA256, secureCompare, toBase64, fromBase64 } from '../lib/encrypt';

describe('encrypt', () => {
  it('should generate random tokens', () => {
    const token1 = generateToken(32);
    const token2 = generateToken(32);
    
    expect(token1).toHaveLength(32);
    expect(token2).toHaveLength(32);
    expect(token1).not.toBe(token2);
  });

  it('should hash data with SHA256', async () => {
    const hash = await hashSHA256('test-data');
    
    expect(hash).toBeDefined();
    expect(typeof hash).toBe('string');
    
    // Same input should produce same hash
    const hash2 = await hashSHA256('test-data');
    expect(hash2).toBe(hash);
  });

  it('should compare strings securely', () => {
    expect(secureCompare('abc', 'abc')).toBe(true);
    expect(secureCompare('abc', 'def')).toBe(false);
    expect(secureCompare('abc', 'ab')).toBe(false);
  });

  it('should convert to/from base64', () => {
    const original = 'Hello World!';
    const encoded = toBase64(new TextEncoder().encode(original));
    const decoded = new TextDecoder().decode(fromBase64(encoded));
    
    expect(decoded).toBe(original);
  });
});
