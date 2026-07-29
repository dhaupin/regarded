# Regarded - Agent Knowledge Base

## Project Context

Regarded is a KISS/DRY crypto trading bot platform that executes paper and live trades based on technical indicators and custom rulesets. It targets the Cloudflare free tier.

**Repository:** `regarded.creadev.org`  
**Tech Stack:** Vite/React (frontend), Cloudflare Workers/Hono (backend), D2 (database), KV (cache)  
**Initial Focus:** Personal/small team use with Google auth

## Library Structure (`/lib`)

All core modules are flat files:

```
lib/
├── regarded.ts        # Main entry point
├── types.ts           # All TypeScript interfaces
├── error.ts           # Error codes, factory, utilities
├── encrypt.ts        # AES-256-GCM, PBKDF2
├── audit.ts          # Audit logging
├── waf.ts            # WAF - rate limiting, IP blocking
├── qos.ts            # QoS - circuit breaker, rate limiter
├── network.ts        # HTTP client with retry, circuit breaker
├── scheduler.ts       # Cron scheduler, heartbeat
├── auth.ts           # JWT, OAuth, sessions, lockout
├── config.ts         # Config registry, secrets
├── storage.ts       # KV cache, rate limiter
├── cache.ts         # LRU cache with TTL
├── event.ts         # Event emitter
├── api.ts           # HTTP handlers, router, transforms
├── indicators.ts    # RSI, KDJ, Bollinger, MACD
├── patterns.ts      # Humps, divergence, etc.
├── rules.ts         # Rules engine
├── utils.ts         # Helper functions
├── connectors.ts   # Factory & registry
└── connectors/      # Individual connectors
    ├── base.ts      # BaseConnector class
    ├── kraken.ts    # Kraken exchange
    ├── solana.ts    # Solana wallet
    └── jupiter.ts   # Jupiter aggregator

dist/                 # Frontend build output (empty)
test/                  # Test files (*.test.ts)
```

### Quick Imports
```typescript
import { createConnector, createRulesEngine, calculateIndicator, events, LRUCache, Router, json, success, error } from './lib/regarded';
```

### NPM Scripts
```bash
npm test          # Run all tests
npm run typecheck # TypeScript check
npm run lint      # ESLint
npm run lint:fix # Auto-fix lint issues
```

### Git Hooks
- Pre-commit: runs `tsc --noEmit` to check types before commit

---

## Module Integration

All modules use `error.ts` for consistent error handling via `RegardedError`:

```
error.ts (foundation)
    ↑
    ├── waf.ts      → Rate limiting, validation errors
    ├── qos.ts     → Circuit breaker, rate limiter errors  
    ├── network.ts → HTTP errors, exchange errors
    ├── scheduler.ts → Job scheduling errors
    ├── cache.ts   → Cache errors
    ├── auth.ts    → Auth errors
    └── connectors.ts → Connector errors
```

### Module Dependencies

| Module | Uses | Provides |
|--------|------|----------|
| `error.ts` | - | Error codes, factory functions |
| `cache.ts` | error.ts | LRU cache with TTL |
| `waf.ts` | error.ts, cache.ts | Rate limiting, IP blocking |
| `qos.ts` | error.ts, cache.ts | Circuit breaker, rate limiter |
| `network.ts` | error.ts, qos.ts | HTTP client with retry/circuit breaker |
| `scheduler.ts` | error.ts | Cron scheduler, heartbeat |
| `connectors.ts` | error.ts, qos.ts, network.ts | Exchange connectors |
| `rules.ts` | error.ts | Rules engine |
| `event.ts` | - | Event emitter |

### Example: Using Modules Together

```typescript
import { createWAF, createQoSManager, createNetwork, createScheduler, errors } from './lib/regarded';

// 1. Set up WAF for request validation
const waf = createWAF({ maxRequestsPerWindow: 100 });

// 2. Set up QoS for circuit breaking  
const qos = createQoSManager();

// 3. Set up Network with QoS integration
const network = createNetwork({}, qos);

// 4. Set up Scheduler for periodic tasks
const scheduler = createScheduler();
scheduler.addJob('fetch-prices', 'Fetch Prices', '*/5 * * * *', async () => {
  const result = await network.get('https://api.exchange.com/prices');
  // Process prices...
});
scheduler.start();

// 5. Validate incoming requests
const validation = waf.validate({ ip: '1.2.3.4', method: 'GET', path: '/api', headers: {} });
if (!validation.allowed) {
  throw errors.rateLimited(); // Uses standardized error
}
```

---

## Architecture Decisions

### Cloudflare-First Design
- All services run on Cloudflare free tier
- Workers for API logic
- Pages for frontend SPA
- D2 for SQL storage
- KV for sessions, config, caching
- Zero external server dependencies

### KISS Principles Applied
- Simple React components, no heavy UI frameworks
- Plain SQL migrations (no ORM)
- Minimal dependencies
- Horizontal scaling via CF edge network

### DRY Principles Applied
- Shared TypeScript types between frontend and backend
- Reusable indicator calculations
- Extensible connector interface
- Common error handling patterns

---

## Tech Stack Details

### Frontend
- **Build:** Vite 5.x
- **Framework:** React 18.x
- **Language:** TypeScript 5.x
- **Routing:** React Router 6.x
- **State:** Zustand
- **Styling:** CSS Modules + CSS Variables
- **HTTP:** Fetch API (no axios)

### Backend
- **Runtime:** Cloudflare Workers
- **Framework:** Hono (for API routes)
- **Database:** D2 (SQLite-based)
- **Cache:** KV Namespace
- **Auth:** Google OAuth 2.0

### Deployment
- **CI/CD:** GitHub Actions
- **Hosting:** Cloudflare Pages + Workers
- **Wrangler:** For local dev and deployment

---

## Code Organization

```
/
├── frontend/           # Vite + React app
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── stores/
│   │   ├── types/
│   │   └── styles/
│   └── vite.config.ts
│
├── backend/            # Cloudflare Workers
│   ├── src/
│   │   ├── routes/    # API route handlers
│   │   ├── middleware/# Auth, error handling
│   │   ├── services/  # Business logic
│   │   ├── connectors/# Exchange connectors
│   │   ├── indicators/# Technical indicators
│   │   ├── engine/    # Rules/trading engine
│   │   └── types/
│   ├── migrations/    # D2 schema migrations
│   └── wrangler.toml
│
├── shared/             # Shared types/utilities
│   └── types/
│
├── SPECS.md           # Full specification
├── ROADMAP.md         # Project phases
└── AGENTS.md         # This file
```

---

## Key Interfaces

### Exchange Connector
```typescript
interface ExchangeConnector {
  connect(credentials: Credentials): Promise<boolean>;
  disconnect(): Promise<void>;
  getBalance(): Promise<Balance[]>;
  getPrice(symbol: string): Promise<number>;
  getCandles(symbol: string, interval: string, limit: number): Promise<Candle[]>;
  placeOrder(order: Order): Promise<OrderResult>;
  cancelOrder(orderId: string): Promise<boolean>;
  getOpenOrders(): Promise<Order[]>;
}
```

### Indicator (with Multi-Timeframe Support)
```typescript
interface Indicator {
  name: string;
  version: string;
  calculate(candles: Candle[]): IndicatorResult;
  validateParams(params: Record<string, number>): boolean;
}

interface MultiTimeframeIndicator {
  calculateForTimeframes(
    candles: Map<string, Candle[]>,
    intervals: string[]
  ): Map<string, IndicatorResult>;
}
```

### Advanced Rule (with Chaining & Triggers)
```typescript
interface Rule {
  id: string;
  user_id: string;
  name: string;
  enabled: boolean;
  conditions: Condition[];
  condition_logic: 'and' | 'or';
  triggers: Trigger[];
  chain?: {
    trigger_rule?: string;
    delay_ms?: number;
    pass_context?: boolean;
  };
  risk_modifier?: {
    type: 'multiply' | 'add' | 'set';
    value: number;
    scope: 'position' | 'trade' | 'session';
  };
}
```

### Condition (Advanced)
```typescript
interface Condition {
  id: string;
  name: string;
  enabled: boolean;
  logic: 'and' | 'or';
  timeframes?: string[];  // Multi-timeframe
  condition: SingleCondition;
}

interface SingleCondition {
  type: 'indicator' | 'price' | 'pattern' | 'time' | 'reference' | 'composite';
  indicator?: { name: string; params?: Record<string, number>; field?: string; };
  pattern?: { type: 'humps' | 'divergence' | 'crossover'; direction: 'up' | 'down'; count?: number; };
  reference?: { type: 'timeframe' | 'asset'; target: string; comparison: string; };
  composite?: { conditions: SingleCondition[]; logic: 'and' | 'or'; };
  operator: string;
  value: any;
}
```

### Trigger
```typescript
interface Trigger {
  id: string;
  type: 'trade' | 'notify' | 'adjust_risk' | 'webhook' | 'chain';
  config: TradeTrigger | NotifyTrigger | RiskTrigger | WebhookTrigger | ChainTrigger;
}
```

### Encrypted Secrets
```typescript
interface EncryptedSecrets {
  ciphertext: string;
  iv: string;
  auth_tag: string;
  key_id: string;
  encrypted_by: string;
  created_at: number;
  updated_at: number;
  version: number;
}
```

---

## Example Rule: Multi-Timeframe SOL Strategy

This is the example rule from the spec that demonstrates the advanced rules engine:

**"SOL Multi-Timeframe RSI + Bollinger + 3 Humps"**

```json
{
  "name": "SOL Multi-Timeframe RSI Divergence with Pattern",
  "condition_logic": "and",
  "conditions": [
    { "id": "cond_1", "timeframes": ["5m"], "condition": { "type": "composite", ... } },
    { "id": "cond_2", "timeframes": ["30m"], "condition": { "type": "indicator", "indicator": {"name":"rsi"}, "operator":"lt", "value":40 }},
    { "id": "cond_3", "timeframes": ["1h"], "condition": { "type": "indicator", "indicator": {"name":"rsi"}, "operator":"lt", "value":45 }},
    { "id": "cond_4", "timeframes": ["5m"], "condition": { "type": "pattern", "pattern": {"type":"humps","direction":"up","count":3} }},
    { "id": "cond_5", "timeframes": ["5m"], "condition": { "type": "reference", "reference": {"type":"asset","target":"btc"} }}
  ],
  "triggers": [
    { "type": "adjust_risk", "config": {"modifier":"multiply","value":0.5} },
    { "type": "trade", "config": {"action":"sell","amount_type":"percent_of_balance","amount":50} },
    { "type": "notify", "config": {"channel":"telegram","message":"..."} }
  ],
  "chain": { "trigger_rule": "rule_btc_recovery", "delay_ms": 3600000 }
}
```

Key features:
- 5 timeframes: 5m (execution), 30m & 1h (confirmation)
- Pattern: 3 humps detection
- Cross-asset: BTC as leading indicator
- Chained triggers: trade + risk adjust + notify
- Rule chaining: triggers recovery rule after 1 hour

---

## Database Schema (D2)

Key tables:
- `users` - User accounts and roles
- `credentials` - Exchange API key references
- `strategies` - Trading strategies
- `rules` - Trade rules/triggers
- `trades` - Trade history
- `positions` - Active positions
- `pairs` - Trading pairs
- `secrets` - Encrypted secrets metadata
- `audit_log` - Security audit events
- `configs` - User/strategy configurations

See `backend/migrations/` for full schema.

---

## API Conventions

### Response Format
```typescript
// Success
{ "success": true, "data": {...} }

// Error
{ "success": false, "error": { "code": "string", "message": "string" } }
```

### Status Codes
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Internal Error

### Authentication
- All routes except `/api/health` and `/api/auth/*` require JWT
- JWT in `Authorization: Bearer <token>` header
- Refresh token in HttpOnly cookie

---

## Security & Encryption

### Encryption Standards
- **Algorithm:** AES-256-GCM
- **Key Derivation:** PBKDF2 (100,000 iterations) or Argon2id
- **IV:** 12 bytes (random per encryption)
- **Auth Tag:** 16 bytes (GMAC)

### Secrets Storage
- Encrypted secrets stored in KV with user isolation
- Metadata in D2 (reference only, not plaintext)
- Never log or expose secret values
- Per-user encryption keys derived from user secrets

### Audit Logging
All security-relevant events logged:
- Login/logout
- API key changes
- Trade execution
- Config changes
- Failed authentication attempts

---

## Environment Variables

### Backend (Workers)
```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
JWT_SECRET=...
CF_ACCOUNT_ID=...
CF_D1_DATABASE_ID=...
CF_KV_NAMESPACE_ID=...
```

### Frontend
```
VITE_API_URL=...        # Workers API URL
VITE_GOOGLE_CLIENT_ID=...
```

---

## Common Development Tasks

### Running Locally
```bash
# Frontend
cd frontend && npm run dev

# Backend (with Wrangler)
cd backend && npx wrangler dev

# Both with tunnel for OAuth
```

### Database Migrations
```bash
cd backend && npx wrangler d1 migrations apply regarded-db
```

### Deployment
```bash
# Backend
cd backend && npx wrangler deploy

# Frontend
cd frontend && npm run build && npx wrangler pages deploy frontend/dist
```

---

## Known Limitations (Free Tier)

- 100k Worker requests/day
- 1GB KV storage
- 5GB D2 storage
- No websockets (use polling)
- Cold starts on Workers

---

## Roadmap & Integrations

### Vant Integration (Priority: High)
Vant (https://github.com/AI-H虔u/vant) is a memory/experience system for AI agents.

**Goals:**
- Store agent experiences and learnings
- Session persistence across restarts
- Strategy performance tracking
- Guard/Rules configuration versioning

**Implementation Ideas:**
- Create `lib/vant.ts` adapter
- Store guard configs in Vant memory
- Track strategy performance metrics
- Persist agent state across deployments

---

## Future Considerations

- Python engine for complex analysis
- Rust engine for HFT
- Backtesting module
- Multi-sig wallet support
- Telegram/Discord notifications
- Vant memory integration

---

*Last Updated: 2026-07-29*
*Version: 0.1.0*
