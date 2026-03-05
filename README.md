# CineFiles

Cinema and entertainment news & review site. Russian-language primary, i18n-ready.

## Tech Stack

- **Next.js 14+** (App Router) with TypeScript strict mode
- **PostgreSQL** via Supabase (`@supabase/supabase-js`)
- **CSS Modules** + CSS Variables (dark/light themes)
- **Yandex OAuth** (primary), VK ID, Telegram Login Widget
- **Yandex S3** for image storage
- **TMDB API** for movie/TV metadata
- **Yandex Cloud** (Docker) + Vercel (fallback)

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL database (or Supabase project)
- Yandex OAuth application
- TMDB API key

### Setup

```bash
# Install dependencies
npm install

# Set environment variables in Yandex Cloud / Vercel dashboard
# (no local .env file — all secrets managed via platform)
# See docs/ENV_VARS.md for the full list

# Apply database schema (via Supabase Dashboard SQL editor or CLI)
# See SQL_SCHEMA.sql for the full schema

# Seed database (optional)
npm run db:seed

# Start development server
npm run dev
```

### Environment Variables

All environment variables are managed directly in **Yandex Cloud** and **Vercel** dashboards — no `.env` files are stored in the repo.

See [docs/ENV_VARS.md](docs/ENV_VARS.md) for the full list. Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | JWT signing secret (64+ chars) |
| `YANDEX_CLIENT_ID` | Yes | Yandex OAuth app ID |
| `YANDEX_CLIENT_SECRET` | Yes | Yandex OAuth app secret |
| `TMDB_API_KEY` | Yes | TMDB v3 API key |
| `YANDEX_S3_*` | Yes | Yandex S3 credentials (5 vars) |

## Scripts

```bash
npm run dev          # Development server (localhost:3000)
npm run build        # Production build
npm run start        # Start production server
npm run lint         # ESLint check
npm run db:seed      # Seed database
```

## Project Structure

```
app/              Next.js App Router (pages + API)
├── (public)/     Public pages (category, article, tag, search, etc.)
├── admin/        Admin panel (protected)
└── api/          REST API endpoints
components/       React components
lib/              Server utilities (auth, db, tmdb, storage, etc.)
styles/           CSS Modules + globals
locales/          i18n strings (ru.json, en.json)
SQL_SCHEMA.sql    Database schema (PostgreSQL DDL)
docs/             Project documentation
.github/          CI/CD workflows (deploy, cleanup)
```

## Features

- **Block-based articles** — 11+ content block types (paragraph, heading, image, quote, embed, spoiler, infobox, etc.)
- **TMDB integration** — movie/TV/person metadata with caching and auto-sync
- **Threaded comments** — with admin moderation
- **Collections** — curated article groupings
- **Full-text search** — articles and tags
- **RSS feed** — `/feed/rss.xml`
- **Dynamic sitemap** — articles, categories, tags, collections
- **Dark/light theme** — CSS variable-based with localStorage persistence
- **TR-BUTE integration** — product cards and cross-site article linking

## Auth

Three OAuth providers (Yandex, VK, Telegram) with JWT session management.

**Roles:**
- `reader` — view and comment
- `editor` — create/edit own articles, manage tags, upload media
- `admin` — full access

## Deployment

### Docker (Yandex Cloud)

Automated via GitHub Actions (`.github/workflows/deploy-yandex.yml`).

```bash
# Manual build
docker build -f docker/Dockerfile -t cinefiles .
docker run -p 3000:3000 cinefiles
```

### Vercel

Push to git. Vercel auto-deploys with cron jobs configured in `vercel.json`.

## Documentation

| Document | Description |
|----------|-------------|
| [CLAUDE.md](CLAUDE.md) | AI assistant instructions & gotchas |
| [IMPLEMENTATION_PROTOCOL.md](IMPLEMENTATION_PROTOCOL.md) | Development protocols & conventions |
| [docs/STRUCTURE.md](docs/STRUCTURE.md) | Full project structure |
| [docs/FEATURES.md](docs/FEATURES.md) | Feature overview |
| [docs/DATABASE.md](docs/DATABASE.md) | Database schema reference |
| [docs/AUTH_SYSTEM.md](docs/AUTH_SYSTEM.md) | Authentication & authorization |
| [docs/ADMIN_PANEL.md](docs/ADMIN_PANEL.md) | Admin panel guide |
| [docs/CONTENT_SYSTEM.md](docs/CONTENT_SYSTEM.md) | Block-based content model |
| [docs/THEMING.md](docs/THEMING.md) | CSS & theming |
| [docs/TMDB_INTEGRATION.md](docs/TMDB_INTEGRATION.md) | TMDB proxy & entity sync |
| [docs/TRIBUTE_INTEGRATION.md](docs/TRIBUTE_INTEGRATION.md) | TR-BUTE cross-linking |
| [docs/CRON_JOBS.md](docs/CRON_JOBS.md) | Scheduled tasks |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Docker & Vercel deployment |
| [docs/ENV_VARS.md](docs/ENV_VARS.md) | Environment variables |
| [docs/SECURITY.md](docs/SECURITY.md) | Security measures |
| [docs/SEO.md](docs/SEO.md) | SEO & discovery |

## License

Private project. All rights reserved.
