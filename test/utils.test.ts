/**
 * Utils Module Tests
 */

import { describe, it, expect } from 'vitest';
import {
  formatDate, formatDateTime, getRelativeTime,
  formatNumber, formatCurrency, formatPercent, round, clamp, percentChange,
  generateId, truncate, slugify,
  chunk, uniqueBy, groupBy, sortBy,
  intervalToMs, normalizePair, parsePair, calculatePositionValue, calculatePositionSize,
  isValidEmail, isValidPair, isValidInterval,
  createError, safeJsonParse,
} from '../lib/utils';

describe('Utils', () => {
  describe('Date/Time', () => {
    it('should format dates', () => {
      const timestamp = new Date('2024-01-15T10:30:00Z').getTime();
      const formatted = formatDate(timestamp);
      expect(formatted).toContain('2024-01-15');
    });

    it('should get relative time', () => {
      const now = Date.now();
      expect(getRelativeTime(now)).toBe('0s ago');
      expect(getRelativeTime(now - 60000)).toBe('1m ago');
      expect(getRelativeTime(now - 3600000)).toBe('1h ago');
      expect(getRelativeTime(now - 86400000)).toBe('1d ago');
    });
  });

  describe('Numbers', () => {
    it('should format numbers', () => {
      expect(formatNumber(1234.567)).toBe('1,234.57');
      expect(formatNumber(1234.5, 0)).toBe('1,235');
    });

    it('should format currency', () => {
      expect(formatCurrency(1234.56)).toContain('1,234.56');
    });

    it('should format percent', () => {
      expect(formatPercent(0.1234)).toBe('12.34%');
      expect(formatPercent(0.5)).toBe('50.00%');
    });

    it('should round numbers', () => {
      expect(round(1.234, 2)).toBe(1.23);
      expect(round(1.235, 2)).toBe(1.24);
    });

    it('should clamp values', () => {
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(-5, 0, 10)).toBe(0);
      expect(clamp(15, 0, 10)).toBe(10);
    });

    it('should calculate percent change', () => {
      expect(percentChange(100, 110)).toBe(0.1);
      expect(percentChange(100, 90)).toBe(-0.1);
      expect(percentChange(0, 100)).toBe(0);
    });
  });

  describe('Strings', () => {
    it('should generate IDs', () => {
      const id1 = generateId(16);
      const id2 = generateId(16);
      
      expect(id1).toHaveLength(16);
      expect(id2).toHaveLength(16);
      expect(id1).not.toBe(id2);
    });

    it('should truncate strings', () => {
      expect(truncate('hello world', 8)).toBe('hello...');
      expect(truncate('hi', 10)).toBe('hi');
    });

    it('should slugify strings', () => {
      expect(slugify('Hello World')).toBe('hello-world');
      expect(slugify('Test  Multiple   Spaces')).toBe('test-multiple-spaces');
    });
  });

  describe('Arrays', () => {
    it('should chunk arrays', () => {
      expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    });

    it('should get unique by key', () => {
      const arr = [{ id: 1, name: 'a' }, { id: 2, name: 'b' }, { id: 1, name: 'c' }];
      const result = uniqueBy(arr, 'id');
      expect(result).toHaveLength(2);
    });

    it('should group by key', () => {
      const arr = [{ type: 'a', val: 1 }, { type: 'b', val: 2 }, { type: 'a', val: 3 }];
      const result = groupBy(arr, 'type');
      expect(result.a).toHaveLength(2);
      expect(result.b).toHaveLength(1);
    });

    it('should sort by key', () => {
      const arr = [{ a: 3 }, { a: 1 }, { a: 2 }];
      const result = sortBy(arr, 'a', 'asc');
      expect(result[0].a).toBe(1);
      expect(result[2].a).toBe(3);
    });
  });

  describe('Trading', () => {
    it('should convert intervals to ms', () => {
      expect(intervalToMs('1m')).toBe(60000);
      expect(intervalToMs('1h')).toBe(3600000);
      expect(intervalToMs('1d')).toBe(86400000);
    });

    it('should normalize pairs', () => {
      expect(normalizePair('sol/usd')).toBe('SOL/USD');
    });

    it('should parse pairs', () => {
      expect(parsePair('SOL/USD')).toEqual({ base: 'SOL', quote: 'USD' });
    });

    it('should calculate position values', () => {
      expect(calculatePositionValue(10, 100)).toBe(1000);
    });

    it('should calculate position sizes', () => {
      expect(calculatePositionSize(1000, 100)).toBe(10);
    });
  });

  describe('Validation', () => {
    it('should validate emails', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
      expect(isValidEmail('invalid')).toBe(false);
    });

    it('should validate pairs', () => {
      expect(isValidPair('SOL/USD')).toBe(true);
      expect(isValidPair('invalid')).toBe(false);
    });

    it('should validate intervals', () => {
      expect(isValidInterval('1m')).toBe(true);
      expect(isValidInterval('1h')).toBe(true);
      expect(isValidInterval('invalid')).toBe(false);
    });
  });

  describe('Error handling', () => {
    it('should create errors with code', () => {
      const error = createError('TEST_CODE', 'Test message');
      expect(error.code).toBe('TEST_CODE');
      expect(error.message).toBe('Test message');
    });

    it('should safe parse JSON', () => {
      expect(safeJsonParse('{"a": 1}', { b: 2 })).toEqual({ a: 1 });
      expect(safeJsonParse('invalid', { b: 2 })).toEqual({ b: 2 });
    });
  });
});
