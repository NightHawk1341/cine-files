# Admin & Editor CMS UI — Implementation Plan

## Current State

The backend is fully built (auth endpoints, CRUD APIs, middleware). The admin panel has 9 basic pages with functional but minimal UI. **Key gaps:**

- **No login UI** — OAuth endpoints exist but no way to trigger them from the frontend
- **No profile page** — no user-facing account management
- **No user indicator in header** — no avatar, login button, or user menu
- **Raw JSON article editor** — textarea for content blocks, no visual editor
- **No media upload form** — API stub exists but no multer middleware and no upload UI
- **No ad management** — nothing exists
- **No tag CRUD UI** — read-only list
- **No article deletion** — no delete button in articles list or editor
- **No draft management UX** — no status filters, no "my drafts" view for editors
- **No frontend auth guards** — admin pages render even when not logged in

---

## Implementation Plan (ordered by dependency)

### Phase 1: Auth UI Foundation

**1.1 — Login page** (`/login`)
- New file: `public/js/pages/login.js`
- New file: `public/css/login.css`
- Two OAuth buttons: "Войти через Яндекс" and "Войти через Telegram"
- Each button is an `<a>` linking to `/api/auth/yandex` and `/api/auth/telegram`
- Centered card layout matching admin styling
- Redirect away if already authenticated (check via `/api/auth/me` — needs new endpoint)
- Add `<script>` tag to `index.html`

**1.2 — Auth status API endpoint** (`GET /api/auth/me`)
- New file: `api/auth-me.js`
- Returns current user (id, display_name, avatar_url, role) if authenticated, or 401
- Uses `authenticateToken` middleware (not `requireAuth` — needs optional mode)
- Register in `server/routes/index.js`

**1.3 — Logout endpoint** (`POST /api/auth/logout`)
- New file: `api/auth-logout.js`
- Clears `access_token` and `refresh_token` cookies
- Deletes refresh token from DB
- Register in `server/routes/index.js`

**1.4 — Header user menu**
- Modify `public/js/modules/header.js`
- On init: fetch `/api/auth/me` to check auth state
- If logged in: show avatar + display name (dropdown with: profile link, admin link if editor+, logout)
- If not logged in: show "Войти" button linking to `/login`
- Add user menu HTML to header in `index.html`
- Add styles to `public/css/header.css`

**1.5 — Frontend auth guards for admin pages**
- Create `public/js/modules/auth.js` — shared auth state module
  - `Auth.getUser()` returns cached user or fetches `/api/auth/me`
  - `Auth.requireRole(role)` — redirects to `/login` if not authenticated or insufficient role
- Each admin page calls `Auth.requireRole('editor')` or `Auth.requireRole('admin')` in `init()`

### Phase 2: Profile Page

**2.1 — Profile page** (`/profile`)
- New file: `public/js/pages/profile.js`
- New file: `public/css/profile.css`
- Sections (adapted from TR-BUTE for a content site):
  - **Account info**: avatar, display name, email, login method icon, member since
  - **My activity** (tabbed):
    - My comments (with delete option)
    - My articles (if editor+ — link to admin editor)
  - **Settings**: theme toggle, notification preferences
  - **Logout button**
  - **Delete account** (with confirmation modal)
- Add `<script>` tag to `index.html`

**2.2 — Profile API endpoints**
- `GET /api/users/me/comments` — user's own comments (new handler)
- `DELETE /api/auth/account` — delete own account (new handler)
- `PUT /api/users/me` — update display name / preferences (new handler)

### Phase 3: Article Editor Upgrade

**3.1 — Visual block editor**
- Major rewrite of `public/js/pages/admin/article-editor.js`
- Replace raw JSON textarea with visual block editor:
  - "Add block" button with block type selector (dropdown/popover)
  - Each block renders as an editable card with type-specific UI:
    - **paragraph**: contenteditable div or textarea
    - **heading**: input with level selector (h2/h3/h4)
    - **image**: URL input + preview + alt text + credit fields + media library picker
    - **quote**: textarea + attribution input
    - **list**: dynamic item inputs + ordered/unordered toggle
    - **embed**: URL input with auto-detect (YouTube/VK/RuTube) + preview
    - **divider**: just a visual separator line, no input
    - **spoiler**: title input + content textarea
    - **infobox**: type selector (info/warning) + content textarea
    - **movie_card**: TMDB search integration (uses existing `/api/tmdb/search`)
    - **tribute_products**: product ID inputs
  - Drag-and-drop reordering (use native HTML5 drag API)
  - Delete block button on each block
  - Duplicate block button
- New file: `public/css/block-editor.css`

**3.2 — Article editor improvements**
- Add fields missing from current editor:
  - Cover image alt text + credit
  - SEO fields: meta title, meta description, canonical URL
  - Tags selector (multi-select with search, uses `/api/tags` + create inline)
  - Featured / Pinned toggles
  - Allow comments toggle
  - TR-BUTE product IDs
- Status workflow buttons: Save Draft / Submit for Review / Publish / Archive
- Delete article button (with confirmation modal)
- Article preview (render blocks using `ArticleBody` component in a modal/side panel)
- Auto-save to localStorage every 30s (restore on page load if newer than server version)

**3.3 — Media library picker (reusable component)**
- New file: `public/js/components/media-picker.js`
- Modal that shows media grid from `/api/media`
- Click to select → returns URL
- Upload button within picker (requires Phase 4)
- Used by: article editor cover image, image blocks

### Phase 4: Media Upload

**4.1 — Backend: add multer middleware**
- Install `multer` package
- Configure in `server/app.js` (memory storage, 5MB limit, image mimetypes)
- Wire up `POST /api/media/upload` route with multer middleware in `server/routes/index.js`

**4.2 — Media upload UI**
- Add upload zone to `public/js/pages/admin/media.js`:
  - Drag-and-drop area + file input button
  - Upload progress indicator
  - Alt text + credit inputs before upload
  - After upload: add to grid immediately

### Phase 5: Admin Improvements

**5.1 — Articles list improvements**
- Status filter tabs: All / Drafts / Review / Published / Archived
- "My articles" filter for editors (show only own articles)
- Search/filter by title
- Delete button per row (with confirmation)
- Bulk status change (select multiple → change status)
- Sort by date, views, comments

**5.2 — Tag management CRUD**
- Enhance `public/js/pages/admin/tags.js`:
  - "New tag" button → form (name_ru, name_en, tag_type selector, TMDB search)
  - Edit button per tag → inline edit or modal
  - Delete button per tag (with article count warning)
  - Filter by tag_type

**5.3 — Comments management improvements**
- Filter by status: All / Visible / Hidden / Deleted
- Search by text or author
- Bulk moderation (select multiple → hide/show/delete)
- Link to the article each comment belongs to

**5.4 — Collections article management**
- Add article picker to collection editor form
- Show current articles with drag-and-drop reordering
- Search/select articles to add
- Remove articles from collection

**5.5 — Admin dashboard upgrade**
- Show real stats: total articles (by status), total comments, total users, total media
- Recent activity feed (latest articles, comments)
- Quick actions: new article, moderate comments count

### Phase 6: Ad Management (New Feature)

**6.1 — Database schema**
- New table: `ads`
  - id, title, ad_type (banner/sidebar/inline/interstitial), placement (header/sidebar/between-articles/footer)
  - content (HTML or image URL + link), alt_text
  - start_date, end_date, is_active
  - priority (sort order), max_impressions, current_impressions, click_count
  - target_categories (integer[] — limit to specific categories, null = all)
  - created_at, updated_at
- Migration file: `migrations/XXX_create_ads_table.sql`
- Update `SQL_SCHEMA.sql`

**6.2 — Ad API endpoints**
- New file: `api/ads.js`
  - `GET /api/ads` — list ads (admin: all, public: active + within date range)
  - `POST /api/ads` — create ad (requireAdmin)
  - `GET /api/ads/:id` — get ad by ID
  - `PUT /api/ads/:id` — update ad (requireAdmin)
  - `DELETE /api/ads/:id` — delete ad (requireAdmin)
  - `POST /api/ads/:id/impression` — increment impression count (public, rate-limited)
  - `POST /api/ads/:id/click` — increment click count (public, rate-limited)
- Register in `server/routes/index.js`

**6.3 — Ad management admin page**
- New file: `public/js/pages/admin/ads.js`
- Route: `/admin/ads`
- List view: table with title, type, placement, status, dates, impressions, clicks, CTR
- Editor form:
  - Title, ad type selector, placement selector
  - Content: image upload (via media picker) + destination URL, or raw HTML
  - Date range picker (start/end)
  - Active toggle
  - Priority number
  - Max impressions (0 = unlimited)
  - Target categories multi-select
- Dashboard link in admin nav

**6.4 — Ad rendering on public site**
- New file: `public/js/components/ad-slot.js`
- `AdSlot.render(placement)` — fetches active ads for placement, renders one (by priority/random)
- Placements:
  - **Sidebar**: rendered in `sidebar-right`
  - **Between articles**: injected every N articles in feed pages
  - **Article footer**: after article body, before comments
  - **Header banner**: below site header (dismissible)
- Tracks impressions on render, clicks on click
- Respects `max_impressions` limit

### Phase 7: Additional Features (from TR-BUTE patterns)

**7.1 — Activity feed** (admin)
- New file: `public/js/pages/admin/feed.js`
- Route: `/admin/feed`
- Unified view of: new comments, new articles submitted for review, new user registrations
- Date-grouped, filterable by type
- Quick actions: approve/reject articles, moderate comments

**7.2 — Bottom nav user slot** (mobile)
- Replace one bottom nav item (or add 5th) with user icon
- Links to `/profile` if logged in, `/login` if not
- Shows notification badge for editors (pending review count)

**7.3 — Category management** (admin)
- New file: `public/js/pages/admin/categories.js`
- Route: `/admin/categories`
- CRUD for categories: name_ru, name_en, slug, description, sort_order
- Currently categories are DB-only with no admin UI
- New API endpoints: `POST /api/categories`, `PUT /api/categories/:id`, `DELETE /api/categories/:id`

---

## New Files Summary

### JavaScript
| File | Purpose |
|------|---------|
| `public/js/pages/login.js` | Login page with OAuth buttons |
| `public/js/pages/profile.js` | User profile page |
| `public/js/modules/auth.js` | Shared auth state management |
| `public/js/components/media-picker.js` | Reusable media selector modal |
| `public/js/components/ad-slot.js` | Ad rendering component |
| `public/js/pages/admin/ads.js` | Ad management admin page |
| `public/js/pages/admin/feed.js` | Activity feed admin page |
| `public/js/pages/admin/categories.js` | Category management admin page |
| `api/auth-me.js` | Auth status endpoint |
| `api/auth-logout.js` | Logout endpoint |
| `api/ads.js` | Ads CRUD + impression/click tracking |

### CSS
| File | Purpose |
|------|---------|
| `public/css/login.css` | Login page styles |
| `public/css/profile.css` | Profile page styles |
| `public/css/block-editor.css` | Visual block editor styles |

### SQL
| File | Purpose |
|------|---------|
| `migrations/XXX_create_ads_table.sql` | Ads table schema |

### Modified Files
| File | Changes |
|------|---------|
| `public/index.html` | New script tags, header user menu HTML |
| `public/js/modules/header.js` | User menu with auth state |
| `public/js/pages/admin/article-editor.js` | Full rewrite → visual block editor |
| `public/js/pages/admin/articles.js` | Filters, search, delete, bulk actions |
| `public/js/pages/admin/tags.js` | CRUD UI |
| `public/js/pages/admin/comments.js` | Filters, bulk moderation |
| `public/js/pages/admin/media.js` | Upload form |
| `public/js/pages/admin/collections.js` | Article picker |
| `public/js/pages/admin/dashboard.js` | Real stats + quick actions |
| `public/css/admin.css` | New component styles |
| `public/css/header.css` | User menu styles |
| `server/routes/index.js` | New route registrations |
| `server/app.js` | Multer middleware |
| `SQL_SCHEMA.sql` | Ads table |

---

## Implementation Order

Strict dependency chain — each phase builds on the previous:

1. **Phase 1** (Auth UI) — everything else needs login to work
2. **Phase 2** (Profile) — depends on auth module from Phase 1
3. **Phase 3** (Article Editor) — core CMS functionality
4. **Phase 4** (Media Upload) — needed for editor image blocks
5. **Phase 5** (Admin Improvements) — polish existing pages
6. **Phase 6** (Ad Management) — new feature, independent of 3-5
7. **Phase 7** (Additional) — nice-to-haves

Phases 3-5 can be partially parallelized. Phase 6 only depends on Phase 1.
