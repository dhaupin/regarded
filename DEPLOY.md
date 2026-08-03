# Deployment Guide

Detailed instructions for deploying Regarded to Cloudflare.

## Prerequisites

- Cloudflare account
- Node.js 18+
- GitHub repository (for CI/CD)

---

## 1. Cloudflare Resources

Create these resources in the Cloudflare dashboard **before setting up secrets**:

| Resource | Type | Name |
|----------|------|------|
| D2 Database | D1 | `regarded-db` |
| KV Namespace | KV | `regarded-kv` |

### Getting Resource IDs

After creating resources, get their IDs from the dashboard:

- **D1 Database ID**: Found in the database details page URL: `https://dash.cloudflare.com/<account>/d1/<database-id>`
- **KV Namespace ID**: Found in KV → namespace details page URL: `https://dash.cloudflare.com/<account>/kv/namespaces/<namespace-id>`

You'll need these IDs for the GitHub secrets below.

---

## 2. Backend (Workers)

### Configure wrangler.toml

The wrangler.toml uses environment variables for D1/KV IDs (update-safe for forks):

```toml
# srv/providers/cloudflare/wrangler.toml
main = "../../dist/worker.js"

[[d1_databases]]
binding = "DB"
database_name = "${CF_D1_NAME}"
database_id = "${CF_D1_ID}"

[[kv_namespaces]]
binding = "KV"
id = "${CF_KV_ID}"
```

IDs are injected via GitHub secrets (CI/CD) or Wrangler secrets (local).

### Set Secrets

#### GitHub Secrets (CI/CD)

Set these in GitHub → Settings → Secrets → Actions:

| Secret | Description |
|--------|-------------|
| `CF_ACCOUNT_ID` | Cloudflare Account ID |
| `CF_API_TOKEN` | Cloudflare API Token |
| `CF_D1_NAME` | D1 database name (e.g., "regarded-db") |
| `CF_D1_ID` | D1 database ID (from Cloudflare dashboard) |
| `CF_KV_ID` | KV namespace ID (from Cloudflare dashboard) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `JWT_SECRET` | JWT signing secret |

#### Local Development

**Recommended: Use Wrangler secrets** (same as production)

```bash
cd srv

# Set secrets via Wrangler (recommended - same as production)
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put JWT_SECRET
```

**Alternative: .env file** (not recommended - for local testing only)

Create `srv/.env`:
```env
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
JWT_SECRET=your-jwt-secret
```

> ⚠️ **Important**: Never commit `.env` files to version control. Add `srv/.env` to `.gitignore`.

#### Getting Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project → APIs & Services → Credentials
3. Create OAuth 2.0 Client ID
4. Add authorized redirect URI: `https://your-domain/auth/google/callback`

### Install Dependencies

```bash
cd srv
npm install
```

### Run Locally

```bash
cd srv
npm run dev
```

### Deploy via GitHub Actions (Recommended)

Workers are deployed using GitHub Actions:

1. Go to GitHub → Repository → Settings → Secrets and variables → Actions
2. Add these secrets:

| Secret | Value |
|--------|-------|
| `CF_ACCOUNT_ID` | Your Cloudflare Account ID (from dashboard URL) |
| `CF_API_TOKEN` | Cloudflare API Token (create at https://dash.cloudflare.com/profile/api-tokens) |

3. Push to `main` or `staging` branch to trigger deploy
4. Or manually trigger from GitHub → Actions → Deploy Workers → Run workflow

### Deploy Locally (Alternative)

```bash
cd srv
npm run deploy
```

Deploy to specific environment:
```bash
npm run deploy:staging  # Deploy to staging
npm run deploy:prod     # Deploy to production
```

---

## 3. Frontend (Pages)

### Create Pages Project

If you haven't already, create the Pages project in Cloudflare:

1. Go to Cloudflare Dashboard → Pages
2. Connect to GitHub and select your repository
3. Configure:

| Setting | Value |
|---------|-------|
| Production branch | `main` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `app` |

4. Add custom domain (optional)

Cloudflare will automatically build and deploy on push to `main` (no GitHub Actions needed).

### Configure Environment

The frontend needs to know the Workers API URL. You can set this in multiple ways:

#### Option 1: Cloudflare Pages Settings (Recommended for production)

In Cloudflare Dashboard → Pages → regarded → Settings → Environment variables:

| Variable | Value |
|---------|-------|
| `VITE_API_URL` | `https://your-workers-domain.workers.dev` |

#### Option 2: GitHub Secrets (if using CI/CD)

Set in GitHub → Settings → Secrets → Actions:

| Secret | Value |
|--------|-------|
| `VITE_API_URL` | `https://your-workers-domain.workers.dev` |

#### Option 3: .env file (local development only)

```bash
cp app/.env.example app/.env
```

Edit `app/.env`:
```env
# Production: Workers URL after deployment
VITE_API_URL=https://your-workers-domain.workers.dev
```

> ⚠️ **Important**: Never commit `.env` files to version control. Add `app/.env` to `.gitignore`.

### Trigger Deploy

Push to `main` branch (or merge staging to main) to trigger Cloudflare's auto-build and deploy.

### Local Development

```bash
# Frontend only (needs workers running)
cd app
npm run dev

# Or with local workers proxy
cd app
VITE_API_URL=http://localhost:8787 npm run dev
```

---

## 4. Environment Variables Summary

### Workers (Backend)

Set via **GitHub Secrets** (CI/CD) or **Wrangler secrets** (local):

| Variable | Recommended | Description |
|----------|-------------|-------------|
| `GOOGLE_CLIENT_ID` | Secret | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | Secret | Google OAuth Client Secret |
| `JWT_SECRET` | Secret | JWT signing secret |

### Pages (Frontend)

Set via **Cloudflare Pages Settings**, **GitHub Secrets**, or **.env file** (local):

| Variable | Recommended | Description |
|----------|-------------|-------------|
| `VITE_API_URL` | Pages Settings | Workers API URL |

---

## 5. Database Migrations

After deploying workers, run D2 migrations:

```bash
cd srv
npx wrangler d1 migrations apply regarded-db
```

---

## Quick Deploy Commands

```bash
# Full deploy (both)
cd srv && npm run deploy                    # Backend
# Then trigger Pages deploy via GitHub push

# Or from root
npm run build:frontend                     # Build frontend
cd srv && npm run deploy                   # Deploy backend
```

---

## Related Docs

- [README.md](./README.md) - Project overview and quick start
- [AGENTS.md](./AGENTS.md) - Developer guide and codebase documentation
- [ROADMAP.md](./ROADMAP.md) - Version history and upcoming features

---

[View on GitHub](https://github.com/dhaupin/regarded)
