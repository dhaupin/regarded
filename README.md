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

## Deployment

This guide covers deploying to Cloudflare Pages (frontend) and Cloudflare Workers (backend).

### Prerequisites

- Cloudflare account
- Node.js 18+

---

### 1. Cloudflare Resources

Create these resources in Cloudflare dashboard:

| Resource | Type | Name |
|----------|------|------|
| D2 Database | D1 | `regarded-db` |
| KV Namespace | KV | `regarded-kv` |

---

### 2. Backend (Workers)

#### Configure wrangler.toml

Update `srv/providers/cloudflare/wrangler.toml` with your actual IDs:

```toml
[[d1_databases]]
binding = "DB"
database_name = "regarded-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  # From dashboard

[[kv_namespaces]]
binding = "KV"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"  # From dashboard
```

#### Set Secrets

```bash
cd srv

# Login to Cloudflare (if not already)
npx wrangler login

# Set required secrets (replace with your values)
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put JWT_SECRET
```

**Getting Google OAuth credentials:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project → APIs & Services → Credentials
3. Create OAuth 2.0 Client ID
4. Add authorized redirect URI: `https://your-domain/auth/google/callback`

#### Install Dependencies

```bash
cd srv
npm install
```

#### Run Locally

```bash
npm run dev
```

#### Deploy to Production

```bash
npm run deploy
```

Or deploy to specific environment:
```bash
npm run deploy:staging  # Deploy to staging
npm run deploy:prod     # Deploy to production
```

---

### 3. Frontend (Pages)

#### Configure Environment

Copy and configure `app/.env.example`:

```bash
cp app/.env.example app/.env
```

Edit `app/.env`:
```env
# Production: Workers URL after deployment
VITE_API_URL=https://your-workers-domain.workers.dev
```

#### Build & Deploy via GitHub

1. Push to `main` branch (or merge staging to main)
2. In Cloudflare Dashboard → Pages → regarded
3. Configure:

| Setting | Value |
|---------|-------|
| Production branch | `main` |
| Build command | `npm run build:frontend` |
| Build output directory | `app/dist` |

4. Add custom domain (optional)

#### Local Development

```bash
# Frontend only (needs workers running)
cd app
npm run dev

# Or with local workers proxy
cd app
VITE_API_URL=http://localhost:8787 npm run dev
```

---

### 4. Environment Variables Summary

| Variable | Where | Description |
|----------|-------|-------------|
| `GOOGLE_CLIENT_ID` | Workers (secret) | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | Workers (secret) | Google OAuth Client Secret |
| `JWT_SECRET` | Workers (secret) | Secret for JWT tokens |
| `VITE_API_URL` | Frontend (.env) | Workers API URL |

---

### 5. Database Migrations

After deploying workers, run D2 migrations:

```bash
cd srv
npx wrangler d1 migrations apply regarded-db
```

---

### Quick Deploy Commands

```bash
# Full deploy (both)
cd srv && npm run deploy                    # Backend
# Then trigger Pages deploy via GitHub push

# Or from root
npm run build:frontend                     # Build frontend
cd srv && npm run deploy                   # Deploy backend
```

## Tech Stack

- **Runtime**: Cloudflare Workers
- **Framework**: Hono (API), React 18 (Frontend), Vite 5
- **Database**: D2 (SQLite), KV Namespace
- **Auth**: Google OAuth 2.0

## License

MIT
