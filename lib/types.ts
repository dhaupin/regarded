/**
 * Core TypeScript types for Regarded
 * 
 * These types are shared across the entire codebase - frontend, backend, workers.
 * Import from this file to ensure type consistency everywhere.
 */

// ============================================================================
// User & Auth Types
// ============================================================================

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  created_at: number;
  updated_at: number;
  settings: UserSettings;
}

export type UserRole = 'admin' | 'trader' | 'viewer';

export interface UserSettings {
  theme: 'dark' | 'light';
  timezone: string;
  notifications: NotificationSettings;
  default_exchange?: string;
  default_pair?: string;
}

export interface NotificationSettings {
  telegram?: string;
  discord?: string;
  email?: boolean;
  trade_executed: boolean;
  rule_triggered: boolean;
  position_closed: boolean;
  error_alerts: boolean;
}

export interface Session {
  id: string;
  user_id: string;
  refresh_token_hash: string;
  expires_at: number;
  created_at: number;
  last_active: number;
  ip_address?: string;
  user_agent?: string;
}

// ============================================================================
// Exchange & Trading Types
// ============================================================================

export interface ExchangeCredentials {
  id: string;
  user_id: string;
  exchange: string;
  label?: string;
  created_at: number;
  updated_at: number;
}

export interface Balance {
  asset: string;
  free: number;
  locked: number;
  total: number;
}

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type CandleInterval = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w' | '1M';

export interface Order {
  id?: string;
  pair: string;
  side: OrderSide;
  type: OrderType;
  amount: number;
  price?: number;
  stop_price?: number;
  created_at?: number;
}

export type OrderSide = 'buy' | 'sell';
export type OrderType = 'market' | 'limit' | 'stop_loss' | 'take_profit';
export type OrderStatus = 'pending' | 'filled' | 'partially_filled' | 'cancelled' | 'rejected';

export interface OrderResult {
  id: string;
  pair: string;
  side: OrderSide;
  type: OrderType;
  amount: number;
  filled_amount: number;
  price: number;
  avg_price: number;
  fee: number;
  status: OrderStatus;
  created_at: number;
  filled_at?: number;
}

export interface Position {
  id: string;
  user_id: string;
  strategy_id?: string;
  pair: string;
  side: OrderSide;
  entry_price: number;
  amount: number;
  current_price?: number;
  unrealized_pnl?: number;
  realized_pnl?: number;
  stop_loss?: number;
  take_profit?: number;
  opened_at: number;
  closed_at?: number;
}

export interface Trade {
  id: string;
  user_id: string;
  strategy_id?: string;
  rule_id?: string;
  pair: string;
  side: OrderSide;
  type: OrderType;
  amount: number;
  price: number;
  fee: number;
  status: OrderStatus;
  mode: TradingMode;
  order_id?: string;
  executed_at: number;
  created_at: number;
}

export type TradingMode = 'paper' | 'live';

// ============================================================================
// Strategy & Rule Types
// ============================================================================

export interface Strategy {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  pairs: string[];
  intervals: CandleInterval[];
  rules: string[];
  position_sizing: PositionSizing;
  risk_management: RiskManagement;
  mode: TradingMode;
  enabled: boolean;
  created_at: number;
  updated_at: number;
}

export interface PositionSizing {
  type: 'fixed' | 'percent' | 'kelly' | 'risk_based';
  value: number;
  max_position_size?: number;
}

export interface RiskManagement {
  max_position_size: number;
  stop_loss_percent: number;
  take_profit_percent: number;
  max_daily_trades: number;
  max_open_positions: number;
  max_daily_loss: number;
}

// ============================================================================
// Indicator Types
// ============================================================================

export interface Indicator {
  name: string;
  version: string;
  params: Record<string, number>;
  calculate(candles: Candle[]): IndicatorResult;
  validateParams(params: Record<string, number>): boolean;
}

export interface IndicatorResult {
  value: number | number[];
  signal?: IndicatorSignal;
  metadata?: Record<string, any>;
  history?: number[];
}

export type IndicatorSignal = 'buy' | 'sell' | 'neutral';

export interface MultiTimeframeIndicators {
  [interval: string]: IndicatorResult;
}

// ============================================================================
// Pattern Types
// ============================================================================

export interface Pattern {
  name: string;
  type: string;
  detect(candles: Candle[], options?: PatternOptions): PatternResult;
}

export interface PatternOptions {
  direction?: 'up' | 'down';
  count?: number;
  min_height?: number;
  lookback?: number;
  threshold?: number;
}

export interface PatternResult {
  detected: boolean;
  confidence: number;
  direction?: 'up' | 'down';
  start_index?: number;
  end_index?: number;
  metadata?: Record<string, any>;
}

// ============================================================================
// Rules Engine Types
// ============================================================================

export interface Rule {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  enabled: boolean;
  conditions: Condition[];
  condition_logic: 'and' | 'or';
  triggers: Trigger[];
  chain?: RuleChain;
  risk_modifier?: RiskModifier;
  metadata: RuleMetadata;
}

export interface Condition {
  id: string;
  name: string;
  enabled: boolean;
  logic: 'and' | 'or';
  timeframes?: CandleInterval[];
  condition: SingleCondition;
}

export interface SingleCondition {
  type: ConditionType;
  indicator?: IndicatorCondition;
  pattern?: PatternCondition;
  reference?: ReferenceCondition;
  composite?: CompositeCondition;
  price?: PriceCondition;
  time?: TimeCondition;
  operator: ConditionOperator;
  value: any;
}

export type ConditionType = 'indicator' | 'pattern' | 'reference' | 'composite' | 'price' | 'time';
export type ConditionOperator = 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'crosses' | 'between' | 'diverges';

export interface IndicatorCondition {
  name: string;
  params?: Record<string, number>;
  field?: string;
}

export interface PatternCondition {
  type: PatternType;
  direction: 'up' | 'down';
  count?: number;
  min_height?: number;
  lookback?: number;
}

export type PatternType = 'humps' | 'divergence' | 'crossover' | 'double_top' | 'double_bottom' | 'three_drive' | 'head_shoulders';

export interface ReferenceCondition {
  type: 'timeframe' | 'asset' | 'indicator';
  target: string;
  comparison: 'gt' | 'lt' | 'eq' | 'diverges';
}

export interface CompositeCondition {
  conditions: SingleCondition[];
  logic: 'and' | 'or';
}

export interface PriceCondition {
  type: 'price' | 'change' | 'change_percent';
  source?: string;
}

export interface TimeCondition {
  type: 'hour' | 'day' | 'weekday';
  operator: ConditionOperator;
  value: number | number[];
}

export interface Trigger {
  id: string;
  type: TriggerType;
  config: TriggerConfig;
}

export type TriggerType = 'trade' | 'notify' | 'adjust_risk' | 'webhook' | 'chain';

export interface TradeTrigger {
  action: 'buy' | 'sell' | 'close' | 'close_all';
  amount_type: 'fixed' | 'percent' | 'percent_of_balance';
  amount: number;
  order_type: 'market' | 'limit';
  limit_price?: number;
  max_slippage_percent?: number;
  after_trade?: {
    set_stop_loss?: number;
    set_take_profit?: number;
  };
}

export interface RiskTrigger {
  modifier: 'multiply' | 'add' | 'set';
  value: number;
  scope: 'position' | 'trade' | 'session';
  duration_ms?: number;
}

export interface NotifyTrigger {
  channel: 'telegram' | 'discord' | 'email' | 'webhook';
  message: string;
  include_context?: boolean;
}

export interface WebhookTrigger {
  url: string;
  method: 'POST' | 'GET';
  headers?: Record<string, string>;
  body_template?: string;
}

export interface ChainTrigger {
  target_type: 'rule' | 'condition' | 'webhook';
  target_id: string;
  pass_state?: boolean;
}

export type TriggerConfig = TradeTrigger | RiskTrigger | NotifyTrigger | WebhookTrigger | ChainTrigger;

export interface RuleChain {
  trigger_rule?: string;
  evaluate_condition?: string;
  delay_ms?: number;
  pass_context?: boolean;
}

export interface RiskModifier {
  type: 'multiply' | 'add' | 'set';
  value: number;
  scope: 'position' | 'trade' | 'session';
}

export interface RuleMetadata {
  created_at: number;
  updated_at: number;
  version: number;
  tags?: string[];
}

// ============================================================================
// Config & Secrets Types
// ============================================================================

export interface ConfigRegistry {
  global: GlobalConfig;
  users: Map<string, UserConfig>;
  strategies: Map<string, StrategyConfig>;
}

export interface GlobalConfig {
  supported_exchanges: string[];
  supported_intervals: CandleInterval[];
  default_indicators: string[];
  rate_limits: RateLimitConfig;
}

export interface RateLimitConfig {
  window_seconds: number;
  max_requests: number;
}

export interface UserConfig {
  user_id: string;
  preferences: UserPreferences;
  secrets_ref: string;
}

export interface UserPreferences {
  default_pairs: string[];
  default_intervals: CandleInterval[];
  auto_save_trades: boolean;
}

export interface StrategyConfig {
  strategy_id: string;
  risk_multiplier?: number;
  max_position_size?: number;
  enabled_pairs?: string[];
}

export interface EncryptedSecrets {
  ciphertext: string;
  iv: string;
  auth_tag: string;
  key_id: string;
  encrypted_by: string;
  created_at: number;
  updated_at: number;
  version: number;
}

export interface SecretsMetadata {
  id: string;
  user_id: string;
  category: SecretsCategory;
  label: string;
  encrypted_ref: string;
  created_at: number;
  updated_at: number;
}

export type SecretsCategory = 'exchange_api' | 'wallet_private' | 'webhook' | 'oauth';

// ============================================================================
// Audit & Logging Types
// ============================================================================

export interface AuditEvent {
  id: string;
  timestamp: number;
  event_type: AuditEventType;
  user_id: string;
  ip_address?: string;
  user_agent?: string;
  details: Record<string, any>;
  risk_level: RiskLevel;
}

export type AuditEventType = 
  | 'login' 
  | 'logout' 
  | 'api_key_added' 
  | 'api_key_removed'
  | 'trade_executed' 
  | 'config_changed'
  | 'rule_created'
  | 'rule_triggered'
  | 'strategy_started'
  | 'strategy_stopped';

export type RiskLevel = 'low' | 'medium' | 'high';

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

// ============================================================================
// Connector Types
// ============================================================================

export interface ExchangeConnector {
  name: string;
  exchange: string;
  connect(credentials: EncryptedSecrets): Promise<boolean>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  getBalance(): Promise<Balance[]>;
  getPrice(symbol: string): Promise<number>;
  getPrices(symbols: string[]): Promise<Map<string, number>>;
  getCandles(symbol: string, interval: CandleInterval, limit: number): Promise<Candle[]>;
  placeOrder(order: Order): Promise<OrderResult>;
  cancelOrder(orderId: string): Promise<boolean>;
  getOpenOrders(pair?: string): Promise<OrderResult[]>;
  getTradeHistory(pair?: string, limit?: number): Promise<Trade[]>;
  supportsPaperTrading(): boolean;
  supportedIntervals(): CandleInterval[];
  supportedSymbols(): string[];
}

// ============================================================================
// Engine Types
// ============================================================================

export interface RulesEngineState {
  context: {
    pair: string;
    current_price: number;
    current_timeframe: CandleInterval;
    balances: Map<string, number>;
    open_positions: Position[];
  };
  execution: {
    rules_evaluated: number;
    rules_triggered: number;
    trades_executed: number;
    errors: string[];
  };
  risk: {
    current_multiplier: number;
    session_risk: number;
    positions_at_risk: number;
  };
  chain_depth: number;
  max_chain_depth: number;
  triggered_rules: Set<string>;
}

export interface EngineResult {
  triggered: boolean;
  actions_executed: number;
  trades: OrderResult[];
  errors: string[];
  metadata: Record<string, any>;
}
