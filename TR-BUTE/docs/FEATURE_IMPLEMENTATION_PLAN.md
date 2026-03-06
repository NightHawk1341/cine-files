# Feature Implementation Plan

## Table of Contents
1. [Product Recommendations ("You May Also Like")](#1-product-recommendations)
2. [Wishlist Sharing](#2-wishlist-sharing)
3. [Saved Addresses](#3-saved-addresses)
4. [SEO Improvements](#4-seo-improvements)
5. [PWA Offline Support](#5-pwa-offline-support)
6. [Redis Caching Layer](#6-redis-caching-layer)

---

## 1. Product Recommendations

**Goal:** Add a "You may also like" section at the bottom of the product page, alongside "Coming soon" and "Recently viewed" — all rendered through a shared module.

### Current State
- Product page ends after `.product-masonry-section` (line 324 of `product.html`) — no recommendations section exists
- `viewed-products.js` tracks last 10 viewed products in localStorage (id, title, image, price, slug)
- Profile page already renders a "recently viewed" carousel using this data
- `product-grid.js` exports `createProductCard()` for reusable card rendering
- Products have `genre`, `author`, `key_word`, `catalog_ids`, `type` — all usable for similarity matching
- `product_link_items` table already connects variant-linked products

### Architecture

#### A. New shared module: `public/js/modules/product-recommendations.js`

A single module that renders horizontal scrollable card strips. Used on the product page initially, reusable on other pages later.

```
renderRecommendationSection(container, { title, products, emptyText? })
```

- Renders a titled section with a horizontal scroll of product cards
- Uses `createProductCard()` from `product-grid.js` internally
- CSS: horizontal scroll container with snap points, similar to existing carousels on profile page
- Returns the section element (or null if no products)

#### B. Product page integration (`public/js/pages/product/main.js`)

After loading the product, render up to 3 sections at the bottom of `.product-page-content`:

1. **"You may also like"** — server-driven recommendations
2. **"Coming soon"** — products with `status = 'coming_soon'` (if any exist)
3. **"Recently viewed"** — from localStorage via `viewed-products.js`, excluding current product

#### C. Recommendation API endpoint

**`GET /api/products/recommendations?productId=123&limit=8`**

Server-side logic (simple, no ML):
1. Get the current product's `genre`, `author`, `catalog_ids`
2. Query products that share any of: same genre, same author, overlapping catalog_ids
3. Exclude: current product, `status` in (`test`, `not_for_sale`), already-linked variants
4. Score by number of matching attributes, order by score desc then randomize ties
5. Return top N products (default 8) with standard card fields (id, title, slug, price, old_price, image_url, status)

#### D. Coming soon products

**`GET /api/products/coming-soon?limit=6`**

Query: `SELECT ... FROM products WHERE status = 'coming_soon' ORDER BY release_date ASC LIMIT $1`

Could be combined into the recommendations endpoint with a `type` param, or kept separate for clarity.

### Files to Create/Modify

| File | Action |
|------|--------|
| `public/js/modules/product-recommendations.js` | **Create** — shared recommendation strip module |
| `public/css/components/product-recommendations.css` | **Create** — horizontal scroll strip styles |
| `public/js/pages/product/main.js` | **Modify** — import module, render sections after page load |
| `public/pages/product.html` | **Modify** — add container div after masonry section |
| `api/products/recommendations.js` | **Create** — recommendation endpoint |
| `api/products/coming-soon.js` | **Create** — coming soon endpoint |
| `server/routes/index.js` | **Modify** — register new routes (before products catch-all) |

### Database Changes
None — uses existing product fields for similarity matching.

---

## 2. Wishlist Sharing

**Goal:** Add a share button to the favorites page that generates a shareable link to the user's wishlist. Only for logged-in users.

### Current State
- Catalog page has a working share button (catalog.js lines 263-302) — supports Telegram share, Web Share API, clipboard fallback
- Favorites stored in `user_favorites` table (user_id, product_id, tag)
- Favorites page (`favorites.js`) loads from localStorage + syncs with server for logged-in users
- No public API to view another user's favorites
- No share mechanism for favorites

### Architecture

#### A. Shareable wishlist concept

When a logged-in user clicks "Share", the system:
1. Snapshots the user's current favorites list (product IDs + tags)
2. Generates a unique share token (e.g., nanoid or UUID)
3. Stores the snapshot in DB with the token
4. Returns a shareable URL: `https://buy-tribute.com/favorites?shared=<token>`

**Why snapshot, not live link:** Sharing a live link to someone's favorites raises privacy concerns (real-time tracking of what someone likes). A snapshot is what the user chose to share at that moment.

#### B. Database: `shared_wishlists` table

```sql
CREATE TABLE public.shared_wishlists (
  id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id),
  share_token varchar(32) NOT NULL UNIQUE,
  product_ids jsonb NOT NULL,        -- [1, 5, 12, ...]
  tags jsonb DEFAULT '{}',           -- {"1": "wish", "5": "present"}
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '90 days')
);

CREATE INDEX idx_shared_wishlists_token ON shared_wishlists(share_token);
```

- Wishlists expire after 90 days (configurable)
- One user can have multiple shared wishlists (each share creates a new snapshot)

#### C. API Endpoints

**`POST /api/favorites/share`** (authenticated)
- Reads user's current favorites from DB
- Generates share token, inserts into `shared_wishlists`
- Returns `{ shareToken, shareUrl }`

**`GET /api/favorites/shared/:token`** (public, no auth)
- Looks up `shared_wishlists` by token
- Joins with `products` table to return full product data (title, price, image, slug, status)
- Returns `{ products: [...], tags: {...}, createdAt, expired: false }`
- If expired or not found: `{ expired: true }` or 404

#### D. Frontend Changes

**`public/js/pages/favorites.js`:**
- Add share button next to page header (same position as catalog's share button)
- Only visible when `isLoggedIn()` returns true
- On click: call `POST /api/favorites/share`, then trigger share flow (same 3-tier: Telegram → Web Share → clipboard)
- Show toast "Link copied" on success

**`public/pages/favorites.html`:**
- Add share button element in header area

**Shared wishlist viewing:**
- When favorites page loads with `?shared=<token>` query param:
  - Fetch `GET /api/favorites/shared/<token>`
  - Render in read-only mode (no tag editing, no remove buttons)
  - Show banner: "Wishlist shared by a user" with option to add items to own favorites
  - Hide the share button itself

### Files to Create/Modify

| File | Action |
|------|--------|
| `api/favorites/share.js` | **Create** — generate share token |
| `api/favorites/shared.js` | **Create** — public shared wishlist endpoint |
| `public/js/pages/favorites.js` | **Modify** — share button + shared view mode |
| `public/pages/favorites.html` | **Modify** — add share button element |
| `server/routes/index.js` | **Modify** — register new routes |
| `SQL_SCHEMA.sql` | **Modify** — add shared_wishlists table |

### Database Changes
- New table: `shared_wishlists` (see SQL above)
- ALTER TABLE SQL to provide to user for Supabase execution

---

## 3. Saved Addresses

**Goal:** Let users save, edit, and delete delivery addresses. Usable on checkout (address picker) and manageable on profile page.

### Current State
- Checkout stores last-used address in `localStorage.tributary_orderFormData`
- `order_addresses` table stores per-order addresses (tied to `order_id`, not reusable)
- Profile page shows last localStorage address in a read-only card (lines 702-733 of profile.js)
- DaData autocomplete works for address input on checkout
- No `user_addresses` or `saved_addresses` table exists
- No API for address CRUD

### Architecture

#### A. Database: `user_addresses` table

```sql
CREATE TABLE public.user_addresses (
  id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id),
  label varchar(50),                    -- "Home", "Work", custom label
  surname varchar(100) NOT NULL,
  name varchar(100) NOT NULL,
  phone varchar(30) NOT NULL,
  postal_index varchar(10),
  address text NOT NULL,
  entrance varchar(10),                 -- подъезд (courier)
  floor_number varchar(10),            -- этаж (courier)
  apartment varchar(20),               -- квартира (courier)
  comment text,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_user_addresses_user ON user_addresses(user_id);
```

- Max 5 addresses per user (enforced in API)
- `is_default` — one default address, auto-selected on checkout
- Label is optional — if not set, UI shows truncated address

#### B. API Endpoints

**`GET /api/user/addresses`** (authenticated)
- Returns all saved addresses for the user, ordered by is_default desc, updated_at desc

**`POST /api/user/addresses`** (authenticated)
- Creates a new address (validate required fields, enforce max 5 limit)
- If `is_default: true`, unset other defaults
- Returns created address with id

**`PUT /api/user/addresses/:id`** (authenticated)
- Updates an existing address (verify ownership by user_id)
- If `is_default: true`, unset other defaults

**`DELETE /api/user/addresses/:id`** (authenticated)
- Deletes an address (verify ownership)
- If deleted address was default and others exist, make the most recent one default

#### C. Checkout Integration

**`public/js/pages/checkout.js`:**

1. On page load (after auth check), fetch `GET /api/user/addresses`
2. If user has saved addresses, show an address selector above the address form:
   - Horizontal scrollable chips/cards showing label + truncated address
   - "New address" chip at the end
   - Clicking a saved address populates all form fields
   - Clicking "New address" clears the form
3. After successful order creation, prompt: "Save this address?" (if it's a new address not matching any saved ones)
   - Simple toast with "Save" button, auto-dismisses after 5s
   - On save, POST to addresses API

#### D. Profile Page Integration

**`public/js/pages/profile.js`:**

Replace the current single-address display (lines 702-733) with a full address management section:

1. List all saved addresses as cards
2. Each card shows: label (or "Address N"), full address, name, phone
3. Default address has a badge/indicator
4. Actions per card:
   - **Edit** — opens inline form (same fields as checkout) with DaData autocomplete
   - **Delete** — confirmation dialog, then DELETE API call
   - **Set as default** — PUT with `is_default: true`
5. "Add address" button (if under max limit) — opens blank form
6. If user has no saved addresses and has localStorage address data, show "Save your last delivery address?" prompt

**`public/pages/profile.html`:**
- The `#profile-addresses-section` container already exists — reuse and expand it

### Files to Create/Modify

| File | Action |
|------|--------|
| `api/user/addresses.js` | **Create** — CRUD endpoint for saved addresses |
| `public/js/pages/checkout.js` | **Modify** — address selector UI + save prompt |
| `public/js/pages/profile.js` | **Modify** — address management section |
| `public/pages/profile.html` | **Modify** — expand addresses section markup |
| `public/css/checkout.css` | **Modify** — address selector styles |
| `public/css/profile.css` | **Modify** — address card/form styles |
| `server/routes/index.js` | **Modify** — register address routes |
| `SQL_SCHEMA.sql` | **Modify** — add user_addresses table |

### Database Changes
- New table: `user_addresses` (see SQL above)
- ALTER TABLE SQL to provide to user for Supabase execution

---

## 4. SEO Improvements

**Goal:** Improve search engine visibility for product pages and the public site.

### Current State
- `robots.txt` exists — blocks admin, cart, checkout, profile; allows crawlers
- Dynamic `sitemap.xml` generated from DB (static pages + products with slugs)
- Server-side meta injection for product pages (`server/routes/static.js` lines 96-168) — title, description, OG tags, canonical URL
- Only "фирменные" products get full meta tags; others keep `noindex`
- No structured data (Schema.org / JSON-LD)
- No breadcrumb markup
- OG tags in most page HTML files are empty templates (filled by JS — invisible to crawlers)

### Improvements

#### A. Structured Data (JSON-LD) for Product Pages

**`server/routes/static.js`** — extend the existing product meta injection:

Inject a `<script type="application/ld+json">` block with:

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Product Title",
  "description": "Product description...",
  "image": "https://...image_url",
  "url": "https://buy-tribute.com/product/slug",
  "brand": {
    "@type": "Brand",
    "name": "TRIBUTE"
  },
  "offers": {
    "@type": "Offer",
    "price": "1500",
    "priceCurrency": "RUB",
    "availability": "https://schema.org/InStock",
    "url": "https://buy-tribute.com/product/slug"
  }
}
```

- Only for indexable products (same filter as current meta injection)
- Map `status` to Schema.org availability values
- Include `aggregateRating` if product has reviews

#### B. Breadcrumb Structured Data

For product pages, inject BreadcrumbList JSON-LD:
```json
{
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "position": 1, "name": "Home", "item": "https://buy-tribute.com/" },
    { "position": 2, "name": "Catalog", "item": "https://buy-tribute.com/catalog" },
    { "position": 3, "name": "Product Title" }
  ]
}
```

#### C. Organization Schema on Homepage

Inject on index.html via server-side:
```json
{
  "@type": "Organization",
  "name": "TRIBUTE",
  "url": "https://buy-tribute.com",
  "logo": "https://buy-tribute.com/logo.png"
}
```

#### D. Catalog Page Meta Tags

Currently catalog pages have `noindex`. For public catalogs (not user-specific), add server-side meta injection similar to product pages:
- Title: catalog name
- Description: generated from catalog content
- OG image: first product image in catalog
- Make catalog pages indexable in `robots.txt`

#### E. Sitemap Enhancements

- Add `<lastmod>` based on product `updated_at`
- Add catalog pages to sitemap
- Add `Cache-Control: public, max-age=3600` header to sitemap endpoint
- Consider splitting into sitemap index + per-type sitemaps if product count grows

#### F. Image SEO

- Ensure all product images served via image proxy have descriptive `alt` attributes derived from `products.alt` or `products.title`
- This is primarily a frontend concern — update `createProductCard()` in `product-grid.js` to always set meaningful `alt` text

### Files to Create/Modify

| File | Action |
|------|--------|
| `server/routes/static.js` | **Modify** — add JSON-LD injection for products, breadcrumbs, organization |
| `server/routes/products.js` | **Modify** — add review aggregate data to product query (for rating schema) |
| `public/js/modules/product-grid.js` | **Modify** — ensure alt text on all product images |
| `public/robots.txt` | **Modify** — allow catalog pages |
| `SQL_SCHEMA.sql` | No changes |

### Database Changes
None.

---

## 5. PWA Offline Support

**Goal:** Add basic PWA capabilities — installability, offline fallback, asset caching.

> **Note:** This is exploratory. The site runs primarily as a Telegram Mini App where PWA install prompts don't apply. PWA benefits are mainly for direct web visitors.

### Current State
- No `manifest.json`, no service worker, no offline support
- Responsive design, mobile-optimized layout already in place
- Compression enabled, static assets cached for 1 day

### Implementation

#### A. Web App Manifest

**`public/manifest.json`:**
```json
{
  "name": "TRIBUTE — Art Posters",
  "short_name": "TRIBUTE",
  "description": "Art posters with AR visualization",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#121212",
  "theme_color": "#121212",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

Add `<link rel="manifest" href="/manifest.json">` to `index.html` and all page HTML files.

#### B. Service Worker (`public/service-worker.js`)

Minimal strategy:
1. **Precache** app shell: HTML pages, core CSS (`global.css`, `page-layouts.css`), core JS (`router.js`, `utils.js`, `auth.js`)
2. **Cache-first** for static assets: fonts, icons, local images
3. **Network-first** for API calls (no offline API caching — data is user-specific and must be fresh)
4. **Offline fallback** page: show a simple "You're offline" message when network is unavailable and no cache hit

Registration: add `navigator.serviceWorker.register('/service-worker.js')` in a shared init script, gated on `'serviceWorker' in navigator` and NOT inside Telegram Web App context.

#### C. Icons

Need to generate PWA icon set (192x192, 512x512) from existing brand assets. Place in `public/icons/`.

### Files to Create/Modify

| File | Action |
|------|--------|
| `public/manifest.json` | **Create** |
| `public/service-worker.js` | **Create** |
| `public/icons/icon-192.png` | **Create** (from brand assets) |
| `public/icons/icon-512.png` | **Create** (from brand assets) |
| `public/index.html` | **Modify** — add manifest link, SW registration |
| `public/pages/*.html` (all 14) | **Modify** — add manifest link |
| `server.js` | **Modify** — serve manifest with correct MIME type (should work with existing static middleware) |

### Database Changes
None.

---

## 6. Redis Caching Layer

**Goal:** Use the existing Redis connection (currently only for bot sessions) to cache frequently-read, rarely-changing API responses.

### Current State
- Redis connected via `lib/session-store.js` using ioredis
- Used only for Telegram bot session storage (user:XXX, admin:XXX keys)
- Configured via `REDIS_URL` env var
- Graceful fallback to in-memory if Redis unavailable
- No API response caching

### Architecture

#### A. Cache utility module: `lib/cache.js`

```javascript
const { getRedisClient } = require('./session-store'); // reuse existing connection

async function cacheGet(key) { ... }
async function cacheSet(key, data, ttlSeconds) { ... }
async function cacheDelete(pattern) { ... }   // for invalidation
async function withCache(key, ttlSeconds, fetchFn) { ... }  // cache-aside wrapper
```

- All keys prefixed with `cache:` to separate from session keys
- JSON serialize/deserialize automatically
- Graceful fallback: if Redis unavailable, just call fetchFn directly (no caching, no errors)
- `withCache` pattern: check cache → if miss, call fetchFn → store result → return

#### B. Endpoints to Cache

| Endpoint | TTL | Cache Key | Invalidation |
|----------|-----|-----------|-------------|
| `GET /api/products` (all products) | 5 min | `cache:products:all` | On product create/update/delete |
| `GET /api/products/authors` | 1 hour | `cache:products:authors` | On product update |
| `GET /api/products/keywords` | 1 hour | `cache:products:keywords` | On product update |
| `GET /api/products/ip-names` | 1 hour | `cache:products:ip-names` | On product update |
| `GET /api/catalogs` | 10 min | `cache:catalogs:list` | On catalog update |
| `GET /api/catalog/:id` | 10 min | `cache:catalog:{id}` | On catalog or product update |
| `GET /api/products/recommendations` | 15 min | `cache:recs:{productId}` | On product update |
| `GET /api/products/coming-soon` | 10 min | `cache:products:coming-soon` | On product status change |
| `GET /api/faq` | 30 min | `cache:faq` | On FAQ update |
| `GET /api/app-settings` (public) | 5 min | `cache:app-settings` | On settings update |
| `sitemap.xml` | 1 hour | `cache:sitemap` | On product create/update |

#### C. Cache Invalidation

Two approaches, used together:
1. **TTL-based expiry** — all cache keys have a TTL, so stale data auto-expires
2. **Explicit invalidation** — when admin updates a product/catalog/FAQ via admin API endpoints, delete relevant cache keys

Add a helper middleware or post-hook to admin mutation endpoints:
```javascript
// In admin product update handler:
await cacheDelete('cache:products:*');
await cacheDelete('cache:catalogs:*');
await cacheDelete('cache:recs:*');
```

#### D. Session Store Changes

Need to export the Redis client from `session-store.js` (or create a shared Redis connection module) so `cache.js` can reuse the same connection.

### Files to Create/Modify

| File | Action |
|------|--------|
| `lib/cache.js` | **Create** — cache utility with `withCache`, `cacheDelete` |
| `lib/session-store.js` | **Modify** — export Redis client for reuse |
| `server/routes/products.js` | **Modify** — wrap cacheable queries with `withCache` |
| `server/routes/static.js` | **Modify** — cache sitemap response |
| `api/admin/products/*.js` | **Modify** — add cache invalidation on mutations |
| `api/admin/catalogs/*.js` | **Modify** — add cache invalidation on mutations |
| `api/admin/faq/*.js` | **Modify** — add cache invalidation on mutations |

### Database Changes
None.

---

## Implementation Priority & Dependencies

| # | Feature | Complexity | Dependencies | Suggested Order |
|---|---------|-----------|--------------|-----------------|
| 1 | Product Recommendations | Medium | None | 1st — standalone, high user impact |
| 2 | SEO Improvements | Low-Medium | None | 2nd — mostly server-side, no DB changes |
| 3 | Redis Caching | Medium | None (existing Redis) | 3rd — improves perf for all features |
| 4 | Saved Addresses | Medium-High | New DB table | 4th — needs DB migration |
| 5 | Wishlist Sharing | Medium | New DB table | 5th — needs DB migration |
| 6 | PWA Offline | Low-Medium | Icons needed | 6th — least impactful for Telegram users |

Features 1-3 have no DB schema changes and can ship independently. Features 4-5 each need a new table (SQL provided for Supabase). Feature 6 is the most exploratory.
