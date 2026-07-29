/**
 * Rules Engine
 * 
 * Evaluate conditions, execute triggers, manage rule chaining.
 */

import type { Rule, Condition, Trigger, RulesEngineState, EngineResult, Candle, CandleInterval, Order } from './types';
import { calculateIndicator } from './indicators';
import { detectPattern } from './patterns';

export interface RulesEngineConfig {
  maxChainDepth: number;
}

export interface ConditionContext {
  pair: string;
  timeframes: CandleInterval[];
  candles: Map<CandleInterval, Candle[]>;
  currentPrice: number;
}

/**
 * Rules Engine
 */
export class RulesEngine {
  private config: RulesEngineConfig;
  private state: RulesEngineState;
  private triggeredRules = new Set<string>();
  
  constructor(config: Partial<RulesEngineConfig> = {}) {
    this.config = { maxChainDepth: config.maxChainDepth ?? 5 };
    this.state = this.createInitialState();
  }
  
  private createInitialState(): RulesEngineState {
    return {
      context: { pair: '', current_price: 0, current_timeframe: '5m', balances: new Map(), open_positions: [] },
      execution: { rules_evaluated: 0, rules_triggered: 0, trades_executed: 0, errors: [] },
      risk: { current_multiplier: 1, session_risk: 0, positions_at_risk: 0 },
      chain_depth: 0,
      max_chain_depth: this.config.maxChainDepth,
      triggered_rules: new Set(),
    };
  }
  
  reset(): void {
    this.state = this.createInitialState();
    this.triggeredRules.clear();
  }
  
  setContext(context: Partial<ConditionContext>): void {
    // Convert camelCase to snake_case
    const converted: any = {};
    for (const [key, value] of Object.entries(context)) {
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      converted[snakeKey] = value;
    }
    this.state.context = { ...this.state.context, ...converted };
  }
  
  /**
   * Evaluate a single condition
   */
  async evaluateCondition(condition: Condition, ctx: ConditionContext): Promise<boolean> {
    if (!condition.enabled) return false;
    
    const candles = ctx.candles.get(ctx.timeframes[0]);
    if (!candles || candles.length === 0) return false;
    
    const result = this.evaluateSingleCondition(condition.condition, candles);
    return condition.logic === 'and' ? result : result;
  }
  
  private evaluateSingleCondition(condition: any, candles: Candle[]): boolean {
    switch (condition.type) {
      case 'indicator':
        if (!condition.indicator) return false;
        const result = calculateIndicator(condition.indicator.name, candles, condition.indicator.params);
        if (!result) return false;
        const value = condition.indicator.field ? (result.metadata?.[condition.indicator.field] ?? result.value) : result.value;
        return this.compareValues(value, condition.operator, condition.value);
      
      case 'pattern':
        if (!condition.pattern) return false;
        const patternResult = detectPattern(condition.pattern.type, candles, {
          direction: condition.pattern.direction,
          count: condition.pattern.count,
          min_height: condition.pattern.min_height,
          lookback: condition.pattern.lookback,
        });
        return patternResult ? patternResult.detected : false;
      
      case 'price':
        return this.compareValues(ctx.currentPrice, condition.operator, condition.value);
      
      default:
        return false;
    }
  }
  
  private compareValues(actual: any, operator: string, expected: any): boolean {
    const a = typeof actual === 'number' ? actual : parseFloat(actual);
    const b = typeof expected === 'number' ? expected : parseFloat(expected);
    if (isNaN(a) || isNaN(b)) return false;
    
    switch (operator) {
      case 'gt': return a > b;
      case 'lt': return a < b;
      case 'eq': return a === b;
      case 'gte': return a >= b;
      case 'lte': return a <= b;
      case 'between': return Array.isArray(expected) ? a >= expected[0] && a <= expected[1] : false;
      default: return false;
    }
  }
  
  /**
   * Evaluate a rule
   */
  async evaluateRule(rule: Rule, ctx: ConditionContext, triggerFn?: (trigger: Trigger) => Promise<void>): Promise<EngineResult> {
    if (this.triggeredRules.has(rule.id)) {
      return { triggered: false, actions_executed: 0, trades: [], errors: ['Already triggered'] };
    }
    
    this.state.execution.rules_evaluated++;
    
    const conditionsMet = await Promise.all(rule.conditions.map(c => this.evaluateCondition(c, ctx)));
    const met = rule.condition_logic === 'and' ? conditionsMet.every(r => r) : conditionsMet.some(r => r);
    
    if (!met) return { triggered: false, actions_executed: 0, trades: [], errors: [] };
    
    // Execute triggers
    let actionsExecuted = 0;
    if (triggerFn) {
      for (const trigger of rule.triggers) {
        await triggerFn(trigger);
        actionsExecuted++;
      }
    }
    
    this.triggeredRules.add(rule.id);
    this.state.execution.rules_triggered++;
    
    return { triggered: true, actions_executed: actionsExecuted, trades: [], errors: [] };
  }
  
  getState(): RulesEngineState { return this.state; }
  getRiskMultiplier(): number { return this.state.risk.current_multiplier; }
}

export function createRulesEngine(config?: Partial<RulesEngineConfig>): RulesEngine {
  return new RulesEngine(config);
}
