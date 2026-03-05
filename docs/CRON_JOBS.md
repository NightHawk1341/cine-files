# CineFiles — Cron Jobs

All cron jobs are configured in `vercel.json` and run as Vercel Cron Functions. Each requires `Authorization: Bearer {CRON_SECRET}` header.

## Jobs

### 1. TMDB Entity Sync
- **Endpoint**: `GET /api/cron/tmdb-sync`
- **Schedule**: Daily at 00:00 UTC
- **What it does**: Re-syncs TMDB entities (movies, TV shows, people) that haven't been updated in 7+ days
- **Batch size**: Max 50 entities per run
- **Why**: Keeps movie/TV metadata (titles, ratings, images, credits) fresh without hitting TMDB rate limits
- **File**: `app/api/cron/tmdb-sync/route.ts`

### 2. TMDB Cache Cleanup
- **Endpoint**: `GET /api/cron/tmdb-cleanup`
- **Schedule**: Daily at 03:00 UTC
- **What it does**: Deletes expired entries from the `TmdbCache` table
- **Why**: Prevents unbounded cache growth. Cache entries have a 1–24 hour TTL depending on endpoint
- **File**: `app/api/cron/tmdb-cleanup/route.ts`

### 3. Auth Token Cleanup
- **Endpoint**: `GET /api/cron/token-cleanup`
- **Schedule**: Daily at 05:00 UTC
- **What it does**: Deletes expired refresh tokens from the `AuthToken` table
- **Why**: Prevents stale token accumulation. Refresh tokens expire after 30 days
- **File**: `app/api/cron/token-cleanup/route.ts`

## Running Locally

Cron endpoints are standard GET routes. To test locally:

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/cron/tmdb-sync
curl -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/cron/tmdb-cleanup
curl -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/cron/token-cleanup
```

## Vercel Configuration

From `vercel.json`:
```json
{
  "crons": [
    { "path": "/api/cron/tmdb-sync", "schedule": "0 0 * * *" },
    { "path": "/api/cron/tmdb-cleanup", "schedule": "0 3 * * *" },
    { "path": "/api/cron/token-cleanup", "schedule": "0 5 * * *" }
  ]
}
```

## Adding New Cron Jobs

1. Create route at `app/api/cron/{job-name}/route.ts`
2. Validate `Authorization: Bearer {CRON_SECRET}` at the top
3. Add schedule to `vercel.json` `crons` array
4. Document in this file
