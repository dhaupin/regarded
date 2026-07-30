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
lib/
├── regarded.ts        # Main entry point
├── types.ts           # All TypeScript interfaces
├── error.ts           # Error codes, factory, utilities
├── encrypt.ts        # AES-256-GCM encryption
├── audit.ts          # Audit logging
├── waf.ts            # Rate limiting, IP blocking
├── qos.ts            # Circuit breaker, rate limiter
├── network.ts        # HTTP client with retry
├── scheduler.ts      # Cron scheduler
├── auth.ts           # JWT, OAuth, sessions
├── config.ts         # Config registry, secrets
├── storage.ts        # KV cache
├── cache.ts          # LRU cache with TTL
├── event.ts          # Event emitter
├── api.ts            # HTTP handlers
├── indicators.ts     # RSI, KDJ, Bollinger, MACD
├── patterns.ts       # Pattern detection
├── rules.ts          # Rules engine
├── connectors/       # Exchange connectors
│   ├── base.ts       # Base connector class
│   ├── kraken.ts     # Kraken exchange
│   ├── solana.ts     # Solana wallet
│   └── jupiter.ts    # Jupiter aggregator
└── runner.ts         # Trading agent runner
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
