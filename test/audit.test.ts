/**
 * Audit Module Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  initAuditLogger,
  logAuditEvent,
  logLogin,
  logLogout,
  logApiKeyAdded,
  logApiKeyRemoved,
  logTradeExecuted,
  logConfigChanged,
  logRuleCreated,
  logRuleTriggered,
  logStrategyStarted,
  logStrategyStopped,
  getUserAuditEvents,
  AuditEventType,
  RiskLevel,
} from '../lib/audit';

// Mock KVNamespace for testing
const mockKV = {
  get: async () => null,
  put: async () => {},
  list: async () => ({ keys: [] }),
  delete: async () => {},
  getWithMetadata: async () => ({ value: null, metadata: null }),
};

describe('Audit Logger', () => {
  beforeEach(() => {
    initAuditLogger({
      kvNamespace: mockKV as any,
      environment: 'development',
    });
  });

  it('should initialize audit logger', () => {
    expect(() => {
      initAuditLogger({
        kvNamespace: mockKV as any,
        environment: 'production',
      });
    }).not.toThrow();
  });
});

describe('Audit Events', () => {
  beforeEach(() => {
    initAuditLogger({
      kvNamespace: mockKV as any,
      environment: 'development',
    });
  });

  it('should log generic audit event', async () => {
    const event = await logAuditEvent(
      'user_login',
      'user-123',
      { method: 'password' },
      'medium'
    );
    expect(event.id).toBeDefined();
    expect(event.event_type).toBe('user_login');
    expect(event.user_id).toBe('user-123');
    expect(event.risk_level).toBe('medium');
  });

  it('should log login event', async () => {
    const event = await logLogin('user-123', { ip: '127.0.0.1' });
    expect(event.event_type).toBe('login');
    expect(event.user_id).toBe('user-123');
  });

  it('should log logout event', async () => {
    const event = await logLogout('user-123');
    expect(event.event_type).toBe('logout');
    expect(event.user_id).toBe('user-123');
  });

  it('should log API key added', async () => {
    const event = await logApiKeyAdded('user-123', 'key-name');
    expect(event.event_type).toBe('api_key_added');
    expect(event.user_id).toBe('user-123');
  });

  it('should log API key removed', async () => {
    const event = await logApiKeyRemoved('user-123', 'key-name');
    expect(event.event_type).toBe('api_key_removed');
    expect(event.user_id).toBe('user-123');
  });

  it('should log trade executed', async () => {
    const event = await logTradeExecuted('user-123', {
      symbol: 'BTC/USD',
      side: 'buy',
      quantity: 1,
      price: 50000,
    });
    expect(event.event_type).toBe('trade_executed');
    expect(event.user_id).toBe('user-123');
  });

  it('should log config changed', async () => {
    const event = await logConfigChanged('user-123', 'max_position_size', {
      old: 1000,
      new: 2000,
    });
    expect(event.event_type).toBe('config_changed');
    expect(event.user_id).toBe('user-123');
  });

  it('should log rule created', async () => {
    const event = await logRuleCreated('user-123', 'stop-loss-rule', {
      ruleType: 'stop_loss',
    });
    expect(event.event_type).toBe('rule_created');
    expect(event.user_id).toBe('user-123');
  });

  it('should log rule triggered', async () => {
    const event = await logRuleTriggered('user-123', 'stop-loss-rule', {
      reason: 'price_drop',
    });
    expect(event.event_type).toBe('rule_triggered');
    expect(event.user_id).toBe('user-123');
  });

  it('should log strategy started', async () => {
    const event = await logStrategyStarted('user-123', 'ma-cross', {
      symbol: 'BTC/USD',
    });
    expect(event.event_type).toBe('strategy_started');
    expect(event.user_id).toBe('user-123');
  });

  it('should log strategy stopped', async () => {
    const event = await logStrategyStopped('user-123', 'ma-cross');
    expect(event.event_type).toBe('strategy_stopped');
    expect(event.user_id).toBe('user-123');
  });
});

describe('Get Audit Events', () => {
  it('should return empty array when not initialized', async () => {
    // Reset the audit config
    (global as any).auditConfig = null;
    
    const events = await getUserAuditEvents('user-123', 10);
    expect(Array.isArray(events)).toBe(true);
  });
});
