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

// ===========================================
// Order Validation Pipeline
// ===========================================

export type ValidationPhase = 'pre' | 'post';
export type ValidationAction = 'allow' | 'block' | 'modify';

export interface ValidationResult {
  valid: boolean;
  action: ValidationAction;
  reason?: string;
  modifiedOrder?: Order;
  metadata?: Record<string, any>;
}

export interface OrderContext {
  order: Order;
  exchange: string;
  connectorName: string;
  availableBalance: number;
  currentPrice: number;
  positionSize: number; // Total position size for this symbol
  dailyTradeCount: number;
  dailyLoss: number;
  portfolioValue: number;
  slippage?: number; // For post-trade validation
  filledPrice?: number; // For post-trade validation
}

export interface ValidationRule {
  id: string;
  name: string;
  description: string;
  phase: ValidationPhase;
  enabled: boolean;
  
  /**
   * Validate the order context
   * @returns ValidationResult with action: allow, block, or modify
   */
  validate(context: OrderContext): ValidationResult | Promise<ValidationResult>;
}

// ===========================================
// Built-in Validation Rules
// ===========================================

/**
 * Max order size validation
 */
export const maxOrderSizeRule: ValidationRule = {
  id: 'max_order_size',
  name: 'Max Order Size',
  description: 'Block orders exceeding max $ value',
  phase: 'pre',
  enabled: true,
  
  validate(context: OrderContext): ValidationResult {
    const orderValue = context.order.amount * (context.order.price ?? context.currentPrice);
    
    if (orderValue > 10000) { // Configurable threshold
      return {
        valid: false,
        action: 'block',
        reason: `Order value $${orderValue.toFixed(2)} exceeds max $10,000`,
      };
    }
    
    return { valid: true, action: 'allow' };
  },
};

/**
 * Min order size validation
 */
export const minOrderSizeRule: ValidationRule = {
  id: 'min_order_size',
  name: 'Min Order Size',
  description: 'Block orders below min $ value to avoid dust',
  phase: 'pre',
  enabled: true,
  
  validate(context: OrderContext): ValidationResult {
    const orderValue = context.order.amount * (context.order.price ?? context.currentPrice);
    
    if (orderValue < 10) {
      return {
        valid: false,
        action: 'block',
        reason: `Order value $${orderValue.toFixed(2)} below min $10`,
      };
    }
    
    return { valid: true, action: 'allow' };
  },
};

/**
 * Balance check validation
 */
export const balanceCheckRule: ValidationRule = {
  id: 'balance_check',
  name: 'Balance Check',
  description: 'Ensure sufficient balance for order',
  phase: 'pre',
  enabled: true,
  
  validate(context: OrderContext): ValidationResult {
    const orderValue = context.order.amount * (context.order.price ?? context.currentPrice);
    const required = orderValue * 1.01; // 1% buffer for fees
    
    if (context.availableBalance < required) {
      return {
        valid: false,
        action: 'block',
        reason: `Insufficient balance: have $${context.availableBalance.toFixed(2)}, need $${required.toFixed(2)}`,
      };
    }
    
    return { valid: true, action: 'allow' };
  },
};

/**
 * Price deviation validation for limit orders
 */
export const priceDeviationRule: ValidationRule = {
  id: 'price_deviation',
  name: 'Price Deviation',
  description: 'Limit orders must be within % of market price',
  phase: 'pre',
  enabled: true,
  
  validate(context: OrderContext): ValidationResult {
    if (context.order.type === 'market') {
      return { valid: true, action: 'allow' };
    }
    
    const limitPrice = context.order.price ?? 0;
    const marketPrice = context.currentPrice;
    
    if (!limitPrice || !marketPrice) {
      return { valid: true, action: 'allow' };
    }
    
    const deviation = Math.abs((limitPrice - marketPrice) / marketPrice);
    const maxDeviation = 0.05; // 5% max deviation
    
    if (deviation > maxDeviation) {
      return {
        valid: false,
        action: 'block',
        reason: `Limit price ${(deviation * 100).toFixed(1)}% from market (max 5%)`,
      };
    }
    
    return { valid: true, action: 'allow' };
  },
};

/**
 * Max position size validation
 */
export const maxPositionSizeRule: ValidationRule = {
  id: 'max_position_size',
  name: 'Max Position Size',
  description: 'Max $ exposed per symbol',
  phase: 'pre',
  enabled: true,
  
  validate(context: OrderContext): ValidationResult {
    const orderValue = context.order.amount * context.currentPrice;
    const totalPosition = context.positionSize + orderValue;
    const maxPosition = 50000; // $50k max per symbol
    
    if (totalPosition > maxPosition) {
      return {
        valid: false,
        action: 'block',
        reason: `Position $${totalPosition.toFixed(2)} would exceed max $${maxPosition}`,
      };
    }
    
    return { valid: true, action: 'allow' };
  },
};

/**
 * Daily trade count limit
 */
export const maxDailyTradesRule: ValidationRule = {
  id: 'max_daily_trades',
  name: 'Max Daily Trades',
  description: 'Rate limit trades per day',
  phase: 'pre',
  enabled: true,
  
  validate(context: OrderContext): ValidationResult {
    const maxTrades = 50; // Max 50 trades per day
    
    if (context.dailyTradeCount >= maxTrades) {
      return {
        valid: false,
        action: 'block',
        reason: `Daily trade limit reached (${maxTrades})`,
      };
    }
    
    return { valid: true, action: 'allow' };
  },
};

/**
 * Daily loss limit - stop trading if losing too much
 */
export const maxDailyLossRule: ValidationRule = {
  id: 'max_daily_loss',
  name: 'Max Daily Loss',
  description: 'Stop trading if daily loss threshold hit',
  phase: 'pre',
  enabled: true,
  
  validate(context: OrderContext): ValidationResult {
    const maxLoss = 1000; // $1000 max daily loss
    
    if (context.dailyLoss < -maxLoss) {
      return {
        valid: false,
        action: 'block',
        reason: `Daily loss $${Math.abs(context.dailyLoss).toFixed(2)} exceeds $${maxLoss}`,
      };
    }
    
    return { valid: true, action: 'allow' };
  },
};

/**
 * Stop-loss required for large orders
 */
export const stopLossRequiredRule: ValidationRule = {
  id: 'stop_loss_required',
  name: 'Stop Loss Required',
  description: 'Large orders must have stop-loss',
  phase: 'pre',
  enabled: true,
  
  validate(context: OrderContext): ValidationResult {
    const orderValue = context.order.amount * context.currentPrice;
    const threshold = 5000; // $5k threshold
    
    if (orderValue > threshold && !context.order.stop_price) {
      return {
        valid: false,
        action: 'block',
        reason: `Orders > $${threshold} require stop-loss`,
      };
    }
    
    return { valid: true, action: 'allow' };
  },
};

/**
 * Slippage validation - post-trade rule
 */
export const slippageCheckRule: ValidationRule = {
  id: 'slippage_check',
  name: 'Slippage Check',
  description: 'Alert if fill price differs significantly from expected',
  phase: 'post',
  enabled: true,
  
  validate(context: OrderContext): ValidationResult {
    if (!context.slippage || !context.filledPrice) {
      return { valid: true, action: 'allow' };
    }
    
    const maxSlippage = 0.02; // 2% max slippage
    const slippagePct = Math.abs(context.slippage);
    
    if (slippagePct > maxSlippage) {
      return {
        valid: false,
        action: 'block',
        reason: `Slippage ${(slippagePct * 100).toFixed(1)}% exceeds max ${(maxSlippage * 100)}%`,
        metadata: { slippage: context.slippage, filledPrice: context.filledPrice },
      };
    }
    
    return { valid: true, action: 'allow' };
  },
};

/**
 * Exposure limit - post-trade
 */
export const exposureLimitRule: ValidationRule = {
  id: 'exposure_limit',
  name: 'Exposure Limit',
  description: 'Max $ exposed per symbol across all positions',
  phase: 'post',
  enabled: true,
  
  validate(context: OrderContext): ValidationResult {
    const maxExposure = 100000; // $100k max exposure
    
    if (context.positionSize > maxExposure) {
      return {
        valid: false,
        action: 'block',
        reason: `Exposure $${context.positionSize.toFixed(2)} exceeds $${maxExposure}`,
      };
    }
    
    return { valid: true, action: 'allow' };
  },
};

// Default pre-trade rules
export const defaultPreRules: ValidationRule[] = [
  maxOrderSizeRule,
  minOrderSizeRule,
  balanceCheckRule,
  priceDeviationRule,
  maxPositionSizeRule,
  maxDailyTradesRule,
  maxDailyLossRule,
  stopLossRequiredRule,
];

// Default post-trade rules
export const defaultPostRules: ValidationRule[] = [
  slippageCheckRule,
  exposureLimitRule,
];

// ===========================================
// Rules Validator Pipeline
// ===========================================

export interface RulesValidatorConfig {
  globalPreRules?: ValidationRule[];
  globalPostRules?: ValidationRule[];
  connectorRules?: ValidationRule[];
}

export class RulesValidator {
  private config: RulesValidatorConfig;
  
  constructor(config: RulesValidatorConfig = {}) {
    this.config = {
      globalPreRules: config.globalPreRules ?? defaultPreRules,
      globalPostRules: config.globalPostRules ?? defaultPostRules,
      connectorRules: config.connectorRules ?? [],
    };
  }
  
  /**
   * Run pre-trade validation pipeline
   * Global Pre → Connector → Exchange (passthrough)
   */
  async validatePreTrade(context: OrderContext): Promise<ValidationResult> {
    // 1. Run global pre-rules
    for (const rule of this.config.globalPreRules ?? []) {
      if (!rule.enabled) continue;
      
      const result = await rule.validate(context);
      if (!result.valid || result.action === 'block') {
        return result;
      }
    }
    
    // 2. Run connector-specific rules
    for (const rule of this.config.connectorRules ?? []) {
      if (!rule.enabled || rule.phase !== 'pre') continue;
      
      const result = await rule.validate(context);
      if (!result.valid || result.action === 'block') {
        return result;
      }
    }
    
    // 3. Allow through to exchange (passthrough)
    return { valid: true, action: 'allow' };
  }
  
  /**
   * Run post-trade validation pipeline
   * Exchange result → Connector → Global Post
   */
  async validatePostTrade(context: OrderContext): Promise<ValidationResult> {
    // 1. Run connector-specific post-rules (if any)
    for (const rule of this.config.connectorRules ?? []) {
      if (!rule.enabled || rule.phase !== 'post') continue;
      
      const result = await rule.validate(context);
      if (!result.valid || result.action === 'block') {
        return result;
      }
    }
    
    // 2. Run global post-rules
    for (const rule of this.config.globalPostRules ?? []) {
      if (!rule.enabled) continue;
      
      const result = await rule.validate(context);
      if (!result.valid || result.action === 'block') {
        return result;
      }
    }
    
    return { valid: true, action: 'allow' };
  }
  
  /**
   * Full pipeline: pre-trade → (user places order) → post-trade
   */
  async validateFullPipeline(
    preContext: OrderContext,
    postContext: OrderContext
  ): Promise<{ preResult: ValidationResult; postResult: ValidationResult }> {
    const preResult = await this.validatePreTrade(preContext);
    
    if (!preResult.valid) {
      return { preResult, postResult: { valid: false, action: 'block', reason: 'Pre-trade failed' } };
    }
    
    const postResult = await this.validatePostTrade(postContext);
    
    return { preResult, postResult };
  }
  
  /**
   * Add a connector rule
   */
  addConnectorRule(rule: ValidationRule): void {
    this.config.connectorRules?.push(rule);
  }
  
  /**
   * Enable/disable a rule by ID
   */
  setRuleEnabled(ruleId: string, enabled: boolean): void {
    // Check global pre-rules
    for (const rule of this.config.globalPreRules ?? []) {
      if (rule.id === ruleId) {
        rule.enabled = enabled;
        return;
      }
    }
    
    // Check global post-rules
    for (const rule of this.config.globalPostRules ?? []) {
      if (rule.id === ruleId) {
        rule.enabled = enabled;
        return;
      }
    }
    
    // Check connector rules
    for (const rule of this.config.connectorRules ?? []) {
      if (rule.id === ruleId) {
        rule.enabled = enabled;
        return;
      }
    }
  }
}

export function createRulesValidator(config?: RulesValidatorConfig): RulesValidator {
  return new RulesValidator(config);
}
