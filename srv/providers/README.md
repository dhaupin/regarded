# Provider Configurations

This directory contains platform-specific deployment configurations for Regarded.

## Structure

```
providers/
├── README.md            # This file
├── cloudflare/         # Cloudflare Pages + Workers
│   ├── _headers        # Caching & security headers (generated from headers.ts)
│   ├── _redirects     # URL redirects
│   ├── config.ts      # TypeScript config (imports from src/headers.ts)
│   └── wrangler.toml # Worker configuration
├── vercel/             # Vercel
│   ├── config.ts      # TypeScript config
│   └── vercel.json    # Vercel configuration
└── netlify/            # Netlify
    ├── config.ts      # TypeScript config
    └── netlify.toml  # Netlify configuration
```

## Global Headers

All providers share common headers defined in `srv/src/headers.ts`:
- Security: CSP, HSTS, X-Frame-Options, etc.
- Caching: immutable for assets, short for HTML
- CORS: Cross-origin policies

Providers can add their own headers that override global defaults.

## Usage

### Cloudflare (default)

1. **Backend Worker**:
   ```bash
   cd srv
   cp provider/cloudflare/wrangler.toml wrangler.toml
   npx wrangler d1 create regarded-db
   npx wrangler kv namespace create regarded-kv
   # Update wrangler.toml with IDs
   npx wrangler deploy
   ```

2. **Frontend**:
   ```bash
   cd app
   npm run build
   npx wrangler pages deploy dist
   ```

### Vercel

```bash
vercel --prod
# Or connect GitHub and deploy from dashboard
```

### Netlify

```bash
netlify deploy --prod
# Or connect GitHub and deploy from dashboard
```

## Environment Setup

Each provider requires:
- Database (D1 for Cloudflare)
- KV namespace for sessions/cache
- Environment secrets (JWT_SECRET, API keys, etc.)

See each provider's config file for details.
