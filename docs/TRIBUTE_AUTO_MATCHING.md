# TR-BUTE Auto-Matching — Implementation Spec

## Goal

Replace manual `tribute_product_ids` on articles with automatic product matching. When a CineFiles article has TMDB tags (movie titles, actor names, etc.), automatically find and display matching TR-BUTE products (posters, figures, merch) on the article page.

## How It Works Today (Manual)

1. Editor manually sets `tribute_product_ids` integer array on an article
2. TR-BUTE calls `/api/articles/related?tribute_product_id=X` to find articles for a given product
3. CineFiles calls TR-BUTE's `/api/products/by-ids?ids=1,2,3` to render product cards in `tribute_products` content blocks
4. Both directions require someone to know and enter the correct IDs by hand

## How It Should Work (Automatic)

1. Article has TMDB-powered tags (e.g., tag "Дюна: Часть вторая" with `tag_type: 'movie'`)
2. When rendering the article page, CineFiles searches TR-BUTE for products matching those tag names
3. Matching products display automatically — no manual ID entry needed
4. The `tribute_products` content block stays as an optional manual override for editors

## TR-BUTE Product Data Model (Relevant Fields)

```
products table:
  id          integer     — primary key
  title       varchar     — product name (e.g., "Постер Дюна: Часть вторая")
  alt         text        — alternative title/description
  key_word    text        — comma-separated keywords
  ip_names    text        — comma-separated IP names (movie/show/game franchise titles)
  slug        varchar     — URL slug
  price       numeric     — base price
  status      varchar     — product status
```

The `ip_names` field is the primary match target — it stores franchise names like "Дюна", "Разделение", "Аркейн".

## TR-BUTE Endpoints Available

### 1. Product Search (existing, best for auto-matching)
```
GET {TRIBUTE_API_URL}/products/search?query=Дюна
```
- Searches `title`, `alt`, `key_word` via ILIKE + trigram fuzzy matching
- Returns up to 5 results: `{ id, title, price, image_url, media, category }`
- Already works, no changes needed on TR-BUTE side

### 2. Products By IDs (existing, for manual overrides)
```
GET {TRIBUTE_API_URL}/products/by-ids?ids=1,2,3
```
- Returns: `{ products: [{ id, name, price, imageUrl, url }] }`
- Max 20 IDs
- Already called by `lib/tribute-api.js`

### 3. IP Names List (existing, useful for pre-validation)
```
GET {TRIBUTE_API_URL}/products/ip-names
```
- Returns all unique IP names from all products
- Could be cached daily to know which tags have potential matches before searching

## CineFiles Tag Data Model

```
tags table:
  slug        varchar     — e.g., "dyuna-chast-vtoraya"
  name_ru     varchar     — e.g., "Дюна: Часть вторая"
  name_en     varchar     — e.g., "Dune: Part Two"
  tag_type    varchar     — "movie", "series", "person", "genre", etc.

tmdb_entities table:
  tmdb_id     integer     — TMDB ID
  entity_type varchar     — "movie", "tv", "person"
  title_ru    text
  title_en    text
  metadata    jsonb       — full TMDB data
```

Tags are linked to articles via `article_tags` (many-to-many with `is_primary` flag).

## Implementation Plan

### Phase 1: Server-Side — Auto-Match Function

Add to `lib/tribute-api.js`:

```javascript
/**
 * Search TR-BUTE products by article tag names.
 * Searches using the existing /products/search endpoint.
 * @param {string[]} tagNames — Russian tag names from article tags
 * @returns {Promise<Array>} — deduplicated products
 */
async function searchTributeProductsByTags(tagNames) { ... }
```

Logic:
- Filter to relevant tag types: `movie`, `series`, `person`, `genre` (skip meta tags)
- Call `/products/search?query={tagName}` for each tag (parallel, with limit)
- Deduplicate by product ID
- Cap at 10 products total
- Graceful degradation: return `[]` on any failure

### Phase 2: Server-Side — Caching

Add a cache layer (in-memory or simple DB cache) so we don't call TR-BUTE search on every article page view:
- Cache key: `tribute-match:{article_id}` or `tribute-match:{sorted-tag-slugs-hash}`
- TTL: 1 hour (matches TR-BUTE's own caching)
- Invalidate when article tags change

Options for cache storage:
- **Simple**: In-memory Map with TTL (loses on restart, fine for this)
- **Persistent**: Use the existing `tmdb_cache` table pattern — add a `tribute_product_cache` table or reuse `tmdb_cache` with a `tribute:` prefix key

### Phase 3: API Endpoint

Add or modify an endpoint that the frontend can call:

```
GET /api/articles/:id/products
```

Returns:
```json
{
  "products": [
    { "id": 42, "name": "Постер Дюна", "price": 2999, "imageUrl": "...", "url": "https://buy-tribute.com/poster-dune" }
  ],
  "source": "auto"  // or "manual" if tribute_product_ids is set
}
```

Logic:
1. If article has non-empty `tribute_product_ids`, use those (manual override wins) — call `/products/by-ids`
2. Otherwise, get article tags, call `searchTributeProductsByTags(tagNames)`
3. Return results with cache

### Phase 4: Frontend — Article Page Integration

In `public/js/pages/article.js` (or `public/js/components/article-body.js`):
- After article loads, call `/api/articles/:id/products`
- If products returned, render a "Merch" section (similar to existing `tribute_products` block renderer)
- Place it in the article sidebar or after article content
- Reuse existing product card styles from `tribute_products` block rendering

### Phase 5: Reverse Direction — Help TR-BUTE Match Too

TR-BUTE already calls `/api/articles/related?tag_slug=X`. For auto-matching from their side:
- TR-BUTE products have `ip_names` (e.g., "Дюна")
- TR-BUTE could search CineFiles by tag slug derived from `ip_names`
- This already works if CineFiles tags match — e.g., tag slug `dyuna-chast-vtoraya` matches articles about Дюна

No changes needed on CineFiles side for this direction — it already works via tag_slug queries.

## What NOT To Change

- Keep `tribute_product_ids` column — it becomes the manual override mechanism
- Keep `tribute_products` content block type — editors can still place product cards at specific positions in article body
- Keep `/api/articles/related` endpoint — TR-BUTE uses it and it works
- Keep `fetchTributeProducts(ids)` in `lib/tribute-api.js` — still needed for manual overrides and content blocks

## Files To Modify

| File | Change |
|------|--------|
| `lib/tribute-api.js` | Add `searchTributeProductsByTags()` function |
| `api/article-by-id.js` or new `api/article-products.js` | Add `/api/articles/:id/products` endpoint |
| `server/routes/index.js` | Register new endpoint (before `:id` catch-all) |
| `public/js/pages/article.js` | Call products endpoint, render section |
| `public/js/components/article-body.js` | Possibly reuse product card renderer |
| `public/css/article.css` (or equivalent) | Styles for auto-matched products section |

## Environment

- `TRIBUTE_API_URL` is already configured (defaults to `https://buy-tribute.com/api`)
- No new env vars needed
- No new API keys needed — both sites' endpoints are public

## Testing

Test data lives in `migrations/001_test_articles.sql` (run manually in Supabase SQL editor). It creates:

- 10 tags with `tag_type: 'movie'` or `'series'`:
  - `potok` (Поток / Flow)
  - `anora` (Анора / Anora)
  - `razdelenie` (Разделение / Severance) — series
  - `odni-iz-nas` (Одни из нас / The Last of Us) — series
  - `amerikanskiy-psikhopat` (Американский психопат / American Psycho)
  - `substantsiya` (Субстанция / The Substance)
  - `dyuna-chast-vtoraya` (Дюна: Часть вторая / Dune: Part Two)
  - `odin-doma` (Один дома / Home Alone)
  - `zavodoy-apelsin` (Заводной апельсин / A Clockwork Orange)
  - `arkeyn` (Аркейн / Arcane) — series

- 10 articles across 4 categories (news, reviews, articles, analysis), each linked to its corresponding tag with `is_primary = TRUE`

Searching TR-BUTE for the Russian tag names (e.g., "Дюна", "Аркейн", "Один дома") should return matching products.

**Prerequisites**: The migration assumes categories with IDs 13 (news), 14 (reviews), 15 (articles), 18 (analysis) exist, and at least one admin user is in the `users` table.

## Edge Cases

- Tag name doesn't match any TR-BUTE product → show nothing (no empty state needed)
- TR-BUTE is down → graceful degradation, show article without products
- Article has no tags → skip product search entirely
- Too many tags → limit to primary tags or first 5 to avoid excessive API calls
- Search returns duplicates across tags → deduplicate by product ID
