# CineFiles / TR-BUTE Parity Report

Audit date: 2026-03-31. Comparison base: `NightHawk1341/TR-BUTE` main branch.

This document catalogs every gap between CineFiles and TR-BUTE across CSS theming, security, frontend architecture, routes/features, database/infrastructure, and authentication. Each item has a priority and implementation notes.

---

## Table of Contents

1. [CSS Variables & Theming](#1-css-variables--theming)
2. [Security](#2-security)
3. [SPA Router & Frontend Architecture](#3-spa-router--frontend-architecture)
4. [Routes & Features](#4-routes--features)
5. [Database & Infrastructure](#5-database--infrastructure)
6. [Authentication](#6-authentication)
7. [Cross-Site Integration](#7-cross-site-integration)
8. [Implementation Checklist](#8-implementation-checklist)

---

## 1. CSS Variables & Theming

**Overall parity: ~85% — CineFiles is a clean subset of TR-BUTE**

### What matches (55+ variables, 100% naming parity)

Both projects use identical names for all core theming variables:

- **Layout**: `--header-height`, `--footer-height`, `--bottom-nav-height`, `--content-max-width`, `--content-narrow-width`
- **Typography**: `--font-size-mobile`, `--font-size-desktop`, `--heading-mobile`, `--heading-desktop`, `--icon-scale`, `--page-title-size`, `--page-title-size-mobile`
- **Brand**: `--brand-primary`, `--brand-secondary`, `--brand-hover`, `--brand-muted`
- **Backgrounds**: `--bg-primary`, `--bg-primary-t`, `--bg-secondary`, `--bg-tertiary`, `--bg-quaternary`, `--bg-overlay`, `--removing-overlay-bg`, `--bg-body`, `--bg-body-t`
- **Text**: `--text-primary`, `--text-secondary`, `--text-tertiary`, `--text-inverse`
- **Borders**: `--border-color`, `--border-hover`, `--border-active`, `--divider`
- **Status**: `--status-pending`, `--status-info`, `--status-success`, `--status-warning`, `--status-error` (each with `-bg` variant)
- **Interactive**: `--link-color`, `--link-hover`, `--favorite-color`, `--telegram-color`, `--yandex-color`, `--active-page-color`
- **Shadows**: `--shadow-color`, `--shadow-sm`, `--shadow-md`, `--shadow-lg`, `--modal-popup-shadow`
- **Skeleton**: `--skeleton-bg-base`, `--skeleton-bg-highlight`
- **Cards**: `--card-bg`, `--card-bg-hover`, `--card-border`, `--card-border-hover`
- **Glass**: `--glass-bg`, `--glass-border`
- **Tabs**: `--tab-inactive-bg`, `--tab-inactive-border`, `--tab-active-bg`, `--tab-counter-bg`, `--tab-counter-border`, `--tab-counter-color`, `--tab-counter-active-bg`, `--tab-counter-active-color`
- **Filters**: `--filter-active-bg`, `--filter-active-border`, `--filter-active-color`, `--filter-group-bg`, `--filter-group-border`, `--filter-group-shadow`
- **Neutral buttons**: `--neutral-btn-hover-bg`, `--neutral-btn-hover-border`, `--neutral-btn-hover-color`, `--neutral-btn-active-bg`, `--neutral-btn-active-border`, `--neutral-btn-active-color`, `--neutral-btn-glow`
- **Aliases**: `--icon-color`, `--primary`, `--primary-hover`

Dark theme base values (backgrounds, text, borders, shadows, skeleton) are identical in both projects. Brand colors correctly differ: CineFiles uses blue (`#4a90d9`), TR-BUTE uses gold (`#fbe98a`).

### Variables only in TR-BUTE (34 total)

These are domain-specific to e-commerce. **Not all need porting** — only those that map to CineFiles UI patterns.

**E-commerce specific (skip):**
- `--product-card-border`, `--product-card-hover-bg`, `--product-card-hover-border`
- `--product-special-hover-bg`, `--product-special-hover-border`
- 10 order status color pairs (`--status-awaiting-calculation` through `--status-cancelled`)

**UI patterns worth adopting:**
- `--filter-btn-hover-bg`, `--filter-btn-hover-border`, `--filter-btn-hover-color`
- `--filter-btn-active-bg`, `--filter-btn-active-border`, `--filter-btn-active-color`, `--filter-btn-glow`
- `--type-btn-hover-bg`, `--type-btn-hover-border`, `--type-btn-hover-color`
- `--type-btn-active-bg`, `--type-btn-active-border`, `--type-btn-active-color`, `--type-btn-glow`
- `--reset-btn-hover-bg`, `--reset-btn-hover-border`
- `--format-dropdown-bg`
- `--dropdown-accent-color-1`, `--dropdown-accent-color-2`, `--dropdown-accent-hover`, `--dropdown-accent-active-bg`
- `--indicator-default`, `--indicator-active`
- `--filter-pill-bg`, `--filter-pill-border`

### Light theme coverage gap

| Project | Variables overridden in `html[data-theme="light"]` |
|---------|---------------------------------------------------|
| TR-BUTE | 67 |
| CineFiles | ~32 |

CineFiles covers essential base variables but is missing light theme overrides for interactive states (filter, tab, neutral-btn). These may render with dark-theme values when light theme is active.

### Action items

| ID | Task | Priority |
|----|------|----------|
| CSS-1 | Audit light theme: verify all `--filter-*`, `--tab-*`, `--neutral-btn-*` variables have light overrides in CineFiles `global.css` | Medium |
| CSS-2 | Add `--filter-btn-*`, `--type-btn-*`, `--reset-btn-*` families if CineFiles adds comparable filter UI | Low |
| CSS-3 | Add `--dropdown-accent-*` and `--indicator-*` if CineFiles adds dropdowns/carousels | Low |

---

## 2. Security

**Overall parity: Significant gap — TR-BUTE is substantially more hardened**

### 2.1 CSP (Content Security Policy)

| Aspect | CineFiles | TR-BUTE |
|--------|-----------|---------|
| Script policy | `'unsafe-inline'` + `'unsafe-eval'` | Per-request nonce via `crypto.randomBytes` |
| `objectSrc` | Not set (implicit allow) | `'none'` |
| `workerSrc` | Not set | Configured |
| `frameAncestors` | Not set | Configured |

**Impact**: `unsafe-inline` + `unsafe-eval` effectively defeat CSP's XSS protection.

**Implementation**: Generate nonce in middleware, inject into `index.html` inline scripts, replace `'unsafe-inline'`/`'unsafe-eval'` with `'nonce-${nonce}'`. Follow TR-BUTE pattern in `server.js` lines 33-223.

| ID | Task | Priority |
|----|------|----------|
| SEC-1 | Implement nonce-based CSP — remove `'unsafe-inline'` and `'unsafe-eval'` from `scriptSrc` | **Critical** |
| SEC-2 | Add `objectSrc: ["'none'"]` to CSP | **Critical** |

### 2.2 Prototype Pollution Protection

CineFiles `express.json()` has no custom reviver. TR-BUTE strips `__proto__`, `constructor`, `prototype` keys.

```javascript
// TR-BUTE pattern (server.js lines 257-262)
app.use(express.json({
  reviver: (key, value) => {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype')
      return undefined;
    return value;
  }
}));
```

| ID | Task | Priority |
|----|------|----------|
| SEC-3 | Add prototype pollution reviver to `express.json()` in `server/app.js` | **Critical** |

### 2.3 Bot & Scraper Protection

CineFiles has no bot detection. TR-BUTE has a 3-layer `bot-guard.js` middleware:
1. Known bot UA blocking (Scrapy, Python-requests, curl, GPTBot, CCBot, Playwright, etc.)
2. Allowlist for legitimate bots (Googlebot, Yandexbot, Bingbot, Telegrambot, CineFiles)
3. Headless browser detection (missing Accept-Language, HeadlessChrome, PhantomJS)

| ID | Task | Priority |
|----|------|----------|
| SEC-4 | Port `bot-guard.js` middleware from TR-BUTE, adapt allowlist for CineFiles context | **High** |

### 2.4 Rate Limiting

| Tier | CineFiles | TR-BUTE |
|------|-----------|---------|
| General API | 300 / 15min | 100 / 15min |
| Auth | 20 / 15min | 20 / 15min |
| Sensitive ops | None | 10 / hour |
| Scraper-targeted | 600 / 15min (cross-site) | 30 / min |

| ID | Task | Priority |
|----|------|----------|
| SEC-5 | Lower general rate limit from 300 to 100-150 per 15min | **High** |
| SEC-6 | Add `sensitiveLimiter` (10/hour) for account deletion endpoint | **High** |
| SEC-7 | Lower cross-site limiter from 600 to a reasonable threshold | **High** |

### 2.5 CORS

CineFiles uses a static origin array. TR-BUTE uses a function with blocked-origin logging.

| ID | Task | Priority |
|----|------|----------|
| SEC-8 | Switch CORS to function-based validation with `console.warn` for blocked origins | Medium |

### 2.6 Security Headers

| Header | CineFiles | TR-BUTE |
|--------|-----------|---------|
| HSTS | Helmet default | Explicit: 1 year + `includeSubDomains` + `preload` |
| Referrer-Policy | Helmet default | `strict-origin-when-cross-origin` |
| Permissions-Policy | Not set | Comprehensive (camera, geo, payment, mic, USB, MIDI blocked) |
| Cross-Origin policies | Defaults | COEP disabled, COOP same-origin-allow-popups, CORP cross-origin |

| ID | Task | Priority |
|----|------|----------|
| SEC-9 | Add explicit HSTS config (production only) | Medium |
| SEC-10 | Add Permissions-Policy header | Medium |
| SEC-11 | Add explicit Referrer-Policy | Medium |
| SEC-12 | Configure Cross-Origin policies for OAuth popup compatibility | Medium |

### 2.7 Additional Security Features

| Feature | CineFiles | TR-BUTE |
|---------|-----------|---------|
| Hotlink protection | None | Referrer-based middleware |
| Timing-safe comparison | No | `crypto.timingSafeEqual` for Telegram auth |
| Graceful shutdown | No | SIGINT/SIGTERM handlers close DB pool |
| Process error handlers | No | `uncaughtException` + `unhandledRejection` |
| Asset cache-busting | `no-cache` for JS/CSS | Git-hash versioning (`?v=abc123`) |

| ID | Task | Priority |
|----|------|----------|
| SEC-13 | Add timing-safe comparison for any secret comparisons | **High** |
| SEC-14 | Add graceful shutdown handler (close DB pool on SIGINT/SIGTERM) | Medium |
| SEC-15 | Add `uncaughtException` and `unhandledRejection` process handlers | Medium |
| SEC-16 | Add hotlink protection middleware | Low |
| SEC-17 | Implement git-hash asset cache-busting | Low |

---

## 3. SPA Router & Frontend Architecture

**Overall parity: Functional equivalence, but TR-BUTE has significant performance optimizations**

### Feature comparison

| Feature | CineFiles | TR-BUTE |
|---------|-----------|---------|
| Module system | IIFE (CommonJS-style) | ES6 modules |
| `registerPage()` pattern | Yes | Yes |
| Content container | `#page-content` | `#spa-content` |
| Link prefetching | None | Hover/touchstart with 10s TTL cache |
| Connection warmup | None | On tab visibility change (>60s idle) |
| Module preloading | None | 14 core modules via `<link rel="modulepreload">` |
| SVG symbol merging | Static in template | Dynamic merge from fetched pages |
| OG meta tag updates | None | Updates on SPA navigation |
| Navigation queue | `isNavigating` flag | Pending navigation queue (race-safe) |
| Skeleton loaders | Created in JS | Pre-rendered in HTML template |
| Progress bar | DOM-based inline | CSS animation class-based |
| Scroll restoration | Position map by path | Full route key (path + query params) |
| Mini-app support | None | Telegram, VK, MAX |
| Router size | ~294 lines | ~1164 lines |

### Action items

| ID | Task | Priority |
|----|------|----------|
| SPA-1 | Add link prefetching on hover/touchstart with TTL cache | Medium |
| SPA-2 | Add OG meta tag updates on SPA navigation (important for share previews) | Medium |
| SPA-3 | Upgrade navigation queue from flag to pending-queue pattern (prevents race conditions) | Medium |
| SPA-4 | Add connection warmup on tab visibility change for stale tabs | Low |
| SPA-5 | Add `<link rel="modulepreload">` for core scripts in `index.html` | Low |
| SPA-6 | Consider pre-rendering skeleton loaders in HTML template | Low |

---

## 4. Routes & Features

**CineFiles: 31 endpoints (content platform). TR-BUTE: 150+ endpoints (e-commerce).**

The endpoint count difference is expected — different domains. Focus is on features that would benefit CineFiles.

### TR-BUTE features worth considering for CineFiles

| Feature | TR-BUTE implementation | CineFiles relevance | Priority |
|---------|----------------------|---------------------|----------|
| Analytics dashboard | `api/analytics/` — product stats, dashboard, author stats | Article/author view analytics would be valuable | Medium |
| Email notifications | `nodemailer` — comment reply, order updates | Comment reply notifications | Medium |
| FAQ system | `api/faq/` — categories, items, page-specific items | Site help / editorial guidelines | Low |
| Stories content | `api/stories/` — ephemeral content with scheduling | Editorial highlights / breaking news | Low |
| PWA support | `manifest.json`, `service-worker.js` | Offline reading, push notifications | Low |

### CineFiles features TR-BUTE lacks (unique strengths)

- TMDB integration (proxy, search, sync, cleanup crons)
- RSS feed + XML sitemap generation
- Article collections with ordering
- Block-based content editor (11+ block types)
- Partner integrations/promos with ORD compliance reporting
- 3-tier editorial roles (reader/editor/admin)
- Russian-Latin transliteration for slugs

### Action items

| ID | Task | Priority |
|----|------|----------|
| FEAT-1 | Add basic article/author analytics (view counts over time, popular articles) | Medium |
| FEAT-2 | Add comment reply email notifications | Medium |
| FEAT-3 | Add FAQ page for site help | Low |
| FEAT-4 | Evaluate PWA support (manifest + service worker) | Low |

---

## 5. Database & Infrastructure

### Connection resilience

| Feature | CineFiles | TR-BUTE |
|---------|-----------|---------|
| Pool singleton | `getPool()` / `closePool()` | Same + `warmupPool()` + `queryWithRetry()` |
| Cold-start handling | None | Exponential backoff warmup (5 attempts) |
| Transient error retry | None | Retries on ECONNREFUSED, ETIMEDOUT, postgres 57P03 |

### Caching

| Layer | CineFiles | TR-BUTE |
|-------|-----------|---------|
| Application cache | TMDB responses in DB table | Redis (`ioredis`) with in-memory fallback |
| Session store | Stateless JWT only | Redis-backed sessions |

### Media pipeline

| Feature | CineFiles | TR-BUTE |
|---------|-----------|---------|
| Upload | Custom AWS4 signing (no SDK) | AWS SDK v3 |
| Processing | Store as-is | `sharp` resizing + variant generation |
| Batch operations | None | Batch delete (up to 1000 keys) |
| Pre-signed URLs | None | Client-side upload for large files (>4.5MB) |

### Action items

| ID | Task | Priority |
|----|------|----------|
| INFRA-1 | Add DB pool warmup with exponential backoff (port from TR-BUTE `lib/db.js`) | **High** |
| INFRA-2 | Add `queryWithRetry()` for transient connection errors | **High** |
| INFRA-3 | Evaluate migrating S3 upload from custom signing to AWS SDK v3 | Low |
| INFRA-4 | Add image variant generation with `sharp` (thumbnails for article cards) | Low |

---

## 6. Authentication

### Provider comparison

| Provider | CineFiles | TR-BUTE |
|----------|-----------|---------|
| Yandex OAuth | Full OIDC | Full OAuth |
| Telegram | OIDC + PKCE (more secure) | Bot initData + HMAC (simpler) |
| VK | Not implemented | OAuth + Mini App |
| MAX (Mail.ru) | Not implemented | Mini App auth |

### Token handling

| Aspect | CineFiles | TR-BUTE |
|--------|-----------|---------|
| Transport | httpOnly cookies | Headers (API) + Cookies (browser) |
| Roles | reader / editor / admin | User + Admin (separate table) |
| Timing-safe comparison | No | `crypto.timingSafeEqual` for Telegram |
| Auth date validation | No | 24-hour window check |
| Session store | Stateless JWT | Redis |

### Action items

| ID | Task | Priority |
|----|------|----------|
| AUTH-1 | Add `crypto.timingSafeEqual` for Telegram auth verification | **High** |
| AUTH-2 | Add auth_date validation (reject tokens older than 24 hours) | **High** |
| AUTH-3 | Evaluate adding VK OAuth (significant Russian user base) | Low |

---

## 7. Cross-Site Integration

### Current state

**CineFiles -> TR-BUTE** (implemented):
- `lib/tribute-api.js` fetches products by IDs, checks user existence, searches by tags
- Articles store `tribute_product_ids` for "see also" suggestions
- Caches: 1hr product matches, 30min catalog
- CSP allows `buy-tribute.com`

**TR-BUTE -> CineFiles** (implemented):
- `api/cinefiles/editorial.js` and `api/cinefiles/search.js` fetch articles
- `cinefiles-articles.js` module displays articles in product grids
- Bot guard allowlists `cinefiles` user-agent
- Config: `CINEFILES_API_URL` env var

**Integration is two-way and functional.** No immediate action items.

---

## 8. Implementation Checklist

Ordered by priority. Check off as completed.

### Critical

- [x] **SEC-1**: Nonce-based CSP — remove `'unsafe-inline'`/`'unsafe-eval'`
- [x] **SEC-2**: Add `objectSrc: ["'none'"]`
- [x] **SEC-3**: Prototype pollution reviver on `express.json()`

### High

- [x] **SEC-4**: Port bot-guard middleware from TR-BUTE
- [x] **SEC-5**: Lower general rate limit to 100-150/15min
- [x] **SEC-6**: Add sensitive operations rate limiter (10/hour)
- [x] **SEC-7**: Lower cross-site rate limit
- [x] **SEC-13**: Timing-safe comparison for secrets
- [x] **AUTH-1**: `crypto.timingSafeEqual` for Telegram auth
- [x] **AUTH-2**: Auth date validation (24hr window)
- [x] **INFRA-1**: DB pool warmup with exponential backoff
- [x] **INFRA-2**: `queryWithRetry()` for transient errors

### Medium

- [x] **SEC-8**: Function-based CORS with blocked-origin logging
- [x] **SEC-9**: Explicit HSTS configuration
- [x] **SEC-10**: Permissions-Policy header
- [x] **SEC-11**: Explicit Referrer-Policy
- [x] **SEC-12**: Cross-Origin policies for OAuth
- [x] **SEC-14**: Graceful shutdown handler (already existed in server.js)
- [x] **SEC-15**: Process-level error handlers (already existed in server.js)
- [x] **CSS-1**: Audit light theme interactive state coverage
- [x] **SPA-1**: Link prefetching on hover/touchstart
- [x] **SPA-2**: OG meta tag updates on SPA navigation
- [x] **SPA-3**: Pending navigation queue (race-safe)
- [ ] **FEAT-1**: Article/author analytics
- [ ] **FEAT-2**: Comment reply email notifications

### Low

- [x] **SEC-16**: Hotlink protection middleware
- [x] **SEC-17**: Git-hash asset cache-busting
- [x] **CSS-2**: Add filter button variable families
- [x] **CSS-3**: Add dropdown/indicator variable families
- [x] **SPA-4**: Connection warmup on tab visibility
- [x] **SPA-5**: Module preloading in `index.html`
- [ ] **SPA-6**: Pre-rendered skeleton loaders
- [ ] **FEAT-3**: FAQ page
- [ ] **FEAT-4**: PWA support evaluation
- [ ] **INFRA-3**: Migrate to AWS SDK v3 for S3
- [ ] **INFRA-4**: Image variant generation with sharp
- [ ] **AUTH-3**: VK OAuth support
