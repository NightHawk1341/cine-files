# CineFiles — TR-BUTE Integration

## Overview

CineFiles integrates with [TR-BUTE](https://buy-tribute.com) (sister e-commerce project) in two directions:
- **Outbound**: CineFiles fetches product data from TR-BUTE to render product cards in articles
- **Inbound**: TR-BUTE fetches articles from CineFiles to display on product pages and in editorial grid strips

## Outbound: CineFiles -> TR-BUTE

### API Client

`lib/tribute-api.js` provides:
- `fetchTributeProducts(ids)` — Fetch product details by IDs
- `checkTributeUser(provider, providerId)` — Check if a user exists on TR-BUTE

**Authentication**: None required — TR-BUTE product endpoints are public

### Article Content Block

The `tribute_products` block type in articles stores an array of TR-BUTE product IDs. When rendering:

1. `ArticleBody` encounters a `tribute_products` block
2. Calls TR-BUTE API to fetch current product data
3. Products rendered as styled cards with links back to TR-BUTE

## Inbound: TR-BUTE -> CineFiles

TR-BUTE calls these public CineFiles API endpoints (no authentication required):

### Endpoints Called by TR-BUTE

#### 1. Featured Articles (Editorial Grid Strips)
`GET /api/articles?featured=true&status=published&limit={n}`

Used on TR-BUTE main page, catalog, and favorites for editorial strip carousels between product cards.

#### 2. Related Articles by Product ID
`GET /api/articles/related?tribute_product_id={id}&limit={n}`

Shown on TR-BUTE product pages alongside the product.

#### 3. Related Articles by Tag
`GET /api/articles/related?tag_slug={slug}&limit={n}`

Used for catalog-context article matching.

#### 4. Search Articles (Admin)
`GET /api/search?q={query}&limit=10`

Used in TR-BUTE admin for article picker (manual overrides).

#### 5. Single Article by Slug
`GET /api/articles/{slug}`

Used for admin-configured article overrides by URL.

### Response Format

All endpoints return articles with at minimum:
```json
{
  "title": "string",
  "lead": "string",
  "coverImageUrl": "string",
  "publishedAt": "ISO 8601",
  "url": "full CineFiles article URL",
  "category": { "slug": "string", "nameRu": "string" }
}
```

The `url` field is constructed from `APP_URL` + category slug + article slug.

## Configuration

| Variable | Direction | Description |
|----------|-----------|-------------|
| `TRIBUTE_API_URL` | Outbound | TR-BUTE API base URL |

## Article Model

Articles have a `tribute_product_ids` integer array field that stores linked TR-BUTE product IDs. This enables:
- Rendering product cards in article content (outbound)
- Querying related articles by product ID (inbound)

## TR-BUTE Integration Details

TR-BUTE caches CineFiles responses for 1 hour (editorial/product) and 10 minutes (search). All requests have a 5-second timeout with graceful degradation (empty array on failure). When `CINEFILES_API_URL` is absent, TR-BUTE hides all CineFiles UI sections.
