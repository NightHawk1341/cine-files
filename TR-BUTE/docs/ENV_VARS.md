# Environment Variables Reference

All env vars are centralized in `lib/config.js`. This document lists every variable
the codebase reads, which deployment targets need it, and whether it's required.

Legend — **Deployment targets:**
- **V** = Vercel (Telegram mode)
- **Y** = Yandex Cloud (Yandex mode)
- **Both** = needed in both

---

## Core

| Variable | Required | Target | Description |
|----------|----------|--------|-------------|
| `NODE_ENV` | yes | Both | `production` or `development` |
| `APP_URL` | prod only | Both | Base URL (e.g. `https://buy-tribute.com`) |
| `PORT` | no | Both | Server port (default: `3000`) |
| `AUTH_MODE` | no | Both | `telegram` or `yandex` (auto-detected from `APP_URL` if omitted) |
| `SITE_LOCK_PASSWORD` | no | Both | Password for the temporary site lockscreen (default: `ccritique`) |

## Database

| Variable | Required | Target | Description |
|----------|----------|--------|-------------|
| `DATABASE_URL` | yes | Both | PostgreSQL connection string |

## Authentication

| Variable | Required | Target | Description |
|----------|----------|--------|-------------|
| `JWT_SECRET` | yes | Both | Signs JWT tokens. Fallback: `SESSION_SECRET` |
| `ADMIN_USERNAME` | yes | Both | Admin panel login |
| `ADMIN_PASSWORD` | yes | Both | Admin panel password |
| `EDITOR_USERNAME` | no | Both | Editor role login (limited admin) |
| `EDITOR_PASSWORD` | no | Both | Editor role password |
| `ADMIN_API_KEY` | no | Both | API key auth for admin endpoints |
| `CRON_SECRET` | no | Both | Bearer token for cron endpoints (`/api/cron/*`) |

## Telegram

| Variable | Required | Target | Description |
|----------|----------|--------|-------------|
| `BOT_TOKEN` | telegram mode | V | Telegram bot token (user-facing). Fallback for `USER_BOT_TOKEN` |
| `USER_BOT_TOKEN` | no | Both | Preferred name for the user bot token; falls back to `BOT_TOKEN` |
| `ADMIN_BOT_TOKEN` | no | Both | Separate bot token for admin notifications |
| `ADMIN_CHAT_ID` | no | Both | Telegram chat ID for admin alerts |
| `TELEGRAM_BOT_USERNAME` | no | V | Bot username (without `@`). Used for deep-link on payment result page and to render the Telegram Login Widget on the profile page when opened in a regular browser |

## Yandex OAuth

| Variable | Required | Target | Description |
|----------|----------|--------|-------------|
| `YANDEX_CLIENT_ID` | yandex mode | Y | Yandex OAuth app client ID |
| `YANDEX_CLIENT_SECRET` | yandex mode | Y | Yandex OAuth app client secret |

## VK

### VK ID OAuth (website login — Yandex Cloud only)
Users logging in via VK ID on the website get `notification_method = 'email'`. Email is
requested via OAuth scope; if the user hasn't set one in VK, collect it separately.

| Variable | Required | Target | Description |
|----------|----------|--------|-------------|
| `VK_CLIENT_ID` | no | Y | VK ID OAuth client ID |
| `VK_CLIENT_SECRET` | no | Y | VK ID OAuth client secret |

### VK Mini App (native auth — Vercel only)
Users are authenticated by `vk_user_id` from signed launch params (no OAuth redirect).
They get `notification_method = 'vk'` and receive Mini App push notifications.

| Variable | Required | Target | Description |
|----------|----------|--------|-------------|
| `VK_APP_ID` | no | V | Mini App ID from `vk.com/editapp` |
| `VK_APP_SECRET` | no | V | Protected key (signs launch params). Distinct from `VK_CLIENT_SECRET` |
| `VK_APP_SERVICE_TOKEN` | no | V | Service token for VK API calls (`users.get`, `notifications.send`) |

### VK Community Bot (multi-community, suffix `_2` for second)
| Variable | Required | Target | Description |
|----------|----------|--------|-------------|
| `VK_COMMUNITY_ID` | no | V | Numeric community ID |
| `VK_COMMUNITY_TOKEN` | no | V | Community API access token |
| `VK_CONFIRMATION_CODE` | no | V | Callback API confirmation string |
| `VK_COMMUNITY_ID_2` | no | V | Second community ID |
| `VK_COMMUNITY_TOKEN_2` | no | V | Second community token |
| `VK_CONFIRMATION_CODE_2` | no | V | Second community confirmation code |

## MAX

### MAX Mini App & Bot (Vercel only)
Users are authenticated via `window.WebApp.InitData` (HMAC-SHA256, same algorithm as Telegram).
They get `notification_method = 'max'` and receive messages via the MAX Bot.

The MAX Bridge SDK (`https://st.max.ru/js/max-web-app.js`) is loaded on all pages and
creates `window.WebApp`. `window.WebApp.InitData` is non-empty only when running inside MAX.

| Variable | Required | Target | Description |
|----------|----------|--------|-------------|
| `MAX_BOT_TOKEN` | no | V | MAX bot token from @BotFather on MAX. Used to verify initData and send notifications via MAX Bot API (`platform-api.max.ru`) |
| `MAX_APP_URL` | no | V | Override for the miniapp URL shown in bot buttons. Defaults to `APP_URL` |

### Webhook registration
Register `POST /api/webhooks/max-bot` as your MAX bot's webhook URL in the MAX developer console.

## Payment (T-Bank)

| Variable | Required | Target | Description |
|----------|----------|--------|-------------|
| `TBANK_TERMINAL_KEY` | yes | Both | T-Bank EACQ terminal key |
| `TBANK_PASSWORD` | yes | Both | T-Bank terminal password (signs requests) |
| `TBANK_USE_TEST_ENV` | no | Both | Set `true` to use T-Bank sandbox |

## Email (Yandex Cloud Postbox — primary)

Postbox is the primary email provider. When configured, emails are sent via
`postbox.cloud.yandex.net` SMTP using an API key. If Postbox fails or is not
configured, the system falls back to legacy Yandex SMTP.

| Variable | Required | Target | Description |
|----------|----------|--------|-------------|
| `POSTBOX_API_KEY_ID` | yandex mode | Y | Postbox API key ID (SMTP username) |
| `POSTBOX_API_KEY_SECRET` | yandex mode | Y | Postbox API key secret (SMTP password) |
| `POSTBOX_FROM_ADDRESS` | no | Y | Sender address verified in Postbox. Falls back to `YANDEX_EMAIL` |

## Email (Yandex SMTP — fallback)

| Variable | Required | Target | Description |
|----------|----------|--------|-------------|
| `YANDEX_EMAIL` | yandex mode | Y | SMTP sender address (`user@yandex.ru`) |
| `YANDEX_EMAIL_PASSWORD` | yandex mode | Y | SMTP app password |

## Image Storage

One of the three providers must be configured.

### Vercel Blob (Telegram/Vercel deploys)
| Variable | Required | Target | Description |
|----------|----------|--------|-------------|
| `BLOB_READ_WRITE_TOKEN` | telegram mode | V | Vercel Blob storage token |

### Yandex S3 (Yandex deploys)
| Variable | Required | Target | Description |
|----------|----------|--------|-------------|
| `YANDEX_S3_ENDPOINT` | no | Y | S3 endpoint (default: `https://storage.yandexcloud.net`) |
| `YANDEX_S3_REGION` | no | Y | Region (default: `ru-central1`) |
| `YANDEX_S3_BUCKET` | yandex mode | Y | Bucket name |
| `YANDEX_S3_ACCESS_KEY` | yandex mode | Y | AWS-compatible access key |
| `YANDEX_S3_SECRET_KEY` | yandex mode | Y | AWS-compatible secret key |

### Supabase Storage (fallback)
| Variable | Required | Target | Description |
|----------|----------|--------|-------------|
| `SUPABASE_URL` | yes | Both | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Both | Service role key for admin ops. Catalog endpoints fall back to `SUPABASE_KEY` |

## Shipping

### CDEK
| Variable | Required | Target | Description |
|----------|----------|--------|-------------|
| `CDEK_CLIENT_ID` | no | Both | CDEK API client ID |
| `CDEK_CLIENT_SECRET` | no | Both | CDEK API client secret |
| `CDEK_TEST_MODE` | no | Both | Set `true` for CDEK sandbox |

### APIShip (Pochta Russia)
| Variable | Required | Target | Description |
|----------|----------|--------|-------------|
| `APISHIP_TOKEN` | no | Both | Direct API token (preferred) |
| `APISHIP_LOGIN` | no | Both | Login email (used if token missing) |
| `APISHIP_PASSWORD` | no | Both | Login password |
| `APISHIP_TEST_MODE` | no | Both | Set `true` for APIShip sandbox |

### Sender Details
| Variable | Required | Target | Default |
|----------|----------|--------|---------|
| `SENDER_NAME` | no | Both | `ИП` |
| `SENDER_COMPANY` | no | Both | `ИП` |
| `SENDER_PHONE` | no | Both | `+79001234567` |
| `SENDER_EMAIL` | no | Both | _(none)_ |
| `SENDER_POSTAL_CODE` | no | Both | `344000` |
| `SENDER_CITY` | no | Both | `Ростов-на-Дону` |
| `SENDER_ADDRESS` | no | Both | `ул. Пушкинская, 1` |

## Maps & Address

| Variable | Required | Target | Description |
|----------|----------|--------|-------------|
| `YANDEX_MAPS_API_KEY` | no | Both | Yandex Maps JS API key (address widget) |
| `DADATA_API_KEY` | no | Both | DaData token for address suggestions |
| `DADATA_SECRET_KEY` | no | Both | DaData secret (cleansing API) |

## Session Storage

| Variable | Required | Target | Description |
|----------|----------|--------|-------------|
| `REDIS_URL` | no | Both | Redis URL for distributed sessions. Falls back to in-memory store |

## CI/CD Only (GitHub Actions)

These are used by deploy workflows only, never by application code.

| Secret | Description |
|--------|-------------|
| `YC_SA_JSON_KEY` | Yandex Cloud service account JSON key |
| `YC_REGISTRY_ID` | Yandex Container Registry ID |
| `YC_CONTAINER_ID` | Production container ID |
| `YC_CONTAINER_ID_STAGING` | Staging container ID |
| `YC_SERVICE_ACCOUNT_ID` | Service account for container deploys |
| `APP_URL_STAGING` | Staging base URL (used in staging workflow) |

---

## Deprecated / Unused Variables

These are set in some deployment targets but **not referenced in application code**.
Safe to remove.

| Variable | Where set | Why unused |
|----------|-----------|------------|
| `SUPABASE_ANON_KEY` | Vercel | Code uses `SUPABASE_SERVICE_ROLE_KEY` (with `SUPABASE_KEY` fallback). Anon key is never read. |
| `SUPABASE_JWT_SECRET` | Vercel | JWT uses `JWT_SECRET`, not Supabase JWT secret. |
| `CHANNEL_ID` | Vercel | Likely a leftover from old notification setup. `ADMIN_CHAT_ID` is the actual variable. |
| `ADMIN_TELEGRAM_ID` | Vercel | Not referenced anywhere. `ADMIN_CHAT_ID` is used instead. |
| `SUPABASE_KEY` | Vercel | Only used as fallback when `SUPABASE_SERVICE_ROLE_KEY` is missing. Can be removed if `SUPABASE_SERVICE_ROLE_KEY` is always set. |
