/**
 * Utility Functions
 *
 * Common helper functions used throughout the codebase.
 */

import type { CandleInterval } from './types';

// ============================================================================
// Date/Time Utilities
// ============================================================================

/**
 * Format timestamp to ISO date string
 */
export function formatDate(timestamp: number): string {
  return new Date(timestamp).toISOString().split('T')[0];
}

/**
 * Format timestamp to ISO datetime string
 */
export function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

/**
 * Get start of day timestamp
 */
export function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * Get start of week timestamp (Monday)
 */
export function startOfWeek(timestamp: number): number {
  const date = new Date(timestamp);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * Get relative time string (e.g., "5 minutes ago")
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
// Number Formatting
// ============================================================================

/**
 * Format number with specified decimals
 */
export function formatNumber(num: number, decimals: number = 2): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

/**
 * Format number as currency
 */
export function formatCurrency(num: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(num);
}

/**
 * Format number as percentage
 */
export function formatPercent(num: number, decimals: number = 2): string {
  return `${(num * 100).toFixed(decimals)}%`;
}

/**
 * Round number to specified decimals
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
 * Truncate string to max length
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Convert string to URL-friendly slug
 */
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ============================================================================
// Array Utilities
// ============================================================================

/**
 * Split array into chunks
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Get unique values by key
 */
export function uniqueBy<T>(array: T[], key: keyof T): T[] {
  const seen = new Set();
  return array.filter(item => {
    const value = item[key];
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

/**
 * Group array by key
 */
export function groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
  return array.reduce((acc, item) => {
    const groupKey = String(item[key]);
    if (!acc[groupKey]) acc[groupKey] = [];
    acc[groupKey].push(item);
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
 * Convert interval to milliseconds
 */
export function intervalToMs(interval: CandleInterval): number {
  const multipliers: Record<CandleInterval, number> = {
    '1m': 60 * 1000,
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '30m': 30 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
    '1w': 7 * 24 * 60 * 60 * 1000,
    '1M': 30 * 24 * 60 * 60 * 1000,
  };
  return multipliers[interval];
}

/**
 * Convert milliseconds to interval
 */
export function msToInterval(ms: number): CandleInterval {
  const intervals: [CandleInterval, number][] = [
    ['1M', 30 * 24 * 60 * 60 * 1000],
    ['1w', 7 * 24 * 60 * 60 * 1000],
    ['1d', 24 * 60 * 60 * 1000],
    ['4h', 4 * 60 * 60 * 1000],
    ['1h', 60 * 60 * 1000],
    ['30m', 30 * 60 * 1000],
    ['15m', 15 * 60 * 1000],
    ['5m', 5 * 60 * 1000],
    ['1m', 60 * 1000],
  ];
  
  for (const [interval, intervalMs] of intervals) {
    if (ms >= intervalMs) return interval;
  }
  return '1m';
}

/**
 * Normalize trading pair (e.g., "BTC/USD" -> "BTC/USD")
 */
export function normalizePair(pair: string): string {
  return pair.toUpperCase().replace(/[^A-Z0-9/]/g, '');
}

/**
 * Parse trading pair into base and quote
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
  if (price <= 0) return 0;
  return dollarAmount / price;
}

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate trading pair format
 */
export function isValidPair(pair: string): boolean {
  const pairRegex = /^[A-Z0-9]{2,10}\/[A-Z0-9]{2,10}$/;
  return pairRegex.test(normalizePair(pair));
}

/**
 * Validate interval
 */
export function isValidInterval(interval: string): interval is CandleInterval {
  const validIntervals: CandleInterval[] = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M'];
  return validIntervals.includes(interval as CandleInterval);
}

// ============================================================================
// Error Utilities
// ============================================================================

/**
 * Create standardized error object
 */
export function createError(code: string, message: string, details?: any): Error & { code: string; details?: any } {
  const error = new Error(message) as Error & { code: string; details?: any };
  error.code = code;
  if (details) error.details = details;
  return error;
}

/**
 * Safe JSON parse with fallback
 */
export function safeJsonParse<T>(str: string, fallback: T): T {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}
