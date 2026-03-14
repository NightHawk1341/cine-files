# CineFiles — Claude Instructions

## Required Reading Before Any Implementation

Before making changes, read these docs in order:
1. This file (CLAUDE.md) — project rules and conventions
2. `PLAN.md` — architecture plan and progress
3. `docs/STRUCTURE.md` — full project structure
4. `docs/THEMING.md` — CSS variable system (shared with TR-BUTE)
5. `docs/CONTENT_SYSTEM.md` — block-based content model

## Project Overview
CineFiles is a cinema/entertainment news and review site. Russian-language primary, i18n-ready.
Sister project to [TR-BUTE](https://buy-tribute.com) (e-commerce). They share CSS variable naming and cross-link via APIs.

## Tech Stack
- **Backend**: Express.js (Node.js), plain JavaScript (CommonJS)
- **Frontend**: Vanilla JavaScript SPA with custom router
- **Database**: PostgreSQL via `pg` driver (raw SQL, parameterized queries)
- **Styling**: CSS Variables + page-specific CSS (same variable names as TR-BUTE)
- **Auth**: Yandex OAuth (primary), Telegram OIDC — shared with TR-BUTE
- **Storage**: Yandex S3 for images (AWS4-HMAC-SHA256 signing)
- **Deployment**: Yandex Cloud (Docker) primary, Vercel fallback

## Commands
- `npm run dev` — development server (node --watch)
- `npm start` — production server
- `npm run check` — run validation checks (syntax + CSS + required files)
- `npm run db:seed` — seed database

## Project Structure
```
cine-files/
  server.js                    # Entry point — boots Express app, listens
  server/
    app.js                     # Express app setup (middleware, routes, static)
    routes/index.js            # Flat route registration (all API routes)
    middleware/auth.js          # authenticateToken, requireAuth/Editor/Admin
    services/tmdb.js           # TMDB sync and cache
    utils/transliterate.js     # Slug generation
  api/                         # API endpoint handlers (factory pattern)
    articles.js, article-by-id.js, articles-related.js
    categories.js
    tags.js, tag-by-id.js
    comments.js, comment-by-id.js, comment-moderate.js
    users.js                   # Admin user management
    media.js, media-upload.js  # Media list + upload
    collections.js             # Collections CRUD
    settings.js                # App settings CRUD
    search.js
    auth-yandex.js, auth-telegram.js
    cron-token-cleanup.js, cron-tmdb-sync.js, cron-tmdb-cleanup.js
    tmdb-proxy.js, tmdb-search.js
    feed-rss.js, sitemap.js
  lib/
    db.js                      # getPool() / closePool() singleton
    config.js                  # requireEnv() / getEnv() centralized config
    auth.js                    # JWT signing, session management
    storage.js                 # Yandex S3 with AWS4 signing
    tribute-api.js             # TR-BUTE product fetch
  public/
    index.html                 # SPA entry point
    css/                       # Global + page-specific + component CSS
    js/
      core/router.js           # SPA router (registerPage pattern)
      core/media.js            # resolveImageUrl helper
      utils.js                 # Shared utilities
      components/              # Persistent + UI components (vanilla JS)
      pages/                   # Page scripts (home, article, category, etc.)
      pages/admin/             # Admin page scripts
    pages/                     # HTML templates
    fonts/                     # Montserrat WOFF2
    icons/                     # SVG icons
  scripts/
    seed.js                    # Database seed (raw SQL)
    check.sh                   # Validation script
  docker/Dockerfile            # Production Docker image
  locales/                     # i18n (ru.json primary, en.json fallback)
  SQL_SCHEMA.sql               # Schema reference (12 tables)
  docs/                        # Project documentation
```

## Key Conventions

### Code Quality Rules
- Never use emojis in code or UI
- Do not write AI-sounding comments (no "elegant", "robust", "seamlessly", etc.)
- All interactive elements need `.active` + `.active:hover` states
- Hardcoded colors break light theme — always use CSS variables
- New external services need CSP entries in `server/app.js`
- Dropdowns and popovers must scroll into view when opened
- Run `npm run check` before completing any task
- Conditional visibility/styling must use CSS classes, not inline styles

### JavaScript Conventions (matching TR-BUTE)
- **Plain JavaScript** — CommonJS modules, no TypeScript
- **`registerPage('/route', { init, cleanup })`** pattern for all pages
- **Cleanup** must reset module state, clear timers, remove body-appended elements
- **Page CSS** in `pageSpecificStyles` array (router cleans up on navigation)
- **`contentSelectors`** must match HTML class names
- **`requireEnv()` / `getEnv()`** for all env vars
- **Parameterized SQL only** (`$1, $2` placeholders)
- **`Number()`** cast for numeric DB columns
- **No auto-migrations** — manual SQL via Supabase dashboard

### CSS & Theming
- **NEVER hardcode colors** — always use CSS variables from `public/css/global.css`
- **CSS variable names** match TR-BUTE (sister project) — only values differ
- **Font loading**: Montserrat from `/fonts/` (WOFF2), NEVER Google Fonts
- **Skeleton loading**: use `--skeleton-bg-base`/`--skeleton-bg-highlight`
- **Shadows**: use `--shadow-sm`, `--shadow-md`, `--shadow-lg`
- **New styles**: page CSS in `public/css/`, component CSS in `public/css/components/`

### Localization
- **Russian-first UI** — all user-facing strings in Russian
- **Slug generation**: Russian-Latin transliteration via `server/utils/transliterate.js`
- **No i18n framework** — manual imports from locale files

### Content Model
- Articles use **block-based content** (JSON array of typed blocks)
- 11+ block types: paragraph, heading, image, quote, list, embed, divider, spoiler, infobox, tribute_products, movie_card
- Block rendering: `public/js/components/article-body.js`
- Block editing: `public/js/pages/admin/article-editor.js`

### Auth & Roles
- Three roles: `reader` -> `editor` -> `admin`
- Auth middleware in `server/middleware/auth.js`: `requireAuth`, `requireEditor`, `requireAdmin`
- Editors own their articles — can only edit/delete their own
- Admin routes require `requireAdmin` middleware

### Database
- PostgreSQL via `pg` driver — `lib/db.js` provides pool singleton
- 12 tables (see `SQL_SCHEMA.sql`)
- Denormalized counters: `view_count`/`comment_count` on articles, `article_count` on tags
- Soft-delete pattern for comments (status field, not actual deletion)

### API Pattern
- Handler files in `api/` export factory functions: `function list({ pool }) { return handler }`
- Routes registered flat in `server/routes/index.js`
- Express server (`server.js`) for Docker/dev, Vercel routes to `server.js` via `@vercel/node`

## Gotchas & Common Pitfalls

### 1. TMDB proxy exists for geo-bypass
TMDB blocks some Russian IPs. The `/api/tmdb/*` proxy runs on Vercel (US region) to bypass this. Always use the proxy URL, never call `api.themoviedb.org` directly.

### 2. S3 upload uses custom AWS4 signing
`lib/storage.js` implements AWS4-HMAC-SHA256 signing manually (no AWS SDK). If modifying upload logic, preserve the canonical request signing flow.

### 3. Theme script prevents FOUC
`index.html` includes an inline `<script>` that reads `localStorage('cinefiles-theme')` and sets `data-theme` before paint. CSP allows inline scripts for this reason.

### 4. Docker build
Dockerfile in `docker/Dockerfile` copies server files and serves via `node server.js`.

### 5. Cron jobs need bearer auth
All `/api/cron/*` endpoints require `Authorization: Bearer {CRON_SECRET}`. Vercel passes this automatically for configured crons.

### 6. Comment deletion updates article counts
When moderating/deleting comments, the `commentCount` on the associated Article must be updated. The moderation endpoint handles this.

### 7. Image remote patterns
CSP `img-src` allows `storage.yandexcloud.net` and `userapi.com` (VK avatars). Adding a new image source requires updating CSP in `server/app.js`.

### 8. CSP frame-src is restricted
Only YouTube, VK Video, and RuTube embeds are allowed.

### 9. Slug collisions get timestamp suffix
`server/utils/transliterate.js` generates slugs from Russian. Don't assume slugs are pure transliterations.

### 10. SPA router manages page lifecycle
Pages register via `Router.registerPage()`. The router handles CSS injection/cleanup, history API, and init/cleanup calls. Always implement `cleanup()` to prevent memory leaks.

## Documentation
See `docs/` directory for detailed documentation.

## Progress
- **Phase 1: Foundation** — COMPLETE (Express server, pg pool, auth, config, middleware)
- **Phase 2: API Endpoints** — COMPLETE (21 endpoint files, 42+ routes)
- **Phase 3: Frontend SPA** — COMPLETE (router, components, pages, CSS)
- **Phase 4: Admin Panel** — COMPLETE (dashboard, articles, comments, tags, users, media, collections, settings)
- **Phase 5: Cleanup** — COMPLETE (removed Next.js, React, TypeScript, Prisma, CSS Modules)
- **Phase 6: Vercel Compatibility** — COMPLETE (vercel.json, Express-on-Vercel via @vercel/node)
