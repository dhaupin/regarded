/**
 * WAF - Web Application Firewall / Security Validation
 * 
 * Request validation, input sanitization, IP-based rate limiting.
 * Inspired by Vant's security module.
 */

import { LRUCache } from './cache';
import { errors } from './error';
import { EventEmitter } from './event';

export interface WAFEvents {
  'waf:blocked': { ip: string; reason: string; path: string };
  'waf:rate-limited': { ip: string; current: number; limit: number };
  'waf:banned': { ip: string; reason: string; duration: number };
  'waf:auth-failed': { ip: string; username?: string; attempts: number };
  'waf:validated': { ip: string; path: string; allowed: boolean };
};

export interface WAFConfig {
  /** Max requests per window per IP */
  maxRequestsPerWindow: number;
  /** Window duration in ms */
  windowMs: number;
  /** Max failed auth attempts before ban */
  maxAuthAttempts: number;
  /** Ban duration in ms */
  banDurationMs: number;
  /** Max request body size in bytes */
  maxBodySize: number;
  /** Allowed IP ranges (CIDR notation) */
  allowedIps: string[];
  /** Blocked IP ranges */
  blockedIps: string[];
  /** Enable request ID tracking */
  trackRequestIds: boolean;
}

export interface RequestContext {
  ip: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: any;
  requestId?: string;
  timestamp: number;
}

export interface ValidationResult {
  allowed: boolean;
  reason?: string;
  requestId?: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * WAF - Web Application Firewall
 */
export class WAF extends EventEmitter<WAFEvents> {
  private config: WAFConfig;
  private requestCounts = new LRUCache<number>(10000, 60000);
  private authFailures = new LRUCache<number>(10000, 300000);
  private bannedIps = new LRUCache<boolean>(1000, 0);
  private requestIds = new LRUCache<string>(1000, 300000);
  
  constructor(config: Partial<WAFConfig> = {}) {
    super();
    this.config = {
      maxRequestsPerWindow: config.maxRequestsPerWindow ?? 100,
      windowMs: config.windowMs ?? 60000,
      maxAuthAttempts: config.maxAuthAttempts ?? 5,
      banDurationMs: config.banDurationMs ?? 300000,
      maxBodySize: config.maxBodySize ?? 102400,
      allowedIps: config.allowedIps ?? [],
      blockedIps: config.blockedIps ?? [],
      trackRequestIds: config.trackRequestIds ?? true,
    };
  }
  
  /**
   * Generate request ID
   */
  generateRequestId(): string {
    const id = crypto.randomUUID();
    return id;
  }
  
  /**
   * Get client IP from request
   */
  getClientIp(ctx: RequestContext): string {
    // Check Cloudflare header first
    if (ctx.headers['cf-connecting-ip']) {
      return ctx.headers['cf-connecting-ip'];
    }
    // Check standard headers
    return ctx.headers['x-forwarded-for']?.split(',')[0]?.trim() 
      || ctx.headers['x-real-ip'] 
      || ctx.ip 
      || 'unknown';
  }
  
  /**
   * Check if IP is banned
   */
  isIpBanned(ip: string): boolean {
    return this.bannedIps.has(ip);
  }
  
  /**
   * Check if IP is blocked
   */
  isIpBlocked(ip: string): boolean {
    for (const blocked of this.config.blockedIps) {
      if (ip === blocked || ip.startsWith(blocked.split('/')[0])) {
        return true;
      }
    }
    return false;
  }
  
  /**
   * Check if IP is allowed
   */
  isIpAllowed(ip: string): boolean {
    if (this.config.allowedIps.length === 0) return true;
    
    for (const allowed of this.config.allowedIps) {
      if (ip === allowed || ip.startsWith(allowed.split('/')[0])) {
        return true;
      }
    }
    return false;
  }
  
  /**
   * Record request for rate limiting
   */
  recordRequest(ip: string): void {
    const count = this.requestCounts.get(ip) || 0;
    this.requestCounts.set(ip, count + 1, this.config.windowMs);
  }
  
  /**
   * Record auth failure
   */
  recordAuthFailure(ip: string): void {
    const count = this.authFailures.get(ip) || 0;
    this.requestCounts.set(ip, count + 1, this.config.banDurationMs);
    
    if (count + 1 >= this.config.maxAuthAttempts) {
      this.bannedIps.set(ip, true, this.config.banDurationMs);
    }
  }
  
  /**
   * Get request count for IP
   */
  getRequestCount(ip: string): number {
    return this.requestCounts.get(ip) || 0;
  }
  
  /**
   * Get auth failure count for IP
   */
  getAuthFailureCount(ip: string): number {
    return this.authFailures.get(ip) || 0;
  }
  
  /**
   * Validate request
   */
  validate(ctx: RequestContext): ValidationResult {
    const ip = this.getClientIp(ctx);
    const requestId = this.config.trackRequestIds ? this.generateRequestId() : undefined;
    
    // Check if banned
    if (this.isIpBanned(ip)) {
      this.emit('waf:blocked', { ip, reason: 'IP banned due to too many failed attempts', path: ctx.path });
      this.emit('waf:banned', { ip, reason: 'too many failed attempts', duration: this.config.banDurationMs });
      return {
        allowed: false,
        reason: 'IP banned due to too many failed attempts',
        requestId,
        riskLevel: 'critical',
      };
    }
    
    // Check if blocked
    if (this.isIpBlocked(ip)) {
      this.emit('waf:blocked', { ip, reason: 'IP is blocked', path: ctx.path });
      return {
        allowed: false,
        reason: 'IP is blocked',
        requestId,
        riskLevel: 'critical',
      };
    }
    
    // Check if allowed (whitelist)
    if (!this.isIpAllowed(ip)) {
      this.emit('waf:blocked', { ip, reason: 'IP not in allowed list', path: ctx.path });
      return {
        allowed: false,
        reason: 'IP not in allowed list',
        requestId,
        riskLevel: 'high',
      };
    }
    
    // Rate limiting
    const count = this.getRequestCount(ip);
    if (count >= this.config.maxRequestsPerWindow) {
      this.emit('waf:rate-limited', { ip, current: count, limit: this.config.maxRequestsPerWindow });
      this.emit('waf:blocked', { ip, reason: 'Rate limit exceeded', path: ctx.path });
      return {
        allowed: false,
        reason: 'Rate limit exceeded',
        requestId,
        riskLevel: 'medium',
      };
    }
    
    this.recordRequest(ip);
    
    // Check request size
    if (ctx.body && JSON.stringify(ctx.body).length > this.config.maxBodySize) {
      this.emit('waf:blocked', { ip, reason: 'Request body too large', path: ctx.path });
      return {
        allowed: false,
        reason: 'Request body too large',
        requestId,
        riskLevel: 'medium',
      };
    }
    
    this.emit('waf:validated', { ip, path: ctx.path, allowed: true });
    
    return {
      allowed: true,
      requestId,
      riskLevel: 'low',
    };
  }
  
  /**
   * Validate input string
   */
  sanitizeInput(input: string): string {
    // Remove potential XSS vectors
    return input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .trim();
  }
  
  /**
   * Validate email
   */
  validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
  
  /**
   * Validate URL
   */
  validateUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  }
  
  /**
   * Get config
   */
  getConfig(): WAFConfig {
    return { ...this.config };
  }
  
  /**
   * Reset all counters (for testing)
   */
  reset(): void {
    this.requestCounts.clear();
    this.authFailures.clear();
    this.bannedIps.clear();
    this.requestIds.clear();
  }
}

/**
 * Create WAF instance
 */
export function createWAF(config?: Partial<WAFConfig>): WAF {
  return new WAF(config);
}
