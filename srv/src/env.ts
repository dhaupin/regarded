/**
 * Environment Types
 * 
 * Cloudflare Workers environment bindings.
 */

export interface Env {
  // Database
  DB: D1Database;
  
  // KV Namespaces
  KV_CACHE: KVNamespace;
  KV_SESSIONS: KVNamespace;
  KV_CONFIG: KVNamespace;
  
  // Environment variables
  NODE_ENV: string;
  APP_URL: string;
  
  // Auth
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  JWT_SECRET: string;
  
  // API Keys (secrets)
  TELEGRAM_BOT_TOKEN?: string;
  DISCORD_BOT_TOKEN?: string;
  SLACK_BOT_TOKEN?: string;
}
