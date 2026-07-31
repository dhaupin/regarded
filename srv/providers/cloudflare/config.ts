/**
 * Cloudflare Provider Configuration
 * 
 * Deployment configuration for Cloudflare Pages + Workers.
 * Copy to srv/wrangler.toml before deploying.
 */

import type { ProviderConfig } from '../providers';

export const cloudflareConfig: ProviderConfig = {
  siteUrl: 'https://regarded.creadev.org',
  siteName: 'Regarded',
  outputDirectory: 'dist',
  
  // Headers are merged with global defaults in providers.ts
  // Add provider-specific overrides here
  headers: [
    // No overrides by default - uses global headers from headers.ts
  ],
};

// ============================================================================
// Full wrangler.toml (copy to srv/wrangler.toml and update IDs)
// ============================================================================

/*
name = "regarded-backend"
main = "src/index.ts"
compatibility_date = "2024-01-01"
node_compat = true

# D2 Database
[[d1_databases]]
binding = "DB"
database_name = "regarded-db"
database_id = "your-database-id-here"

# KV Namespace
[[kv_namespaces]]
binding = "KV"
id = "your-kv-namespace-id-here"

# Environment variables (set via: npx wrangler secret put <name>)
# GOOGLE_CLIENT_ID
# GOOGLE_CLIENT_SECRET
# JWT_SECRET

[env.staging]
name = "regarded-backend-staging"

[env.production]
name = "regarded-backend-prod"
*/
