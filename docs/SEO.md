# CineFiles — SEO & Discovery

## Sitemap

**File**: `app/sitemap.ts` → generates `/sitemap.xml`

Dynamic sitemap includes:
- All published articles with `/{category}/{slug}` URLs
- All categories
- All tags with articles (`/tag/{slug}`)
- All visible collections (`/collection/{slug}`)
- Static pages (about, legal, search, tags listing)

## robots.txt

**File**: `app/robots.ts` → generates `/robots.txt`

Standard configuration allowing search engine crawling with sitemap reference.

## RSS Feed

**Endpoint**: `/feed/rss.xml`

- Last 50 published articles
- Full metadata: title, description, author, category, publication date
- Cover image enclosures
- Proper `<link>` and `<guid>` per item

## Meta Tags

Each article page generates:
- `<title>` — article title or custom `metaTitle`
- `<meta name="description">` — article lead or custom `metaDescription`
- Open Graph tags (`og:title`, `og:description`, `og:image`, `og:type`)
- Twitter Card tags

## JSON-LD

Article pages include structured data:
```json
{
  "@type": "Article",
  "headline": "...",
  "description": "...",
  "image": "...",
  "author": { "@type": "Person", "name": "..." },
  "datePublished": "...",
  "dateModified": "..."
}
```

## URL Structure

- Articles: `/{category}/{slug}` — SEO-friendly, category context in URL
- Tags: `/tag/{slug}`
- Collections: `/collection/{slug}`
- Author pages: `/author/{id}`

## Slug Generation

Russian titles are transliterated to Latin via `lib/transliterate.ts`. Example:
- "Обзор фильма Дюна" → `obzor-filma-dyuna`
- Uniqueness enforced with timestamp fallback
