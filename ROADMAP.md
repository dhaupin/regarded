# Regarded - Project Roadmap

## Overview

A phased approach to building the Regarded crypto trading bot platform. Each phase delivers working, testable functionality while maintaining the KISS/DRY principles.

---

## Phase 0: Foundation (Week 1-2)

**Goal:** Set up infrastructure, authentication, and basic UI skeleton

### Infrastructure Setup
- [ ] Initialize Cloudflare Pages project with Vite/React
- [ ] Set up Cloudflare Workers with Hono
- [ ] Configure D2 database and run migrations
- [ ] Set up KV namespace for sessions and config
- [ ] Configure GitHub Actions for CI/CD to Cloudflare

### Authentication
- [ ] Set up Google OAuth application
- [ ] Implement OAuth flow in Workers
- [ ] Create JWT token management
- [ ] Build session management in KV
- [ ] Create user table and basic CRUD

### Security Infrastructure
- [ ] Implement AES-256-GCM encryption module
- [ ] Build PBKDF2 key derivation (100k iterations)
- [ ] Create encrypted secrets storage in KV
- [ ] Build audit logging system
- [ ] Implement rate limiting middleware

### Config Registry
- [ ] Build global config system
- [ ] Create user config storage
- [ ] Build strategy config system

### Frontend Shell
- [ ] Initialize Vite + React + TypeScript project
- [ ] Set up routing (React Router)
- [ ] Create layout components (Header, Sidebar)
- [ ] Implement dark theme design system
- [ ] Create Login page with Google button
- [ ] Build User Menu component

### Backend API - Core
- [ ] Health check endpoint
- [ ] Auth endpoints (login, logout, me)
- [ ] User endpoints (get, update)
- [ ] Config endpoints (global, user, strategy)
- [ ] Secrets management endpoints
- [ ] Error handling middleware

**Deliverable:** Users can sign in and see empty dashboard

---

## Phase 1: Connectors & Data (Week 3-4)

**Goal:** Connect to exchanges and display market data

### Exchange Connector Framework
- [ ] Define Connector interface
- [ ] Create base connector class
- [ ] Implement Kraken connector (paper trading)
- [ ] Implement Solana wallet connector
- [ ] Implement Jupiter aggregator connector

### Market Data
- [ ] Fetch and cache prices
- [ ] Fetch candle data (all timeframes)
- [ ] Store candle data in D2
- [ ] API endpoint for price queries
- [ ] API endpoint for candle history

### Frontend - Wallets Page
- [ ] List connected exchanges
- [ ] Connect exchange modal (API key input)
- [ ] Display balances per exchange
- [ ] Connection status indicators

**Deliverable:** Users can connect exchange and see balances

---

## Phase 2: Indicators Engine (Week 5-6)

**Goal:** Build the technical indicator system with multi-timeframe support

### Indicator Framework
- [ ] Define Indicator interface with multi-timeframe support
- [ ] Create indicator base class
- [ ] Build indicator registry with factory pattern
- [ ] Implement multi-timeframe indicator calculator

### Implement Indicators
- [ ] RSI - Relative Strength Index
- [ ] KDJ - Stochastic Oscillator
- [ ] Bollinger Bands
- [ ] MACD - Moving Average Convergence Divergence

### Pattern Recognition
- [ ] Build pattern detection framework
- [ ] Implement "3 humps" pattern detector
- [ ] Implement divergence detection
- [ ] Implement crossover detection
- [ ] Implement double top/bottom detection

### Indicator API
- [ ] Calculate endpoint (single timeframe)
- [ ] Calculate endpoint (multi-timeframe)
- [ ] Batch calculate for multiple indicators
- [ ] Cache results in KV

### Frontend - Indicator Display
- [ ] Indicator value cards
- [ ] Multi-timeframe comparison view
- [ ] Pattern detection alerts
- [ ] Indicator chart overlays

**Deliverable:** All 4 indicators calculate correctly with multi-timeframe support, pattern detection works

---

## Phase 3: Rules Engine (Week 7-8)

**Goal:** Build the advanced rules/triggers system with chaining and multi-timeframe support

### Rules Engine Core
- [ ] Define advanced Rule, Condition, Trigger interfaces
- [ ] Build condition evaluator (single & multi-timeframe)
- [ ] Build trigger executor
- [ ] Build rule chainer with loop prevention
- [ ] Create rule registry

### Condition Types
- [ ] Indicator conditions (RSI < 30, MACD cross, etc.)
- [ ] Price conditions
- [ ] Time-based conditions
- [ ] Pattern conditions (3 humps, divergence, etc.)
- [ ] Reference conditions (multi-timeframe comparison)
- [ ] Composite conditions (AND/OR combinations)

### Trigger Types
- [ ] Trade trigger (buy/sell/close)
- [ ] Risk adjustment trigger
- [ ] Notify trigger (Telegram, Discord, email)
- [ ] Webhook trigger
- [ ] Chain trigger (trigger another rule)

### Rule Chaining
- [ ] Implement rule-to-rule chaining
- [ ] Add configurable delay between chains
- [ ] Implement chain depth limiting (prevent infinite loops)
- [ ] Add context passing between chained rules

### Rules API
- [ ] CRUD endpoints for rules
- [ ] Test rule endpoint (evaluate against historical data)
- [ ] Enable/disable endpoint
- [ ] Chain management endpoints

### Frontend - Rules Builder
- [ ] Rule list view with status
- [ ] Advanced create/edit rule form
- [ ] Condition builder with multi-timeframe support
- [ ] Pattern selector (humps, divergence, etc.)
- [ ] Trigger configuration (trade, risk, notify)
- [ ] Chain configuration UI
- [ ] Test rule UI
- [ ] Visual rule builder with drag-and-drop

**Deliverable:** Users can create complex multi-timeframe rules with patterns and chained triggers

### Example Rule Template (From Spec)
The "SOL Multi-Timeframe RSI + Bollinger + 3 Humps" rule demonstrates:
- Multi-timeframe analysis (5m, 30m, 1h)
- Composite conditions (RSI in Bollinger)
- Pattern detection (3 humps)
- Cross-asset reference (BTC leading indicator)
- Chained triggers (trade + risk adjust + notify)
- Rule-to-rule chaining

---

## Phase 4: Strategies & Execution (Week 9-10)

**Goal:** Combine rules into strategies and execute trades

### Strategy Management
- [ ] Define Strategy interface
- [ ] Create Strategy CRUD
- [ ] Build strategy executor

### Trade Execution
- [ ] Order placement (paper)
- [ ] Order cancellation
- [ ] Trade recording
- [ ] Position tracking

### Risk Management
- [ ] Position sizing rules
- [ ] Stop-loss implementation
- [ ] Take-profit implementation
- [ ] Max daily trades limit

### Strategy API
- [ ] CRUD endpoints
- [ ] Start/stop strategy
- [ ] Backtest endpoint

### Frontend - Strategies Page
- [ ] Strategy list with status
- [ ] Create strategy wizard
- [ ] Configure pairs, intervals, rules
- [ ] Performance metrics display

**Deliverable:** Full paper trading loop works end-to-end

---

## Phase 5: Dashboard & Polish (Week 11-12)

**Goal:** Complete the user experience

### Dashboard
- [ ] Portfolio summary cards
- [ ] Active positions table
- [ ] Recent trades list
- [ ] Performance chart

### Settings
- [ ] Profile settings
- [ ] Notification preferences
- [ ] API key management

### Polish
- [ ] Loading states
- [ ] Error handling UI
- [ ] Mobile responsiveness
- [ ] Accessibility improvements

**Deliverable:** Production-ready MVP

---

## Phase 2+ Features (Post-MVP)

### Exchange Extensions
- [ ] Binance connector
- [ ] Coinbase connector
- [ ] More DEX support

### Advanced Features
- [ ] Backtesting engine
- [ ] Multi-asset correlation rules (e.g., BTC confirmation)
- [ ] Custom pattern recognition
- [ ] Telegram/Discord notifications

### Engine Extensions
- [ ] Python engine setup
- [ ] Rust engine setup

---

## Timeline Summary

| Phase | Duration | Key Deliverable |
|-------|----------|-----------------|
| Phase 0 | 2 weeks | Auth + UI shell |
| Phase 1 | 2 weeks | Exchange connectors |
| Phase 2 | 2 weeks | Indicators engine |
| Phase 3 | 2 weeks | Rules engine |
| Phase 4 | 2 weeks | Strategies + execution |
| Phase 5 | 2 weeks | Dashboard + polish |
| **Total** | **12 weeks** | **MVP** |

---

## Release Strategy

### Alpha Releases
- After Phase 0: Internal testing (auth works)
- After Phase 2: Beta testers (indicators working)
- After Phase 4: Public beta (paper trading)

### v1.0
- After Phase 5: Production release
- Stable API
- Documentation

---

## Dependencies & Priorities

### Blocking Dependencies
```
Phase 0 ──┬──► Phase 1 ──┬──► Phase 2 ──┬──► Phase 3 ──┬──► Phase 4 ──┬──► Phase 5
          │              │              │              │              │
          ▼              ▼              ▼              ▼              ▼
      Auth/Infra    Connectors     Indicators      Rules        Dashboard
```

### Parallel Work
- Frontend components can be built ahead of backend
- Indicator calculations can be tested independently
- Connector stubs can exist before real implementation

---

## Implementation Status (2026-07-29)

### ✅ Completed Core Modules

| Module | Status | Notes |
|--------|--------|-------|
| `lib/error.ts` | ✅ Done | Error codes, factory, utilities |
| `lib/event.ts` | ✅ Done | Event emitter |
| `lib/audit.ts` | ✅ Done | Audit logging |
| `lib/encrypt.ts` | ✅ Done | AES-256-GCM encryption |
| `lib/cache.ts` | ✅ Done | LRU cache with TTL |
| `lib/waf.ts` | ✅ Done | Rate limiting, IP blocking |
| `lib/qos.ts` | ✅ Done | Circuit breaker, rate limiter |
| `lib/network.ts` | ✅ Done | HTTP client with retry |
| `lib/scheduler.ts` | ✅ Done | Cron scheduler, heartbeat |
| `lib/auth.ts` | ✅ Done | JWT, OAuth, sessions |
| `lib/config.ts` | ✅ Done | Config registry, secrets |
| `lib/storage.ts` | ✅ Done | Utility functions |
| `lib/indicators.ts` | ✅ Done | RSI, MACD, Bollinger, etc. |
| `lib/patterns.ts` | ✅ Done | Humps, divergence detection |
| `lib/rules.ts` | ✅ Done | Rules engine, validator |
| `lib/connectors.ts` | ✅ Done | Factory + registry |
| `lib/connectors/base.ts` | ✅ Done | Base connector interface |
| `lib/connectors/kraken.ts` | ✅ Done | Kraken exchange |
| `lib/connectors/solana.ts` | ✅ Done | Solana wallet |
| `lib/connectors/jupiter.ts` | ✅ Done | Jupiter aggregator |
| `lib/portfolio.ts` | ✅ Done | Position management + persistence |
| `lib/guard.ts` | ✅ Done | Risk checks + persistence |
| `lib/runner.ts` | ✅ Done | TradingAgent orchestration |
| `lib/backtest.ts` | ✅ Done | Backtesting engine |
| `lib/news.ts` | ✅ Done | News service |
| `lib/psy.ts` | ✅ Done | Market psychology |

### ⚠️ Gaps & TODO

| Gap | Priority | Description |
|-----|----------|-------------|
| **Webhook API** | High | External signal input (TradingView, etc.) |
| **Live trading connectors** | Medium | Connectors are paper trading only |
| **Persistence integration** | Medium | Connect runner to KV storage |
| **Rules in execution flow** | Low | Already integrated via config.validator |
| **News in guard** | Low | Dynamic blackouts added to guard |

### Next Steps

1. **Webhook support** - Add webhook endpoint for external signals
2. **Runner persistence** - Connect TradingAgent to KV for state persistence
3. **Live trading** - Implement real trading in connectors
4. **Notifications** - Telegram/Discord webhook triggers

---

*Last Updated: 2026-07-29*
*Version: 0.2.0*
