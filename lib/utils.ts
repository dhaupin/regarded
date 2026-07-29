/**
 * Utility Functions
 * 
 * Date/time, numbers, strings, trading utilities.
 */

// Date/Time
export function formatDate(timestamp: number): string { return new Date(timestamp).toISOString(); }
export function formatDateTime(timestamp: number): string { return new Date(timestamp).toLocaleString(); }
export function getRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return `${seconds}s ago`;
}

// Numbers
export function formatNumber(num: number, decimals: number = 2): string {
  return num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
export function formatCurrency(num: number, currency: string = 'USD'): string {
  return num.toLocaleString('en-US', { style: 'currency', currency });
}
export function formatPercent(num: number, decimals: number = 2): string { return `${(num * 100).toFixed(decimals)}%`; }
export function round(num: number, decimals: number = 2): number {
  return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
}
export function clamp(num: number, min: number, max: number): number { return Math.min(Math.max(num, min), max); }
export function percentChange(oldValue: number, newValue: number): number {
  return oldValue === 0 ? 0 : (newValue - oldValue) / oldValue;
}

// Strings
export function generateId(length: number = 16): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}
export function truncate(str: string, maxLength: number): string {
  return str.length <= maxLength ? str : str.slice(0, maxLength - 3) + '...';
}
export function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Arrays
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
  return chunks;
}
export function uniqueBy<T>(array: T[], key: keyof T): T[] {
  const seen = new Set();
  return array.filter(item => { const val = item[key]; if (seen.has(val)) return false; seen.add(val); return true; });
}
export function groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
  return array.reduce((acc, item) => { const k = String(item[key]); (acc[k] = acc[k] || []).push(item); return acc; }, {} as Record<string, T[]>);
}
export function sortBy<T>(array: T[], key: keyof T, direction: 'asc' | 'desc' = 'asc'): T[] {
  return [...array].sort((a, b) => {
    const aVal = a[key], bVal = b[key];
    if (aVal < bVal) return direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return direction === 'asc' ? 1 : -1;
    return 0;
  });
}

// Trading
export type CandleInterval = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w' | '1M';
export function intervalToMs(interval: CandleInterval): number {
  const map: Record<CandleInterval, number> = {
    '1m': 60000, '5m': 300000, '15m': 900000, '30m': 1800000,
    '1h': 3600000, '4h': 14400000, '1d': 86400000, '1w': 604800000, '1M': 2592000000,
  };
  return map[interval];
}
export function normalizePair(pair: string): string { return pair.toUpperCase().replace(/[-_]/, '/'); }
export function parsePair(pair: string): { base: string; quote: string } {
  const [base, quote] = normalizePair(pair).split('/');
  return { base: base || 'UNKNOWN', quote: quote || 'USD' };
}
export function calculatePositionValue(amount: number, price: number): number { return amount * price; }
export function calculatePositionSize(dollarAmount: number, price: number): number { return dollarAmount / price; }

// Validation
export function isValidEmail(email: string): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
export function isValidPair(pair: string): boolean { return /^[A-Z0-9]{1,10}\/[A-Z0-9]{1,10}$/.test(pair.toUpperCase()); }
export function isValidInterval(interval: string): interval is CandleInterval {
  return ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M'].includes(interval);
}

// Error handling
export function createError(code: string, message: string, details?: any): Error & { code: string; details?: any } {
  const error = new Error(message) as Error & { code: string; details?: any };
  error.code = code;
  error.details = details;
  return error;
}
export function safeJsonParse<T>(str: string, fallback: T): T {
  try { return JSON.parse(str); } catch { return fallback; }
}
