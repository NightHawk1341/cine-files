# CineFiles — Environment Variables

## Storage Policy

All environment variables are managed directly in **Yandex Cloud** and **Vercel** dashboards. No `.env` files are stored in the repository. For local development, you may create a local `.env` file (gitignored), but production and staging environments pull secrets from the platform.

GitHub Actions secrets mirror these for the CI/CD deploy workflow.

## Required Variables

### Core
| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Runtime environment | `production` / `development` |
| `APP_URL` | Public site URL | `https://cinefiles-txt.com` |
| `DATABASE_URL` | PostgreSQL connection string (Supabase) | `postgresql://user:pass@host:5432/db` |
| `JWT_SECRET` | Secret for signing JWT access tokens | Random 64+ char string |
| `SESSION_SECRET` | Secret for session management | Random 64+ char string |
| `CRON_SECRET` | Bearer token for cron job authentication | Random 64+ char string |

### OAuth — Yandex (Primary)
| Variable | Description |
|----------|-------------|
| `YANDEX_CLIENT_ID` | Yandex OAuth application ID (shared with TR-BUTE) |
| `YANDEX_CLIENT_SECRET` | Yandex OAuth application secret (shared with TR-BUTE) |

### OAuth — VK
| Variable | Description |
|----------|-------------|
| `VK_CLIENT_ID` | VK ID application ID |
| `VK_CLIENT_SECRET` | VK ID application secret |

### OAuth — Telegram (OIDC)
| Variable | Description |
|----------|-------------|
| `BOT_TOKEN` | Telegram bot token (shared with TR-BUTE). Bot ID is derived as the part before `:` |
| `TELEGRAM_OIDC_SECRET` | Client Secret from BotFather > Bot Settings > Web Login |

### Yandex S3 (Image Storage)
| Variable | Description | Default |
|----------|-------------|---------|
| `YANDEX_S3_ENDPOINT` | S3 API endpoint | `https://storage.yandexcloud.net` |
| `YANDEX_S3_REGION` | S3 region | `ru-central1` |
| `YANDEX_S3_BUCKET` | S3 bucket name | `cinefiles-media` |
| `YANDEX_S3_ACCESS_KEY` | S3 access key ID | — |
| `YANDEX_S3_SECRET_KEY` | S3 secret access key | — |

### TMDB
| Variable | Description |
|----------|-------------|
| `TMDB_API_KEY` | TMDB v3 API key |
| `TMDB_PROXY_URL` | Vercel-deployed proxy URL for geo-bypass |
| `TMDB_PROXY_SECRET` | Shared secret for proxy authentication |

### TR-BUTE Integration
| Variable | Description |
|----------|-------------|
| `TRIBUTE_API_URL` | TR-BUTE API base URL |

## Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `REDIS_URL` | Redis connection (optional caching layer) | Not set |

## Security Notes

- **No `.env` files in repo** — all secrets managed via Yandex Cloud / Vercel dashboards
- All secrets should be generated with at least 64 random characters
- Rotate `JWT_SECRET` to invalidate all active sessions
- `CRON_SECRET` is sent as `Authorization: Bearer <token>` — keep it private
- `TMDB_PROXY_SECRET` is sent via `X-Proxy-Secret` header
- GitHub Actions secrets must be kept in sync with platform secrets

## GitHub Actions Secrets

The deploy workflow (`.github/workflows/deploy-yandex.yml`) requires these additional secrets:

| Secret | Description |
|--------|-------------|
| `YC_SA_JSON_KEY` | Yandex Cloud service account JSON key |
| `YC_REGISTRY_ID` | Yandex Container Registry ID |
| `YC_CONTAINER_ID` | Yandex Serverless Container ID |
| `YC_SERVICE_ACCOUNT_ID` | Yandex Cloud service account ID (for container runtime) |

Plus all application env vars listed above (passed as `--environment` flags to the container).

## Configuration File

Environment variables are parsed and validated in `lib/config.js`. Missing required variables throw at startup, preventing silent misconfiguration.
