# CineFiles — Claude Instructions

## Project Overview
CineFiles is a cinema/entertainment news and review site. Russian-language primary, i18n-ready.
Sister project to [TR-BUTE](https://buy-tribute.com) (e-commerce). They share CSS variable naming and cross-link via APIs.

## Tech Stack
- **Framework**: Next.js 14+ (App Router), TypeScript strict mode
- **Database**: PostgreSQL via Supabase (`@supabase/supabase-js`)
- **Styling**: CSS Modules + CSS Variables (dark/light themes)
- **Auth**: Yandex OAuth (primary), VK ID, Telegram Login Widget
- **Storage**: Yandex S3 for images
- **Deployment**: Yandex Cloud (Docker) primary, Vercel fallback

## Commands
- `npm run dev` — development server
- `npm run build` — production build
- `npm run lint` — ESLint
- `npm run db:seed` — seed database

## Project Structure
- `app/` — Next.js App Router pages and API routes
- `app/(public)/` — public pages (route group, no URL segment)
- `app/admin/` — admin panel (protected, direct segment)
- `app/api/` — API routes (REST)
- `components/` — React components (layout, article, editor, comments, tribute)
- `lib/` — server-side utilities (auth, db, tmdb, storage, config, transliterate, tribute-api, types)
- `styles/` — CSS globals and modules (`pages/` and `components/` subdirs)
- `locales/` — i18n string files (ru.json primary, en.json fallback)
- `sql/` — database schema and seeds
- `docs/` — project documentation

## Key Conventions

### CSS & Theming
- **NEVER hardcode colors** — always use CSS variables from `styles/globals.css`
- **CSS variable names** match TR-BUTE (sister project) — only values differ
- **Font loading**: Montserrat from `/fonts/` (WOFF2), NEVER Google Fonts
- **Skeleton loading**: use `--skeleton-bg-base` and `--skeleton-bg-highlight`
- **Shadows**: use `--shadow-sm`, `--shadow-md`, `--shadow-lg`
- **All interactive elements** need `.active` + `.active:hover` states
- **New styles**: page styles → `styles/pages/`, component styles → `styles/components/`

### Localization
- **Russian-first UI** — all user-facing strings go in `locales/ru.json`
- **Slug generation**: Russian → Latin transliteration via `lib/transliterate.ts`
- **No i18n framework** — manual imports from locale files

### Content Model
- Articles use **block-based content** (JSON array of typed blocks)
- 11+ block types: paragraph, heading, image, quote, list, embed, divider, spoiler, infobox, tribute_products, movie_card
- Block rendering: `components/article/ArticleBody.tsx`
- Block editing: `components/editor/BlockEditor.tsx`

### Auth & Roles
- Three roles: `reader` → `editor` → `admin`
- Auth guards in `lib/api-utils.ts`: `requireAuth()`, `requireEditor()`, `requireAdmin()`
- Editors own their articles — can only edit/delete their own
- Admin middleware: lightweight cookie check in `middleware.ts`, full JWT in admin layout

### Database
- Supabase client — use `@supabase/supabase-js` for all queries (same as TR-BUTE)
- 12 tables (see `SQL_SCHEMA.sql`)
- Denormalized counters: `view_count`/`comment_count` on articles, `article_count` on tags
- Soft-delete pattern for comments (status field, not actual deletion)
- Use Supabase Dashboard or `SQL_SCHEMA.sql` for schema changes

## Gotchas & Common Pitfalls

### 1. Admin route is a SEGMENT, not a route group
`app/admin/` uses a direct URL segment — NOT `app/(admin)/`. This prevents path conflicts with the dynamic `[category]` catch-all in `(public)/`. **Do not change this to a route group.**

### 2. TMDB proxy exists for geo-bypass
TMDB blocks some Russian IPs. The `/api/tmdb/[...path]` proxy runs on Vercel (US region) to bypass this. Always use the proxy URL (`TMDB_PROXY_URL`), never call `api.themoviedb.org` directly from server code running in Russia.

### 3. S3 upload uses custom AWS4 signing
`lib/storage.ts` implements AWS4-HMAC-SHA256 signing manually (no AWS SDK). If modifying upload logic, preserve the canonical request signing flow.

### 4. Theme script prevents FOUC
Root layout includes an inline `<script>` that reads `localStorage('theme')` and sets `data-theme` before paint. CSP allows inline scripts for this reason. Do not remove the inline script or tighten CSP `script-src` without an alternative FOUC solution.

### 5. Docker build needs `DOCKER_BUILD=true`
Setting `DOCKER_BUILD=true` enables `output: 'standalone'` in `next.config.js`. Without it, the Docker build won't produce the standalone server. Vercel builds should NOT set this variable.

### 6. Cron jobs need bearer auth
All `/api/cron/*` endpoints require `Authorization: Bearer {CRON_SECRET}`. Vercel passes this automatically for configured crons. When testing locally, you must pass the header manually.

### 7. Comment deletion updates article counts
When moderating/deleting comments, the `commentCount` on the associated Article must be updated. The moderation endpoint handles this — don't delete comments directly without updating the count.

### 8. Image remote patterns are whitelisted
`next.config.js` only allows images from `storage.yandexcloud.net` and `userapi.com` (VK avatars). Adding a new image source requires updating the `images.remotePatterns` config.

### 9. CSP frame-src is restricted
Only YouTube, VK Video, and RuTube embeds are allowed. Adding support for a new embed provider requires updating the CSP `frame-src` in `next.config.js`.

### 10. Slug collisions get timestamp suffix
If `lib/transliterate.ts` generates a slug that already exists, a timestamp is appended. Don't assume slugs are pure transliterations — they may have suffixes.

### 11. TR-BUTE blocks are server components
`TributeProductsBlock` is a React Server Component that fetches live data. It's injected into `ArticleBody` via the `customBlocks` prop pattern — not rendered client-side.

## Documentation
See `docs/` directory for detailed documentation:
- `STRUCTURE.md` — Full project structure
- `FEATURES.md` — Feature overview
- `THEMING.md` — CSS and theming details
- `AUTH_SYSTEM.md` — Authentication and authorization
- `ADMIN_PANEL.md` — Admin panel guide
- `CONTENT_SYSTEM.md` — Block-based content model
- `DATABASE.md` — Database schema reference
- `TMDB_INTEGRATION.md` — TMDB proxy and entity sync
- `TRIBUTE_INTEGRATION.md` — TR-BUTE cross-linking
- `CRON_JOBS.md` — Scheduled tasks
- `DEPLOYMENT.md` — Docker and Vercel deployment
- `ENV_VARS.md` — Environment variables reference
- `SECURITY.md` — Security measures
- `SEO.md` — SEO and discovery features

## Progress
- **Phase 1: Foundation** — COMPLETE
- **Phase 2: Content System** — COMPLETE
- **Phase 3: TMDB & Tagging** — COMPLETE
- **Phase 4: TR-BUTE Integration** — COMPLETE
- **Phase 5: Comments & Community** — COMPLETE
- **Phase 6: Polish & Launch** — COMPLETE
