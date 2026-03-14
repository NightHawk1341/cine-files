# Plan: Rebuild CineFiles to match TR-BUTE architecture

Full architectural alignment with TR-BUTE: Express.js backend, vanilla
JavaScript SPA frontend, raw PostgreSQL via `pg` driver, no React, no
Next.js, no TypeScript, no ORM.

Both sites must look the same, feel the same, and follow the same
development logic — one is a store, the other is articles.

---

## Target architecture (matching TR-BUTE)

| Layer | Technology |
|-------|-----------|
| Backend | Express.js (Node.js) |
| Frontend | Vanilla JavaScript SPA (custom router) |
| Database | PostgreSQL via `pg` driver (raw SQL) |
| Language | Plain JavaScript (CommonJS) |
| Styling | CSS Variables + page-specific CSS (same variable names as TR-BUTE) |
| Auth | Yandex OAuth, VK, Telegram — same providers as TR-BUTE |
| Storage | Yandex S3 (same signing logic) |
| Deployment | Vercel (serverless) + Yandex Cloud (Docker) |
| Migrations | Manual SQL via Supabase dashboard |

## Current CineFiles → TR-BUTE equivalent mapping

| CineFiles (current) | TR-BUTE equivalent |
|---------------------|-------------------|
| Next.js App Router | Express.js + custom SPA router |
| React components (.tsx) | Vanilla JS page scripts + HTML templates |
| Server Components (direct DB) | Express route handlers + API endpoints |
| API routes (`app/api/*/route.ts`) | `api/*.js` serverless endpoints |
| Prisma ORM | Raw `pg` pool queries |
| TypeScript | Plain JavaScript |
| CSS Modules (`.module.css`) | Page-specific CSS files (loaded by SPA router) |
| `tsconfig.json` | `jsconfig.json` (or nothing) |
| `prisma/schema.prisma` | `SQL_SCHEMA.sql` (manual reference) |
| `components/ui/*` | Shared JS modules (`toast.js`, `modal.js`, etc.) |
| `components/layout/*` | `header.js`, `footer.js`, `bottom-nav.js` |

---

## What we're building

### Directory structure (mirroring TR-BUTE)

```
cine-files/
  server.js                    # Express entry point
  server/
    routes/
      index.js                 # Flat route registration (like TR-BUTE)
    middleware/
      auth.js                  # authenticateToken, requireAdmin, requireEditor
    services/
      tmdb.js                  # TMDB sync and cache
    utils/
      transliterate.js         # Slug generation
  api/                         # Serverless endpoints (Vercel)
    articles.js                # GET/POST articles
    article-by-id.js           # GET/PUT/DELETE single article
    articles-related.js        # Related articles
    categories.js              # GET categories
    tags.js                    # GET/POST tags
    tag-by-id.js               # GET/PUT/DELETE single tag
    comments.js                # GET/POST comments
    comment-by-id.js           # PUT/DELETE single comment
    comment-moderate.js        # Admin moderation
    search.js                  # Search articles + tags
    media-upload.js            # S3 upload + DB record
    auth-yandex.js             # Yandex OAuth
    auth-telegram.js           # Telegram OIDC
    auth-telegram-callback.js  # Telegram callback
    cron-token-cleanup.js      # Expired token cleanup
    cron-tmdb-sync.js          # TMDB entity sync
    cron-tmdb-cleanup.js       # Cache cleanup
    tmdb-proxy.js              # TMDB proxy for geo-bypass
    tmdb-search.js             # TMDB search
    feed-rss.js                # RSS feed
    sitemap.js                 # Sitemap XML
  lib/
    db.js                      # getPool() / closePool() singleton
    config.js                  # requireEnv() / getEnv() centralized config
    auth.js                    # JWT signing, session management
    storage.js                 # Yandex S3 with AWS4 signing
    tribute-api.js             # TR-BUTE product fetch
  public/
    index.html                 # SPA entry point (home page)
    css/
      global.css               # CSS variables, shared styles (same vars as TR-BUTE)
      page-layouts.css         # Shared overlay/content patterns
      style.css                # Home page specific
      article.css              # Article page specific
      category.css             # Category listing
      tag.css                  # Tag page
      tags.css                 # All tags listing
      author.css               # Author page
      search.css               # Search results
      about.css                # About page
      legal.css                # Legal page
      collection.css           # Collection page
      collections.css          # Collections listing
      admin.css                # Admin panel
      components/
        article-card.css
        article-body.css
        article-meta.css
        comment-list.css
        block-editor.css
        toast.css
        modal.css
        bottom-sheet.css
        skeleton.css
        image-zoom.css
        scroll-to-top.css
        tooltip.css
    js/
      core/
        router.js              # SPA router (like TR-BUTE's)
        media.js               # resolveImageUrl helper
      pages/
        home.js                # Home page script
        article.js             # Article view (block rendering, comments)
        category.js            # Category listing
        tag.js                 # Tag page
        tags.js                # All tags
        author.js              # Author page
        search.js              # Search
        about.js               # About
        legal.js               # Legal
        collection.js          # Collection view
        collections.js         # All collections
        admin/
          dashboard.js
          articles.js
          article-editor.js    # Block editor
          comments.js
          tags.js
          users.js
          media.js
          settings.js
          collections.js
      components/
        header.js              # Persistent
        footer.js              # Persistent
        bottom-nav.js          # Persistent (mobile)
        theme-toggle.js        # Persistent
        toast.js               # Notification toasts
        modal.js               # MobileModal + ConfirmationModal
        bottom-sheet.js        # Slide-up panel
        skeleton.js            # Loading placeholders
        image-zoom.js          # Full-screen image viewer
        scroll-to-top.js       # Scroll button
        tooltip.js             # Desktop hover tooltip
        article-card.js        # Card component
        article-body.js        # Block renderer
        article-meta.js        # Meta display
        comment-list.js        # Comments with threading
        comment-form.js        # Comment form
        block-editor.js        # Admin block editor
        product-card.js        # TR-BUTE product card
      utils.js                 # Shared utilities
    pages/
      article.html             # Article page template
      category.html            # Category listing
      tag.html                 # Tag page
      tags.html                # All tags
      author.html              # Author page
      search.html              # Search
      about.html               # About
      legal.html               # Legal
      collection.html          # Collection view
      collections.html         # All collections
      admin.html               # Admin panel (SPA within SPA, or separate)
    fonts/
      Montserrat-*.woff2       # Keep existing fonts
    icons/
      *.svg                    # Keep existing icons
  scripts/
    seed.js                    # Database seed (raw SQL)
    check.sh                   # Validation script
  migrations/                  # Manual SQL migrations
  docs/                        # Keep existing docs (update references)
  locales/                     # Keep ru.json, en.json
  SQL_SCHEMA.sql               # Schema reference
  package.json
  jsconfig.json
  Dockerfile
  CLAUDE.md
```

---

## Phased execution plan

### Phase 1: Foundation — Express server + pg pool + config

Set up the new backend skeleton without removing the old code yet.

1. Create `server.js` — Express app with Helmet, CORS, compression,
   rate limiting (matching TR-BUTE's patterns)
2. Create `lib/db.js` — `getPool()` / `closePool()` singleton (copy
   TR-BUTE's pattern: lazy init, SSL config for Supabase, timeouts)
3. Create `lib/config.js` — `requireEnv()` / `getEnv()` / `getEnvInt()` /
   `getEnvBool()` helpers (match TR-BUTE's config.js pattern)
4. Create `lib/auth.js` — JWT signing/verification, session creation
   (INSERT auth_tokens), getCurrentUser (SELECT users), PKCE for Telegram
5. Create `server/routes/index.js` — flat route registration
6. Create `server/middleware/auth.js` — authenticateToken, requireEditor,
   requireAdmin middleware
7. Add `pg`, `express`, `helmet`, `cors`, `compression`, `express-rate-limit`,
   `cookie-parser` to dependencies
8. Create `jsconfig.json`

### Phase 2: API endpoints — convert all routes to Express handlers

Convert each Next.js API route to a standalone handler file in `api/`.
Each exports a function, registered in `server/routes/index.js`.

Priority order (by dependency):
1. Auth endpoints (yandex, telegram) — needed for testing
2. Categories — simple, proves the pattern works
3. Articles (CRUD + related) — bulk of the logic
4. Tags (CRUD) — includes TMDB sync
5. Comments (CRUD + moderation) — includes counter updates
6. Search — ILIKE queries
7. Media upload — S3 integration
8. Cron jobs — cleanup + sync
9. TMDB proxy — passthrough
10. RSS feed + sitemap — content generation

### Phase 3: Frontend — vanilla JS SPA

Build the public-facing frontend as a vanilla JS SPA (like TR-BUTE):

1. Create SPA router (`public/js/core/router.js`) — URL-based page loading,
   `contentSelectors`, `pageSpecificStyles`, `registerPage(route, { init, cleanup })`
2. Create persistent components — header.js, footer.js, bottom-nav.js,
   theme-toggle.js (same behavior as current React components)
3. Create `index.html` — SPA shell with shared script tags
4. Create page HTML templates in `public/pages/`
5. Convert CSS Modules to page-specific CSS files — strip `.module.css`
   scoping, use plain class names matching TR-BUTE's conventions
6. Convert each React component to a vanilla JS module:
   - `ArticleBody` → `article-body.js` (block renderer with innerHTML)
   - `ArticleCard` → `article-card.js` (card builder)
   - `CommentList/Form/Item` → `comment-list.js`, `comment-form.js`
   - `BlockEditor` → `block-editor.js` (admin)
   - All UI components (toast, modal, etc.)
7. Create page scripts — each calls API, renders content, manages state

### Phase 4: Admin panel

Build admin as part of the SPA (or separate HTML pages like TR-BUTE's admin
miniapp — to discuss). Convert:

1. Dashboard (stats/counts)
2. Article management (list, create, edit with block editor)
3. Comment moderation
4. Tag management
5. User management
6. Media library
7. Settings
8. Collections

### Phase 5: Cleanup — remove old stack

1. Delete entire `app/` directory (Next.js pages, API routes, layouts)
2. Delete `components/` directory (React components)
3. Delete `middleware.ts`
4. Delete `prisma/` directory
5. Delete `tsconfig.json`, `next-env.d.ts`
6. Delete all `.module.css` files from `styles/`
7. Remove from `package.json`: `next`, `react`, `react-dom`, `typescript`,
   `@types/*`, `prisma`, `@prisma/client`, `tsx`
8. Remove Next.js scripts (`dev`, `build`, `start`) — replace with
   Express scripts (`dev: nodemon server.js`, `start: node server.js`)
9. Update `next.config.js` → remove (CSP headers move to `server.js`)
10. Move `scripts/seed.js` to use raw SQL
11. Update `CLAUDE.md` to match TR-BUTE conventions
12. Update all docs

### Phase 6: Vercel compatibility

1. Create `api/` serverless endpoint files for Vercel deployment
   (each exports a `(req, res)` handler)
2. Create `vercel.json` with rewrites (SPA fallback) and cron config
3. Ensure `server.js` works for Docker/Yandex Cloud deployment
4. Test both deployment targets

---

## What carries over unchanged

- **Database schema** — same tables, same columns, same SQL_SCHEMA.sql
- **CSS variable names** — already shared with TR-BUTE
- **Font files** (Montserrat WOFF2)
- **Icons/assets**
- **Locale files** (ru.json, en.json)
- **S3 signing logic** (AWS4-HMAC-SHA256)
- **Auth providers** (Yandex, VK, Telegram)
- **TMDB proxy logic**
- **Business rules** (roles, ownership, soft-delete comments, counters)
- **Block types** (paragraph, heading, image, quote, list, embed, divider,
  spoiler, infobox, tribute_products, movie_card)
- **docs/** (content updated, structure kept)

## What changes fundamentally

- **No React** — vanilla JS DOM manipulation
- **No Next.js** — Express.js server + SPA router
- **No TypeScript** — plain JavaScript with JSDoc
- **No Prisma** — raw pg Pool with parameterized SQL
- **No CSS Modules** — plain CSS files loaded by SPA router
- **No Server Components** — API endpoints return JSON, frontend renders
- **No server-side rendering** — SPA with client-side rendering (like TR-BUTE)

## Key conventions to adopt from TR-BUTE

- `registerPage('/route', { init, cleanup })` pattern for all pages
- Cleanup must reset module state, clear timers, remove body-appended elements
- Page CSS in `pageSpecificStyles` array (router cleans up on navigation)
- `contentSelectors` must match HTML class names
- Flat route registration in `server/routes/index.js`
- `requireEnv()` / `getEnv()` for all env vars
- Parameterized SQL only (`$1, $2` placeholders)
- `Number()` cast for numeric DB columns
- No auto-migrations — manual SQL via Supabase dashboard
- Active elements need `.active` + `.active:hover` states
- Dropdowns must scroll into view when opened
- New external services need CSP entries in `server.js`

## Estimated scope

This is a full rebuild. The backend conversion (phases 1-2) is
straightforward — translating Prisma queries to SQL and Express handlers.
The frontend conversion (phases 3-4) is the bulk of the work — rewriting
every React component as vanilla JS with DOM manipulation, building the
SPA router, and creating HTML templates.

The business logic, styling, and database stay the same. What changes is
how the code is structured and executed.
