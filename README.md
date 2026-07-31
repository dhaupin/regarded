# Regarded

A KISS/DRY crypto trading bot platform that executes paper and live trades based on technical indicators and custom rulesets. Built for Cloudflare's free tier.

![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)
![Cloudflare](https://img.shields.io/badge/Cloudflare-Workers-orange)
![Tests](https://img.shields.io/badge/Tests-359-green)

## Features

- **Multi-Exchange Support**: Kraken, Solana, Jupiter connectors
- **Technical Indicators**: RSI, KDJ, Bollinger Bands, MACD
- **Pattern Detection**: Humps, divergence, crossovers, and more
- **Advanced Rules Engine**: Multi-timeframe conditions, rule chaining, risk modifiers
- **Risk Management**: Psychology guards, position sizing, daily loss limits
- **Paper Trading**: Full simulation mode before going live
- **Notifications**: Telegram, Discord, Slack, webhooks

## Quick Start

```bash
# Install dependencies
npm install

# Run type check
npm run typecheck

# Run tests
npm test

# Lint
npm run lint
```

## Architecture

```
lib/                     # Core trading engine
├── regarded.ts          # Main entry point
├── types.ts            # All TypeScript interfaces
├── error.ts            # Error codes, factory, utilities
├── encrypt.ts          # AES-256-GCM encryption
├── audit.ts            # Audit logging
├── waf.ts              # Rate limiting, IP blocking
├── qos.ts              # Circuit breaker, rate limiter
├── network.ts          # HTTP client with retry
├── scheduler.ts        # Cron scheduler
├── auth.ts             # JWT, OAuth, sessions
├── config.ts           # Config registry, secrets
├── storage.ts          # KV cache
├── cache.ts            # LRU cache with TTL
├── event.ts            # Event emitter
├── api.ts              # HTTP handlers
├── indicators.ts       # RSI, KDJ, Bollinger, MACD
├── patterns.ts         # Pattern detection
├── rules.ts            # Rules engine
├── notify.ts           # Canonical notification handler
├── runner.ts           # Trading agent runner
├── portfolio.ts        # Position & portfolio management
├── guard.ts           # Risk guardrails
├── psy.ts             # Market psychology analysis
├── connectors/        # Exchange connectors
│   ├── base.ts       # Base connector class
│   ├── kraken.ts     # Kraken exchange
│   ├── solana.ts     # Solana wallet
│   └── jupiter.ts    # Jupiter aggregator
└── adapters/         # Notification adapters
    ├── base.ts       # Base adapter class, registry
    ├── telegram.ts   # Telegram adapter
    ├── discord.ts   # Discord adapter
    ├── slack.ts     # Slack adapter
    └── webhook.ts   # Generic webhook adapter

srv/                    # Cloudflare Workers server
├── src/
│   ├── index.ts      # Hono app entry
│   ├── env.ts        # Environment types
│   └── routes/       # API route handlers
│       ├── auth.ts   # Auth endpoints
│       ├── api.ts    # Main API
│       └── webhooks.ts # Webhook handlers
├── migrations/       # D2 schema migrations
└── wrangler.toml    # Workers config

app/                    # Frontend placeholder (Vite/React)
```

## Example Usage

```typescript
import { createConnector, createRulesEngine, calculateIndicator } from './lib/regarded';

// Create exchange connector
const connector = await createConnector('kraken');
await connector.connect({ apiKey: '...', secret: '...' });

// Calculate indicator
const candles = await connector.getCandles('SOL/USD', '5m', 100);
const rsi = calculateIndicator('rsi', candles, { period: 14 });

// Create rules engine
const engine = createRulesEngine({ maxChainDepth: 3 });
await engine.evaluateRule(rule, context);
```

## Tech Stack

- **Runtime**: Cloudflare Workers
- **Framework**: Hono (API), React 18 (Frontend), Vite 5
- **Database**: D2 (SQLite), KV Namespace
- **Auth**: Google OAuth 2.0

## License

MIT
