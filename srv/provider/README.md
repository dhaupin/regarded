# Provider Configurations

This directory contains platform-specific deployment configurations for Regarded.

## Structure

```
provider/
├── cloudflare/          # Cloudflare Pages + Workers
│   ├── _headers         # Caching & security headers
│   ├── _redirects      # URL redirects
│   └── wrangler.toml   # Worker configuration
├── vercel/              # Vercel
│   └── vercel.json     # Vercel configuration
└── netlify/             # Netlify
    └── netlify.toml    # Netlify configuration
```

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
