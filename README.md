# Regarded

A KISS/DRY crypto trading agent platform that executes paper and live trades based on technical indicators and custom rulesets. Built for Cloudflare's free tier.

![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)
![Cloudflare](https://img.shields.io/badge/Cloudflare-Workers-orange)
![Tests](https://img.shields.io/badge/Tests-359-green)

## Features

- **Multi-Exchange Support**: Binance, Coinbase, Kraken, Solana, Jupiter
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
lib/                     # Core trading library (~40 modules)
├── regarded.ts          # Main entry point
├── types.ts            # Shared TypeScript interfaces
├── connectors/         # Exchange connectors
│   ├── base.ts        # Base connector class
│   ├── binance.ts     # Binance
│   ├── coinbase.ts    # Coinbase
│   ├── kraken.ts      # Kraken
│   ├── solana.ts      # Solana
│   └── jupiter.ts     # Jupiter
├── adapters/           # Notification adapters
│   ├── telegram.ts    # Telegram
│   ├── discord.ts    # Discord
│   ├── slack.ts      # Slack
│   └── webhook.ts    # Webhooks
├── indicators.ts       # RSI, KDJ, Bollinger, MACD
├── patterns.ts        # Humps, divergence, crossovers
├── rules.ts           # Rules engine
├── runner.ts          # TradingAgent orchestration
├── portfolio.ts       # Position management
├── guard.ts           # Risk guardrails
├── backtest.ts       # Backtesting engine
├── news.ts           # News service
├── psy.ts            # Market psychology
└── ...                # Auth, encryption, cache, network, scheduler, etc.

srv/                    # Cloudflare Workers server
├── src/
│   ├── app.ts         # Hono app entry
│   ├── env.ts         # Environment types
│   └── routes/        # API routes (auth, api, webhooks)
└── providers/         # Provider-specific configs

app/                    # Frontend (Vite/React)
└── src/
    ├── App.tsx       # Main app
    └── pages/        # Dashboard, Strategies, Trades, etc.
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

## Deployment

See [DEPLOY.md](./DEPLOY.md) for detailed deployment instructions.

### Quick Deploy

```bash
# Backend (Workers)
cd srv && npm run deploy

# Frontend (Pages) - push to main/staging to trigger auto-deploy
```

## Tech Stack

- **Runtime**: Cloudflare Workers
- **Framework**: Hono (API), React 18 (Frontend), Vite 5
- **Database**: D2 (SQLite), KV Namespace
- **Auth**: Google OAuth 2.0

## For Developers

- [AGENTS.md](./AGENTS.md) - Developer guide and codebase docs
- [ROADMAP.md](./ROADMAP.md) - Version history and upcoming features
- [DEPLOY.md](./DEPLOY.md) - Deployment instructions

## License

[MIT](https://github.com/dhaupin/regarded/blob/main/LICENSE)

