# Admin & Editor CMS UI — Implementation Plan

## Architecture Overview

Following TR-BUTE patterns: profile page doubles as login, most editor/admin work happens inline on the main site, heavy admin tasks live in a separate admin miniapp.

**Main site** handles: login/profile, article editor (modal), saved articles, inline comment moderation (for editors on article pages).

**Admin miniapp** handles: user management, ad management, site settings, media library, collections, categories, tag management, word filter/auto-moderation, analytics dashboard.

---

## Phase 1: Auth Foundation

### 1.1 — Auth module (`public/js/modules/auth.js`)
Shared auth state, like TR-BUTE's `core/auth.js`:
- `Auth.getUser()` — returns cached user or fetches `/api/auth/me`
- `Auth.isLoggedIn()` — boolean check
- `Auth.isEditor()` / `Auth.isAdmin()` — role checks
- `Auth.logout()` — calls logout endpoint, clears state
- Caches user in memory; invalidated on logout or 401 response

### 1.2 — API endpoints
- **`GET /api/auth/me`** — new file `api/auth-me.js`. Returns `{ id, display_name, avatar_url, role, email, login_method, created_at }` or 401
- **`POST /api/auth/logout`** — new file `api/auth-logout.js`. Clears cookies, deletes refresh token from DB
- **`GET /api/users/me/comments`** — user's own comments with article titles
- **`PUT /api/users/me`** — update display_name, preferences
- **`DELETE /api/auth/account`** — delete own account (with cascade)
- Register all in `server/routes/index.js`

### 1.3 — Header changes
Modify `public/js/modules/header.js` and header HTML in `index.html`:
- **Left of profile button**: "New article" button (visible to editors/admins only) — SVG pen/plus icon, opens article editor modal from anywhere
- **Profile button**: avatar circle if logged in (links to `/profile`), generic person icon if not (links to `/profile` which shows login)
- Like TR-BUTE: notification counter on profile icon for editors (pending review articles, new comments on own articles)
- Update `public/css/header.css`

### 1.4 — Bottom nav (mobile)
Modify `public/js/modules/bottom-nav.js` and bottom nav HTML in `index.html`:
- Add profile icon as 5th item (or replace one)
- Links to `/profile`
- Notification badge for editors

---

## Phase 2: Profile Page (login + profile, like TR-BUTE)

### 2.1 — Profile page (`/profile`)
New files: `public/js/pages/profile.js`, `public/css/profile.css`

**Logged-out state** (two containers toggled via display, TR-BUTE pattern):
- Login prompt text
- OAuth buttons: "Войти через Яндекс", "Войти через Telegram" (each styled with provider color like TR-BUTE)
- Guest theme toggle

**Logged-in state**:
- **Header section**: avatar (with fallback initials like TR-BUTE), display name, login method icon, member since date
- **Saved articles**: grid of bookmarked article cards (like TR-BUTE favorites)
- **My comments**: list with article links, delete own comments
- **My articles**: visible for editors — list with status badges, click to edit (opens editor modal)
- **Settings**: theme toggle, display name edit
- **Logout button**
- **Delete account** (confirmation modal)

### 2.2 — Saved articles system (like TR-BUTE favorites)
New file: `public/js/core/favorites.js`
- `Favorites.toggle(articleId)` — add/remove
- `Favorites.has(articleId)` — check
- `Favorites.getAll()` — list
- localStorage-based (`cinefiles-favorites`, Set of article IDs)
- Server sync when authenticated (fire-and-forget, like TR-BUTE)
- Bookmark button on every article card and article page
- Counter badge in profile
- New API: `GET /api/users/me/favorites`, `PUT /api/users/me/favorites` (sync endpoint)
- New DB: `user_favorites` table (user_id, article_id, created_at) or JSONB in users.preferences
- Migration file for favorites storage

### 2.3 — Update header/bottom-nav favorites counter
Like TR-BUTE updates cart/favorites counts across tabs via `storage` event listener.

---

## Phase 3: Article Editor Modal

### 3.1 — Editor modal component
New files: `public/js/components/article-editor-modal.js`, `public/css/article-editor-modal.css`

Full-screen modal (like the screenshot reference). Opens from:
- "New article" button in header
- "Edit" button on article pages (visible to author/admin)
- "Edit" link in profile "My articles" section

**Top section**:
- Author info (avatar + name, auto-filled)
- Topic/category selector dropdown

**Title area**:
- Inline editable title field (large text)
- Subtitle field below (optional, smaller)

**Block content area**:
Each block has a grip handle (6-dot icon) that opens a context menu:
- Convert to H2 / H3 (for paragraph blocks)
- Convert to paragraph (for heading blocks)
- Anchor (set anchor ID for deep linking)
- Hide content (spoiler wrapper)
- Move up / Move down
- Duplicate block
- Delete block

Block types with their editing UI:

| Block | Editor UI |
|-------|-----------|
| **paragraph** | Contenteditable div with inline formatting (bold, italic, link) |
| **heading** | Inline editable, level shown in context menu |
| **image** | Media picker button + URL input, preview, alt text, credit, caption |
| **gallery** | Multiple image slots, grid preview, captions per image |
| **quote** | Styled textarea + attribution input |
| **list** | Dynamic items with +/- buttons, ordered/unordered toggle |
| **embed** | URL paste field, auto-detect platform (YouTube/VK/RuTube), live preview iframe |
| **divider** | One-click insert, style selector (line/dots/space) |
| **spoiler** | Title input + nested content area |
| **infobox** | Type selector (info/warning/tip/error) + content area |
| **movie_card** | TMDB search field (uses `/api/tmdb/search`), preview card |
| **tribute_products** | Product ID input, fetches preview from TR-BUTE API |
| **comparison** | Two-column layout, before/after labels, images or text |
| **rating** | Score input (1-10), optional label |
| **table** | Row/column controls, cell editing |
| **audio** | URL input for external audio embeds |
| **code** | Monospace textarea with optional language label |

"Add block" button between blocks (+ icon that appears on hover/focus, shows block type picker).

**Bottom toolbar** (fixed at bottom of modal):
- **"Опубликовать"** / **"Сохранить черновик"** button (primary action depends on current status)
- **Comment icon** — toggle allow_comments
- **"..."** overflow menu:
  - Preview (renders article using existing `ArticleBody` component in read-only modal)
  - Mark 18+
  - SEO settings (meta title, meta description, canonical URL — sub-panel)
  - Tags (multi-select with search + inline create)
  - Featured / Pinned toggles
  - Cover image (media picker)
  - Version history (future)
  - Delete article (confirmation modal)
- **Auto-save indicator**: "Сохранено" with checkmark, or "Сохранение..." during save
- Auto-save to server every 30s for drafts; localStorage backup

### 3.2 — Inline formatting toolbar
Floating toolbar appears on text selection within paragraph/heading blocks:
- Bold, Italic, Strikethrough
- Link (URL input popup)
- Inline code
- Clear formatting

### 3.3 — Article body renderer updates
Update `public/js/components/article-body.js` to support new block types: gallery, comparison, rating, table, audio, code.

### 3.4 — Remove old admin article editor
Delete or repurpose `public/js/pages/admin/article-editor.js` and `public/js/pages/admin/articles.js` — article management now happens via the modal + profile page "My articles" section.

---

## Phase 4: Media Upload

### 4.1 — Backend
- Install `multer` (memory storage, 5MB limit, image mimetypes)
- Configure in `server/app.js`
- Wire `POST /api/media/upload` with multer in `server/routes/index.js`

### 4.2 — Media picker component
New file: `public/js/components/media-picker.js`
- Modal grid of existing media from `/api/media`
- Drag-and-drop upload zone at top
- Upload progress indicator
- Alt text + credit inputs on upload
- Click image to select → returns URL
- Used by: article editor (cover image, image blocks, gallery blocks)

---

## Phase 5: Inline Comment Moderation

For editors/admins viewing articles on the public site:
- Modify `public/js/components/comment-list.js`
- Each comment shows hide/delete action buttons for users with editor+ role
- Uses existing `POST /api/admin/comments/:id/moderate` endpoint
- Removes comment from view on action (with toast confirmation)
- No separate admin page needed for basic moderation

---

## Phase 6: Admin Miniapp

Separate lightweight app, similar to TR-BUTE's `admin-miniapp/`. Could be a Telegram Mini App or standalone web panel at `/admin`.

### 6.1 — Structure
- Keep existing `/admin` route prefix
- Existing admin pages become the miniapp sections
- Auth: same JWT cookies, `requireAdmin` / `requireEditor` middleware
- Navigation: sidebar or top tabs (like TR-BUTE miniapp nav)

### 6.2 — Sections

**Dashboard** (`/admin`)
- Stats cards: articles by status, total comments, total users, media count
- Attention alerts: pending review articles, recent comments needing moderation
- Quick links to all sections

**User Management** (`/admin/users`)
- Keep existing: user list with inline role selector
- Add: search/filter, registration date sort, last login sort

**Ad Management** (`/admin/ads`) — NEW
- Database: new `ads` table
  - id, title, ad_type (banner/sidebar/inline), placement (header/sidebar/between-articles/article-footer)
  - image_url, destination_url, alt_text (or raw HTML for custom ads)
  - start_date, end_date, is_active
  - priority, max_impressions, current_impressions, click_count
  - target_categories (integer[], null = all)
  - created_at, updated_at
- API: `api/ads.js` — full CRUD + impression/click tracking endpoints
- Admin UI: list with status/dates/stats, editor form with all fields
- Public rendering: `public/js/components/ad-slot.js`
  - Sidebar ads, between-article ads, article footer ads
  - Impression tracking on render, click tracking on click
- Migration: `migrations/XXX_create_ads_table.sql`

**Media Library** (`/admin/media`)
- Keep existing grid view
- Add: upload zone (drag-and-drop), bulk delete, search/filter
- Like TR-BUTE: orphan detection (S3 files not in DB)

**Collections** (`/admin/collections`)
- Keep existing CRUD
- Add: article picker with drag-and-drop reordering within collection

**Categories** (`/admin/categories`) — NEW
- CRUD for categories: name_ru, name_en, slug, description, sort_order
- New API endpoints: POST/PUT/DELETE `/api/categories/:id`

**Tags** (`/admin/tags`)
- Upgrade from read-only to full CRUD
- Create/edit: name_ru, name_en, tag_type, TMDB link
- Delete with article count warning
- Filter by tag_type

**Word Filter / Auto-Moderation** (`/admin/moderation`) — NEW
Copied from TR-BUTE pattern:
- Database: new `moderation_words` table (id, word, category, is_active, created_at, updated_at)
- API: `api/admin-moderation.js`
  - GET `/api/admin/moderation/words` — list with filters (category, active status, search)
  - POST — create/bulk insert (normalize lowercase, skip duplicates via ON CONFLICT)
  - PUT — update word/category/active status
  - DELETE — remove by ID
  - POST `/api/admin/moderation/test` — test text against filters, returns pass/fail + triggered words
- Cache: in-memory word list, invalidated on changes
- Admin UI:
  - Word list table with search, category filter, active/inactive toggle
  - Bulk import (textarea, one word per line)
  - Test panel: paste text, see which words trigger
- Integration: comments API checks against word filter before saving; auto-hide if triggered
- Migration: `migrations/XXX_create_moderation_words_table.sql`

**Settings** (`/admin/settings`)
- Keep existing key/value CRUD

**Comment Moderation** (`/admin/comments`)
- Keep existing but add: status filter tabs, bulk actions, article links, search

---

## Phase 7: Public Site Ad Rendering

### 7.1 — Ad slot component
New file: `public/js/components/ad-slot.js`
- `AdSlot.render(placement, container)` — fetches active ads for given placement, renders into container
- Respects date range, active status, max impressions, category targeting
- Tracks impressions (POST on render, debounced)
- Tracks clicks (POST on click)

### 7.2 — Ad placements
- Sidebar: rendered in `#sidebar-right` by `public/js/modules/sidebar.js`
- Between articles: injected by feed pages (home, category) every N cards
- Article footer: rendered by `public/js/pages/article.js` after body, before comments

---

## New Files Summary

| File | Purpose |
|------|---------|
| `public/js/modules/auth.js` | Shared auth state (like TR-BUTE core/auth) |
| `public/js/core/favorites.js` | Saved articles (like TR-BUTE core/favorites) |
| `public/js/pages/profile.js` | Profile + login page |
| `public/css/profile.css` | Profile styles |
| `public/js/components/article-editor-modal.js` | Full-screen article editor modal |
| `public/css/article-editor-modal.css` | Editor modal styles |
| `public/js/components/media-picker.js` | Media selection modal |
| `public/js/components/ad-slot.js` | Public ad rendering |
| `public/js/pages/admin/ads.js` | Ad management page |
| `public/js/pages/admin/categories.js` | Category management page |
| `public/js/pages/admin/moderation.js` | Word filter management page |
| `api/auth-me.js` | Auth status endpoint |
| `api/auth-logout.js` | Logout endpoint |
| `api/user-me.js` | User self-service (comments, update, favorites) |
| `api/ads.js` | Ads CRUD + tracking |
| `api/admin-moderation.js` | Word filter CRUD + test |
| `migrations/XXX_create_ads_table.sql` | Ads schema |
| `migrations/XXX_create_moderation_words_table.sql` | Word filter schema |
| `migrations/XXX_create_user_favorites_table.sql` | Saved articles schema |

## Modified Files

| File | Changes |
|------|---------|
| `public/index.html` | Header buttons (new article, profile), new script tags, bottom nav profile slot |
| `public/js/modules/header.js` | Auth state, new article button, profile button with notification badge |
| `public/js/modules/bottom-nav.js` | Profile icon with badge |
| `public/js/components/comment-list.js` | Inline moderation buttons for editors |
| `public/js/components/article-body.js` | New block type renderers |
| `public/js/pages/admin/dashboard.js` | Real stats + alerts |
| `public/js/pages/admin/tags.js` | Full CRUD |
| `public/js/pages/admin/comments.js` | Filters, bulk actions |
| `public/js/pages/admin/media.js` | Upload zone |
| `public/js/pages/admin/collections.js` | Article picker |
| `public/css/admin.css` | New section styles |
| `public/css/header.css` | Profile button, new article button |
| `server/routes/index.js` | All new route registrations |
| `server/app.js` | Multer middleware |
| `SQL_SCHEMA.sql` | New tables |

## Implementation Order

1. **Phase 1** — Auth foundation (everything depends on this) — COMPLETE
2. **Phase 2** — Profile page + saved articles — COMPLETE
3. **Phase 3** — Article editor modal (core CMS feature) — COMPLETE
4. **Phase 4** — Media upload (needed for editor image blocks) — COMPLETE
5. **Phase 5** — Inline comment moderation — COMPLETE
6. **Phase 6** — Admin miniapp sections (can partially parallelize with 3-5) — COMPLETE
7. **Phase 7** — Public integration rendering
8. **Phase 8** — Performance optimizations

---

## Phase 8: Performance Optimizations

### 8.1 — Resource hints in `public/index.html`
Add preconnect hints after FOUC prevention script, before font preload:
- `api.themoviedb.org` (TMDB API proxy target)
- `storage.yandexcloud.net` (S3 media)
- `cdn.cinefiles-txt.com` (CDN)

### 8.2 — Cache-Control headers on public API endpoints
Add `res.set('Cache-Control', ...)` before `res.json(...)` in read-only public endpoints:

| Endpoint | Cache value |
|----------|-------------|
| `api/categories.js` (list) | `public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400` |
| `api/tags.js` (list) | `public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400` |
| `api/articles.js` (list) | `public, max-age=60, s-maxage=300, stale-while-revalidate=600` |
| `api/article-by-id.js` (get) | `public, max-age=60, s-maxage=600, stale-while-revalidate=3600` |
| `api/search.js` | `public, max-age=30, s-maxage=60, stale-while-revalidate=300` |
| `api/articles-related.js` (list) | `public, max-age=300, s-maxage=3600, stale-while-revalidate=3600` |
| `api/collections.js` (list, get only) | `public, max-age=300, s-maxage=3600, stale-while-revalidate=3600` |

Do NOT add to auth, write, admin, or cron endpoints.

### 8.3 — Improve static file serving in `server/app.js`
Replace maxAge config with ETag-based caching:
- JS/CSS/HTML: `no-cache` (always revalidate via ETag — code changes propagate immediately)
- Everything else (fonts, images, icons): `public, max-age=86400` (24h cache)

### 8.4 — esbuild minification build step
- Add `esbuild` to devDependencies
- Create `scripts/minify.js` — deployment-only in-place minification
  - Collects `.css` and `.js` from `public/` (skip `fonts/`)
  - Uses esbuild `transform()` API with `{ minify: true, legalComments: 'inline' }`
  - Reports savings (original vs minified, percentage)
  - `--dry-run` flag for preview without writing
- Add `build` and `build:dry` npm scripts
- Source files in git stay readable — only runs during deployment
