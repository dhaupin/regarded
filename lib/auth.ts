/**
 * Auth Module
 * 
 * JWT tokens, session management, lockout after failed attempts.
 */

import type { User, Session, UserRole, UserSettings } from './types';
import { generateToken, hashSHA256, secureCompare } from './encrypt';

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
export class AuthManager {
  private config: AuthConfig;
  private failedAttempts: Map<string, { count: number; lockoutUntil: number }> = new Map();
  
  constructor(config: AuthConfig) {
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
      return true; // Now locked out
    }
    
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
   * Generate JWT
   */
  async generateJWT(user: User): Promise<string> {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = btoa(JSON.stringify({
      userId: user.id,
      email: user.email,
      role: user.role,
      iat: Date.now(),
      exp: Date.now() + this.config.jwtExpiryMs,
    }));
    const signature = await hashSHA256(`${header}.${payload}.${this.config.jwtSecret}`);
    return `${header}.${payload}.${signature}`;
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
}
