# TR-BUTE ↔ CineFiles Integration — Implementation Steps

This document describes what needs to be implemented on the **TR-BUTE side** to enable cross-site integration with CineFiles (cinema/entertainment news site). CineFiles already has its side implemented — this is the TR-BUTE TODO.

---

## Overview

CineFiles articles can reference TR-BUTE products (via `tribute_product_ids` on articles). TR-BUTE product pages can show related CineFiles articles. Users who have accounts on both sites are linked via shared OAuth provider IDs.

**Integration is API-key-authenticated** — both sites share a secret (`TRIBUTE_API_KEY` on CineFiles, `CINEFILES_API_KEY` on TR-BUTE) sent via `X-API-Key` header.

---

## Step 1: Environment Variables

### 1.1 — Add to `lib/config.js`

In the config object (near the bottom, alongside other service configs):

```javascript
// CineFiles integration
cinefilesApiUrl: getEnv('CINEFILES_API_URL', ''),
cinefilesApiKey: getEnv('CINEFILES_API_KEY', ''),
```

### 1.2 — Add to deployment environments

Add these env vars to Vercel project settings AND Yandex Cloud config:

```
CINEFILES_API_URL=https://your-cinefiles-domain.com/api
CINEFILES_API_KEY=<shared-secret-same-as-TRIBUTE_API_KEY-in-cinefiles>
```

### 1.3 — Update `docs/ENV_VARS.md`

Add a "CineFiles Integration" section with the two new variables.

---

## Step 2: New API Endpoints

Create these three endpoints. All use API key auth via `X-API-Key` header.

### 2.1 — `GET /api/products/by-ids`

**Purpose:** CineFiles calls this to render product cards inside articles (`tribute_products` content block).

**File:** `api/products/by-ids.js`

**Request:**
```
GET /api/products/by-ids?ids=1,2,3
X-API-Key: <shared-secret>
```

**Response:** Array of minimal product objects:
```json
[
  {
    "id": 42,
    "name": "Фигурка Астробой",
    "price": 2999,
    "imageUrl": "https://storage.yandexcloud.net/...",
    "url": "https://buy-tribute.com/products/astroboy-figurka"
  }
]
```

**Implementation notes:**
- Query `products` table by IDs: `SELECT id, name, price, slug FROM products WHERE id = ANY($1)`
- Build `imageUrl` from the product's primary image (first image in `product_images`)
- Build `url` from `APP_URL + '/products/' + slug`
- Return empty array for missing/inactive products (no errors)
- Validate API key first — return 401 if missing or wrong

**CineFiles expects this shape** (see `lib/tribute-api.ts` → `TributeProduct` interface):
```typescript
interface TributeProduct {
  id: number;
  name: string;
  price: number;
  imageUrl: string;
  url: string;
}
```

### 2.2 — `GET /api/users/by-provider`

**Purpose:** CineFiles calls this during login to check if a user also has a TR-BUTE account (for cross-site linking).

**File:** `api/users/by-provider.js`

**Request:**
```
GET /api/users/by-provider?provider=yandex&id=123456
X-API-Key: <shared-secret>
```

**Response:**
```json
{ "id": 78 }
```
Or `404` if no user found.

**Implementation notes:**
- Provider is one of: `yandex`, `vk`, `telegram`
- Map to column: `yandex` → `yandex_id`, `vk` → `vk_id`, `telegram` → `telegram_id`
- Query: `SELECT id FROM users WHERE {provider_column} = $1 LIMIT 1`
- Return `{ "id": user.id }` or 404

**CineFiles expects** `data.id` to be a number or null (see `lib/tribute-api.ts` → `checkTributeUser`).

### 2.3 — `GET /api/products/:id/related-articles`

**Purpose:** TR-BUTE product pages call this to show "Related Articles from CineFiles" section.

**File:** `api/products/related-articles.js`

**Request:**
```
GET /api/products/42/related-articles
```

This endpoint does NOT need API key auth — it's called by the TR-BUTE frontend (browser), not server-to-server. It proxies to CineFiles.

**Implementation:**
```javascript
module.exports = function relatedArticlesHandler(req, res) {
  const { id } = req.params;
  const config = require('../../lib/config');

  if (!config.cinefilesApiUrl || !config.cinefilesApiKey) {
    return res.json({ articles: [] });
  }

  fetch(`${config.cinefilesApiUrl}/articles/related?tribute_product_id=${id}&limit=5`, {
    headers: { 'X-API-Key': config.cinefilesApiKey }
  })
    .then(r => r.ok ? r.json() : { articles: [] })
    .then(data => res.json(data))
    .catch(() => res.json({ articles: [] }));
};
```

**CineFiles returns:**
```json
{
  "articles": [
    {
      "title": "Обзор фигурки Астробой",
      "lead": "Подробный обзор новой коллекционной фигурки...",
      "coverImageUrl": "https://storage.yandexcloud.net/cinefiles-media/...",
      "publishedAt": "2026-03-01T12:00:00.000Z",
      "url": "https://cinefiles.ru/reviews/obzor-figurki-astroboy",
      "category": "Обзоры"
    }
  ]
}
```

---

## Step 3: Register Routes

In `server/routes/index.js`, add these routes in the **PRODUCT-SPECIFIC ROUTES** section (BEFORE `app.use('/api/products', productRouter)` — the catch-all `/:idOrSlug` would intercept them otherwise):

```javascript
// ============ CINEFILES INTEGRATION ============
const productsByIdsHandler = require('../../api/products/by-ids');
const userByProviderHandler = require('../../api/users/by-provider');
const relatedArticlesHandler = require('../../api/products/related-articles');

app.get('/api/products/by-ids', productsByIdsHandler);
app.get('/api/users/by-provider', userByProviderHandler);
app.get('/api/products/:id/related-articles', relatedArticlesHandler);
```

**Critical:** The `/api/products/by-ids` route MUST be before the product router catch-all. The `/api/products/:id/related-articles` can technically go after (since the catch-all matches `/:idOrSlug` not `/:id/related-articles`), but keeping them together is cleaner.

---

## Step 4: API Key Middleware Helper

Create a reusable auth check for the API-key-protected endpoints:

**File:** `server/middleware/api-key-auth.js`

```javascript
module.exports = function requireApiKey(req, res, next) {
  const config = require('../../lib/config');
  const apiKey = req.headers['x-api-key'];

  if (!config.cinefilesApiKey) {
    // Integration not configured — reject
    return res.status(503).json({ error: 'Integration not configured' });
  }

  if (apiKey !== config.cinefilesApiKey) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  next();
};
```

Use it in route registration:
```javascript
const requireApiKey = require('../middleware/api-key-auth');

app.get('/api/products/by-ids', requireApiKey, productsByIdsHandler);
app.get('/api/users/by-provider', requireApiKey, userByProviderHandler);
// related-articles does NOT need API key — it's a browser-facing proxy
app.get('/api/products/:id/related-articles', relatedArticlesHandler);
```

---

## Step 5: Product Page — "Related Articles" Section

When CineFiles has articles referencing a TR-BUTE product, show them on the product detail page.

### 5.1 — Frontend Module

**File:** `public/js/pages/product/related-articles.js`

- Fetch `/api/products/${productId}/related-articles` after the page loads
- Only render if `articles.length > 0` (no empty state — the section is invisible if no articles)
- Render a horizontal scrollable list of article cards (similar to product recommendations)
- Each card shows: cover image, title, category badge, date
- Card links to the CineFiles article URL (external link, opens in new tab)

### 5.2 — CSS

**File:** `public/css/product.css` (add section)

- Use existing card patterns (`--card-bg`, `--card-border`, etc.)
- Horizontal scroll with `scroll-snap-type: x mandatory`
- Article cover images: aspect-ratio 16/9, `object-fit: cover`, 8px border-radius
- Category badge: pill shape, `--brand-muted` background, `--brand-primary` text

### 5.3 — Load Order

Add the script to `public/pages/product.html` after the main product script:
```html
<script src="/js/pages/product/related-articles.js" defer></script>
```

---

## Step 6: Validation

After implementation, run:
```bash
npm run check:claude
```

This verifies:
- Routes registered before catch-all (`check:routes`)
- Page scripts included in HTML (`check:page-scripts`)
- No missing content selectors (`check:selectors`)

---

## Step 7: Testing Checklist

- [ ] `GET /api/products/by-ids?ids=1,2,3` returns products with correct shape
- [ ] `GET /api/products/by-ids` with bad/no API key returns 401
- [ ] `GET /api/products/by-ids?ids=999999` returns empty array (not error)
- [ ] `GET /api/users/by-provider?provider=yandex&id=<real-id>` returns user ID
- [ ] `GET /api/users/by-provider?provider=yandex&id=nonexistent` returns 404
- [ ] `GET /api/products/1/related-articles` returns articles (or empty array if CineFiles is down)
- [ ] Product page shows "Related Articles" section when articles exist
- [ ] Product page shows nothing when no related articles
- [ ] External article links open CineFiles in new tab
- [ ] `npm run check:claude` passes

---

## Architecture Notes

- **Graceful degradation:** All integration endpoints return empty arrays on failure. CineFiles down = no articles shown, not a broken page.
- **No shared DB:** Sites communicate only via REST API. Each has its own Supabase project.
- **Caching:** CineFiles caches product data from TR-BUTE for 1 hour (`next: { revalidate: 3600 }`). TR-BUTE should cache CineFiles article responses client-side (or add a short server-side cache).
- **User linking:** CineFiles stores `tribute_user_id` on its users table. This is populated during login when CineFiles calls `/api/users/by-provider`. TR-BUTE doesn't need to store a reciprocal `cinefiles_user_id` unless a future feature requires it.
