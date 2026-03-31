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

### Directory Structure
```
public/
  admin-miniapp/
    index.html              # Standalone admin HTML (own layout, nav, scripts)
    style.css               # Admin-specific styles (merged from admin.css)
    js/
      main.js               # ES module entry point (DOMContentLoaded bootstrap)
      auth.js               # Browser login verification, logout
      config.js             # API_BASE, platform detection
      state.js              # Global state management
      utils.js              # Shared utilities (apiFetch, escapeHtml, formatDate, toast)
      theme.js              # Theme toggle (syncs with main site localStorage key)
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

### Server-Side Changes
```
api/
  admin-browser-login.js     # POST /api/admin/browser-login (username/password)
  admin-browser-verify.js    # GET /api/admin/browser-verify (cookie check)

server/
  app.js                     # Serve admin-miniapp/index.html, admin-login.html
  routes/index.js            # Register new admin auth endpoints
```

### New Environment Variables
- `ADMIN_USERNAME` — Admin login username
- `ADMIN_PASSWORD_HASH` — bcrypt hash of admin password

## Authentication Flow

### Browser Login
1. User navigates to `/admin/login`
2. Server serves `admin-login.html` (standalone page, no SPA)
3. User enters username + password
4. POST `/api/admin/browser-login` validates credentials
5. On success: sets `admin_token` cookie (httpOnly, secure, sameSite)
6. Redirects to `/admin-miniapp/`

### Admin Session Verification
1. `main.js` calls `verifyAdminAccess()` on load
2. `auth.js` fetches `GET /api/admin/browser-verify` with credentials
3. Server checks `admin_token` cookie, verifies JWT, confirms admin role
4. On failure: redirects to `/admin/login`

### Reuse of Existing Auth
- The existing `access_token` cookie (from Yandex/Telegram OAuth) already contains `{ userId, role }`
- `browser-verify` checks this same cookie — no new auth system needed for OAuth users
- `browser-login` adds a direct username/password path for admin-only access (new)

## View-Based Navigation (not URL-based)

Unlike the main SPA which uses URL-based routing (`Router.registerPage`), the admin miniapp uses view-based navigation matching TR-BUTE:

```javascript
// Navigation via data-view attributes on buttons
switchView('articles');  // Renders articles view into #content

// State persisted to localStorage
localStorage.setItem('admin-current-view', viewName);
```

Navigation buttons in header (desktop) and bottom nav (mobile) trigger `switchView()`.

## SPA Router Blocking

The main SPA router (`public/js/core/router.js`) blocks all `/admin*` paths:

```javascript
// In navigate():
if (path.startsWith('/admin')) {
  window.location.href = path;
  return;
}
```

This forces a full page reload, letting the server serve the appropriate HTML.

## Server Routing

```javascript
// admin-login.html
app.get('/admin/login', serveAdminLogin);

// admin-miniapp (standalone HTML with own nonce)
app.get('/admin-miniapp', redirectToTrailingSlash);
app.get('/admin-miniapp/*', serveAdminMiniapp);

// SPA fallback (excludes /admin-miniapp and /admin/login)
app.get('*', serveSpaFallback);
```

## Migration Checklist

- [x] Create `docs/ADMIN_MINIAPP_MIGRATION.md` (this file)
- [ ] Create `public/admin-miniapp/` directory structure
- [ ] Create `public/admin-miniapp/index.html` with own layout
- [ ] Create `public/admin-miniapp/style.css` (from `admin.css`)
- [ ] Create `public/admin-miniapp/js/` module files
- [ ] Create all view modules in `public/admin-miniapp/js/views/`
- [ ] Create `public/admin-login.html` standalone login page
- [ ] Create `api/admin-browser-login.js` endpoint
- [ ] Create `api/admin-browser-verify.js` endpoint
- [ ] Update `server/routes/index.js` with new admin auth routes
- [ ] Update `server/app.js` to serve admin miniapp and login HTML
- [ ] Block `/admin*` routes in SPA router
- [ ] Remove admin `<script>` tags from `public/index.html`
- [ ] Remove admin page files from `public/js/pages/admin/` (keep as reference)
- [ ] Update CSP in `server/app.js` if needed
- [ ] Run `npm run check:claude` validation
- [ ] Update `CLAUDE.md` with new architecture
