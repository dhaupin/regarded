# Regarded - Crypto Trading Agent Specification

## Project Overview

**Project Name:** Regarded  
**Type:** Full-stack Web Application (Trading Agent Platform)  
**Core Functionality:** A KISS/DRY cryptocurrency trading agent that executes paper and live trades based on configurable technical indicators and custom rulesets across multiple exchanges and chains.  
**Target Users:** Individual traders (initially the developers and friends) with personal dashboards, session management, and role-based access.

---

## 1. Architecture Overview

### 1.1 System Design

```
┌─────────────────────────────────────────────────────────────────┐
│                        Cloudflare Platform                      │
│  ┌─────────────────┐    ┌─────────────────┐                   │
│  │   Pages (SPA)   │    │  Workers (API)  │                   │
│  │   Frontend      │    │  - Auth         │                   │
│  │   Vite/React    │    │  - Trading      │                   │
│  └────────┬────────┘    │  - Indicators   │                   │
│           │             │  - Rules Engine │                   │
│           │             └────────┬────────┘                   │
│           │                      │                             │
│  ┌────────┴──────────────────────┴────────┐                  │
│  │           Cloudflare Storage            │                  │
│  │  - D2 (SQL database)                     │                  │
│  │  - KV (cache, sessions, config)         │                  │
│  └──────────────────────────────────────────┘                  │
└─────────────────────────────────────────────────────────────────┘
                          │
         ┌────────────────┼────────────────┐
         │                │                │
         ▼                ▼                ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  Exchange   │  │   DEX/      │  │   Price     │
│  Connectors │  │   Chain     │  │   Oracles   │
│  - Kraken   │  │   Connectors│  │             │
│  - Binance  │  │   - Solana  │  │             │
│  - Coinbase │  │   - Jupiter │  │             │
└─────────────┘  └─────────────┘  └─────────────┘
```

### 1.2 Technology Stack

| Layer | Technology | Justification |
|-------|------------|----------------|
| Frontend | Vite + React + TypeScript | Fast dev, small bundles, excellent DX |
| Styling | CSS Modules + CSS Variables | KISS, no heavy UI frameworks |
| State | Zustand | Lightweight, TypeScript-friendly |
| Backend | Cloudflare Workers (Hono) | Free tier compatible, edge-native |
| Database | Cloudflare D2 | Free SQL storage on CF |
| Cache/Config | Cloudflare KV | Fast key-value for sessions & config |
| Auth | Cloudflare Access / Google OAuth | Free tier, enterprise SSO |
| Deployment | Cloudflare Pages + Wrangler | 100% free tier |

### 1.3 Engine Abstraction

The system uses a pluggable engine architecture:

```
┌─────────────────────────────────────────────┐
│            Trading Platform Core            │
├─────────────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐  ┌─────────────┐ │
│  │  Node   │  │ Python  │  │   Rust      │ │
│  │ Engine  │  │ Engine  │  │   Engine    │ │
│  │ (v1)    │  │ (v2)    │  │   (future)  │ │
│  └────┬────┘  └────┬────┘  └──────┬──────┘ │
│       │            │               │        │
│  ┌────┴────────────┴───────────────┴────┐  │
│  │         Engine Interface (Contract)   │  │
│  │  - execute_strategy()                  │  │
│  │  - calculate_indicators()             │  │
│  │  - place_order()                       │  │
│  │  - get_balance()                      │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

---

## 2. Feature Specifications

### 2.1 Authentication & Authorization

#### Login System
- **Provider:** Google OAuth 2.0
- **Implementation:** Cloudflare Access or custom OAuth flow via Workers
- **Session Management:**
  - JWT tokens stored in HttpOnly cookies
  - Refresh tokens in KV for session persistence
  - Session expiry: 7 days (configurable)

#### Role-Based Access Control (RBAC)

| Role | Permissions |
|------|-------------|
| `admin` | Full access, manage users, view all trades, system config |
| `trader` | Own dashboard, create/edit strategies, execute trades |
| `viewer` | Read-only access to own dashboard and trades |

User data schema:
```typescript
interface User {
  id: string;              // UUID
  email: string;           // Google email
  name: string;           // Display name
  role: 'admin' | 'trader' | 'viewer';
  created_at: number;      // Unix timestamp
  settings: UserSettings;
}
```

### 2.2 Dashboard

#### Features
- Portfolio overview (total value, P&L)
- Active positions list
- Recent trades history
- Strategy performance metrics
- Balance across connected exchanges/wallets

#### UI Layout
```
┌─────────────────────────────────────────────────┐
│  Header: Logo | Nav (Dashboard | Strategies | │
│          Wallets | Settings) | User Menu       │
├─────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  Portfolio  │  │    Active Positions     │  │
│  │   Summary   │  │    (table)              │  │
│  └─────────────┘  └─────────────────────────┘  │
│  ┌─────────────────────────────────────────┐   │
│  │        Recent Trades / Activity         │   │
│  └─────────────────────────────────────────┘   │
│  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  Strategy   │  │   Performance Chart      │  │
│  │   Stats     │  │   (line graph)          │  │
│  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### 2.3 Exchange & Chain Connectors

#### Abstract Connector Interface
```typescript
interface ExchangeConnector {
  // Connection
  connect(credentials: Credentials): Promise<boolean>;
  disconnect(): Promise<void>;
  getBalance(): Promise<Balance[]>;
  
  // Market Data
  getPrice(symbol: string): Promise<number>;
  getCandles(symbol: string, interval: string, limit: number): Promise<Candle[]>;
  
  // Trading
  placeOrder(order: Order): Promise<OrderResult>;
  cancelOrder(orderId: string): Promise<boolean>;
  getOpenOrders(): Promise<Order[]>;
  getTradeHistory(symbol?: string): Promise<Trade[]>;
  
  // Capabilities
  supportsPaperTrading(): boolean;
  supportedIntervals(): string[];
  supportedSymbols(): string[];
}
```

#### Initial Connectors (Priority Order)

| Priority | Connector | Type | Status |
|----------|-----------|------|--------|
| 1 | Kraken | CEX | v1 |
| 2 | Solana (Wallet) | DEX | v1 |
| 3 | Jupiter (Solana) | Aggregator | v1 |
| 4 | Binance | CEX | v2 |
| 5 | Coinbase | CEX | v2 |

#### Credentials Storage
- Encrypted at rest using Cloudflare Workers' secrets
- Never stored in plain text
- User-specific credential isolation

### 2.4 Technical Indicators

All indicators implement a common interface:

```typescript
interface Indicator {
  name: string;
  version: string;
  calculate(candles: Candle[]): IndicatorResult;
  validateParams(params: Record<string, number>): boolean;
}

interface IndicatorResult {
  value: number | number[];  // Current value(s)
  signal?: 'buy' | 'sell' | 'neutral';
  metadata?: Record<string, any>;
  history?: number[];  // For pattern recognition
}
```

#### Multi-Timeframe Indicator Support

Indicators must support calculation across multiple timeframes simultaneously:

```typescript
interface MultiTimeframeIndicator {
  calculateForTimeframes(
    candles: Map<string, Candle[]>,  // interval -> candles
    intervals: string[]
  ): Map<string, IndicatorResult>;  // interval -> result
}
```

#### Implemented Indicators (v1)

| Indicator | Parameters | Output |
|-----------|------------|--------|
| **RSI** | period (default: 14), overbought (70), oversold (30) | value (0-100), signal |
| **KDJ** | n (default: 9), m1 (default: 3), m2 (default: 3) | K, D, J values, signal |
| **Bollinger Bands** | period (default: 20), stdDev (default: 2) | upper, middle, lower bands |
| **MACD** | fast (12), slow (26), signal (9) | MACD line, signal line, histogram |

#### Indicator Registry
- Pluggable indicator system
- Indicators registered at runtime
- Custom indicators can be added via plugin system
- Factory pattern for instantiating indicators

---

### 2.5 Configuration & Secrets System

A centralized configuration registry with encrypted secrets storage.

#### Config Registry

```typescript
interface ConfigRegistry {
  // Global config (same for all users)
  global: GlobalConfig;
  
  // User-specific config
  users: Map<string, UserConfig>;
  
  // Strategy-specific config
  strategies: Map<string, StrategyConfig>;
}

interface GlobalConfig {
  // System-wide settings
  supported_exchanges: string[];
  supported_intervals: string[];
  default_indicators: string[];
  rate_limits: RateLimitConfig;
}

interface UserConfig {
  user_id: string;
  preferences: UserPreferences;
  // Encrypted secrets reference
  secrets_ref: string;  // Points to encrypted blob in KV
}

interface StrategyConfig {
  strategy_id: string;
  // Strategy-specific overrides
  risk_multiplier?: number;
  max_position_size?: number;
  enabled_pairs?: string[];
}
```

#### Encrypted Secrets System

All sensitive data (API keys, secrets, tokens) must be encrypted before storage:

```typescript
interface EncryptedSecrets {
  // AES-256-GCM encrypted blob
  ciphertext: string;  // Base64 encoded
  
  // Encryption metadata
  iv: string;         // Initialization vector (12 bytes, base64)
  auth_tag: string;   // Authentication tag (16 bytes, base64)
  
  // Key derivation info
  key_id: string;     // References the key used
  encrypted_by: string; // Who encrypted (user_id or system)
  
  // Metadata
  created_at: number;
  updated_at: number;
  version: number;
}

// Master key derivation (never stored)
interface KeyDerivation {
  // PBKDF2 or Argon2id for key stretching
  algorithm: 'pbkdf2' | 'argon2id';
  iterations: number;  // 100,000+ for PBKDF2
  salt: string;       // Unique per user, stored separately
  
  // Derived key stored encrypted with master
  derived_key_ref: string;
}
```

#### Encryption Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Encryption Process                        │
├─────────────────────────────────────────────────────────────┤
│  1. User provides API key                                   │
│  2. Generate random 12-byte IV                              │
│  3. Derive key from user password + salt (PBKDF2)         │
│  4. Encrypt with AES-256-GCM                                │
│  5. Store: {ciphertext, iv, auth_tag, key_id} in KV        │
│  6. NEVER store plaintext anywhere                          │
└─────────────────────────────────────────────────────────────┘
```

#### Secrets Categories

| Category | Examples | Storage |
|----------|----------|---------|
| `exchange_api` | API keys, API secrets | Encrypted KV |
| `wallet_private` | Private keys | Encrypted KV (with extra caution) |
| `webhook` | Slack/Telegram tokens | Encrypted KV |
| `oauth` | OAuth refresh tokens | Encrypted KV |

---

### 2.6 Security Hardening

#### Encryption Standards

| Data Type | Encryption | Key Derivation |
|-----------|------------|----------------|
| API Keys/Secrets | AES-256-GCM | PBKDF2 (100k iterations) |
| Session Tokens | AES-256-GCM | Per-session key |
| User Passwords | bcrypt/Argon2 | N/A (one-way) |
| Database | D2 at-rest encryption | CF-managed |

#### Security Measures

```typescript
interface SecurityConfig {
  // Authentication
  jwt: {
    expiry_seconds: number;        // 900 (15 min)
    refresh_expiry_seconds: number; // 604800 (7 days)
    algorithm: 'ES256' | 'RS256';
  };
  
  // Rate limiting
  rate_limit: {
    window_seconds: number;
    max_requests: number;
    per_ip: boolean;
  };
  
  // Input validation
  input_validation: {
    max_string_length: number;
    allowed_chars: RegExp;
    sanitize_html: boolean;
  };
  
  // CORS
  cors: {
    allowed_origins: string[];
    allow_credentials: boolean;
    max_age_seconds: number;
  };
}
```

#### Audit Logging

All security-relevant events are logged:

```typescript
interface AuditEvent {
  id: string;
  timestamp: number;
  event_type: 'login' | 'logout' | 'api_key_added' | 'trade_executed' | 'config_changed';
  user_id: string;
  ip_address: string;
  user_agent: string;
  details: Record<string, any>;
  risk_level: 'low' | 'medium' | 'high';
}
```

---

### 2.7 Advanced Rules & Triggers Engine

The rules engine is the heart of trade execution. It supports multi-timeframe analysis, pattern recognition, and chained triggers.

#### Core Concepts

```typescript
// === CONDITION TYPES ===

// Base condition interface
interface Condition {
  id: string;
  name: string;
  enabled: boolean;
  
  // How to combine with next condition
  logic: 'and' | 'or';
  
  // Multi-timeframe analysis
  timeframes?: string[];  // e.g., ['5m', '30m', '1h']
  
  // The actual condition definition
  condition: SingleCondition;
}

// Single condition with full flexibility
interface SingleCondition {
  // What type of condition
  type: 'indicator' | 'price' | 'pattern' | 'time' | 'reference' | 'composite';
  
  // === INDICATOR CONDITIONS ===
  indicator?: {
    name: string;           // 'rsi', 'boll', 'macd', 'kdj'
    params?: Record<string, number>;
    field?: string;         // 'value', 'signal', 'upper', 'lower', 'histogram'
  };
  
  // === PATTERN CONDITIONS (e.g., "3 humps") ===
  pattern?: {
    type: 'humps' | 'divergence' | 'crossover' | 'double_top' | 'double_bottom' | 'custom';
    direction: 'up' | 'down';
    count?: number;         // Number of humps/peaks
    min_height?: number;    // Minimum height between peaks
    lookback?: number;      // How many candles to look back
  };
  
  // === REFERENCE CONDITIONS (multi-timeframe comparison) ===
  reference?: {
    type: 'timeframe' | 'asset' | 'indicator';
    target: string;         // e.g., '30m', 'btc', 'rsi.14'
    comparison: 'gt' | 'lt' | 'eq' | 'diverges';
  };
  
  // === COMPOSITE CONDITIONS (combine multiple) ===
  composite?: {
    conditions: SingleCondition[];
    logic: 'and' | 'or';
  };
  
  // The operator and value to evaluate
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'crosses' | 'between' | 'diverges';
  value: any;
}

// === RULE ===

interface Rule {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  
  enabled: boolean;
  
  // Conditions that must be met
  conditions: Condition[];
  
  // Logic for combining conditions
  condition_logic: 'and' | 'or';
  
  // === TRIGGERS (what happens when rule fires) ===
  triggers: Trigger[];
  
  // === CHAINING (trigger other rules/conditions) ===
  chain?: {
    // Trigger another rule after this one
    trigger_rule?: string;  // Rule ID
    
    // Evaluate a condition from another rule
    evaluate_condition?: string;  // Condition ID in another rule
    
    // Delay before chaining (ms)
    delay_ms?: number;
    
    // Pass context to chained rule
    pass_context?: boolean;
  };
  
  // Risk adjustment (for rules that modify risk)
  risk_modifier?: {
    type: 'multiply' | 'add' | 'set';
    value: number;
    scope: 'position' | 'trade' | 'session';
  };
  
  metadata: {
    created_at: number;
    updated_at: number;
    version: number;
    tags?: string[];
  };
}

// === TRIGGER TYPES ===

interface Trigger {
  id: string;
  
  // What type of trigger
  type: 'trade' | 'notify' | 'adjust_risk' | 'log' | 'webhook' | 'chain';
  
  // Trigger configuration
  config: TradeTrigger | NotifyTrigger | RiskTrigger | WebhookTrigger | ChainTrigger;
}

interface TradeTrigger {
  action: 'buy' | 'sell' | 'close' | 'close_all';
  amount_type: 'fixed' | 'percent' | 'percent_of_balance';
  amount: number;
  order_type: 'market' | 'limit';
  limit_price?: number;  // For limit orders
  
  // Slippage protection
  max_slippage_percent?: number;
  
  // Post-trade actions
  after_trade?: {
    set_stop_loss?: number;
    set_take_profit?: number;
  };
}

interface RiskTrigger {
  modifier: 'multiply' | 'add' | 'set';
  value: number;
  scope: 'position' | 'trade' | 'session';
  duration_ms?: number;  // Temp adjustment
}

interface ChainTrigger {
  target_type: 'rule' | 'condition' | 'webhook';
  target_id: string;
  pass_state?: boolean;
}

interface NotifyTrigger {
  channel: 'telegram' | 'discord' | 'email' | 'webhook';
  message: string;
  include_context?: boolean;
}

interface WebhookTrigger {
  url: string;
  method: 'POST' | 'GET';
  headers?: Record<string, string>;
  body_template?: string;
}
```

#### Example: Multi-Timeframe RSI + Bollinger + Pattern Rule

This is the schema you described - comparing timeframes and detecting "3 humps":

```json
{
  "name": "SOL Multi-Timeframe RSI Divergence with Pattern",
  "description": "5m RSI in Bollinger with 30m/1h confirmation, detect 3 humps pattern for correction",
  "enabled": true,
  "condition_logic": "and",
  "conditions": [
    {
      "id": "cond_1",
      "name": "5m RSI in Bollinger Bands",
      "logic": "and",
      "timeframes": ["5m"],
      "condition": {
        "type": "composite",
        "composite": {
          "logic": "and",
          "conditions": [
            {
              "type": "indicator",
              "indicator": {
                "name": "rsi",
                "params": { "period": 14 },
                "field": "value"
              },
              "operator": "between",
              "value": [30, 70]
            },
            {
              "type": "indicator",
              "indicator": {
                "name": "boll",
                "params": { "period": 20, "stdDev": 2 },
                "field": "value"
              },
              "operator": "between",
              "value": ["lower", "upper"]
            }
          ]
        }
      }
    },
    {
      "id": "cond_2",
      "name": "30m RSI Oversold (confirmation)",
      "logic": "and",
      "timeframes": ["30m"],
      "condition": {
        "type": "indicator",
        "indicator": {
          "name": "rsi",
          "params": { "period": 14 },
          "field": "value"
        },
        "operator": "lt",
        "value": 40
      }
    },
    {
      "id": "cond_3",
      "name": "1h RSI Oversold (confirmation)",
      "logic": "and",
      "timeframes": ["1h"],
      "condition": {
        "type": "indicator",
        "indicator": {
          "name": "rsi",
          "params": { "period": 14 },
          "field": "value"
        },
        "operator": "lt",
        "value": 45
      }
    },
    {
      "id": "cond_4",
      "name": "3 Humps Pattern (correction signal)",
      "logic": "and",
      "timeframes": ["5m"],
      "condition": {
        "type": "pattern",
        "pattern": {
          "type": "humps",
          "direction": "up",
          "count": 3,
          "min_height": 0.5,
          "lookback": 20
        },
        "operator": "eq",
        "value": true
      }
    },
    {
      "id": "cond_5",
      "name": "BTC as Leading Indicator - Bullish",
      "logic": "and",
      "timeframes": ["5m"],
      "condition": {
        "type": "reference",
        "reference": {
          "type": "asset",
          "target": "btc",
          "comparison": "gt"
        },
        "indicator": {
          "name": "sma",
          "params": { "period": 20 }
        },
        "operator": "crosses",
        "value": "above"
      }
    }
  ],
  "triggers": [
    {
      "id": "trigger_1",
      "type": "adjust_risk",
      "config": {
        "modifier": "multiply",
        "value": 0.5,
        "scope": "position",
        "duration_ms": 300000
      }
    },
    {
      "id": "trigger_2",
      "type": "trade",
      "config": {
        "action": "sell",
        "amount_type": "percent_of_balance",
        "amount": 50,
        "order_type": "market",
        "max_slippage_percent": 1,
        "after_trade": {
          "set_stop_loss": 2,
          "set_take_profit": 1.5
        }
      }
    },
    {
      "id": "trigger_3",
      "type": "notify",
      "config": {
        "channel": "telegram",
        "message": "🚨 3-Hump Pattern Detected on SOL! Risk reduced, position scaled down.",
        "include_context": true
      }
    }
  ],
  "chain": {
    "trigger_rule": "rule_btc_recovery",
    "delay_ms": 3600000,
    "pass_context": true
  },
  "risk_modifier": {
    "type": "multiply",
    "value": 0.5,
    "scope": "position"
  },
  "metadata": {
    "created_at": 1699999999999,
    "updated_at": 1699999999999,
    "version": 1,
    "tags": ["multi-timeframe", "pattern", "sol", "correction"]
  }
}
```

#### Rules Engine Execution Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Rules Engine Execution                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. Strategy Evaluator calls Rules Engine                           │
│     │                                                               │
│     ▼                                                               │
│  2. For each Rule:                                                  │
│     │                                                               │
│     ▼                                                               │
│  3. Load all required candles for all timeframes                   │
│     │                                                               │
│     ▼                                                               │
│  4. Calculate indicators for each timeframe                          │
│     │                                                               │
│     ▼                                                               │
│  5. Evaluate conditions (with multi-tf comparison)                  │
│     │                                                               │
│     ▼                                                               │
│  6. If conditions met:                                               │
│     │  ├── Execute triggers (trade, notify, risk)                  │
│     │  ├── Apply risk modifiers                                     │
│     │  └── Optionally chain to other rules                          │
│     │                                                               │
│     ▼                                                               │
│  7. Record execution in audit log                                   │
│     │                                                               │
│     ▼                                                               │
│  8. Return results with context                                     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

#### Rules Engine State Management

```typescript
interface RulesEngineState {
  // Current evaluation context
  context: {
    pair: string;
    current_price: number;
    current_timeframe: string;
    balances: Map<string, number>;
    open_positions: Position[];
  };
  
  // Execution history for this cycle
  execution: {
    rules_evaluated: number;
    rules_triggered: number;
    trades_executed: number;
    errors: string[];
  };
  
  // Risk state
  risk: {
    current_multiplier: number;
    session_risk: number;
    positions_at_risk: number;
  };
  
  // Chain state (prevent infinite loops)
  chain_depth: number;
  max_chain_depth: number;
  triggered_rules: Set<string>;
}
```

#### Ruleset Management
- Create, edit, delete rules via UI
- Enable/disable rules without deletion
- Test rules against historical data (backtest)
- Clone/copy rules
- Visual rule builder with drag-and-drop
- Rule templates library

---

### 2.8 Pattern Recognition System

Built-in pattern recognition for candle/indicator formations:

```typescript
interface Pattern {
  name: string;
  type: string;
  detect(candles: Candle[], options: PatternOptions): PatternResult;
}

interface PatternResult {
  detected: boolean;
  confidence: number;  // 0-1
  direction?: 'up' | 'down';
  start_index?: number;
  end_index?: number;
  metadata?: Record<string, any>;
}
```

#### v1 Patterns

| Pattern | Description | Use Case |
|---------|-------------|----------|
| **Humps** | N consecutive peaks in same direction | Trend exhaustion |
| **Divergence** | Price vs indicator divergence | Reversal signals |
| **Crossover** | Two lines crossing | Entry signals |
| **Double Top/Bottom** | Two peaks/valleys | Reversal |
| **3 Drive** | 3 drives to a level | Reversal |
| **Head & Shoulders** | Classic reversal | Trend change |

---

### 2.9 Strategy Management

A **Strategy** combines:
1. One or more trading pairs (e.g., SOL/USDC, ETH/USDC)
2. One or more timeframes (1m, 5m, 15m, 1h, 4h, 1d, 1w, 1M)
3. One or more rules
4. Position sizing rules
5. Risk management settings

```typescript
interface Strategy {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  
  // Trading pairs
  pairs: string[];
  
  // Timeframes to evaluate
  intervals: string[];
  
  // Rules to apply
  rules: string[];  // Rule IDs
  
  // Position sizing
  position_sizing: {
    type: 'fixed' | 'percent' | 'kelly';
    value: number;
  };
  
  // Risk management
  risk_management: {
    max_position_size: number;
    stop_loss_percent: number;
    take_profit_percent: number;
    max_daily_trades: number;
  };
  
  // Mode
  mode: 'paper' | 'live';
  
  enabled: boolean;
  created_at: number;
  updated_at: number;
}
```

### 2.10 Trade Execution

#### Order Types
- Market orders (immediate execution)
- Limit orders (execute at price)
- Stop-loss orders
- Take-profit orders

#### Execution Flow
```
Rule Triggered
      │
      ▼
┌─────────────────┐
│ Validate Order  │
│ - Balance check │
│ - Min notional │
│ - Risk limits   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Place Order     │──────► Connector
│ (Paper/Live)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Record Trade    │
│ - DB            │
│ - Activity log  │
└─────────────────┘
```

### 2.11 Data Storage (Cloudflare D2)

#### Tables Schema

```sql
-- Users table
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  role TEXT DEFAULT 'trader',
  created_at INTEGER NOT NULL,
  settings TEXT  -- JSON
);

-- Exchange credentials (encrypted reference only)
CREATE TABLE credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  exchange TEXT NOT NULL,
  label TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Trading pairs
CREATE TABLE pairs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  base TEXT NOT NULL,
  quote TEXT NOT NULL,
  exchange TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Strategies
CREATE TABLE strategies (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  config TEXT NOT NULL,  -- JSON
  mode TEXT DEFAULT 'paper',
  enabled INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Rules
CREATE TABLE rules (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  strategy_id TEXT,
  name TEXT NOT NULL,
  config TEXT NOT NULL,  -- JSON
  enabled INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (strategy_id) REFERENCES strategies(id)
);

-- Trades
CREATE TABLE trades (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  strategy_id TEXT,
  rule_id TEXT,
  pair TEXT NOT NULL,
  side TEXT NOT NULL,
  type TEXT NOT NULL,
  amount REAL NOT NULL,
  price REAL,
  fee REAL,
  status TEXT NOT NULL,
  mode TEXT NOT NULL,  -- paper or live
  executed_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (strategy_id) REFERENCES strategies(id),
  FOREIGN KEY (rule_id) REFERENCES rules(id)
);

-- Positions
CREATE TABLE positions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  strategy_id TEXT,
  pair TEXT NOT NULL,
  side TEXT NOT NULL,
  entry_price REAL NOT NULL,
  amount REAL NOT NULL,
  current_price REAL,
  unrealized_pnl REAL,
  opened_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (strategy_id) REFERENCES strategies(id)
);
```

### 2.12 API Endpoints (Cloudflare Workers)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/api/health` | Health check | Public |
| `POST` | `/api/auth/login` | Google OAuth callback | Public |
| `POST` | `/api/auth/logout` | Logout | User |
| `GET` | `/api/auth/me` | Current user | User |

#### User Management
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/api/users` | List users | Admin |
| `GET` | `/api/users/:id` | Get user | User/Admin |
| `PATCH` | `/api/users/:id` | Update user | User/Admin |
| `DELETE` | `/api/users/:id` | Delete user | Admin |

#### Strategies
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/api/strategies` | List strategies | Trader |
| `POST` | `/api/strategies` | Create strategy | Trader |
| `GET` | `/api/strategies/:id` | Get strategy | Trader |
| `PUT` | `/api/strategies/:id` | Update strategy | Trader |
| `DELETE` | `/api/strategies/:id` | Delete strategy | Trader |
| `POST` | `/api/strategies/:id/toggle` | Enable/disable | Trader |

#### Rules
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/api/rules` | List rules | Trader |
| `POST` | `/api/rules` | Create rule | Trader |
| `GET` | `/api/rules/:id` | Get rule | Trader |
| `PUT` | `/api/rules/:id` | Update rule | Trader |
| `DELETE` | `/api/rules/:id` | Delete rule | Trader |

#### Connectors
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/api/connectors` | List available connectors | Trader |
| `GET` | `/api/connectors/:exchange/status` | Connection status | Trader |
| `POST` | `/api/connectors/:exchange/connect` | Connect exchange | Trader |
| `POST` | `/api/connectors/:exchange/disconnect` | Disconnect | Trader |
| `GET` | `/api/connectors/:exchange/balance` | Get balance | Trader |
| `GET` | `/api/connectors/:exchange/prices` | Get prices | Trader |

#### Trading
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/api/trades` | Trade history | Trader |
| `GET` | `/api/trades/:id` | Trade details | Trader |
| `POST` | `/api/trades/execute` | Execute trade | Trader |
| `POST` | `/api/trades/cancel/:id` | Cancel trade | Trader |
| `GET` | `/api/positions` | Active positions | Trader |

---

## 3. Frontend Specification

### 3.1 Project Structure

```
frontend/
├── public/
├── src/
│   ├── components/      # Reusable UI components
│   │   ├── common/     # Buttons, inputs, cards
│   │   ├── layout/     # Header, sidebar, containers
│   │   └── trading/    # Trading-specific components
│   ├── pages/          # Route pages
│   │   ├── Dashboard/
│   │   ├── Strategies/
│   │   ├── Rules/
│   │   ├── Wallets/
│   │   └── Settings/
│   ├── hooks/          # Custom React hooks
│   ├── services/       # API client
│   ├── stores/         # Zustand stores
│   ├── types/          # TypeScript types
│   ├── utils/          # Helper functions
│   ├── styles/         # Global styles, variables
│   ├── App.tsx
│   └── main.tsx
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

### 3.2 Design System

#### Color Palette (Dark Theme - Trading Focused)
```css
:root {
  /* Background */
  --bg-primary: #0d1117;
  --bg-secondary: #161b22;
  --bg-tertiary: #21262d;
  --bg-elevated: #30363d;
  
  /* Text */
  --text-primary: #f0f6fc;
  --text-secondary: #8b949e;
  --text-muted: #6e7681;
  
  /* Brand */
  --accent-primary: #58a6ff;
  --accent-hover: #79c0ff;
  
  /* Status */
  --success: #3fb950;
  --success-dim: #238636;
  --danger: #f85149;
  --danger-dim: #da3633;
  --warning: #d29922;
  --warning-dim: #9e6a03;
  
  /* Trading */
  --buy: #3fb950;
  --sell: #f85149;
  --neutral: #8b949e;
  
  /* Borders */
  --border: #30363d;
  --border-focus: #58a6ff;
}
```

#### Typography
- **Font Family:** 'JetBrains Mono' for numbers/data, 'Inter' for UI text
- **Headings:** Inter, weights 600-700
- **Body:** Inter, weight 400-500
- **Monospace:** JetBrains Mono for prices, quantities

#### Component Guidelines
- KISS - Simple, composable components
- Consistent spacing (4px base unit)
- Clear visual hierarchy
- Accessible (WCAG 2.1 AA)

### 3.3 Key Pages

#### Dashboard
- Portfolio summary cards
- Active positions table
- Recent trades list
- Performance mini-charts

#### Strategies Page
- Strategy list with status indicators
- Create/Edit strategy modal
- Enable/disable toggle per strategy

#### Rules Builder
- Visual rule builder
- Condition blocks with dropdowns
- Action configuration
- Test against historical data

#### Wallets/Exchanges
- List of connected exchanges
- Connect new exchange flow
- Balance display per exchange

#### Settings
- Profile settings
- API key management
- Notification preferences
- Theme preferences

---

## 4. Security Specification

### 4.1 Authentication
- Google OAuth 2.0 for identity
- JWT tokens with short expiry (15 min)
- Refresh tokens stored in HttpOnly, Secure cookies
- CSRF protection on all state-changing operations

### 4.2 Data Protection
- Exchange API keys encrypted at rest
- No sensitive data in logs
- Input validation and sanitization
- Rate limiting on all endpoints

### 4.3 Cloudflare Security
- WAF rules for common attacks
- DDoS protection (CF built-in)
- HTTPS only (force SSL)
- CORS configured per endpoint

### 4.4 Trading Safety
- Max position size limits
- Daily trade limits
- Paper trading by default
- Kill switch for live trading

---

## 5. Constraints & Limitations

### 5.1 Cloudflare Free Tier Limits
- **Workers:** 100,000 requests/day
- **KV:** 1 GB storage, 100,000 reads/day, 1,000 writes/day
- **D2:** 5 GB storage, 5 million storage reads/month
- **Pages:** 500 MB build, unlimited bandwidth

### 5.2 Design Implications
- Aggressive caching for read operations
- Batch writes where possible
- Queue-based trade execution (within Worker limits)
- Minimal real-time updates (polling vs websockets)

---

## 6. Future Considerations

### 6.2 v2+ Features
- Backtesting engine
- Multi-signature wallet support
- Telegram/Discord notifications
- Portfolio rebalancing
- Machine learning indicators
- Paper portfolio sharing

### 6.3 Engine Extensions
- Python engine for complex analysis
- Rust engine for high-frequency execution
- Julia engine for quantitative strategies

---

## 7. Acceptance Criteria

### Core Functionality
- [ ] User can sign in with Google
- [ ] User can view dashboard with portfolio
- [ ] User can connect at least one exchange
- [ ] User can create a strategy with rules
- [ ] Rules can trigger paper trades
- [ ] All 4 indicators (RSI, KDJ, BB, MACD) calculate correctly

### Technical
- [ ] Frontend builds with Vite
- [ ] Backend deploys to Cloudflare Workers
- [ ] D2 database migrations run successfully
- [ ] API responds within 200ms (cached)
- [ ] All endpoints require authentication (except health)

### UX
- [ ] Responsive on mobile
- [ ] Dark theme consistent
- [ ] Loading states on async operations
- [ ] Error messages are helpful

---

*Last Updated: 2026-07-29*
*Version: 0.1.0 (Planning)*
