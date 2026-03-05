# CineFiles — TMDB Integration

## Overview

CineFiles integrates with [The Movie Database (TMDB)](https://www.themoviedb.org/) to enrich tags and content blocks with movie, TV show, and person metadata.

## Architecture

### Geo-Bypass Proxy

TMDB blocks some Russian IP ranges. CineFiles deploys a proxy on Vercel (US region) to bypass this:

```
Client → /api/tmdb/[...path] (Vercel, US) → api.themoviedb.org
```

- **Endpoint**: `GET /api/tmdb/[...path]`
- **Auth**: `X-Proxy-Secret` header required
- **Caching**: 1-hour `Cache-Control` on responses
- **Config**: `TMDB_PROXY_URL` and `TMDB_PROXY_SECRET` env vars

### Caching Strategy (Multi-Layer)

1. **TmdbCache table** — API response caching with 1–24 hour TTL depending on endpoint
2. **TmdbEntity table** — Long-term entity storage with structured metadata
3. **Cron cleanup** — Expired cache entries removed daily at 03:00 UTC

### Entity Model

`TmdbEntity` stores structured TMDB data:

| Field | Description |
|-------|-------------|
| `tmdbId` | TMDB numeric ID |
| `entityType` | `movie` / `tv` / `person` |
| `titleRu` | Russian title |
| `titleEn` | English title |
| `metadata` | Full JSON (poster, backdrop, rating, overview, etc.) |
| `credits` | JSON (cast, crew for movies/TV) |
| `lastSyncedAt` | Timestamp for staleness tracking |

## Tag Linking

Tags can link to TMDB entities via `tmdbEntityId` foreign key.

**Tag types that map to TMDB**:
- `movie` → TMDB Movie
- `tv` → TMDB TV Show
- `person` → TMDB Person
- `genre`, `franchise`, `studio` → Manual (no TMDB auto-link)
- `topic`, `game`, `anime` → CineFiles-specific types

When a tag is linked to a TMDB entity, the tag detail page displays an overview section with poster, rating, and description from TMDB.

## Admin Features

### TMDB Search Autocomplete
- **Endpoint**: `GET /api/tmdb/search?query=...&type=movie|tv|person`
- **Used by**: Admin tag management page
- **Flow**: Editor types → autocomplete searches TMDB → select result → entity synced and linked to tag

### Entity Sync
- `syncTmdbEntity(tmdbId, type)` in `lib/tmdb.ts`
- Fetches from TMDB API, stores/updates in `TmdbEntity` table
- Called on tag creation/update when TMDB ID provided

## Cron: Batch Sync

**Daily at 00:00 UTC** (`/api/cron/tmdb-sync`):
1. Finds entities with `lastSyncedAt` older than 7 days
2. Re-fetches from TMDB (max 50 per run to respect rate limits)
3. Updates stored metadata and credits
4. Keeps movie data fresh (ratings change, new seasons, etc.)

## Content Blocks

### movie_card Block
Renders a styled card in articles with TMDB data (poster, title, rating, overview). Data is fetched at article render time or cached from the entity table.

## Key Files
- `lib/tmdb.ts` — TMDB API client, caching, entity sync
- `app/api/tmdb/[...path]/route.ts` — Proxy endpoint
- `app/api/tmdb/search/route.ts` — Autocomplete endpoint
- `app/api/cron/tmdb-sync/route.ts` — Batch sync cron
- `app/api/cron/tmdb-cleanup/route.ts` — Cache cleanup cron
