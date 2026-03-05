# CineFiles — Security

## Authentication & Authorization

### JWT Tokens
- Access tokens: 7-day expiry, stored in `access_token` cookie
- Refresh tokens: 30-day expiry, stored in `AuthToken` DB table
- Expired tokens cleaned daily via `/api/cron/token-cleanup`
- Rotate `JWT_SECRET` to invalidate all active sessions

### Role-Based Access Control
- `reader` — comment on articles
- `editor` — CRUD own articles, manage tags, upload media
- `admin` — full access (edit any article, moderate comments, manage users)

### Auth Guards (lib/api-utils.ts)
- `requireAuth()` — validates JWT, returns user
- `requireEditor()` — requireAuth + role check (editor or admin)
- `requireAdmin()` — requireAuth + role check (admin only)
- Editors can only edit/delete their own articles (admins bypass)
- Users can only edit/delete their own comments (admins bypass)

### Middleware
- `/admin/*` routes check for `access_token` cookie
- Missing token → redirect to Yandex OAuth
- Lightweight check only — full JWT verification happens in admin layout

## API Security

### Protected Endpoints
- Cron jobs: `Authorization: Bearer {CRON_SECRET}` header required
- TMDB proxy: `X-Proxy-Secret` header required
- TR-BUTE API: `X-API-Key` header for cross-site requests
- Media upload: editor+ role required

### Input Validation
- Required field checks on all create/update operations
- File type validation: JPEG, PNG, WebP, AVIF, GIF only
- File size limit: 5MB max for media uploads
- Pagination limits capped to prevent abuse
- Slug uniqueness enforced with timestamp fallback

## HTTP Security Headers

Configured in `next.config.js`:

| Header | Value | Purpose |
|--------|-------|---------|
| `X-Frame-Options` | `DENY` | Prevent clickjacking |
| `X-Content-Type-Options` | `nosniff` | Prevent MIME sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Control referrer info |
| `Content-Security-Policy` | See below | Restrict resource loading |

### CSP Policy
- `frame-src`: YouTube, VK, RuTube (for embeds)
- `connect-src`: TMDB API, Supabase, TR-BUTE API
- `script-src`: `self`, inline scripts (needed for theme FOUC prevention)
- `style-src`: `self`, inline styles

## Database Security

- **Supabase client** with parameterized queries prevents SQL injection
- Row Level Security (RLS) available for additional protection
- Cascading deletes configured for related records
- Soft-delete pattern for comments (preserves thread structure)
- Unique constraints on slugs, OAuth IDs, refresh tokens

## S3 Storage Security

- AWS4-HMAC-SHA256 signed uploads (custom implementation in `lib/storage.ts`)
- Files organized by date: `uploads/YYYY/MM/DD/{hash}.{ext}`
- Access keys stored as environment variables, never exposed to client

## Secrets Management

- All secrets in environment variables (never hardcoded)
- `.env` excluded from git via `.gitignore`
- Minimum 64-character random strings recommended for all secrets
- Separate secrets for JWT, sessions, cron, TMDB proxy, TR-BUTE API
