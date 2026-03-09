# CineFiles — Deployment

## Environments

### Primary: Yandex Cloud (Docker)
- Multi-stage Docker build (Alpine Node 20)
- Next.js standalone output mode
- Runs as non-root `nextjs` user (uid 1001)
- Port 3000

### Fallback: Vercel
- Automatic deployments from git
- Region: `iad1` (US) — needed for TMDB proxy geo-bypass
- Cron jobs configured in `vercel.json`

## Docker Build

**Dockerfile location**: `docker/Dockerfile`

```bash
# Build
docker build -f docker/Dockerfile -t cinefiles .

# Run
docker run -p 3000:3000 cinefiles  # env vars injected by platform
```

### Build Stages
1. **base** — Node 20 Alpine
2. **deps** — Install npm dependencies
3. **builder** — `npm run build` (with `DOCKER_BUILD=true`)
4. **runner** — Minimal production image with standalone Next.js output

### Key Detail: `DOCKER_BUILD=true`
Set this env var during build to enable `output: 'standalone'` in `next.config.js`. Without it, the build produces a standard Next.js output (for Vercel).

## Vercel Configuration

**File**: `vercel.json`

```json
{
  "framework": "nextjs",
  "regions": ["iad1"],
  "crons": [
    { "path": "/api/cron/tmdb-sync", "schedule": "0 0 * * *" },
    { "path": "/api/cron/tmdb-cleanup", "schedule": "0 3 * * *" },
    { "path": "/api/cron/token-cleanup", "schedule": "0 5 * * *" }
  ]
}
```

## Database

- **Provider**: PostgreSQL on Supabase
- **Client**: Prisma ORM (`@prisma/client`) — schema changes applied manually via Supabase Dashboard SQL editor
- **Schema**: `SQL_SCHEMA.sql` — reference file, apply via Supabase Dashboard
- **Env vars**: `DATABASE_URL` managed in platform dashboards (Vercel + GitHub secrets)

## Image Storage

- **Provider**: Yandex S3
- **Public URL**: `https://storage.yandexcloud.net/{bucket}/uploads/...`
- **Configured in**: `next.config.js` remote image patterns

## Security Headers

Configured in `next.config.js` for all responses:
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Content-Security-Policy` (frame-src, connect-src, script-src, style-src)

## Domain

- **Production**: `cinefiles.ru`
- **Vercel fallback**: `cinefiles.vercel.app`
