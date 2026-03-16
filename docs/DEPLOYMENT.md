# CineFiles — Deployment

## Environments

### Primary: Yandex Cloud (Serverless Containers)
- Docker image built and pushed to Yandex Container Registry
- Deployed as a Yandex Cloud Serverless Container via `yc` CLI
- 1 core, 512MB memory, concurrency 16, 60s execution timeout
- SSL/TLS and domain managed by Yandex Cloud (API Gateway or container domain binding)
- Port 8080 (Yandex Cloud standard)

### Fallback: Vercel
- Automatic deployments from git
- Region: `iad1` (US) — needed for TMDB proxy geo-bypass
- Cron jobs configured in `vercel.json`

## Docker Build

**Dockerfile location**: `docker/Dockerfile`

```bash
# Build
docker build -f docker/Dockerfile -t cinefiles-app .

# Run locally
docker run -p 8080:8080 --env-file .env cinefiles-app
```

### Build Stages
1. **builder** — Node 20 Alpine, `npm ci --omit=dev`
2. **runner** — Minimal production image, non-root `nodejs` user (uid 1001), dumb-init for signal handling

## Yandex Cloud Setup

### Prerequisites
You need a Yandex Cloud account with the following resources. Create them in this order:

#### 1. Cloud + Folder
- Create a cloud (or use existing) and a folder for CineFiles resources

#### 2. Service Account
- Create a service account with roles:
  - `container-registry.images.puller` (pull images)
  - `container-registry.images.pusher` (push images)
  - `serverless-containers.editor` (deploy containers)
- Generate a JSON key for the service account -> `YC_SA_JSON_KEY` secret

#### 3. Container Registry
- Create a Container Registry in your folder
- Note the registry ID -> `YC_REGISTRY_ID` secret

#### 4. Serverless Container
- Create a Serverless Container in your folder
- Set it to public access (for HTTP traffic)
- Note the container ID -> `YC_CONTAINER_ID` secret
- Note the service account ID -> `YC_SERVICE_ACCOUNT_ID` secret

#### 5. Domain + SSL
- In Yandex Cloud Console, bind your custom domain to the serverless container
- Yandex Cloud manages SSL certificates automatically
- Alternatively, use an API Gateway with a custom domain

#### 6. Object Storage (S3)
- Create a bucket for media uploads (or share TR-BUTE's bucket with a separate key prefix)
- Create a static access key for the service account
- Set bucket to public read access for serving images

### GitHub Secrets

All secrets must be set in the GitHub repo Settings -> Secrets and variables -> Actions:

**Yandex Cloud Infrastructure:**
| Secret | Description |
|--------|-------------|
| `YC_SA_JSON_KEY` | Service account JSON key (for registry login + yc CLI) |
| `YC_REGISTRY_ID` | Container Registry ID |
| `YC_CONTAINER_ID` | Serverless Container ID |
| `YC_SERVICE_ACCOUNT_ID` | Service Account ID (for container runtime) |

**Application Config:**
| Secret | Description |
|--------|-------------|
| `APP_URL` | Production URL (e.g. `https://cinefiles-txt.com`) |
| `DATABASE_URL` | Supabase PostgreSQL connection string |
| `JWT_SECRET` | JWT signing secret (generate with `openssl rand -hex 32`) |
| `SESSION_SECRET` | Session signing secret (generate with `openssl rand -hex 32`) |
| `CRON_SECRET` | Cron endpoint auth token (generate with `openssl rand -hex 32`) |

**Auth Providers:**
| Secret | Description |
|--------|-------------|
| `YANDEX_CLIENT_ID` | Yandex OAuth app client ID |
| `YANDEX_CLIENT_SECRET` | Yandex OAuth app client secret |
| `VK_CLIENT_ID` | VK ID app client ID |
| `VK_CLIENT_SECRET` | VK ID app client secret |
| `BOT_TOKEN` | Telegram bot token (from BotFather, shared with TR-BUTE) |
| `TELEGRAM_OIDC_SECRET` | Telegram OIDC client secret (from BotFather > Bot Settings > Web Login) |

**Storage:**
| Secret | Description |
|--------|-------------|
| `YANDEX_S3_ENDPOINT` | `https://storage.yandexcloud.net` |
| `YANDEX_S3_REGION` | `ru-central1` |
| `YANDEX_S3_BUCKET` | Bucket name |
| `YANDEX_S3_ACCESS_KEY` | Static access key ID |
| `YANDEX_S3_SECRET_KEY` | Static access key secret |

**External Services:**
| Secret | Description |
|--------|-------------|
| `TMDB_API_KEY` | TMDB API key |
| `TMDB_PROXY_URL` | Vercel TMDB proxy URL (e.g. `https://cine-files.vercel.app/api/tmdb`) |
| `TMDB_PROXY_SECRET` | Shared secret for TMDB proxy auth |
| `TRIBUTE_API_URL` | TR-BUTE API URL (e.g. `https://buy-tribute.com/api`) |

## Vercel Configuration

**File**: `vercel.json`

- Framework: `@vercel/node` (Express on Vercel)
- Cron jobs: TMDB sync (daily), TMDB cleanup (daily), token cleanup (daily)
- Vercel Hobby plan: crons run at most once per day

## Database

- **Provider**: PostgreSQL on Supabase
- **Client**: `pg` driver with raw parameterized SQL (no ORM)
- **Schema**: `SQL_SCHEMA.sql` — apply via Supabase SQL editor
- **Env var**: `DATABASE_URL` set in platform dashboards (Vercel + GitHub secrets)

## Image Storage

- **Provider**: Yandex Object Storage (S3-compatible)
- **Upload**: `lib/storage.js` with AWS4-HMAC-SHA256 signing (no SDK)
- **Public URL**: `https://storage.yandexcloud.net/{bucket}/uploads/...`
- **CSP**: `storage.yandexcloud.net` allowed in `img-src` (server/app.js)

## Domain

- **Production**: `cinefiles-txt.com` (Yandex Cloud Serverless Container)
- **Vercel fallback**: `cine-files.vercel.app`
- **DNS**: Domain bought on Vercel, pointed to Yandex Cloud

## CI/CD Workflows

### `deploy-yandex.yml`
- Triggers on push to `main` or manual dispatch
- Builds Docker image with Buildx (cached via GitHub Actions cache)
- Pushes to Yandex Container Registry
- Deploys new revision to Yandex Serverless Container via `yc` CLI

### `cleanup-registry.yml`
- Manual dispatch only
- Configurable: keep count, dry run mode, image filter
- Cleans up old Docker images from Container Registry
