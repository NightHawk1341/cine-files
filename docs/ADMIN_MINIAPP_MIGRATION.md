# Admin Mini-App Separation

## Overview

Migrate the CineFiles admin panel from being embedded in the main SPA to a standalone mini-app at `/admin-miniapp/`, matching TR-BUTE's architecture.

### Before (CineFiles embedded admin)
- Admin pages are `registerPage()` calls in the main SPA
- All 12 admin JS files loaded by every visitor via `<script>` tags in `index.html`
- Admin shares the public site layout (header, sidebar, footer)
- No separate admin auth flow
- No router-level separation

### After (TR-BUTE pattern)
- Admin is a standalone app at `/admin-miniapp/` with its own `index.html`
- ES module architecture (`import`/`export`) with view-based navigation
- Own authentication system (browser login, JWT cookie verification)
- SPA router blocks `/admin*` routes and forces full page reload
- Admin scripts removed from main `index.html` (zero download for visitors)

## Architecture

> **Reference**: TR-BUTE submodule at `tribute/admin-miniapp/` is the canonical implementation.
> All patterns below include `→ tribute/...` pointers to the source file.

### Directory Structure
```
public/
  admin-miniapp/
    index.html              # Standalone admin HTML (own layout, nav, scripts)
    style.css               # Admin-specific styles (merged from admin.css)
    css/                    # Modular CSS partials (NOT a single file)
      _variables.css        #   → tribute/admin-miniapp/css/_variables.css
      _utilities.css        #   → tribute/admin-miniapp/css/_utilities.css
      _layout.css           #   → tribute/admin-miniapp/css/_layout.css
      _cards.css            #   → tribute/admin-miniapp/css/_cards.css
      _forms.css            #   → tribute/admin-miniapp/css/_forms.css
      _modals.css           #   → tribute/admin-miniapp/css/_modals.css
    js/
      main.js               # ES module entry point (DOMContentLoaded bootstrap)
      auth.js               # Browser login verification, logout
      config.js             # API_BASE, platform detection
      state.js              # Global state management
      utils.js              # SVGIcons, escapeHtml, showToast, showModal/hideModal, formatDate
      theme.js              # Theme toggle (syncs with main site localStorage key)
      utils/
        apiClient.js         # Authenticated fetch wrapper with retry (← NOT in utils.js)
        templates.js         # Reusable HTML builders (createPageHeader, createLoadingSpinner, createEmptyState)
        modalManager.js      # Modal stacking state tracker
      views/
        dashboard.js         # Stats overview + quick links
        articles.js          # Article list
        article-editor.js    # Article create/edit (opens modal)
        comments.js          # Comment moderation
        tags.js              # Tag list
        users.js             # User role management
        media.js             # Media library + upload
        collections.js       # Collection CRUD
        categories.js        # Category CRUD
        integrations.js      # Partner placement management
        moderation.js        # Auto-moderation word filter
        settings.js          # Key-value settings
  admin-login.html           # Standalone browser login page
```

### Gaps vs Original Plan (discovered from submodule)

1. **CSS is modular, not a single file** — TR-BUTE splits admin CSS into `css/_variables.css`, `_layout.css`, `_forms.css`, `_modals.css`, etc. loaded via parallel `<link>` tags (not `@import`). We should do the same instead of one `style.css`.
   → `tribute/admin-miniapp/index.html:15-28`

2. **`apiClient.js` is a separate utils module** — `apiFetch` with retry logic and auth header injection lives in `js/utils/apiClient.js`, not in `utils.js`. Views import `{ apiGet, apiPost }` from it.
   → `tribute/admin-miniapp/js/utils/apiClient.js`

3. **`utils/templates.js` provides reusable HTML builders** — `createPageHeader()`, `createLoadingSpinner()`, `createEmptyState()`, `createErrorState()`. Views import these instead of duplicating HTML.
   → `tribute/admin-miniapp/js/utils/templates.js`

4. **`modulepreload` links in HTML** — `index.html` includes `<link rel="modulepreload">` for core JS modules to break Firefox's sequential module-resolution waterfall.
   → `tribute/admin-miniapp/index.html:40-48`

5. **Modal stacking with input preservation** — `showModal()` saves current modal to a stack including input/select/textarea values. `hideModal()` restores them. Separate `modalManager.js` tracks unsaved changes.
   → `tribute/admin-miniapp/js/utils.js` (showModal/hideModal) + `tribute/admin-miniapp/js/utils/modalManager.js`

6. **`#app.authenticated` CSS gate** — Nav is hidden via `#app:not(.authenticated) .app-header { display: none !important }` until auth succeeds and adds `.authenticated` class.
   → `tribute/admin-miniapp/css/_layout.css:29-33`

7. **Rate limiting on login endpoint** — `express-rate-limit` (10 attempts / 15 min) on browser-login.
   → `tribute/server/routes/admin.js:20-26`

8. **`protectAdminMiniapp` middleware** — Serves static files from admin-miniapp dir with auth check for browser users but allows unauthenticated access for Telegram WebView (SPA handles its own auth).
   → `tribute/server/routes/admin.js:98-153`

9. **Response helpers pattern** — TR-BUTE uses `{ success, error, badRequest, unauthorized, forbidden, methodNotAllowed }` from a response-helpers module. CineFiles doesn't have this — decide whether to add it or use raw `res.json()`.
   → `tribute/server/utils/response-helpers.js`

10. **Logout endpoint** — Separate `POST /api/admin/logout` that clears cookie. Not just a client-side redirect.
    → `tribute/api/admin/logout.js`

11. **Login page redirects if already authenticated** — `loginPage()` handler checks cookie before serving login HTML, redirects to `/admin-miniapp/` if valid.
    → `tribute/server/routes/admin.js:64-87`

### Server-Side Changes
```
api/
  admin/
    browser-login.js         # POST /api/admin/browser-login (username/password → JWT cookie)
    browser-verify.js        # GET /api/admin/browser-verify (cookie check → admin data + role)
    logout.js                # POST /api/admin/logout (clear cookie)

server/
  routes/admin.js            # Admin router factory: auth endpoints + static file serving + login page
  routes/index.js            # Mount admin router at /api/admin, login at /admin/login, miniapp at /admin-miniapp
  middleware/admin-auth.js   # requireAdminAuth middleware (cookie JWT for browser, initData for Telegram)
```

> **Reference**: TR-BUTE puts admin API handlers in `api/admin/` subdirectory and mounts them
> via a router factory in `server/routes/admin.js`. The factory exports three things:
> - `createAdminRouter(deps)` → Express Router for `/api/admin/*` auth endpoints
> - `.loginPage(deps)` → Handler for `GET /admin/login` (redirects if already authed)
> - `.protectAdminMiniapp(deps)` → Router that serves static files from admin-miniapp/ with optional cookie gate
>
> → `tribute/server/routes/admin.js` (full pattern)
> → `tribute/server/routes/index.js:85-92` (mounting)

### New Environment Variables
- `ADMIN_USERNAME` — Admin login username
- `ADMIN_PASSWORD_HASH` — bcrypt hash of admin password (supports both bcrypt and plain-text with timing-safe comparison → `tribute/api/admin/browser-login.js:17-32`)

## Authentication Flow

> **Reference**: → `tribute/admin-miniapp/js/auth.js` (client-side verification, all three modes)

### Browser Login
1. User navigates to `/admin/login`
2. Server checks cookie — if already authed, redirect to `/admin-miniapp/` → `tribute/server/routes/admin.js:64-87`
3. Otherwise serves `admin-login.html` (standalone page, no SPA) → `tribute/admin-login.html`
4. User enters username + password
5. POST `/api/admin/browser-login` validates credentials (bcrypt or timing-safe plain-text) → `tribute/api/admin/browser-login.js`
6. On success: sets `admin_token` cookie (httpOnly, secure, sameSite: strict, 7 day expiry)
7. JWT payload: `{ isAdmin: true, role: 'admin', username, authMethod: 'browser', loginTime }`
8. Client redirects to `/admin-miniapp/`
9. Rate-limited: 10 attempts per 15 minutes → `tribute/server/routes/admin.js:20-26`

### Admin Session Verification
1. `main.js` calls `verifyAdminAccess()` on DOMContentLoaded → `tribute/admin-miniapp/js/main.js:197`
2. `auth.js` detects browser mode via `isBrowserMode()` (no Telegram SDK) → `tribute/admin-miniapp/js/config.js:28-31`
3. Fetches `GET /api/admin/browser-verify` with `credentials: 'include'` → `tribute/api/admin/browser-verify.js`
4. Server reads `admin_token` cookie, verifies JWT, returns `{ admin: { role, editorPermissions } }`
5. Client sets `state.role`, adds `.authenticated` + `.role-admin` classes to `#app`
6. On failure: redirects to `/admin/login`

### Reuse of Existing Auth
- The existing `access_token` cookie (from Yandex/Telegram OAuth) already contains `{ userId, role }`
- `browser-verify` checks this same cookie — no new auth system needed for OAuth users
- `browser-login` adds a direct username/password path for admin-only access (new)

### Logout
- Separate `POST /api/admin/logout` endpoint that clears cookie server-side → `tribute/api/admin/logout.js`
- Client calls it from `auth.js:logout()`, then redirects to `/admin/login` → `tribute/admin-miniapp/js/auth.js:192-221`

## View-Based Navigation (not URL-based)

> **Reference**: → `tribute/admin-miniapp/js/main.js:114-184` (switchView implementation)

Unlike the main SPA which uses URL-based routing (`Router.registerPage`), the admin miniapp uses view-based navigation matching TR-BUTE:

```javascript
// Navigation via data-view attributes on buttons
switchView('articles');  // Renders articles view into #content

// State persisted to localStorage
localStorage.setItem('admin-current-view', viewName);
```

Navigation buttons in header (desktop) and bottom nav (mobile) trigger `switchView()`.

### switchView() responsibilities (from TR-BUTE)
1. Check permission via `canAccessView(viewName)` → `main.js:51-76`
2. Toggle `.active` on nav buttons (both header and bottom nav)
3. Update `state.currentView` and save to localStorage
4. Set `data-view` attribute on `.content-area` (for per-view CSS)
5. Clean up body-appended elements from previous view (bulk bars, selection bars)
6. Call view's render function (e.g. `renderArticlesView()`)

### View module pattern (from TR-BUTE)
Each view exports a render function that:
1. Calls `requireAuth()` guard
2. Gets `document.getElementById('content')` and sets innerHTML
3. Fetches data via `apiGet()`/`apiPost()` from `utils/apiClient.js`
4. Uses `createPageHeader()`, `createLoadingSpinner()` from `utils/templates.js`
5. Attaches event listeners after rendering

→ `tribute/admin-miniapp/js/views/statistics.js:1-60` (good example of subtab pattern)

## SPA Router Blocking

> **Reference**: TR-BUTE does this in `shouldSpaHandle()` → `tribute/public/js/core/router.js:920-923`

The main SPA router (`public/js/core/router.js`) blocks all `/admin*` paths:

```javascript
// TR-BUTE pattern: in shouldSpaHandle() which returns false to skip SPA navigation
if (targetUrl.pathname.startsWith('/admin')) {
  return false;
}
```

CineFiles equivalent — add to `navigate()` in `public/js/core/router.js`:
```javascript
if (path.startsWith('/admin')) {
  window.location.href = path;
  return;
}
```

This forces a full page reload, letting the server serve the appropriate HTML.

## Server Routing

> **Reference**: → `tribute/server/routes/index.js:85-92` + `tribute/server/routes/admin.js`

TR-BUTE mounts everything via a router factory pattern:

```javascript
// tribute/server/routes/index.js:85-92
const createAdminRouter = require('./admin');
const adminRouter = createAdminRouter({ pool, auth, config, requireAdminAuth });
app.use('/api/admin', adminRouter);                                    // Auth API endpoints
app.get('/admin/login', createAdminRouter.loginPage({ auth }));        // Login page (redirects if authed)
app.use('/admin-miniapp', createAdminRouter.protectAdminMiniapp({ auth })); // Static files + cookie gate
```

CineFiles equivalent in `server/routes/index.js`:
```javascript
// Admin auth endpoints
app.post('/api/admin/browser-login', loginLimiter, browserLogin(deps));
app.get('/api/admin/browser-verify', browserVerify(deps));
app.post('/api/admin/logout', adminLogout(deps));

// Admin login page (redirect if already authenticated)
app.get('/admin/login', serveAdminLogin);

// Admin miniapp static files (with optional cookie gate)
app.use('/admin-miniapp', protectAdminMiniapp(deps));

// SPA fallback (excludes /admin-miniapp and /admin/login)
app.get('*', serveSpaFallback);
```

### protectAdminMiniapp key detail
The middleware allows unauthenticated static file access (JS/CSS) so that Telegram WebViews can load the SPA. The SPA itself verifies auth via API before showing any data. Only browser HTML navigations without a cookie could be redirected.
→ `tribute/server/routes/admin.js:110-140`

## Bootstrap Sequence (from TR-BUTE main.js)

> **Reference**: → `tribute/admin-miniapp/js/main.js:189-274`

`DOMContentLoaded` handler runs in this order:
1. `initTheme()` — apply saved theme
2. Attach logout button listener
3. `await verifyAdminAccess()` — **blocks everything if auth fails**
4. Set up modal close listeners (overlay click, close button)
5. Attach nav button click handlers → `switchView(btn.dataset.view)`
6. `updateNavigationVisibility()` — hide nav buttons for inaccessible views
7. Restore saved view from localStorage or use default
8. `switchView(defaultView)` — render initial view

### HTML structure (from TR-BUTE index.html)

> **Reference**: → `tribute/admin-miniapp/index.html`

Key elements that must exist:
- `<div id="app">` — root container, gets `.authenticated` + `.role-admin` classes
- `<header class="app-header">` — desktop nav (hidden until authenticated via CSS)
- `<main id="content" class="content-area">` — views inject here
- `<nav class="bottom-nav">` — mobile nav (hidden until authenticated via CSS)
- `<div id="toast-container">` — outside `#app` for toast notifications
- `<div id="modal-overlay" class="modal-overlay">` — shared modal with `#modal-title`, `#modal-body`, `#modal-footer`
- `<script type="module" src="/admin-miniapp/js/main.js">` — single entry point

### CSS loading pattern
Parallel `<link rel="stylesheet">` tags instead of `@import` waterfall:
```html
<link rel="stylesheet" href="/admin-miniapp/css/_variables.css">
<link rel="stylesheet" href="/admin-miniapp/css/_utilities.css">
<link rel="stylesheet" href="/admin-miniapp/css/_layout.css">
<!-- ... more partials ... -->
<link rel="stylesheet" href="/admin-miniapp/style.css">
```

### Module preloading
```html
<link rel="modulepreload" href="/admin-miniapp/js/state.js">
<link rel="modulepreload" href="/admin-miniapp/js/config.js">
<link rel="modulepreload" href="/admin-miniapp/js/auth.js">
<link rel="modulepreload" href="/admin-miniapp/js/utils.js">
<link rel="modulepreload" href="/admin-miniapp/js/theme.js">
<link rel="modulepreload" href="/admin-miniapp/js/utils/apiClient.js">
<link rel="modulepreload" href="/admin-miniapp/js/utils/templates.js">
```

## Key Code References (copy-from guide)

| CineFiles Target | Copy From (TR-BUTE submodule) | Adapt |
|---|---|---|
| `admin-miniapp/js/main.js` | `tribute/admin-miniapp/js/main.js` | Remove Telegram/MAX, replace view list |
| `admin-miniapp/js/auth.js` | `tribute/admin-miniapp/js/auth.js` | Remove Telegram/MAX modes, keep browser mode only |
| `admin-miniapp/js/config.js` | `tribute/admin-miniapp/js/config.js` | Remove `tg`, `isMAX`, keep `API_BASE` + `isBrowserMode()` |
| `admin-miniapp/js/state.js` | `tribute/admin-miniapp/js/state.js` | Replace `orders`/`reviews` with CineFiles state (`articles`, etc.) |
| `admin-miniapp/js/utils.js` | `tribute/admin-miniapp/js/utils.js` | Keep SVGIcons, escapeHtml, showToast, showModal/hideModal. Remove payment/order-specific code |
| `admin-miniapp/js/theme.js` | `tribute/admin-miniapp/js/theme.js` | Use as-is (32 lines), but sync localStorage key with main site (`cinefiles-theme`) |
| `admin-miniapp/js/utils/apiClient.js` | `tribute/admin-miniapp/js/utils/apiClient.js` | Remove Telegram header injection, keep retry + `credentials: 'include'` |
| `admin-miniapp/js/utils/templates.js` | `tribute/admin-miniapp/js/utils/templates.js` | Keep `createPageHeader`, `createLoadingSpinner`, `createEmptyState` |
| `admin-miniapp/index.html` | `tribute/admin-miniapp/index.html` | Remove Telegram/MAX SDKs, SortableJS. Replace nav views. Remove modulepreloads for unused modules |
| `admin-miniapp/css/_variables.css` | `tribute/admin-miniapp/css/_variables.css` | Map TR-BUTE vars to CineFiles vars from `global.css` |
| `admin-miniapp/css/_layout.css` | `tribute/admin-miniapp/css/_layout.css` | Keep `#app` layout, auth gate CSS, header/nav styles |
| `admin-miniapp/css/_forms.css` | `tribute/admin-miniapp/css/_forms.css` | Keep form styling patterns |
| `admin-miniapp/css/_modals.css` | `tribute/admin-miniapp/css/_modals.css` | Keep modal overlay/content styles |
| `admin-login.html` | `tribute/admin-login.html` | Change title, branding |
| `api/admin/browser-login.js` | `tribute/api/admin/browser-login.js` | Remove editor role logic (CineFiles uses existing role system), adapt config keys |
| `api/admin/browser-verify.js` | `tribute/api/admin/browser-verify.js` | Remove editor permissions, use CineFiles `requireAdmin` role check |
| `api/admin/logout.js` | `tribute/api/admin/logout.js` | Use as-is (20 lines) |
| `server/routes/admin.js` | `tribute/server/routes/admin.js` | Remove Telegram/MAX verify routes, keep login page + protectAdminMiniapp |

## CineFiles-Specific Adaptations

### No Telegram/MAX — browser-only admin
TR-BUTE supports three auth modes (browser, Telegram, MAX). CineFiles only needs browser mode.
- `config.js`: export only `API_BASE` and `isBrowserMode()` (always returns true)
- `auth.js`: remove Telegram/MAX branches, keep browser verify only
- `apiClient.js`: remove `X-Telegram-Init-Data` header injection
- `index.html`: remove Telegram/MAX SDK script tags

### Reuse existing CineFiles auth for OAuth users
CineFiles already has Yandex/Telegram OAuth with `access_token` cookie containing `{ userId, role }`.
- `browser-verify` should check both `admin_token` (new) and `access_token` (existing) cookies
- If `access_token` exists and decoded role is `admin`, return success without requiring browser login
- This means OAuth admins can access `/admin-miniapp/` without the separate login flow

### No editor role granularity needed (initially)
TR-BUTE has complex editor permissions (`editorPermissions` object with per-subtab access). CineFiles only has `admin` role for the admin panel.
- Skip `editorPermissions`, `isEditor()`, `hasPermission()` subtab checks initially
- `canAccessView()` simply checks `state.role === 'admin'`
- Can add editor support later if needed

## Migration Checklist

- [x] Create `docs/ADMIN_MINIAPP_MIGRATION.md` (this file)

### Phase 1: Server-side setup
- [x] Create `api/admin/browser-login.js` — copy from `tribute/api/admin/browser-login.js`, simplify
- [x] Create `api/admin/browser-verify.js` — copy from `tribute/api/admin/browser-verify.js`, add `access_token` fallback
- [x] Create `api/admin/logout.js` — copy from `tribute/api/admin/logout.js`
- [x] Create `server/routes/admin.js` — copy factory pattern from `tribute/server/routes/admin.js`, remove Telegram/MAX
- [x] Update `server/routes/index.js` — mount admin router, login page, protectAdminMiniapp
- [x] Add `ADMIN_USERNAME` / `ADMIN_PASSWORD_HASH` to `lib/config.js` and deploy workflow
- [x] Add rate-limiting on login endpoint

### Phase 2: Admin miniapp skeleton
- [x] Create `public/admin-miniapp/index.html` — copy from `tribute/admin-miniapp/index.html`, strip Telegram/MAX
- [x] Create `public/admin-miniapp/css/` partials — adapt from tribute, map to CineFiles CSS vars
- [x] Create `public/admin-miniapp/js/config.js` — browser-only version
- [x] Create `public/admin-miniapp/js/state.js` — CineFiles state shape
- [x] Create `public/admin-miniapp/js/auth.js` — browser-only verify + logout
- [x] Create `public/admin-miniapp/js/theme.js` — sync with `cinefiles-theme` localStorage key
- [x] Create `public/admin-miniapp/js/utils.js` — SVGIcons, escapeHtml, toast, modal
- [x] Create `public/admin-miniapp/js/utils/apiClient.js` — copy, remove Telegram headers
- [x] Create `public/admin-miniapp/js/utils/templates.js` — copy reusable builders
- [x] Create `public/admin-miniapp/js/main.js` — bootstrap, switchView for CineFiles views
- [x] Create `public/admin-login.html` — copy from `tribute/admin-login.html`, rebrand

### Phase 3: Migrate views (one at a time)
- [x] `views/dashboard.js` — admin stats overview
- [x] `views/articles.js` — article list + status management
- [x] `views/article-editor.js` — article create/edit (links to main SPA block editor)
- [x] `views/comments.js` — comment moderation
- [x] `views/tags.js` — tag management
- [x] `views/users.js` — user role management
- [x] `views/media.js` — media library + upload
- [x] `views/collections.js` — collection CRUD
- [x] `views/categories.js` — category CRUD
- [x] `views/integrations.js` — partner placement
- [x] `views/moderation.js` — auto-moderation word filter
- [x] `views/settings.js` — key-value settings

### Phase 4: Cutover
- [x] Block `/admin*` routes in SPA router (`public/js/core/router.js`)
- [x] Remove admin `<script>` tags from `public/index.html` (12 scripts)
- [ ] Remove admin page files from `public/js/pages/admin/` (kept as reference for now)
- [x] CSP in `server/app.js` — no changes needed (same-origin miniapp)
- [x] Run `npm run check:claude` validation
- [x] Update `CLAUDE.md` with new architecture
