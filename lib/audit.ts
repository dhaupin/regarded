/**
 * Audit Logging Module
 * 
 * Provides security audit logging for all security-relevant events.
 */

import type { AuditEvent, AuditEventType, RiskLevel } from './types';
import { generateToken } from './encrypt';

export { AuditEvent, AuditEventType, RiskLevel };

// ============================================================================
// Audit Logger
// ============================================================================

export interface AuditLoggerConfig {
  kvNamespace: any; // KVNamespace from @cloudflare/workers-types
  environment: 'development' | 'production';
}

let auditConfig: AuditLoggerConfig | null = null;

/**
 * Initialize the audit logger
 */
export function initAuditLogger(config: AuditLoggerConfig): void {
  auditConfig = config;
}

/**
 * Create an audit event
 */
export async function logAuditEvent(
  eventType: AuditEventType,
  userId: string,
  details: Record<string, any>,
  riskLevel: RiskLevel = 'low',
  options?: {
    ipAddress?: string;
    userAgent?: string;
  }
): Promise<AuditEvent> {
  if (!auditConfig) {
    console.warn('Audit logger not initialized');
  }

  const event: AuditEvent = {
    id: generateToken(16),
    timestamp: Date.now(),
    event_type: eventType,
    user_id: userId,
    ip_address: options?.ipAddress,
    user_agent: options?.userAgent,
    details: sanitizeDetails(details),
    risk_level: riskLevel,
  };

  // Store in KV for fast access
  if (auditConfig?.kvNamespace) {
    try {
      await auditConfig.kvNamespace.put(
        `audit:${event.id}`,
        JSON.stringify(event),
        { expirationTtl: 90 * 24 * 60 * 60 } // 90 days retention
      );
      
      // Also add to user's audit index
      const userIndexKey = `audit:user:${userId}`;
      const existing = await auditConfig.kvNamespace.get(userIndexKey);
      const userEvents = existing ? JSON.parse(existing) : [];
      userEvents.unshift(event.id);
      // Keep last 1000 events per user
      await auditConfig.kvNamespace.put(
        userIndexKey,
        JSON.stringify(userEvents.slice(0, 1000)),
        { expirationTtl: 90 * 24 * 60 * 60 }
      );
    } catch (error) {
      console.error('Failed to log audit event:', error);
    }
  }

  // Log high-risk events to console in development
  if (auditConfig?.environment === 'development' || riskLevel === 'high') {
    console.log(`[AUDIT] ${eventType} by ${userId}:`, event.details);
  }

  return event;
}

// ============================================================================
// Predefined Audit Log Helpers
// ============================================================================

/**
 * Log a login event
 */
export async function logLogin(
  userId: string,
  method: string,
  options?: { ipAddress?: string; userAgent?: string }
): Promise<AuditEvent> {
  return logAuditEvent('login', userId, { method }, 'low', options);
}

/**
 * Log a logout event
 */
export async function logLogout(
  userId: string,
  options?: { ipAddress?: string; userAgent?: string }
): Promise<AuditEvent> {
  return logAuditEvent('logout', userId, {}, 'low', options);
}

/**
 * Log API key addition
 */
export async function logApiKeyAdded(
  userId: string,
  exchange: string,
  label: string,
  options?: { ipAddress?: string; userAgent?: string }
): Promise<AuditEvent> {
  return logAuditEvent(
    'api_key_added',
    userId,
    { exchange, label, sensitive: false },
    'high',
    options
  );
}

/**
 * Log API key removal
 */
export async function logApiKeyRemoved(
  userId: string,
  exchange: string,
  label: string,
  options?: { ipAddress?: string; userAgent?: string }
): Promise<AuditEvent> {
  return logAuditEvent(
    'api_key_removed',
    userId,
    { exchange, label, sensitive: false },
    'high',
    options
  );
}

/**
 * Log trade execution
 */
export async function logTradeExecuted(
  userId: string,
  trade: {
    pair: string;
    side: string;
    amount: number;
    price: number;
    mode: string;
  },
  options?: { ipAddress?: string; userAgent?: string }
): Promise<AuditEvent> {
  return logAuditEvent(
    'trade_executed',
    userId,
    trade,
    trade.mode === 'live' ? 'high' : 'medium',
    options
  );
}

/**
 * Log config change
 */
export async function logConfigChanged(
  userId: string,
  configType: string,
  changes: Record<string, any>,
  options?: { ipAddress?: string; userAgent?: string }
): Promise<AuditEvent> {
  return logAuditEvent(
    'config_changed',
    userId,
    { config_type: configType, changes },
    'medium',
    options
  );
}

/**
 * Log rule creation
 */
export async function logRuleCreated(
  userId: string,
  ruleName: string,
  ruleId: string,
  options?: { ipAddress?: string; userAgent?: string }
): Promise<AuditEvent> {
  return logAuditEvent(
    'rule_created',
    userId,
    { rule_name: ruleName, rule_id: ruleId },
    'medium',
    options
  );
}

/**
 * Log rule triggered
 */
export async function logRuleTriggered(
  userId: string,
  ruleId: string,
  ruleName: string,
  triggers: string[],
  options?: { ipAddress?: string; userAgent?: string }
): Promise<AuditEvent> {
  return logAuditEvent(
    'rule_triggered',
    userId,
    { rule_id: ruleId, rule_name: ruleName, triggers_executed: triggers },
    'medium',
    options
  );
}

/**
 * Log strategy started
 */
export async function logStrategyStarted(
  userId: string,
  strategyId: string,
  strategyName: string,
  options?: { ipAddress?: string; userAgent?: string }
): Promise<AuditEvent> {
  return logAuditEvent(
    'strategy_started',
    userId,
    { strategy_id: strategyId, strategy_name: strategyName },
    'medium',
    options
  );
}

/**
 * Log strategy stopped
 */
export async function logStrategyStopped(
  userId: string,
  strategyId: string,
  strategyName: string,
  options?: { ipAddress?: string; userAgent?: string }
): Promise<AuditEvent> {
  return logAuditEvent(
    'strategy_stopped',
    userId,
    { strategy_id: strategyId, strategy_name: strategyName },
    'low',
    options
  );
}

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Get audit events for a user
 */
export async function getUserAuditEvents(
  userId: string,
  limit: number = 100
): Promise<AuditEvent[]> {
  if (!auditConfig?.kvNamespace) {
    return [];
  }

  try {
    const userIndexKey = `audit:user:${userId}`;
    const existing = await auditConfig.kvNamespace.get(userIndexKey);
    if (!existing) return [];

    const eventIds: string[] = JSON.parse(existing);
    const events: AuditEvent[] = [];

    for (const id of eventIds.slice(0, limit)) {
      const eventData = await auditConfig.kvNamespace.get(`audit:${id}`);
      if (eventData) {
        events.push(JSON.parse(eventData));
      }
    }

    return events;
  } catch (error) {
    console.error('Failed to get user audit events:', error);
    return [];
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Sanitize details to remove sensitive information
 */
function sanitizeDetails(details: Record<string, any>): Record<string, any> {
  const sanitized = { ...details };
  const sensitiveKeys = ['password', 'secret', 'token', 'key', 'api_key', 'private_key'];
  
  for (const key of Object.keys(sanitized)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
      sanitized[key] = '[REDACTED]';
    }
  }
  
  return sanitized;
}
