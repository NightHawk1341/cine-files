# CineFiles — Step-by-Step Setup Guide

This document is your personal checklist for setting up CineFiles infrastructure. Complete each step before moving to the next phase.

---

## Phase 0: Accounts & Services Setup

### 0.1 — Supabase (New Project) — DONE

- [x] Go to [app.supabase.com](https://app.supabase.com)
- [x] Create a new project named `cinefiles` (keep it in the same organization as TR-BUTE if you want)
- [x] Choose a region close to your audience (EU or Singapore — Supabase doesn't have Russian regions)
- [x] Save from Project Settings → Database:
  - `DATABASE_URL` (Connection string → URI, use **"Transaction" mode pooler** for Next.js/Prisma)
- [x] Note: CineFiles uses **Prisma ORM** (not `@supabase/supabase-js`). Only the PostgreSQL connection string is needed — no Supabase URL or service role key.

### 0.2 — Yandex Cloud (New Resources) — LATER

You already have a Yandex Cloud account with TR-BUTE's S3 bucket and CDN.

**Decision needed: S3 storage strategy**

Two options for CineFiles image storage:

- **Option A: Reuse TRIBUTE's existing S3 bucket** — add a `cinefiles/` prefix (folder) inside the existing bucket. Reuse the same service account keys. Pros: no extra bucket, shared CDN, simpler. Cons: shared access keys, shared quota.
- **Option B: Separate S3 bucket** — `cinefiles-media` in the same Yandex Cloud account. Separate service account + keys. Pros: isolated access, clean separation. Cons: another bucket to manage, may need separate CDN config.

For now, skip this step. We'll revisit when tackling Yandex Cloud deployment.

- [ ] Decide S3 strategy (see options above)
- [ ] Create bucket / configure prefix (depending on choice)
- [ ] Save: `YANDEX_S3_ACCESS_KEY`, `YANDEX_S3_SECRET_KEY`, `YANDEX_S3_BUCKET`

- [ ] (Optional) Create a **Managed Redis** instance for session/cache
  - Or skip and use Next.js built-in ISR cache for now

- [ ] Decide deployment method:
  - **Option A: Serverless Containers** — auto-scaling, pay-per-use (recommended for start)
  - **Option B: Compute VM** — fixed cost, more control (better if traffic is predictable)

### 0.3 — Vercel (New Project) — DONE

- [x] Go to [vercel.com](https://vercel.com)
- [x] Create a new project and connect to the CineFiles GitHub repo
- [x] Note: This serves dual purpose:
  1. Fallback deployment of the full site
  2. Always-on host for the TMDB proxy (since Yandex Cloud can't reach TMDB)

### 0.4 — TMDB API Key — DONE

- [x] Go to [themoviedb.org](https://www.themoviedb.org/settings/api) (use VPN if in Russia)
- [x] Create an account or log in
- [x] Request an API key (v3 auth)
- [x] Save: `TMDB_API_KEY`
- [x] Note: You only need to access TMDB once for this step. After that, the Vercel proxy handles all calls.

### 0.5 — Domain

- [ ] Register a domain for CineFiles (e.g., `cinefiles.ru`, `cinefiles.com`, or your choice)
- [ ] Plan DNS:
  - Main domain → Yandex Cloud deployment
  - `vercel.` subdomain (or just the `.vercel.app` default) → Vercel

### 0.6 — Yandex OAuth App (Shared with TR-BUTE)

CineFiles reuses TR-BUTE's existing OAuth apps. Users log in with the same accounts across both sites. A branded login gateway screen shows both logos and explains the shared account.

- [ ] Go to [oauth.yandex.ru](https://oauth.yandex.ru/) → open **TR-BUTE's existing Yandex app**
- [ ] Add CineFiles redirect URI: `https://your-cinefiles-domain.com/api/auth/yandex/callback`
- [ ] Use the **same** `YANDEX_CLIENT_ID` and `YANDEX_CLIENT_SECRET` as TR-BUTE

### 0.7 — VK ID App (Shared with TR-BUTE)

- [ ] Go to [id.vk.com/about/business](https://id.vk.com/about/business) → open **TR-BUTE's existing VK ID app**
- [ ] Add CineFiles redirect URI: `https://your-cinefiles-domain.com/api/auth/vk/callback`
- [ ] Use the **same** `VK_CLIENT_ID` and `VK_CLIENT_SECRET` as TR-BUTE

### 0.8 — Telegram Bot (Shared with TR-BUTE, OIDC Login)

CineFiles uses the new [Telegram Login](https://core.telegram.org/bots/telegram-login) OIDC flow — a standard OAuth2 redirect with PKCE (not the legacy widget). The same bot is reused from TR-BUTE.

- [ ] Open **TR-BUTE's existing bot** in [@BotFather](https://t.me/BotFather)
- [ ] Add CineFiles domain via `/setdomain` (the bot can have multiple domains)
- [ ] Use the **same** `TELEGRAM_BOT_TOKEN` as TR-BUTE
- [ ] Set `TELEGRAM_BOT_ID` — the numeric bot ID (the number before `:` in the bot token)
- [ ] Note: CineFiles uses OIDC redirect flow (`oauth.telegram.org/auth`), NOT the legacy Login Widget

### 0.9 — Yandex Metrica

- [ ] Go to [metrika.yandex.ru](https://metrika.yandex.ru/)
- [ ] Create a new counter for CineFiles
- [ ] Enable: Webvisor, heatmaps, form analytics
- [ ] Save the counter ID for embedding

### 0.10 — Email (For Notifications) — FUTURE

Not yet wired into `lib/config.ts`. Will be added when the notification system is built. Skip for now.

---

## Phase 1: GitHub Repository — DONE

### 1.1 — Create Repo — DONE

- [x] GitHub repository created and initialized

### 1.2 — Connect to Vercel — DONE

- [x] In Vercel dashboard, import the GitHub repo
- [x] Framework: Next.js (auto-detected)

---

## Phase 2: Environment Variables

### Storage Policy (Mirrors TR-BUTE)

**No `.env` files are stored in the repository.** All secrets are managed in two places:

1. **Vercel** — Project Settings → Environment Variables (for Vercel deployments)
2. **GitHub repo secrets** — Settings → Secrets and variables → Actions (for Yandex Cloud deployment via CI/CD)

The GitHub Actions workflow (`deploy-yandex.yml`) injects all secrets into the Docker container at runtime via `-e` flags. This is the same pattern as TR-BUTE.

For **local development**, create a `.env.local` file (already gitignored) — but never commit it. Copy from the variable reference below.

### 2.1 — Variable Reference

All variables are parsed in `lib/config.ts`. Missing required vars throw at startup.

| Variable | Source | Notes |
|----------|--------|-------|
| `NODE_ENV` | Automatic | `production` on Vercel/Yandex, `development` locally |
| `APP_URL` | Set per environment | `http://localhost:3000` / `https://cinefiles.vercel.app` / `https://cinefiles.ru` |
| `DATABASE_URL` | Supabase dashboard | Connection string → URI, "Transaction" mode pooler |
| `JWT_SECRET` | Generate | `openssl rand -hex 32` |
| `SESSION_SECRET` | Generate | `openssl rand -hex 32` |
| `CRON_SECRET` | Generate | `openssl rand -hex 32` |
| `YANDEX_CLIENT_ID` | Step 0.6 | Shared with TR-BUTE |
| `YANDEX_CLIENT_SECRET` | Step 0.6 | Shared with TR-BUTE |
| `VK_CLIENT_ID` | Step 0.7 | Shared with TR-BUTE |
| `VK_CLIENT_SECRET` | Step 0.7 | Shared with TR-BUTE |
| `TELEGRAM_BOT_TOKEN` | Step 0.8 | Shared with TR-BUTE |
| `TELEGRAM_BOT_ID` | Step 0.8 | Numeric ID (number before `:` in bot token) |
| `YANDEX_S3_ENDPOINT` | Default | `https://storage.yandexcloud.net` |
| `YANDEX_S3_REGION` | Default | `ru-central1` |
| `YANDEX_S3_BUCKET` | Step 0.2 | `cinefiles-media` or shared bucket name |
| `YANDEX_S3_ACCESS_KEY` | Step 0.2 | |
| `YANDEX_S3_SECRET_KEY` | Step 0.2 | |
| `TMDB_API_KEY` | Step 0.4 | Already obtained |
| `TMDB_PROXY_URL` | Vercel URL | `https://your-vercel-domain.vercel.app/api/tmdb` |
| `TMDB_PROXY_SECRET` | Generate | Shared between CineFiles (Yandex) and proxy (Vercel) |
| `TRIBUTE_API_URL` | TR-BUTE | `https://buy-tribute.com/api` |
| `TRIBUTE_API_KEY` | Generate | Same value goes into TR-BUTE as `CINEFILES_API_KEY` |

Optional:

| Variable | Description |
|----------|-------------|
| `REDIS_URL` | Redis connection (skip for initial setup) |
| `DOCKER_BUILD` | Set to `true` **only** during Docker builds |

### 2.2 — Set Vercel Environment Variables

- [ ] Go to Vercel project → Settings → Environment Variables
- [ ] Add all variables from the reference above (use production values)
- [ ] For `TMDB_PROXY_URL`: set to `https://your-vercel-domain.vercel.app/api/tmdb`
- [ ] Note: You can set variables for Preview/Production/Development scopes separately

### 2.3 — Set GitHub Repository Secrets

- [ ] Go to GitHub repo → Settings → Secrets and variables → Actions
- [ ] Add all application env vars as repository secrets
- [ ] Add deployment-specific secrets:

| Secret | Description |
|--------|-------------|
| `YC_REGISTRY_ID` | Yandex Container Registry ID |
| `YC_SA_JSON_KEY` | Yandex Cloud service account JSON key |
| `DEPLOY_HOST` | Server hostname/IP for SSH deployment |
| `DEPLOY_USER` | SSH username on deployment server |
| `DEPLOY_SSH_KEY` | SSH private key for deployment |

These are used by `.github/workflows/deploy-yandex.yml` to build, push, and deploy the Docker image.

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

## Phase 5: Yandex Cloud Deployment — LATER

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

| Service | Used For | Account | Status |
|---------|----------|---------|--------|
| Supabase | PostgreSQL database | New project in existing org | DONE |
| Yandex Cloud | Primary hosting, S3 storage | Existing account | LATER |
| Vercel | Fallback hosting, TMDB proxy | New project, connected to repo | DONE |
| TMDB | Movie/show metadata | New account | DONE |
| GitHub | Source code | Repository created | DONE |
| Yandex OAuth | User login | Shared with TR-BUTE (add redirect URI) | TODO |
| VK ID | User login | Shared with TR-BUTE (add redirect URI) | TODO |
| Telegram BotFather | OIDC login (new flow) | Shared with TR-BUTE (add domain) | TODO |
| Yandex Metrica | Analytics | New counter | TODO |
| Yandex Postbox | Email notifications | Existing or new identity | FUTURE |

---

## Secrets to Generate

These are random strings you generate yourself (use `openssl rand -hex 32`):

| Secret | Where Used | Where Stored |
|--------|-----------|--------------|
| `JWT_SECRET` | CineFiles auth tokens | Vercel + GitHub secrets |
| `SESSION_SECRET` | CineFiles sessions | Vercel + GitHub secrets |
| `CRON_SECRET` | Bearer token for `/api/cron/*` endpoints | Vercel + GitHub secrets |
| `TMDB_PROXY_SECRET` | Shared between CineFiles (Yandex) and TMDB proxy (Vercel) | Vercel + GitHub secrets |
| `TRIBUTE_API_KEY` / `CINEFILES_API_KEY` | Same value, used by both sites for cross-API auth | Both projects' Vercel + GitHub secrets |
