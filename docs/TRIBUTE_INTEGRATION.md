# CineFiles — TR-BUTE Integration

## Overview

CineFiles integrates with [TR-BUTE](https://buy-tribute.com) (sister e-commerce project) to display product cards within articles and provide cross-site article linking.

## Components

### TributeProductsBlock (`components/tribute/TributeProductsBlock.tsx`)
- **Type**: React Server Component
- **Purpose**: Fetches and renders TR-BUTE product cards within article content
- **Data**: Fetched live from TR-BUTE API at render time
- **Injection**: Passed via `customBlocks` prop to `ArticleBody`

### ProductCard (`components/tribute/ProductCard.tsx`)
- **Purpose**: Individual product card display
- **Shows**: Product image, title, price, link to TR-BUTE

## Article Content Block

The `tribute_products` block type in articles stores an array of TR-BUTE product IDs. When rendering:

1. `ArticleBody` encounters a `tribute_products` block
2. Delegates rendering to `TributeProductsBlock` (server component)
3. Server component calls TR-BUTE API to fetch current product data
4. Products rendered as styled cards with links back to TR-BUTE

## Related Articles API

**Endpoint**: `GET /api/articles/related`

**Parameters**:
- `productId` — Find articles mentioning a TR-BUTE product
- `tagSlug` — Find articles with a specific tag

**Used by**: TR-BUTE site to show "Related CineFiles articles" for products (e.g., movie merchandise links back to movie review).

## API Client

`lib/tribute-api.ts` provides:
- `fetchTributeProducts(productIds)` — Fetch product details by IDs
- `checkTributeUser(userId)` — Check if a user exists on TR-BUTE (for cross-platform features)

**Authentication**: `X-API-Key` header with `TRIBUTE_API_KEY`

## Configuration

| Variable | Description |
|----------|-------------|
| `TRIBUTE_API_URL` | TR-BUTE API base URL |
| `TRIBUTE_API_KEY` | API key for authenticated requests |

## Article Model

Articles have a `tributeProductIds` field (String array) that stores linked TR-BUTE product IDs. This enables:
- Rendering product cards in article content
- Querying related articles by product ID
