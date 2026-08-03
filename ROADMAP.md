# Regarded - Project Roadmap

## Versions

### v0.8.6

Core engine complete.

**Connectors:**
- Binance exchange
- Coinbase exchange
- Kraken exchange
- Solana wallet
- Jupiter aggregator

**Indicators:**
- RSI - Relative Strength Index
- KDJ - Stochastic Oscillator
- Bollinger Bands
- MACD - Moving Average Convergence Divergence

**Pattern Recognition:**
- 3 humps detection
- Divergence detection
- Crossover detection
- Double top/bottom detection

**Core Modules:**
- Rules engine with chaining and multi-timeframe support
- Portfolio management with persistence
- Risk guard system with persistence
- TradingAgent runner orchestration
- Backtesting engine
- News service
- Market psychology analysis

**Notifications:**
- Telegram adapter
- Discord adapter
- Slack adapter
- Webhook adapter

**Infrastructure:**
- AES-256-GCM encryption
- PBKDF2 key derivation
- Audit logging
- Rate limiting & WAF
- QoS & circuit breaker
- HTTP client with retry
- Cron scheduler

---

### v0.9.x

**Goals:**
- Webhook API for external signals
- Runner persistence (connect TradingAgent to KV)
- Live trading connectors

---

### v1.0.0

**Goals:**
- Production-ready MVP
- Frontend dashboard complete
- Stable API

---

## Implementation Details

### Completed Modules

| Module | Status |
|--------|--------|
| `lib/error.ts` | ✅ Done |
| `lib/event.ts` | ✅ Done |
| `lib/audit.ts` | ✅ Done |
| `lib/encrypt.ts` | ✅ Done |
| `lib/cache.ts` | ✅ Done |
| `lib/waf.ts` | ✅ Done |
| `lib/qos.ts` | ✅ Done |
| `lib/network.ts` | ✅ Done |
| `lib/scheduler.ts` | ✅ Done |
| `lib/auth.ts` | ✅ Done |
| `lib/config.ts` | ✅ Done |
| `lib/storage.ts` | ✅ Done |
| `lib/indicators.ts` | ✅ Done |
| `lib/patterns.ts` | ✅ Done |
| `lib/rules.ts` | ✅ Done |
| `lib/connectors.ts` | ✅ Done |
| `lib/connectors/base.ts` | ✅ Done |
| `lib/connectors/binance.ts` | ✅ Done |
| `lib/connectors/coinbase.ts` | ✅ Done |
| `lib/connectors/kraken.ts` | ✅ Done |
| `lib/connectors/solana.ts` | ✅ Done |
| `lib/connectors/jupiter.ts` | ✅ Done |
| `lib/adapters/telegram.ts` | ✅ Done |
| `lib/adapters/discord.ts` | ✅ Done |
| `lib/adapters/slack.ts` | ✅ Done |
| `lib/adapters/webhook.ts` | ✅ Done |
| `lib/portfolio.ts` | ✅ Done |
| `lib/guard.ts` | ✅ Done |
| `lib/runner.ts` | ✅ Done |
| `lib/backtest.ts` | ✅ Done |
| `lib/news.ts` | ✅ Done |
| `lib/psy.ts` | ✅ Done |

### Gaps & TODO

| Gap | Priority |
|-----|----------|
| Webhook API | High |
| Runner persistence (KV) | Medium |
| Live trading connectors | Medium |

### Next Steps

1. Webhook support - Add webhook endpoint for external signals
2. Runner persistence - Connect TradingAgent to KV for state persistence
3. Live trading - Implement real trading in connectors

---

## Future Integrations

### Vant Integration
Vant (https://github.com/dhaupin/vant) is a memory/experience system for AI agents.

- Store agent experiences and learnings
- Session persistence across restarts
- Strategy performance tracking
- Guard/Rules configuration versioning

### Future Considerations

- Python engine for complex analysis
- Rust engine for HFT
- Multi-sig wallet support

---

## Related Docs

- [README.md](./README.md) - Project overview and quick start
- [AGENTS.md](./AGENTS.md) - Developer guide and codebase documentation
- [DEPLOY.md](./DEPLOY.md) - Deployment instructions

---

*Last Updated: 2026-08-02*
*Version: 0.8.6*

[View on GitHub](https://github.com/dhaupin/regarded)
