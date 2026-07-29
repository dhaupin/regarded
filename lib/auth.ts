/**
 * Auth Module
 * 
 * JWT tokens, session management, lockout after failed attempts.
 * Emits events: auth:login, auth:logout, auth:failed, auth:locked
 */

import { EventEmitter } from './event';
import type { User, Session, UserRole, UserSettings } from './types';
import { generateToken, hashSHA256, secureCompare } from './encrypt';
import { logAuditEvent } from './audit';

export interface AuthEvents {
  'auth:login': { userId: string; method: string };
  'auth:logout': { userId: string };
  'auth:failed': { identifier: string; reason: string };
  'auth:locked': { identifier: string; lockoutUntil: number };
}

export interface AuthConfig {
  jwtSecret: string;
  jwtExpiryMs: number;
  refreshTokenExpiryMs: number;
  maxAttempts: number;
  lockoutDurationMs: number;
}

export interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
  iat: number;
  exp: number;
}

/**
 * Auth Manager with lockout support
 */
export class AuthManager extends EventEmitter<AuthEvents> {
  private config: AuthConfig;
  private failedAttempts: Map<string, { count: number; lockoutUntil: number }> = new Map();
  
  constructor(config: AuthConfig) {
    super();
    this.config = config;
  }
  
  /**
   * Check if IP is locked out
   */
  isLockedOut(identifier: string): boolean {
    const attempt = this.failedAttempts.get(identifier);
    if (!attempt) return false;
    if (Date.now() > attempt.lockoutUntil) {
      this.failedAttempts.delete(identifier);
      return false;
    }
    return true;
  }
  
  /**
   * Record failed attempt
   */
  recordFailedAttempt(identifier: string): boolean {
    const attempt = this.failedAttempts.get(identifier) || { count: 0, lockoutUntil: 0 };
    attempt.count++;
    
    if (attempt.count >= this.config.maxAttempts) {
      attempt.lockoutUntil = Date.now() + this.config.lockoutDurationMs;
      this.failedAttempts.set(identifier, attempt);
      
      // Emit locked event
      this.emit('auth:locked', { identifier, lockoutUntil: attempt.lockoutUntil });
      
      // Audit log
      logAuditEvent('auth_locked' as any, identifier, {
        attempts: attempt.count,
        lockoutUntil: attempt.lockoutUntil,
      }, 'high').catch(() => {});
      
      return true; // Now locked out
    }
    
    // Emit failed event
    this.emit('auth:failed', { identifier, reason: `Failed attempt ${attempt.count}/${this.config.maxAttempts}` });
    
    // Audit log
    logAuditEvent('auth_failed' as any, identifier, {
      attempts: attempt.count,
      maxAttempts: this.config.maxAttempts,
    }, 'medium').catch(() => {});
    
    this.failedAttempts.set(identifier, attempt);
    return false;
  }
  
  /**
   * Clear failed attempts
   */
  clearFailedAttempts(identifier: string): void {
    this.failedAttempts.delete(identifier);
  }
  
  /**
   * Generate JWT (login)
   */
  async generateJWT(user: User, method: string = 'password'): Promise<string> {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = btoa(JSON.stringify({
      userId: user.id,
      email: user.email,
      role: user.role,
      iat: Date.now(),
      exp: Date.now() + this.config.jwtExpiryMs,
    }));
    const signature = await hashSHA256(`${header}.${payload}.${this.config.jwtSecret}`);
    const token = `${header}.${payload}.${signature}`;
    
    // Emit login event
    this.emit('auth:login', { userId: user.id, method });
    
    // Audit log
    logAuditEvent('user_login' as any, user.id, { method }, 'low').catch(() => {});
    
    return token;
  }
  
  /**
   * Verify JWT
   */
  async verifyJWT(token: string): Promise<JWTPayload | null> {
    try {
      const [header, payloadB64, signature] = token.split('.');
      const payload: JWTPayload = JSON.parse(atob(payloadB64));
      
      if (payload.exp < Date.now()) return null;
      
      const expectedSig = await hashSHA256(`${header}.${payloadB64}.${this.config.jwtSecret}`);
      if (!secureCompare(signature, expectedSig)) return null;
      
      return payload;
    } catch {
      return null;
    }
  }
  
  /**
   * Generate refresh token
   */
  generateRefreshToken(): string {
    return generateToken(32);
  }
  
  /**
   * Create session
   */
  createSession(userId: string): Session {
    return {
      id: generateToken(16),
      user_id: userId,
      refresh_token_hash: '',
      expires_at: Date.now() + this.config.refreshTokenExpiryMs,
      created_at: Date.now(),
      last_active: Date.now(),
    };
  }
  
  /**
   * Logout - emit logout event and audit
   */
  async logout(userId: string): Promise<void> {
    // Clear failed attempts on successful logout
    this.failedAttempts.delete(userId);
    
    // Emit logout event
    this.emit('auth:logout', { userId });
    
    // Audit log
    logAuditEvent('user_logout' as any, userId, {}, 'low').catch(() => {});
  }
}
