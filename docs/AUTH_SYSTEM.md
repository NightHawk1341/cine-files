# CineFiles — Authentication System

## OAuth Providers

### Yandex (Primary)
- Main auth method for Russian audience
- Entry: `GET /api/auth/yandex` → redirects to Yandex OAuth
- Callback processes authorization code → creates/updates user → issues JWT

### VK ID
- Secondary OAuth provider
- Popular among Russian social media users

### Telegram Login Widget
- Tertiary auth method
- Validates via `TELEGRAM_BOT_TOKEN` HMAC signature

## Token Architecture

### Access Token
- **Type**: JWT (signed with `JWT_SECRET`)
- **Expiry**: 7 days
- **Storage**: `access_token` HttpOnly cookie
- **Contains**: user ID, role, email

### Refresh Token
- **Expiry**: 30 days
- **Storage**: `AuthToken` database table
- **Cleanup**: Daily cron at 05:00 UTC removes expired tokens

## User Roles

| Role | Permissions |
|------|------------|
| `reader` | View published articles, post comments, edit/delete own comments |
| `editor` | + Create/edit own articles, manage tags, upload media |
| `admin` | + Edit any article, moderate comments, manage users, access all admin features |

## Auth Guards

Defined in `lib/api-utils.ts`:

```typescript
requireAuth()    // Validates JWT, returns user object
requireEditor()  // requireAuth + role ∈ {editor, admin}
requireAdmin()   // requireAuth + role = admin
```

### Ownership Checks
- **Articles**: Editors can only edit/delete their own. Admins can edit any.
- **Comments**: Users can only edit/delete their own. Admins can moderate any.

## Middleware

`middleware.ts` protects `/admin/*` routes:
1. Checks for `access_token` cookie existence
2. Missing → redirect to Yandex OAuth
3. Present → allows through (full JWT verification happens in admin layout server component)

This two-step approach keeps middleware lightweight (no DB queries) while ensuring security at the layout level.

## Session Flow

```
1. User clicks "Login with Yandex"
2. Redirect to Yandex OAuth consent screen
3. Yandex redirects back with authorization code
4. /api/auth/yandex exchanges code for Yandex access token
5. Fetches user profile from Yandex
6. Creates or updates User record in database
7. Signs JWT access token + creates refresh token in DB
8. Sets access_token cookie, redirects to site
```

## Key Files
- `lib/auth.ts` — JWT sign/verify, session helpers
- `lib/api-utils.ts` — requireAuth, requireEditor, requireAdmin guards
- `middleware.ts` — Admin route protection
- `app/api/auth/yandex/route.ts` — OAuth entry point
- `app/admin/layout.tsx` — Server-side JWT verification for admin pages
