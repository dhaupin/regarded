/**
 * Utility Functions
 * 
 * Common helper functions used throughout the codebase.
 */

import type { CandleInterval } from '../core/types';

// ============================================================================
// Date/Time Utilities
// ============================================================================

/**
 * Format timestamp to ISO date string
 */
export function formatDate(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

/**
 * Format timestamp to human readable string
 */
export function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

/**
 * Get start of day
 */
export function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * Get start of week
 */
export function startOfWeek(timestamp: number): number {
  const date = new Date(timestamp);
  const day = date.getDay();
  const diff = date.getDate() - day;
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * Get relative time string
 */
export function getRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return `${seconds}s ago`;
}

// ============================================================================
// Number Utilities
// ============================================================================

/**
 * Format number with commas
 */
export function formatNumber(num: number, decimals: number = 2): string {
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format currency
 */
export function formatCurrency(num: number, currency: string = 'USD'): string {
  return num.toLocaleString('en-US', {
    style: 'currency',
    currency,
  });
}

/**
 * Format percentage
 */
export function formatPercent(num: number, decimals: number = 2): string {
  return `${(num * 100).toFixed(decimals)}%`;
}

/**
 * Round to decimal places
 */
export function round(num: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
}

/**
 * Clamp number between min and max
 */
export function clamp(num: number, min: number, max: number): number {
  return Math.min(Math.max(num, min), max);
}

/**
 * Calculate percentage change
 */
export function percentChange(oldValue: number, newValue: number): number {
  if (oldValue === 0) return 0;
  return (newValue - oldValue) / oldValue;
}

// ============================================================================
// String Utilities
// ============================================================================

/**
 * Generate random ID
 */
export function generateId(length: number = 16): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Truncate string
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Slugify string
 */
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ============================================================================
// Array Utilities
// ============================================================================

/**
 * Chunk array into groups
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Unique array by key
 */
export function uniqueBy<T>(array: T[], key: keyof T): T[] {
  const seen = new Set();
  return array.filter(item => {
    const val = item[key];
    if (seen.has(val)) return false;
    seen.add(val);
    return true;
  });
}

/**
 * Group array by key
 */
export function groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
  return array.reduce((acc, item) => {
    const k = String(item[key]);
    (acc[k] = acc[k] || []).push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

/**
 * Sort array by key
 */
export function sortBy<T>(array: T[], key: keyof T, direction: 'asc' | 'desc' = 'asc'): T[] {
  return [...array].sort((a, b) => {
    const aVal = a[key];
    const bVal = b[key];
    
    if (aVal < bVal) return direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return direction === 'asc' ? 1 : -1;
    return 0;
  });
}

// ============================================================================
// Trading Utilities
// ============================================================================

/**
 * Get interval in milliseconds
 */
export function intervalToMs(interval: CandleInterval): number {
  const map: Record<CandleInterval, number> = {
    '1m': 60000,
    '5m': 300000,
    '15m': 900000,
    '30m': 1800000,
    '1h': 3600000,
    '4h': 14400000,
    '1d': 86400000,
    '1w': 604800000,
    '1M': 2592000000,
  };
  return map[interval];
}

/**
 * Get interval from milliseconds
 */
export function msToInterval(ms: number): CandleInterval {
  const intervals: [CandleInterval, number][] = [
    ['1M', 2592000000],
    ['1w', 604800000],
    ['1d', 86400000],
    ['4h', 14400000],
    ['1h', 3600000],
    ['30m', 1800000],
    ['15m', 900000],
    ['5m', 300000],
    ['1m', 60000],
  ];
  
  for (const [interval, intervalMs] of intervals) {
    if (ms >= intervalMs) return interval;
  }
  
  return '1m';
}

/**
 * Normalize trading pair
 */
export function normalizePair(pair: string): string {
  // Convert various formats to standard: BASE/QUOTE
  return pair.toUpperCase().replace(/[-_]/, '/');
}

/**
 * Parse trading pair
 */
export function parsePair(pair: string): { base: string; quote: string } {
  const normalized = normalizePair(pair);
  const [base, quote] = normalized.split('/');
  return { base: base || 'UNKNOWN', quote: quote || 'USD' };
}

/**
 * Calculate position value
 */
export function calculatePositionValue(amount: number, price: number): number {
  return amount * price;
}

/**
 * Calculate position size from dollar amount
 */
export function calculatePositionSize(dollarAmount: number, price: number): number {
  return dollarAmount / price;
}

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Validate email
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate trading pair format
 */
export function isValidPair(pair: string): boolean {
  const pairRegex = /^[A-Z0-9]{1,10}\/[A-Z0-9]{1,10}$/;
  return pairRegex.test(pair.toUpperCase());
}

/**
 * Validate interval
 */
export function isValidInterval(interval: string): interval is CandleInterval {
  return ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M'].includes(interval);
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Create error with code
 */
export function createError(code: string, message: string, details?: any): Error & { code: string; details?: any } {
  const error = new Error(message) as Error & { code: string; details?: any };
  error.code = code;
  error.details = details;
  return error;
}

/**
 * Safe JSON parse
 */
export function safeJsonParse<T>(str: string, fallback: T): T {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}
