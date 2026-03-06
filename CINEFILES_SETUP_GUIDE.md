# CineFiles — Step-by-Step Setup Guide

This document is your personal checklist for setting up CineFiles infrastructure. Complete each step before moving to the next phase.

---

## Phase 0: Accounts & Services Setup

### 0.1 — Supabase (New Project)

- [ ] Go to [app.supabase.com](https://app.supabase.com)
- [ ] Create a new project named `cinefiles` (keep it in the same organization as TR-BUTE if you want)
- [ ] Choose a region close to your audience (EU or Singapore — Supabase doesn't have Russian regions)
- [ ] Save from Project Settings → Database:
  - `DATABASE_URL` (Connection string → URI, use **"Transaction" mode pooler** for Next.js/Prisma)
- [ ] Note: CineFiles uses **Prisma ORM** (not `@supabase/supabase-js`). Only the PostgreSQL connection string is needed — no Supabase URL or service role key.

### 0.2 — Yandex Cloud (New Resources)

You likely already have a Yandex Cloud account for TR-BUTE. Create new resources under the same account or a separate folder:

- [ ] Create a new **S3 bucket**: `cinefiles-media`
  - Region: `ru-central1`
  - Access: private (public read via signed URLs or CDN)
  - Create a service account with `storage.editor` role
  - Generate static access keys (S3-compatible)
  - Save: `YANDEX_S3_ACCESS_KEY`, `YANDEX_S3_SECRET_KEY`

- [ ] (Optional) Create a **Managed Redis** instance for session/cache
  - Or skip and use Next.js built-in ISR cache for now

- [ ] Decide deployment method:
  - **Option A: Serverless Containers** — auto-scaling, pay-per-use (recommended for start)
  - **Option B: Compute VM** — fixed cost, more control (better if traffic is predictable)

### 0.3 — Vercel (New Project)

- [ ] Go to [vercel.com](https://vercel.com)
- [ ] Create a new project (will connect to the CineFiles GitHub repo later)
- [ ] Note: This serves dual purpose:
  1. Fallback deployment of the full site
  2. Always-on host for the TMDB proxy (since Yandex Cloud can't reach TMDB)

### 0.4 — TMDB API Key

- [ ] Go to [themoviedb.org](https://www.themoviedb.org/settings/api) (use VPN if in Russia)
- [ ] Create an account or log in
- [ ] Request an API key (v3 auth)
- [ ] Save: `TMDB_API_KEY`
- [ ] Note: You only need to access TMDB once for this step. After that, the Vercel proxy handles all calls.

### 0.5 — Domain

- [ ] Register a domain for CineFiles (e.g., `cinefiles.ru`, `cinefiles.com`, or your choice)
- [ ] Plan DNS:
  - Main domain → Yandex Cloud deployment
  - `vercel.` subdomain (or just the `.vercel.app` default) → Vercel

### 0.6 — Yandex OAuth App (Separate from TR-BUTE)

- [ ] Go to [oauth.yandex.ru](https://oauth.yandex.ru/)
- [ ] Create a new app for CineFiles
- [ ] Scopes: `login:email`, `login:info`, `login:avatar`
- [ ] Redirect URI: `https://your-cinefiles-domain.com/api/auth/yandex/callback`
- [ ] Save: `YANDEX_CLIENT_ID`, `YANDEX_CLIENT_SECRET`

### 0.7 — VK ID App (Separate from TR-BUTE)

- [ ] Go to [id.vk.com/about/business](https://id.vk.com/about/business)
- [ ] Create a new VK ID app for CineFiles
- [ ] Set redirect URI: `https://your-cinefiles-domain.com/api/auth/vk/callback`
- [ ] Save: `VK_CLIENT_ID`, `VK_CLIENT_SECRET`

### 0.8 — Telegram Bot (For Login Widget)

- [ ] Create a bot via [@BotFather](https://t.me/BotFather) (e.g., `@CineFilesLoginBot`)
- [ ] Set domain via BotFather: `/setdomain` → your CineFiles domain
- [ ] Save: `TELEGRAM_BOT_TOKEN`
- [ ] Note: This bot is ONLY for the login widget — CineFiles doesn't have a Telegram mini-app

### 0.9 — Yandex Metrica

- [ ] Go to [metrika.yandex.ru](https://metrika.yandex.ru/)
- [ ] Create a new counter for CineFiles
- [ ] Enable: Webvisor, heatmaps, form analytics
- [ ] Save the counter ID for embedding

### 0.10 — Email (For Notifications)

- [ ] If using Yandex Postbox: create an email identity for CineFiles domain
- [ ] Or reuse existing Postbox keys if the domain is verified
- [ ] Save: `POSTBOX_API_KEY_ID`, `POSTBOX_API_KEY_SECRET`, `NOTIFICATION_FROM_EMAIL`

---

## Phase 1: GitHub Repository

### 1.1 — Create Repo

- [ ] Create a new **private** GitHub repository: `CineFiles` (or your preferred name)
- [ ] Initialize with:
  ```bash
  git init
  git remote add origin git@github.com:YOUR_USERNAME/CineFiles.git
  ```

### 1.2 — Connect to Vercel

- [ ] In Vercel dashboard, import the GitHub repo
- [ ] Framework: Next.js (auto-detected)
- [ ] Set environment variables (see Section below)
- [ ] Deploy (will fail initially — that's fine, just confirms the connection)

---

## Phase 2: Environment Variables

### 2.1 — Create `.env.local` for Development

All variables below are parsed in `lib/config.ts`. Missing required vars throw at startup.

```bash
# Core
NODE_ENV=development
APP_URL=http://localhost:3000
DATABASE_URL=postgresql://...your-supabase-connection-string...
JWT_SECRET=generate-a-random-64-char-string
SESSION_SECRET=generate-another-random-64-char-string
CRON_SECRET=generate-another-random-64-char-string

# Auth — Yandex
YANDEX_CLIENT_ID=from-step-0.6
YANDEX_CLIENT_SECRET=from-step-0.6

# Auth — VK
VK_CLIENT_ID=from-step-0.7
VK_CLIENT_SECRET=from-step-0.7

# Auth — Telegram
TELEGRAM_BOT_TOKEN=from-step-0.8

# Storage — Yandex S3
YANDEX_S3_ENDPOINT=https://storage.yandexcloud.net
YANDEX_S3_REGION=ru-central1
YANDEX_S3_BUCKET=cinefiles-media
YANDEX_S3_ACCESS_KEY=from-step-0.2
YANDEX_S3_SECRET_KEY=from-step-0.2

# TMDB
TMDB_API_KEY=from-step-0.4
TMDB_PROXY_URL=http://localhost:3000/api/tmdb
TMDB_PROXY_SECRET=generate-a-shared-secret

# TR-BUTE Integration
TRIBUTE_API_URL=https://buy-tribute.com/api
TRIBUTE_API_KEY=generate-and-add-to-tribute-env-too

# Cache (optional — skip for initial setup)
# REDIS_URL=redis://localhost:6379
```

Note: Email notification vars (`POSTBOX_API_KEY_ID`, etc.) are not yet wired into `lib/config.ts`. They will be added when the notification system is built. For now, skip step 0.10 — it's a future task.

### 2.2 — Set Vercel Environment Variables

- [ ] Go to Vercel project → Settings → Environment Variables
- [ ] Add all variables from above (use production values)
- [ ] For `TMDB_PROXY_URL`: set to `https://your-vercel-domain.vercel.app/api/tmdb`

### 2.3 — Set Yandex Cloud Environment Variables

- [ ] Depends on deployment method:
  - **Serverless Containers**: set in container revision config
  - **Compute VM**: set in systemd service file or `.env` on the server
- [ ] Use the same variable list, but `TMDB_PROXY_URL` points to the Vercel proxy

---

## Phase 3: Database Setup

CineFiles uses **Prisma ORM** for type-safe queries in the application code, but schema changes are applied **manually via Supabase Dashboard SQL editor** (same workflow as TR-BUTE).

### 3.1 — Create Tables

- [ ] Open Supabase Dashboard → SQL Editor
- [ ] Copy and run the contents of `SQL_SCHEMA.sql`
- [ ] Verify tables exist (13 tables: users, auth_tokens, categories, articles, tags, article_tags, tmdb_entities, tmdb_cache, comments, media, app_settings, collections, collection_articles)

### 3.2 — Seed Initial Data

- [ ] Run the seed SQL in Supabase Dashboard SQL Editor (or use `npm run db:seed` if you have terminal access)
- [ ] Seed creates:
  - Default categories (news, reviews, articles, interviews, lists, analysis)
  - Default app_settings
  - Your admin user account

### 3.3 — Schema Change Workflow

When Claude or you modify the schema:

1. Claude updates `prisma/schema.prisma` (the source of truth for Prisma types)
2. Claude provides the `ALTER TABLE` / `CREATE TABLE` SQL for you to run in Supabase Dashboard
3. Claude regenerates `SQL_SCHEMA.sql` to keep the reference file in sync
4. Prisma Client types are regenerated automatically on `npm install` (via `postinstall` hook) or by Claude running `npm run db:generate`

**Never run `prisma db push` or `prisma migrate` against the production database** — all schema changes go through Supabase Dashboard manually, same as TR-BUTE.

---

## Phase 4: TR-BUTE Side Changes

These changes need to be made in the **TR-BUTE repository** to enable cross-site integration. A detailed implementation guide lives in the TR-BUTE repo:

**See: `TR-BUTE/docs/CINEFILES_INTEGRATION_STEPS.md`**

High-level summary of what needs to happen on TR-BUTE's side:

- [ ] Add `CINEFILES_API_URL` and `CINEFILES_API_KEY` env vars to `lib/config.js`
- [ ] Create `GET /api/products/by-ids` endpoint (for CineFiles product card blocks)
- [ ] Create `GET /api/users/by-provider` endpoint (for cross-site user linking)
- [ ] Create `GET /api/products/:id/related-articles` endpoint (proxies to CineFiles)
- [ ] Add "Related Articles" section to product detail page
- [ ] Register routes BEFORE the products catch-all in `server/routes/index.js`

All details, code patterns, and gotchas are in the TR-BUTE-side guide.

---

## Phase 5: Yandex Cloud Deployment

### 5.1 — Docker Setup

- [ ] The repo will include a `docker/Dockerfile` for Next.js standalone build
- [ ] Build and push to Yandex Container Registry:
  ```bash
  docker build -f docker/Dockerfile -t cr.yandex/YOUR_REGISTRY_ID/cinefiles:latest .
  docker push cr.yandex/YOUR_REGISTRY_ID/cinefiles:latest
  ```

### 5.2 — Serverless Container (Recommended)

- [ ] Create a Serverless Container in Yandex Cloud console
- [ ] Set image: `cr.yandex/YOUR_REGISTRY_ID/cinefiles:latest`
- [ ] Set environment variables
- [ ] Set memory: 512MB (adjust as needed)
- [ ] Set concurrency: 1 (Next.js handles internal concurrency)

### 5.3 — Domain & SSL

- [ ] Add your domain to Yandex Cloud
- [ ] Set up API Gateway or Application Load Balancer
- [ ] Configure SSL certificate (Yandex Certificate Manager or Let's Encrypt)
- [ ] Point DNS to Yandex Cloud

---

## Phase 6: Post-Launch

### 6.1 — Verify

- [ ] All pages load (SSR works)
- [ ] Auth flows work (Yandex, VK, Telegram)
- [ ] Admin can create/edit/publish articles
- [ ] TMDB search works from admin (via Vercel proxy)
- [ ] Images upload to Yandex S3 and display
- [ ] Comments work
- [ ] TR-BUTE product cards render in articles
- [ ] TR-BUTE product pages show related articles (if any)
- [ ] Theme toggle works (dark/light)
- [ ] Mobile responsive
- [ ] SEO: check with Yandex Webmaster tools

### 6.2 — Yandex Webmaster

- [ ] Add site to [webmaster.yandex.ru](https://webmaster.yandex.ru/)
- [ ] Submit sitemap: `https://your-domain/sitemap.xml`
- [ ] Verify ownership

### 6.3 — Monitoring

- [ ] Set up Yandex Cloud monitoring alerts (5xx errors, high latency)
- [ ] Set up Yandex Metrica goals (page views, article reads, comments)

---

## Quick Reference: All Services & Their Purpose

| Service | Used For | Account |
|---------|----------|---------|
| Supabase | PostgreSQL database | New project in existing org |
| Yandex Cloud | Primary hosting, S3 storage | Existing account |
| Vercel | Fallback hosting, TMDB proxy | New project in existing account |
| TMDB | Movie/show metadata | New account (needs VPN) |
| Yandex OAuth | User login | New app in existing account |
| VK ID | User login | New app |
| Telegram BotFather | Login widget bot | New bot |
| Yandex Metrica | Analytics | New counter |
| Yandex Postbox | Email notifications | Existing or new identity |
| GitHub | Source code | New private repo |

---

## Secrets to Generate

These are random strings you generate yourself (use `openssl rand -hex 32`):

| Secret | Where Used |
|--------|-----------|
| `JWT_SECRET` | CineFiles auth tokens |
| `SESSION_SECRET` | CineFiles sessions |
| `CRON_SECRET` | Bearer token for `/api/cron/*` endpoints |
| `TMDB_PROXY_SECRET` | Shared between CineFiles (Yandex) and TMDB proxy (Vercel) |
| `TRIBUTE_API_KEY` / `CINEFILES_API_KEY` | Same value, used by both sites for cross-API auth |
