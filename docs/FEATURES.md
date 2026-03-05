# CineFiles — Features

## Content System

### Block-Based Articles
- 11+ content block types: paragraph, heading, image, quote, ordered/unordered list, embed (YouTube/VK/RuTube), divider, spoiler, infobox, tribute_products, movie_card
- JSON-stored content model — flexible layouts without WYSIWYG
- Cover images with Yandex S3 storage
- Article statuses: draft → review → published → archived
- SEO: meta tags + JSON-LD structured data per article

### Categories & Tags
- Category-based URL structure: `/{category}/{slug}`
- TMDB-linked tags (movie, TV, person, genre, franchise, studio, topic, game, anime)
- Tag detail pages show TMDB overview when linked
- Tags listing grouped by type with article counts

### Collections
- Curated article groupings with custom ordering
- Public listing and detail pages
- Visibility toggle (draft/published)

### Search
- Full-text search across article titles, leads, and subtitles
- Tag search included in results
- Paginated results with relevance sorting

### RSS Feed
- `/feed/rss.xml` — last 50 published articles
- Full metadata including enclosures for cover images

## Auth & Users

### OAuth Providers
- **Yandex** (primary) — main Russian audience
- **VK ID** — secondary
- **Telegram Login Widget** — tertiary

### Roles
- `reader` — default, can comment
- `editor` — can create/edit own articles, manage tags, upload media
- `admin` — full access: edit any article, moderate comments, manage users

### Sessions
- JWT access tokens (7-day expiry, `access_token` cookie)
- Refresh tokens (30-day expiry, stored in DB)
- Automatic token cleanup via cron

## Admin Panel

- Protected by middleware + layout-level JWT verification
- Article CRUD with status filters and block editor
- Tag management with TMDB autocomplete search
- Media library with S3 upload
- Comment moderation (hide/show/delete)
- Collection management
- User management
- Site settings

## Comments

- Threaded replies (one level of nesting)
- Soft-delete pattern (status: visible → hidden → deleted)
- Admin moderation with article comment count updates
- Only on published articles with `allowComments` flag

## TMDB Integration

- Proxy API on Vercel for geo-bypass (TMDB blocks some Russian IPs)
- Entity caching in database with TTL
- Auto-sync of stale entities via daily cron
- Search autocomplete for admin tag linking

## TR-BUTE Integration

- Product cards rendered as article blocks
- Related articles API for TR-BUTE cross-linking
- Server-side product data fetching

## SEO & Discovery

- Dynamic sitemap (articles, categories, tags, collections)
- robots.txt generation
- JSON-LD structured data
- Open Graph meta tags
- RSS feed

## i18n

- Russian-first UI (all strings in `locales/ru.json`)
- English fallback available (`locales/en.json`)
- Manual string imports (no i18n framework)
- Cyrillic slug transliteration via `lib/transliterate.ts`
