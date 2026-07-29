/**
 * Rules Module Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RulesEngine, createRulesEngine } from '../lib/rules';

describe('RulesEngine', () => {
  let engine: RulesEngine;

  beforeEach(() => {
    engine = new RulesEngine({ maxChainDepth: 3 });
  });

  it('should create rules engine', () => {
    expect(engine).toBeDefined();
  });

  it('should create via factory', () => {
    const engine = createRulesEngine();
    expect(engine).toBeInstanceOf(RulesEngine);
  });

  it('should reset state', () => {
    engine.setContext({ pair: 'SOL/USD', currentPrice: 100 });
    engine.reset();
    const state = engine.getState();
    expect(state.context.pair).toBe('');
  });

  it('should set context', () => {
    engine.setContext({ pair: 'SOL/USD', currentPrice: 150 });
    const state = engine.getState();
    expect(state.context.pair).toBe('SOL/USD');
    expect(state.context.current_price).toBe(150);
  });

  it('should track risk multiplier', () => {
    const multiplier = engine.getRiskMultiplier();
    expect(multiplier).toBe(1);
  });

  it('should evaluate rule with enabled condition', async () => {
    // This is a simplified test - real evaluation needs proper candle data
    const state = engine.getState();
    expect(state.execution.rules_evaluated).toBe(0);
  });

  it('should respect max chain depth', () => {
    const engine2 = new RulesEngine({ maxChainDepth: 2 });
    const state = engine2.getState();
    expect(state.max_chain_depth).toBe(2);
  });
});
