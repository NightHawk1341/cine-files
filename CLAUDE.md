# CineFiles — Claude Instructions

## Required Reading Before Any Implementation

Before making changes, read these docs in order:
1. This file (CLAUDE.md) — project rules and conventions
2. `DEVELOPMENT_CHECKLIST.md` — common mistakes to avoid
3. `.claude/README.md` — implementation protocols and validation commands
4. `docs/SPA_LIFECYCLE.md` — how the SPA router manages content, styles, and DOM elements across navigations
5. `docs/CONDITIONAL_VISIBILITY.md` — all JS-driven conditional visibility and styling across the public site
6. `docs/THEMING.md` — CSS variable system (shared with TR-BUTE)
7. `docs/CONTENT_SYSTEM.md` — block-based content model

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
- `npm start` — production server
- `npm run dev` — development server (nodemon)
- `npm run check:claude` — run all validation checks before committing

### Validation Commands
Run before completing any task:
```bash
npm run check:claude
```
This executes all linters:
- `validate-routes.js` — Route registration order (specific before catch-all)
- `validate-router-selectors.js` — Content selectors exist in index.html
- `validate-page-scripts.js` — All page scripts included in index.html
- `validate-spa-styles.js` — Page CSS files referenced in scripts exist on disk
- `pre-commit-check.js` — API files registered in routes, JS syntax valid

Individual commands:
```bash
npm run check:routes
npm run check:selectors
npm run check:page-scripts
npm run check:spa-styles
```

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
    css/                       # Global + page-specific CSS (flat, no subdirs)
    js/
      core/router.js           # SPA router (registerPage pattern)
      core/media.js            # resolveImageUrl helper
      utils.js                 # Shared utilities
      modules/                 # Persistent UI modules (survive navigations)
      components/              # Content renderers (article-card, article-body, comment-list)
      pages/                   # Page scripts (home, article, category, etc.)
      pages/admin/             # Admin page scripts
    fonts/                     # Montserrat WOFF2
    icons/                     # SVG icons
  migrations/                   # Manual SQL migrations (run via Supabase SQL editor)
    001_seed_data.sql          # Initial categories, tags, articles
  scripts/
    pre-commit-check.js        # API registration + syntax check
    validate-routes.js         # Route order validation
    validate-router-selectors.js  # Content selector validation
    validate-page-scripts.js   # Script inclusion validation
    validate-spa-styles.js     # CSS file existence validation
  Dockerfile                   # Production Docker image (Yandex Cloud)
  locales/                     # i18n (ru.json primary, en.json fallback)
  SQL_SCHEMA.sql               # Schema reference (12 tables)
  docs/                        # Project documentation
```

## Key Conventions

### Code Quality Rules
- Never use emojis in code or UI — use SVG icons or inline `<svg>` elements instead
- Do not write AI-sounding comments (no "elegant", "robust", "seamlessly", "enhanced for better UX", or task/ticket references in production code)
- All interactive elements need `.active` + `.active:hover` states — the active+hover style should be a visual progression of the active state, not a regression to the inactive hover. Wrap hover rules in `@media (hover: hover)`
- Hardcoded colors break light theme — always use CSS variables from `global.css`
- New external services need CSP entries in `server/app.js` — tag with `// csp=YYYYMM` comment. Check which directives are needed: `scriptSrc`, `frameSrc`, `connectSrc`, `imgSrc`, `styleSrc`, `fontSrc`. Missing entries cause silent resource blocks only visible in DevTools
- Dropdowns and popovers must scroll into view when opened — use 100ms `setTimeout` after adding `active` class so the dropdown renders before measuring. Account for header height and bottom nav height (mobile <=1024px)
- Run `npm run check:claude` before completing any task
- Conditional visibility/styling must use CSS classes, not inline styles
- Inline styles on persistent elements (header, footer, body) leak across pages — use `classList.add/remove` instead of `element.style.*`. If inline styles are unavoidable, reset them in `cleanup()`

### JavaScript Conventions (matching TR-BUTE)
- **Plain JavaScript** — CommonJS modules, no TypeScript
- **`registerPage('/route', { init, cleanup })`** pattern for all pages
- **Every page script must register init + cleanup** — `cleanup` must reset module-level state, clear timers/intervals, abort in-flight fetches, and remove body-appended elements. Missing cleanup causes stale state on repeat visits (the "hard refresh required" bug)
- **Page-specific DOM appended to body must be cleaned up** — the SPA router only replaces content inside `#page-content`. Anything appended to `document.body` (modals, overlays, tooltips) survives navigation and must be explicitly removed in `cleanup()`
- **Page CSS** in `pageSpecificStyles` array (router cleans up on navigation). Without this, CSS stays in `<head>` after navigating away and leaks styles into other pages. Symptom: page looks wrong after SPA navigation but correct after hard refresh
- **`contentSelectors`** must match HTML class names — mismatches cause page swap failures
- **`requireEnv()` / `getEnv()`** for all env vars — new env vars must be added to `lib/config.js` and to `.github/workflows/deploy-yandex.yml` as `--environment VAR_NAME=${{ secrets.VAR_NAME }}`. Missing vars cause silent failures on Yandex Cloud
- **Parameterized SQL only** (`$1, $2` placeholders)
- **`Number()`** cast for numeric DB columns — the `pg` driver returns `numeric`/`decimal` columns as strings. Skipping this causes silent string concatenation (`"1500" + "300"` -> `"1500300"`)
- **No auto-migrations** — do NOT add startup `ALTER TABLE` calls or migration scripts to `server.js` or anywhere else
- **Schema changes**: provide raw SQL for the user to run in Supabase SQL editor, update `SQL_SCHEMA.sql`, add numbered migration file to `migrations/` (e.g. `002_add_column.sql`)

### CSS & Theming
- **NEVER hardcode colors** — always use CSS variables from `public/css/global.css`
- **CSS variable names** match TR-BUTE (sister project) — only values differ
- **Font loading**: Montserrat from `/fonts/` (WOFF2), NEVER Google Fonts
- **New styles**: all CSS in flat `public/css/` directory (no subdirs)
- Dark theme defaults live in `:root`; light theme overrides are in `html[data-theme="light"]`. Both blocks are in `global.css`

#### CSS Variables Quick Reference
```
Backgrounds:   --bg-primary  --bg-secondary  --bg-tertiary  --bg-quaternary  --bg-overlay
Text:          --text-primary  --text-secondary  --text-tertiary  --text-inverse
Borders:       --border-color  --border-hover  --border-active  --divider
Brand:         --brand-primary  --brand-secondary  --brand-hover  --brand-muted
Shadows:       --shadow-sm  --shadow-md  --shadow-lg  --modal-popup-shadow
Status:        --status-pending  --status-info  --status-success  --status-warning
               --status-error  (each has a matching --status-*-bg)
Cards:         --card-bg  --card-bg-hover  --card-border  --card-border-hover
Tabs:          --tab-inactive-bg  --tab-active-bg  --tab-counter-bg
Interactive:   --link-color  --link-hover  --favorite-color
Glass:         --glass-bg  --glass-border
Skeleton:      --skeleton-bg-base  --skeleton-bg-highlight
```

### Localization
- **Russian-first UI** — all user-facing strings in Russian
- **Slug generation**: Russian-Latin transliteration via `server/utils/transliterate.js`
- **No i18n framework** — manual imports from locale files

### Content Model
- Articles use **block-based content** (JSON array of typed blocks)
- 11+ block types: paragraph, heading, image, quote, list, embed, divider, spoiler, infobox, tribute_products, movie_card
- Block rendering: `public/js/components/article-body.js` (content renderer)
- Block editing: `public/js/pages/admin/article-editor.js`

### Auth & Roles
- Three roles: `reader` -> `editor` -> `admin`
- Auth middleware in `server/middleware/auth.js`: `requireAuth`, `requireEditor`, `requireAdmin`
- Editors own their articles — can only edit/delete their own
- Admin routes require `requireAdmin` middleware

### Database
- PostgreSQL hosted on Supabase — schema changes applied manually via Supabase SQL editor
- `pg` driver — `lib/db.js` provides pool singleton
- 12 tables (see `SQL_SCHEMA.sql`)
- Denormalized counters: `view_count`/`comment_count` on articles, `article_count` on tags
- Soft-delete pattern for comments (status field, not actual deletion)
- Migration files in `migrations/` — numbered sequentially (e.g. `001_seed_data.sql`), run manually

### API Pattern
- Handler files in `api/` export factory functions: `function list({ pool }) { return handler }`
- Routes registered flat in `server/routes/index.js` — no separate router files, just `require` + `app.*` lines
- Express server (`server.js`) for Docker/dev, Vercel routes to `server.js` via `@vercel/node`

### Route Registration Rules
All routes live in `server/routes/index.js` as flat `app.get/post/put/patch/delete` calls. Ordering constraints (violations cause silent 404s or wrong handler):
1. Specific routes (e.g. `/api/articles/search`) must be registered **before** dynamic parameter routes (e.g. `/api/articles/:slug`) in the same prefix group
2. Catch-all page routes (`/:category`, `/:category/:slug`) must be registered **last** in `index.html` script order

## Gotchas & Common Pitfalls

### 1. TMDB proxy exists for geo-bypass
TMDB blocks some Russian IPs. The `/api/tmdb/*` proxy runs on Vercel (US region) to bypass this. Always use the proxy URL, never call `api.themoviedb.org` directly.

### 2. S3 upload uses custom AWS4 signing
`lib/storage.js` implements AWS4-HMAC-SHA256 signing manually (no AWS SDK). If modifying upload logic, preserve the canonical request signing flow.

### 3. Theme script prevents FOUC
`index.html` includes an inline `<script>` that reads `localStorage('cinefiles-theme')` and sets `data-theme` before paint. CSP allows inline scripts for this reason.

### 4. Docker build
Dockerfile in `docker/Dockerfile` copies server files and serves via `node server.js`.

### 5. Cron jobs need bearer auth and respect platform limits
All `/api/cron/*` endpoints require `Authorization: Bearer {CRON_SECRET}`. Vercel passes this automatically for configured crons. Vercel Hobby plan only allows daily (or less frequent) cron schedules — expressions running more than once per day fail deployment. When adding cron jobs: register the schedule in `vercel.json` `crons` array and the route in `server/routes/index.js`.

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

### 11. No seeding — database is populated manually
The database is never seeded automatically. All data (articles, tags, categories, etc.) is inserted manually by the owner. Do not rely on seed scripts or placeholder/fake content as a substitute for real data. If the database is empty, the site should show an empty state, not fake content.

### 12. New env vars must be added to deploy workflow
Yandex Cloud deploys via Docker through GitHub Actions. Env vars are passed as `-e` flags in `.github/workflows/deploy-yandex.yml`. When adding a new env var, add `-e VAR_NAME="${{ secrets.VAR_NAME }}"` to the `docker run` command. Missing vars cause silent failures — the app starts but the feature doesn't work. Vercel reads env vars from its project settings automatically.

### 13. MutationObserver/ResizeObserver must not modify their own target
If a `MutationObserver` callback inserts or removes elements inside the observed subtree, it triggers itself infinitely. Similarly, if a `ResizeObserver` callback changes styles that affect the observed element's size, it loops. Fix: disconnect the observer before making DOM changes and reconnect after. The `mutating` flag pattern does NOT work because observer callbacks are async microtasks.

### 14. All media goes through Yandex S3
Images are stored in Yandex Cloud Object Storage. Upload via `lib/storage.js`. Use `resolveImageUrl()` from `public/js/core/media.js` to get URLs. Adding a new image source domain requires updating CSP `img-src` in `server/app.js`.

### 15. `style.css` is home page only
Despite its generic name, `public/css/style.css` is loaded ONLY on the home page (`/`). Do NOT add general-purpose styles here — use `global.css` for global styles or create a page-specific CSS file.

### 16. Conditional visibility changes must be documented
When adding JS-driven `classList` toggling or `style.*` changes that affect visibility or appearance, add an entry to `docs/CONDITIONAL_VISIBILITY.md` in the appropriate module section.

## Documentation
- `DEVELOPMENT_CHECKLIST.md` — step-by-step checklists for adding endpoints, DB fields, pages
- `.claude/README.md` — implementation protocols and validation commands
- `docs/SPA_LIFECYCLE.md` — persistent elements, cleanup contract, common bugs
- `docs/CONDITIONAL_VISIBILITY.md` — all JS-driven visibility and styling changes
- `docs/` directory — see full list below for system-specific documentation

## Progress
- **Phase 1: Foundation** — COMPLETE (Express server, pg pool, auth, config, middleware)
- **Phase 2: API Endpoints** — COMPLETE (21 endpoint files, 42+ routes)
- **Phase 3: Frontend SPA** — COMPLETE (router, components, pages, CSS)
- **Phase 4: Admin Panel** — COMPLETE (dashboard, articles, comments, tags, users, media, collections, settings)
- **Phase 5: Cleanup** — COMPLETE (removed Next.js, React, TypeScript, Prisma, CSS Modules)
- **Phase 6: Vercel Compatibility** — COMPLETE (vercel.json, Express-on-Vercel via @vercel/node)
