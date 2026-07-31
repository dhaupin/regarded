-- Regarded D2 Database Schema
-- Initial migration: Core tables
-- Run with: npx wrangler d1 migrations apply regarded-db

-- ============================================================================
-- Users Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  role TEXT DEFAULT 'trader' CHECK(role IN ('admin', 'trader', 'viewer')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  settings TEXT  -- JSON blob for user preferences
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ============================================================================
-- Credentials Table
-- Stores encrypted API key references (not the actual keys)
-- ============================================================================
CREATE TABLE IF NOT EXISTS credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  exchange TEXT NOT NULL CHECK(exchange IN ('kraken', 'coinbase', 'binance', 'solana')),
  label TEXT,
  key_id TEXT NOT NULL,  -- Reference to encrypted key in KV
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_credentials_user ON credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_credentials_exchange ON credentials(exchange);

-- ============================================================================
-- Trading Pairs Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS pairs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  base TEXT NOT NULL,
  quote TEXT NOT NULL,
  exchange TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pairs_user ON pairs(user_id);
CREATE INDEX IF NOT EXISTS idx_pairs_exchange ON pairs(exchange);

-- ============================================================================
-- Strategies Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS strategies (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  config TEXT NOT NULL,  -- JSON: indicators, risk params, etc.
  mode TEXT DEFAULT 'paper' CHECK(mode IN ('paper', 'live')),
  enabled INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_strategies_user ON strategies(user_id);
CREATE INDEX IF NOT EXISTS idx_strategies_enabled ON strategies(enabled);

-- ============================================================================
-- Rules Table
-- Trading rules with conditions and triggers
-- ============================================================================
CREATE TABLE IF NOT EXISTS rules (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  strategy_id TEXT,
  name TEXT NOT NULL,
  config TEXT NOT NULL,  -- JSON: conditions, triggers, chain config
  enabled INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (strategy_id) REFERENCES strategies(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_rules_user ON rules(user_id);
CREATE INDEX IF NOT EXISTS idx_rules_strategy ON rules(strategy_id);
CREATE INDEX IF NOT EXISTS idx_rules_enabled ON rules(enabled);

-- ============================================================================
-- Trades Table
-- Complete trade history
-- ============================================================================
CREATE TABLE IF NOT EXISTS trades (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  strategy_id TEXT,
  rule_id TEXT,
  pair TEXT NOT NULL,
  side TEXT NOT NULL CHECK(side IN ('buy', 'sell')),
  type TEXT NOT NULL CHECK(type IN ('market', 'limit', 'stop')),
  amount REAL NOT NULL,
  price REAL,
  fee REAL DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('pending', 'filled', 'cancelled', 'failed')),
  mode TEXT NOT NULL CHECK(mode IN ('paper', 'live')),
  executed_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (strategy_id) REFERENCES strategies(id) ON DELETE SET NULL,
  FOREIGN KEY (rule_id) REFERENCES rules(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_trades_user ON trades(user_id);
CREATE INDEX IF NOT EXISTS idx_trades_pair ON trades(pair);
CREATE INDEX IF NOT EXISTS idx_trades_executed ON trades(executed_at);
CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);

-- ============================================================================
-- Positions Table
-- Current open positions
-- ============================================================================
CREATE TABLE IF NOT EXISTS positions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  strategy_id TEXT,
  pair TEXT NOT NULL,
  side TEXT NOT NULL CHECK(side IN ('long', 'short')),
  entry_price REAL NOT NULL,
  amount REAL NOT NULL,
  current_price REAL,
  unrealized_pnl REAL DEFAULT 0,
  opened_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (strategy_id) REFERENCES strategies(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_positions_user ON positions(user_id);
CREATE INDEX IF NOT EXISTS idx_positions_pair ON positions(pair);
CREATE INDEX IF NOT EXISTS idx_positions_strategy ON positions(strategy_id);

-- ============================================================================
-- Audit Log Table
-- Security and activity tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  event TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details TEXT,  -- JSON
  severity TEXT DEFAULT 'low' CHECK(severity IN ('low', 'medium', 'high', 'critical')),
  ip_address TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_event ON audit_log(event);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_severity ON audit_log(severity);

-- ============================================================================
-- Secrets Metadata Table
-- Stores references to encrypted secrets in KV
-- ============================================================================
CREATE TABLE IF NOT EXISTS secrets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  key_id TEXT NOT NULL,  -- KV key for encrypted data
  algorithm TEXT NOT NULL DEFAULT 'AES-256-GCM',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_secrets_user ON secrets(user_id);

-- ============================================================================
-- Configurations Table
-- User and strategy configurations
-- ============================================================================
CREATE TABLE IF NOT EXISTS configs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,  -- JSON
  scope TEXT DEFAULT 'user' CHECK(scope IN ('user', 'strategy', 'global')),
  strategy_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (strategy_id) REFERENCES strategies(id) ON DELETE CASCADE,
  UNIQUE(user_id, key, scope)
);

CREATE INDEX IF NOT EXISTS idx_configs_user ON configs(user_id);
CREATE INDEX IF NOT EXISTS idx_configs_key ON configs(key);
CREATE INDEX IF NOT EXISTS idx_configs_strategy ON configs(strategy_id);
