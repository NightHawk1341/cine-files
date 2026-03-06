# CineFiles — Full Specification

## 1. Project Overview

CineFiles is a cinema/entertainment news and review site — a sister project to TR-BUTE (figurine e-commerce). It covers films, anime, video games (especially film/anime adaptations), directors, actors, and related pop culture. The two sites cross-link: CineFiles articles reference TR-BUTE products, and TR-BUTE product pages link to related CineFiles content.

**Key decisions:**
- **Primary deployment**: Yandex Cloud (main audience is Russian-speaking)
- **Fallback deployment**: Vercel
- **No Telegram MiniApp** (unlike TR-BUTE)
- **Language**: Russian primary, with i18n-ready architecture for future English
- **Content model**: Editorial-only (admin-published), no user submissions

---

## 2. Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | **Next.js 14+ (App Router)** | SSR/SSG for SEO, React Server Components |
| Language | **TypeScript** | Strict mode |
| Database | **PostgreSQL (Supabase)** | Separate project from TR-BUTE |
| ORM | **Prisma** | Type-safe queries, migrations |
| Styling | **CSS Modules + CSS Variables** | Shared variable naming with TR-BUTE for visual kinship |
| Auth | **Yandex OAuth** (primary), **VK ID** (secondary), **Telegram Login Widget** (tertiary) | No mini-app auth — standard OAuth flows only |
| Storage | **Yandex S3** | All images (article covers, author photos, editorial assets) |
| CMS | **Custom admin panel** | Next.js route group `/(admin)` with protected routes |
| Metadata API | **TMDB** (proxied) | Server-side only, via external proxy for Yandex Cloud |
| Deployment | **Yandex Cloud** (Docker/Serverless) primary, **Vercel** fallback |
| Cache | **Redis** (optional) or Next.js built-in ISR | For TMDB proxy cache and session store |

### Why Next.js over Express+SPA

- **SEO is critical** for a content/news site — SSR/SSG out of the box
- **Image optimization** — `next/image` with Yandex S3 loader
- **ISR (Incremental Static Regeneration)** — publish once, serve static, revalidate on demand
- **API routes** — no separate backend needed
- **React ecosystem** — rich markdown/editor libraries

---

## 3. TMDB Integration Strategy

### The Problem
TMDB blocks Russian IPs (both TMDB's geo-block and Roskomnadzor). Since Yandex Cloud is the primary deployment (Russian servers), direct TMDB API calls will fail.

### The Solution: External Proxy + Aggressive Caching

**Architecture:**
```
[Yandex Cloud CineFiles] → [Vercel Proxy Function] → [TMDB API]
                                    ↓
                           [Supabase cache table]
```

1. **Vercel proxy endpoint** (`/api/tmdb/[...path]`) — a lightweight Vercel function that forwards requests to TMDB API. Runs from US/EU IPs, bypassing the block.

2. **Supabase cache table** (`tmdb_cache`) — stores TMDB responses with TTL. The CineFiles server checks cache first, only calls the proxy on cache miss.

3. **Batch sync cron** — daily Vercel cron job that pre-fetches trending/popular/upcoming movies and caches them, so the Yandex Cloud server rarely needs live TMDB calls.

### What We Fetch from TMDB (Metadata Only)

We do NOT need images or videos from TMDB. Only structured metadata:

- **Movies**: title (ru + en), release date, genres, runtime, overview, TMDB ID
- **TV Shows**: same as movies + season/episode counts
- **People**: name (ru + en), known_for_department, TMDB ID
- **Credits**: cast/crew connections (movie ↔ person)
- **Search**: multi-search for autocomplete when tagging articles
- **Keywords**: for topic linking

All editorial images (article covers, thumbnails) are uploaded by admins to Yandex S3.

### TMDB Data Model in Our DB

```sql
CREATE TABLE tmdb_entities (
    id SERIAL PRIMARY KEY,
    tmdb_id INTEGER NOT NULL,
    entity_type VARCHAR(20) NOT NULL, -- 'movie', 'tv', 'person'
    title_ru TEXT,
    title_en TEXT,
    metadata JSONB NOT NULL, -- full TMDB response (genres, dates, etc.)
    credits JSONB, -- cast/crew for movies; filmography for people
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tmdb_id, entity_type)
);

CREATE INDEX idx_tmdb_entities_type ON tmdb_entities(entity_type);
CREATE INDEX idx_tmdb_entities_tmdb_id ON tmdb_entities(tmdb_id);
CREATE INDEX idx_tmdb_entities_title_ru ON tmdb_entities USING gin(title_ru gin_trgm_ops);
```

When an admin tags an article with a movie/person, we:
1. Search TMDB (via proxy) for the entity
2. Store/update it in `tmdb_entities`
3. Link it to the article via `article_tags`

This means the site works even if TMDB is completely down — all needed data is already local.

---

## 4. Database Schema

### Separate Supabase Project

CineFiles has its own Supabase project. Cross-site integration happens via API, not shared DB.

### Core Tables

```sql
-- ============================================================
-- USERS & AUTH
-- ============================================================

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    yandex_id VARCHAR(50) UNIQUE,
    vk_id VARCHAR(50) UNIQUE,
    telegram_id VARCHAR(50) UNIQUE,
    email VARCHAR(255),
    display_name VARCHAR(100),
    avatar_url TEXT,
    login_method VARCHAR(20) NOT NULL, -- 'yandex', 'vk', 'telegram'
    role VARCHAR(20) NOT NULL DEFAULT 'reader', -- 'reader', 'editor', 'admin'
    -- TR-BUTE cross-link (populated if user has account on both sites)
    tribute_user_id INTEGER,
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

CREATE TABLE auth_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token VARCHAR(500) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- CONTENT
-- ============================================================

CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(50) NOT NULL UNIQUE,
    name_ru VARCHAR(100) NOT NULL,
    name_en VARCHAR(100),
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pre-seeded categories:
-- 'news', 'reviews', 'articles', 'interviews', 'lists', 'analysis'

CREATE TABLE articles (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(200) NOT NULL UNIQUE,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    author_id INTEGER NOT NULL REFERENCES users(id),

    -- Content
    title VARCHAR(300) NOT NULL,
    subtitle VARCHAR(500),
    lead TEXT, -- short intro/excerpt for cards and SEO
    body JSONB NOT NULL, -- structured content (blocks: paragraph, heading, image, quote, embed, etc.)

    -- Media
    cover_image_url TEXT, -- Yandex S3
    cover_image_alt VARCHAR(300),
    cover_image_credit VARCHAR(200),

    -- SEO
    meta_title VARCHAR(70),
    meta_description VARCHAR(160),
    canonical_url TEXT,

    -- Publishing
    status VARCHAR(20) NOT NULL DEFAULT 'draft', -- 'draft', 'review', 'published', 'archived'
    published_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Metrics (denormalized for performance)
    view_count INTEGER DEFAULT 0,
    comment_count INTEGER DEFAULT 0,

    -- TR-BUTE integration
    tribute_product_ids INTEGER[] DEFAULT '{}', -- linked TR-BUTE product IDs

    -- Feature flags
    is_featured BOOLEAN DEFAULT FALSE,
    is_pinned BOOLEAN DEFAULT FALSE,
    allow_comments BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_articles_slug ON articles(slug);
CREATE INDEX idx_articles_status ON articles(status);
CREATE INDEX idx_articles_published ON articles(published_at DESC) WHERE status = 'published';
CREATE INDEX idx_articles_category ON articles(category_id);
CREATE INDEX idx_articles_author ON articles(author_id);
CREATE INDEX idx_articles_featured ON articles(is_featured) WHERE is_featured = TRUE;

-- ============================================================
-- TAGGING SYSTEM (TMDB-powered)
-- ============================================================

CREATE TABLE tags (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(100) NOT NULL UNIQUE,
    name_ru VARCHAR(150) NOT NULL,
    name_en VARCHAR(150),
    tag_type VARCHAR(30) NOT NULL, -- 'movie', 'tv', 'person', 'genre', 'franchise', 'studio', 'topic', 'game', 'anime'
    tmdb_entity_id INTEGER REFERENCES tmdb_entities(id), -- NULL for non-TMDB tags (topic, game, anime)
    article_count INTEGER DEFAULT 0, -- denormalized
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tags_type ON tags(tag_type);
CREATE INDEX idx_tags_slug ON tags(slug);
CREATE INDEX idx_tags_name_ru ON tags USING gin(name_ru gin_trgm_ops);

CREATE TABLE article_tags (
    article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT FALSE, -- primary tag shown prominently
    PRIMARY KEY (article_id, tag_id)
);

CREATE INDEX idx_article_tags_tag ON article_tags(tag_id);

-- ============================================================
-- COMMENTS
-- ============================================================

CREATE TABLE comments (
    id SERIAL PRIMARY KEY,
    article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE, -- threaded replies
    body TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'visible', -- 'visible', 'hidden', 'deleted'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE INDEX idx_comments_article ON comments(article_id);
CREATE INDEX idx_comments_user ON comments(user_id);
CREATE INDEX idx_comments_parent ON comments(parent_id);

-- ============================================================
-- TMDB CACHE (see Section 3)
-- ============================================================

-- tmdb_entities table defined in Section 3

CREATE TABLE tmdb_cache (
    id SERIAL PRIMARY KEY,
    cache_key VARCHAR(200) NOT NULL UNIQUE, -- e.g. 'movie/550', 'search/multi?query=...'
    response JSONB NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tmdb_cache_key ON tmdb_cache(cache_key);
CREATE INDEX idx_tmdb_cache_expires ON tmdb_cache(expires_at);

-- ============================================================
-- EDITORIAL MEDIA
-- ============================================================

CREATE TABLE media (
    id SERIAL PRIMARY KEY,
    uploaded_by INTEGER NOT NULL REFERENCES users(id),
    url TEXT NOT NULL, -- Yandex S3 URL
    filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(50) NOT NULL,
    file_size INTEGER,
    width INTEGER,
    height INTEGER,
    alt_text VARCHAR(300),
    credit VARCHAR(200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SITE SETTINGS
-- ============================================================

CREATE TABLE app_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- COLLECTIONS (curated article groups)
-- ============================================================

CREATE TABLE collections (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(100) NOT NULL UNIQUE,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    cover_image_url TEXT,
    sort_order INTEGER DEFAULT 0,
    is_visible BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE collection_articles (
    collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    sort_order INTEGER DEFAULT 0,
    PRIMARY KEY (collection_id, article_id)
);
```

---

## 5. Page Structure & Routes

### Public Pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | Home | Featured articles, latest news, trending tags, collections |
| `/news` | News listing | Paginated news articles |
| `/reviews` | Reviews listing | Film/show reviews with ratings |
| `/articles` | Articles listing | Long-form pieces, analysis |
| `/[category]/[slug]` | Article detail | Full article with comments, related tags, TR-BUTE links |
| `/tags` | All tags | Browse by movies, people, genres, franchises |
| `/tag/[slug]` | Tag page | All articles for a specific movie/person/topic |
| `/author/[id]` | Author page | Editor profile, their articles |
| `/collections` | Collections | Curated article groups |
| `/collection/[slug]` | Collection detail | Articles in a collection |
| `/search` | Search | Full-text search across articles and tags |
| `/about` | About | Site info, team |
| `/legal` | Legal | Privacy policy, terms |

### Admin Pages (Route Group)

| Route | Page | Description |
|-------|------|-------------|
| `/(admin)/dashboard` | Dashboard | Stats, recent activity |
| `/(admin)/articles` | Article list | CRUD, status management |
| `/(admin)/articles/new` | Article editor | Block-based content editor |
| `/(admin)/articles/[id]/edit` | Edit article | Same editor, pre-populated |
| `/(admin)/tags` | Tag management | TMDB search, manual tags |
| `/(admin)/media` | Media library | S3 upload, browse, manage |
| `/(admin)/comments` | Comment moderation | Approve/hide/delete |
| `/(admin)/collections` | Collection management | Curate article groups |
| `/(admin)/users` | User management | Roles, bans |
| `/(admin)/settings` | Site settings | SEO defaults, integrations |

### API Routes

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/articles` | List articles (paginated, filtered) |
| GET | `/api/articles/[slug]` | Single article |
| POST | `/api/articles` | Create article (admin) |
| PUT | `/api/articles/[id]` | Update article (admin) |
| DELETE | `/api/articles/[id]` | Delete article (admin) |
| GET | `/api/tags` | List/search tags |
| POST | `/api/tags` | Create tag (admin) |
| GET | `/api/tags/[slug]` | Tag detail + articles |
| GET | `/api/comments/[articleId]` | List comments for article |
| POST | `/api/comments` | Post comment (authenticated) |
| DELETE | `/api/comments/[id]` | Delete comment (admin/author) |
| GET | `/api/search` | Full-text search |
| GET | `/api/tmdb/search` | TMDB search (admin, for tagging) |
| GET | `/api/tmdb/[type]/[id]` | TMDB entity detail (admin) |
| POST | `/api/media/upload` | Upload to S3 (admin) |
| GET | `/api/tribute/products` | Fetch linked TR-BUTE products |
| POST | `/api/auth/[provider]` | OAuth callback |
| POST | `/api/auth/refresh` | Token refresh |
| POST | `/api/auth/logout` | Logout |

---

## 6. Content Editor

### Block-Based Architecture

Article body is stored as JSONB — an array of typed blocks:

```typescript
type Block =
  | { type: 'paragraph'; text: string }           // Rich text (bold, italic, links)
  | { type: 'heading'; level: 2 | 3 | 4; text: string }
  | { type: 'image'; url: string; alt: string; credit?: string; caption?: string }
  | { type: 'quote'; text: string; author?: string; source?: string }
  | { type: 'list'; style: 'ordered' | 'unordered'; items: string[] }
  | { type: 'embed'; provider: 'youtube' | 'vk_video' | 'rutube'; videoId: string }
  | { type: 'divider' }
  | { type: 'spoiler'; title: string; blocks: Block[] }     // Collapsible section
  | { type: 'infobox'; title: string; blocks: Block[] }     // Highlighted box
  | { type: 'tribute_products'; productIds: number[] }      // TR-BUTE product cards
  | { type: 'movie_card'; tmdbEntityId: number }             // TMDB movie/show info card
```

### Editor UI (Admin)

- Drag-and-drop block reordering
- Inline toolbar for text formatting (bold, italic, link, strikethrough)
- TMDB search autocomplete for tagging and movie card blocks
- S3 image upload with drag-and-drop
- Live preview panel
- Auto-save drafts to localStorage + periodic server save

### Rendering

Server-side rendering of blocks to semantic HTML. Each block type maps to a React component. The `tribute_products` block fetches product data from TR-BUTE API at render time (cached via ISR).

---

## 7. TR-BUTE Integration

### Cross-Site Linking

**CineFiles → TR-BUTE:**
- Articles can reference TR-BUTE product IDs (`tribute_product_ids` column)
- `tribute_products` content block renders product cards with links to TR-BUTE
- Tag pages for movies/franchises show "Related TR-BUTE Products" section
- CineFiles calls TR-BUTE API: `GET /api/products?ids=1,2,3` (public endpoint, needs implementation on TR-BUTE side)

**TR-BUTE → CineFiles:**
- Product pages show "Related Articles" section
- TR-BUTE calls CineFiles API: `GET /api/articles?tribute_product_id=123`
- Product tags (ip_names, genres) can be matched to CineFiles tags

### Shared User Identity

Users who have accounts on both sites are linked via OAuth provider IDs (yandex_id, vk_id, telegram_id). The `tribute_user_id` field in CineFiles `users` table stores the TR-BUTE user ID for direct cross-referencing.

**Flow:**
1. User logs into CineFiles via Yandex OAuth
2. CineFiles checks if a TR-BUTE user exists with same `yandex_id` (via TR-BUTE API)
3. If yes, stores `tribute_user_id` for cross-linking (e.g., showing user's TR-BUTE favorites on CineFiles profile)

### API Contract (TR-BUTE Side — Changes Needed)

New endpoints to add to TR-BUTE `server/routes/index.js`:

```javascript
// Public endpoint for CineFiles to fetch product data
app.get('/api/products/by-ids', require('./routes/products-public').getByIds);

// Public endpoint for CineFiles to check if a user exists
app.get('/api/users/by-provider', require('./routes/users-public').getByProvider);

// Public endpoint to get articles related to a product (calls CineFiles)
app.get('/api/products/:id/articles', require('./routes/integration').getRelatedArticles);
```

These will be implemented when we build the integration features.

---

## 8. Authentication

### Providers

| Provider | Flow | Primary/Secondary |
|----------|------|-------------------|
| **Yandex OAuth** | Standard OAuth 2.0 redirect flow | Primary |
| **VK ID** | VK ID SDK + OAuth callback | Secondary |
| **Telegram Login Widget** | Data-check-string verification (NOT mini-app) | Tertiary |

### Implementation

```
/api/auth/yandex    → OAuth redirect → callback → JWT
/api/auth/vk        → VK ID redirect → callback → JWT
/api/auth/telegram   → Login widget data → verify hash → JWT
```

- JWT access tokens: 7-day expiry (matches TR-BUTE)
- Refresh tokens: 30-day expiry, stored in `auth_tokens` table
- httpOnly cookies for token storage (SSR-friendly, unlike TR-BUTE's localStorage approach)
- Next.js middleware for route protection (`/(admin)` routes)

### Roles

| Role | Permissions |
|------|------------|
| `reader` | Browse, comment, search |
| `editor` | All reader + create/edit own articles, manage own media |
| `admin` | All editor + publish, delete, manage users, site settings |

---

## 9. Styling & Theming

### Design System

CineFiles shares visual DNA with TR-BUTE but has its own identity. The sites must feel like siblings — same structure, different palette.

- **Same CSS variable naming convention** — identical variable names across both sites (`--bg-primary`, `--text-primary`, `--brand-primary`, etc.)
- **Same dark/light theme toggle** — `html[data-theme="light"]` override pattern in `:root`
- **Different brand palette** — cinematic feel (deep blues, warm ambers) vs TR-BUTE's yellow-gold
- **Same typography** — Montserrat, locally hosted (same woff2 files), identical weight scale (100–900)
- **Same component patterns** — cards, buttons, modals, toasts, skeletons follow TR-BUTE conventions
- **Same FOUC prevention** — `html.page-loading` / `html.page-ready` body visibility pattern
- **Same theme transition disable** — `html.theme-transition-disable` class suppresses transitions during theme switch

### Critical Styling Rules (from TR-BUTE)

These rules are shared across both sites and must be followed:

1. **Never hardcode colors** — Always use CSS variables. Hardcoded hex values (e.g. `#1e1e1e`, `#E0E0E0`) break theming. Every color must come from `globals.css` variables.
2. **Active elements need active+hover states** — Any interactive element with an `.active` state must also have a `.active:hover` rule (inside `@media (hover: hover)`) so hovering an active element looks distinct. The active+hover style should be a visual progression (e.g. glow via `box-shadow`), not a regression.
3. **Font loading: local only** — Montserrat loaded from `/fonts/` directory, not Google Fonts (blocked in Russia). Use `font-display: swap` on all `@font-face` rules.
4. **Skeleton loading states** — Use `--skeleton-bg-base` and `--skeleton-bg-highlight` variables for loading placeholders. Never hardcode skeleton colors.
5. **Shadows use variables** — `--shadow-sm`, `--shadow-md`, `--shadow-lg` — never hardcode `box-shadow` rgba values.

### CSS Variable System (Full Reference)

Both sites use the same variable naming. CineFiles overrides only the values, not the names.

```css
/* ===== globals.css :root (dark theme default) ===== */

/* Layout */
--header-height: clamp(3.25rem, 3rem + 1vw, 3.75rem);
--footer-height: auto;

/* Typography */
--font-size-mobile: 18px;
--font-size-desktop: 16px;
--heading-mobile: 24px;
--heading-desktop: 32px;
--page-title-size: 20px;
--page-title-size-mobile: 18px;

/* Brand Colors — CineFiles palette (cinematic) */
--brand-primary: #4a90d9;        /* Steel blue (cinematic feel) */
--brand-secondary: #3a7bc8;     /* Deeper blue */
--brand-hover: #2d6ab5;         /* Hover state */
--brand-muted: rgba(74, 144, 217, 0.15);

/* Backgrounds (same structure as TR-BUTE, different values) */
--bg-primary: #0d0d0d;          /* Near-black (theater dark) */
--bg-primary-t: rgba(13, 13, 13, 0);
--bg-secondary: #1a1a1a;        /* Cards, elevated surfaces */
--bg-tertiary: #272727;         /* Hover states, inputs */
--bg-quaternary: #363636;       /* Active states */
--bg-overlay: rgba(0, 0, 0, 0.85);

/* Text Colors (same names as TR-BUTE) */
--text-primary: #E0E0E0;
--text-secondary: #a3a3a3;
--text-tertiary: #818181;
--text-inverse: #0d0d0d;

/* Border Colors */
--border-color: rgba(65, 65, 65, 0.5);
--border-hover: rgba(143, 143, 143, 0.5);
--border-active: rgba(74, 144, 217, 0.5);  /* Brand-tinted */
--divider: rgba(65, 65, 65, 0.3);

/* Status Colors (shared with TR-BUTE — identical) */
--status-pending: #FFC107;
--status-pending-bg: rgba(255, 193, 7, 0.15);
--status-info: #2196F3;
--status-info-bg: rgba(33, 150, 243, 0.15);
--status-success: #4CAF50;
--status-success-bg: rgba(76, 175, 80, 0.15);
--status-warning: #FF9800;
--status-warning-bg: rgba(255, 152, 0, 0.15);
--status-error: #F44336;
--status-error-bg: rgba(244, 67, 54, 0.15);

/* Interactive */
--link-color: #66b3db;
--link-hover: #8ec8e8;
--favorite-color: #e91e63;

/* Shadows */
--shadow-color: rgba(0, 0, 0, 0.3);
--shadow-sm: 0 1px 2px var(--shadow-color);
--shadow-md: 0 2px 8px var(--shadow-color);
--shadow-lg: 0 8px 16px var(--shadow-color);

/* Skeleton Loading */
--skeleton-bg-base: rgba(255, 255, 255, 0.05);
--skeleton-bg-highlight: rgba(255, 255, 255, 0.1);

/* Glass */
--glass-bg: var(--bg-secondary);
--glass-border: var(--border-color);

/* Cards */
--card-bg: var(--bg-secondary);
--card-bg-hover: var(--bg-tertiary);
--card-border: var(--border-color);
--card-border-hover: var(--border-hover);

/* Tabs */
--tab-inactive-bg: var(--bg-secondary);
--tab-active-bg: var(--bg-primary);
--tab-counter-bg: rgba(74, 144, 217, 0.2);  /* Brand-tinted */
--tab-counter-border: rgba(74, 144, 217, 0.4);
--tab-counter-color: #66b3db;
```

```css
/* ===== Light theme overrides ===== */
html[data-theme="light"] {
  /* Warm parchment palette (same as TR-BUTE light theme) */
  --bg-primary: #f2ede4;
  --bg-primary-t: rgba(242, 237, 228, 0);
  --bg-secondary: #e8e2d8;
  --bg-tertiary: #dcd5c8;
  --bg-quaternary: #cfc7b8;
  --bg-overlay: rgba(30, 20, 10, 0.55);

  --text-primary: #1c160e;
  --text-secondary: #4a4035;
  --text-tertiary: #6b6055;
  --text-inverse: #f2ede4;

  --border-color: rgba(80, 60, 30, 0.15);
  --border-hover: rgba(80, 60, 30, 0.3);
  --border-active: rgba(37, 150, 190, 0.5);
  --divider: rgba(80, 60, 30, 0.1);

  --shadow-color: rgba(30, 20, 10, 0.14);

  --brand-primary: #2d6ab5;
  --brand-secondary: #245a9e;
  --brand-hover: #1d4d8a;
  --brand-muted: rgba(45, 106, 181, 0.12);

  --skeleton-bg-base: rgba(80, 60, 30, 0.08);
  --skeleton-bg-highlight: rgba(80, 60, 30, 0.14);
}
```

### CSS Architecture

```
styles/
  globals.css              -- CSS variables, reset, base, FOUC prevention, font-faces
  components/
    header.module.css
    footer.module.css
    article-card.module.css
    comment.module.css
    tag-chip.module.css
    skeleton.module.css    -- Loading state components
    toast.module.css
    editor/
      toolbar.module.css
      blocks.module.css
  pages/
    home.module.css
    article.module.css
    tag.module.css
    profile.module.css
    admin.module.css
```

**Architecture rules:**
- CSS Modules for component isolation + global CSS variables for theming
- `globals.css` is the only non-module file — loaded on every page via Next.js `layout.tsx`
- Component CSS Modules import no variables — they reference globals via `var(--name)` syntax
- Page-specific CSS Modules contain only overrides, not shared patterns
- When a style is identical across 3+ components, extract to a shared component or `globals.css`

### Component Styling Patterns (TR-BUTE Parity)

These patterns define how each component type should look and behave. CineFiles adapts the same structural patterns — border-radius values, padding, spacing, transitions, blur effects, z-index layers, and responsive breakpoints — swapping only brand colors.

#### Responsive Breakpoints

| Breakpoint | Context |
|-----------|---------|
| 1024px | Primary desktop/mobile threshold — bottom-nav appears, layout shifts |
| 768px | Narrow desktop/tablet — header layout change, footer reflows |
| 550px | Compact footer — logo variants switch |
| 350px | Ultra-narrow — minimal logo, hide secondary elements |

#### Header

- **Position**: Fixed top, z-index: 999
- **Height**: Fluid `clamp(3.25rem, 3rem + 1vw, 3.75rem)` (~52–60px)
- **Padding**: 8–10px vertical (fluid), 8px horizontal
- **Border**: 1px solid `--border-color` (bottom)
- **Background**: `--bg-primary`
- **Layout**: Flex, centered, with gaps
- **Desktop (>1024px)**: Full nav links (home, tags, reviews, search, profile), logo centered
- **Mobile (≤768px)**: Hamburger left, logo centered, profile right
- **Hover effects**: Opacity 0.7 fade on icons; underline animation (30% width idle → 100% active) on nav links
- **Active page indicator**: Color `--active-page-color` with underline
- **No transitions on mobile** — avoids conflicts with mobile address bar show/hide
- **Counter badges** (notifications): 11px font, pill shape (20px border-radius), positioned absolutely on icon

#### Footer

- **Position**: Relative, flex-shrink: 0, margin-top: auto (pushed to bottom via `flex: 1 0 auto` on main content)
- **Padding**: 20px; on mobile (≤1024px) adds extra bottom padding `clamp(3.75rem, 3.5rem + 1vw, 4.25rem)` for bottom-nav clearance
- **Border**: 1px top `--border-color`
- **Max-width**: 1100px centered
- **Layout**: Flex, space-between, wrap, gap: 15px
- **Links**: Grouped in pill containers (7px padding, 4px gap, 40px height)
- **Social icons**: 22px × 22px, opacity 0.5 default → 1 on hover, transition 0.2s
- **Mobile (≤413px)**: Flex column, center-aligned

#### Bottom Navigation (Mobile)

- **Position**: Fixed bottom, z-index: 1001
- **Height**: `clamp(3.75rem, 3.5rem + 1vw, 4.25rem)` — taller than header for icon + label
- **Display**: Only on mobile (max-width: 768px or `hover: none` media query)
- **Border**: 1px top `--border-color`, shadow `0 -4px 12px var(--shadow-color)`
- **Buttons**: Flex: 1 each, column layout (icon on top, label below)
  - Icon: 20 × 20px, color `--text-tertiary`
  - Label: 10px font, 3px margin-top, nowrap
- **Active state**: Color `--active-page-color` (including SVG fill)
- **Counter badges**: Absolute, top: -4px, right: -8px, 8px font, 14px min-width, 10px border-radius
- **Press feedback**: Brightness filter 0.7, 100ms transition (`.mobile-pressed-to-active` class)

#### Modals & Overlays

**Confirmation/Dialog Modals:**
- **Backdrop**: Fixed fullscreen, `--bg-overlay`, backdrop-filter: `blur(4px)` + `-webkit-backdrop-filter`
- **Modal box**: Fixed center, width 85% (max 400px)
- **Padding**: Fluid `clamp(1.25rem, 1rem + 1vw, 1.875rem)`
- **Border**: 1.5px `--border-hover`, border-radius: 20px
- **Background**: `--bg-secondary`
- **Shadow**: `--modal-popup-shadow` — triple-border ring effect: `0 0 0 9px rgba(30,30,30), 0 0 0 10px var(--border-hover)`
- **Entry animation**: `slideUp` 300ms ease — `translateY(20px)` → `translateY(0)`
- **Buttons inside modal**: Full width flex, gap: 10px, 12px padding, border-radius: 12px

**Image Zoom/Lightbox:**
- **Wrapper**: Fixed fullscreen, flex center, z-index: 10002
- **Backdrop**: `rgba(0, 0, 0, 0.7)`, backdrop-filter: `blur(4px)`
- **Content**: Transparent bg, max-width: `min(95vw, 1600px)`
- **Mobile**: Scroll-snap carousel (`scroll-snap-type: x mandatory`), full viewport height
- **Close button**: Top-right, semi-transparent

**Carousel Modals (e.g. FAQ, Gallery):**
- **Backdrop**: Fixed fullscreen, backdrop-filter: `blur(6px)`, z-index: 20000
- **Cards**: Fixed width (e.g. 440px), 1.5px border, 20px border-radius, 24px gap between items
- **Inactive cards**: `scale(0.9)`, `brightness(0.45)` — creates depth effect
- **Active card**: `scale(1)`, `brightness(1)`, triple-border shadow

#### Toast Notifications

**Container:**
- **Position**: Fixed, z-index: 10003
- **Desktop**: Top-right, offset by `calc(var(--header-height) + 12px)`, right: 20px, width: 340px
- **Mobile**: Top-center, `width: calc(100vw - 32px)`, centered via `translateX(-50%)`

**Individual Toast:**
- **Padding**: 13px 18px
- **Background**: `--bg-secondary`
- **Border**: 1px `--border-color`, border-radius: 12px
- **Shadow**: `--shadow-lg`
- **Layout**: Flex, gap: 12px, center-aligned
- **Font**: 14px, center-aligned

**Stack effect** (multiple toasts):
- index 1: `translateY(6px) scaleX(0.96)` — slightly behind
- index 2: `translateY(12px) scaleX(0.92)` — further back
- Height transition: 300ms `cubic-bezier(0.22, 1, 0.36, 1)`

**Animations:**
- Desktop enter: `translateX(110%)` → `translateX(0)`, 280ms cubic-bezier
- Desktop exit: `translateX(0)` → `translateX(110%)`, 220ms ease-in
- Mobile enter: `translateY(-10px)` → `translateY(0)`, 280ms
- Mobile exit: `translateY(0)` → `translateY(-48px)`, 220ms ease-in

#### Cards

**Article cards (CineFiles equivalent of product cards):**
- **Background**: `--card-bg`
- **Border**: 1px `--card-border`, border-radius: 12px
- **Hover**: Background → `--card-bg-hover`, border → `--card-border-hover`
- **Padding**: 15px
- **Image**: Aspect-ratio preserved, 8px border-radius
- **Transition**: Background + border 200ms

**Compact list items (comments, reviews):**
- **Layout**: Flex row, gap: 12px
- **Avatar**: 40 × 40px circle
- **Font sizes**: Author 13px, metadata 12px, body 12px, date 11px
- **Admin/author response**: 3px left border `--brand-primary`, 8px padding

#### Buttons

**Icon buttons (`.btn-icon` pattern):**
- Size: 24 × 24px, transparent background, no border
- SVG: `--text-tertiary` color, fills 24 × 24px
- Transition: 200ms

**Action buttons (`.btn-filter` pattern — tags, filters):**
- Padding: 7px 12px, border-radius: 40px (pill shape)
- Font: 14px
- Hover: `--bg-tertiary` background, `--border-hover` border
- Active: Brand-colored background + border, with glow `box-shadow`
- Transition: 200ms background + border

#### Indicators

**Carousel/slider indicators:**
- **Bar style**: 25px × 2px bars, gap: 6px
- Inactive: `--indicator-default` (`#616161`)
- Active: `--indicator-active` (`#a3a3a3`), width expands to 35px
- Transition: Width + color + opacity

**Dot style** (alternative):
- 8px × 8px circles, similar active/inactive pattern

#### Skeleton Loading

**Base animation**: 1.2s ease-in-out infinite, 90° gradient sweep from `--skeleton-bg-base` to `--skeleton-bg-highlight`

| Element | Dimensions | Border-radius |
|---------|-----------|---------------|
| Text line | 12px h × 100% w | 8px |
| Title | 20px h × 60% w | 8px |
| Button | 40px h × 120px w | 8px |
| Circle (avatar) | Variable | 50% |
| Card placeholder | Column flex, 12px gap | 12px |

**Grid behavior**: Pre-render ~18 skeletons; on mobile (≤1024px) show 12; auto-fill grid with `minmax(min(160px, 100%), 1fr)`

#### Grain Texture Overlay

- **Position**: Fixed, fullscreen, z-index: 1 (below all content)
- **Image**: Repeating 1000 × 1000px grain texture
- **Animation**: `grainFlip` — 0.5s steps(1) infinite with scale transforms at 25% increments: `(1,1)` → `(-1,1)` → `(-1,-1)` → `(1,-1)`
- **Opacity**: Dark theme 0.12 (0.10 on mobile), light theme 0.06 (0.05 on mobile)
- **Light theme**: Invert filter applied for visibility
- CineFiles uses the same grain image file and animation pattern

#### Page Transitions (SPA / Next.js)

CineFiles uses Next.js built-in transitions but follows the same visual patterns:

**Desktop**: Fade — 200ms ease-out (opacity 1 → 0, then 0 → 1)

**Mobile**: Slide —
- Forward: Current page slides left (`translateX(0)` → `translateX(-30px)`), new page slides in from right (`translateX(30px)` → `translateX(0)`)
- Back: Reverse direction
- Duration: 200ms ease-out

**Progress bar** (top of page):
- Height: 2px, gradient from `--brand-primary` → `--brand-secondary`
- Z-index: 99999
- Active: Animates 0% → 75% over 800ms; completes 75% → 100% over 800ms with fade

**Reduced motion**: All animations disabled when `prefers-reduced-motion: reduce`

#### Tooltips

- **Position**: Fixed, z-index: 9500
- **Padding**: 5px 9px, border-radius: 8px
- **Font**: 12px, weight 500, line-height 1.4
- **Background**: `--bg-secondary`, border: 1px `--border-color`
- **White-space**: nowrap
- **Arrow**: Two-layer technique — `::before` for border, `::after` for background fill, 6px size
- **Placement**: Top or bottom, arrow horizontally centered via CSS custom property `--arrow-offset`
- **Transition**: Opacity 0 → 1, 120ms ease

#### Blur & Special Effects

| Effect | Value | Used on |
|--------|-------|---------|
| Backdrop blur (light) | `blur(4px)` | Confirmation modals, image zoom |
| Backdrop blur (heavy) | `blur(6px)` | Carousel modals, gallery overlays |
| Brightness dim | `brightness(0.35)` | Inactive carousel slides |
| Brightness dim (modal) | `brightness(0.45)` | Inactive modal cards |
| Brightness press | `brightness(0.7)` | Mobile tap feedback |
| Scale stack | `scale(0.9)` | Inactive carousel/modal cards |
| Toast stack scale | `scaleX(0.96)`, `scaleX(0.92)` | Stacked toasts depth |

Always include `-webkit-backdrop-filter` alongside `backdrop-filter` for Safari support.

#### Z-Index Scale

| Z-Index | Component |
|---------|-----------|
| 1 | Grain texture overlay |
| 999 | Header |
| 1001 | Bottom navigation |
| 9500 | Tooltips |
| 10002 | Image zoom/lightbox |
| 10003 | Toast notifications |
| 20000 | Carousel/gallery modals |
| 99999 | Progress bar |

---

## 10. SEO Strategy

### Technical SEO

- **SSR/SSG** — all public pages server-rendered
- **ISR** — articles revalidated on publish, tag pages every hour
- **Structured data** — JSON-LD for articles (NewsArticle/Review schema), breadcrumbs, organization
- **Sitemap** — auto-generated `/sitemap.xml` with all published articles and tag pages
- **RSS feed** — `/feed.xml` for news aggregators
- **Open Graph / Twitter cards** — per-article metadata with cover images
- **Canonical URLs** — prevent duplicate content
- **robots.txt** — allow all public pages, disallow admin

### Content SEO

- Article slugs: `/reviews/nazvaniye-filma-2026-retsenziya`
- Tag pages act as topic hubs: `/tag/kristofer-nolan` aggregates all Nolan content
- Internal linking via tags creates SEO-friendly content clusters
- Russian-language meta descriptions and titles by default

---

## 11. Localization

### Russian-First, i18n-Ready

- All UI strings in a locale file (`locales/ru.json`, `locales/en.json`)
- Next.js i18n routing: `/` = Russian, `/en/` = English (future)
- Date formatting: `Intl.DateTimeFormat('ru-RU', ...)`
- TMDB data fetched with `language=ru-RU` parameter
- URL slugs always transliterated Russian → Latin (`транслитерация`)

### Transliteration Rules

For slug generation from Russian titles:
```
А→a Б→b В→v Г→g Д→d Е→e Ё→yo Ж→zh З→z И→i Й→y К→k Л→l М→m
Н→n О→o П→p Р→r С→s Т→t У→u Ф→f Х→kh Ц→ts Ч→ch Ш→sh Щ→shch
Ъ→(skip) Ы→y Ь→(skip) Э→e Ю→yu Я→ya
```

---

## 12. Video Embeds

Supported providers (considering Russian availability):

| Provider | Availability in Russia | Priority |
|----------|----------------------|----------|
| **VK Video** | Full access | Primary |
| **Rutube** | Full access | Secondary |
| **YouTube** | Accessible (not blocked as of 2025, but slow for some ISPs) | Tertiary |

Embed blocks use lazy-loaded iframes with thumbnail placeholders (click-to-load pattern for performance).

---

## 13. Performance

### Targets

- **LCP**: < 2.5s (article pages)
- **FID**: < 100ms
- **CLS**: < 0.1

### Strategy

- **ISR** for all content pages (no SSR on every request)
- **Image optimization**: `next/image` with Yandex S3 as external loader, WebP/AVIF
- **Font loading**: `next/font` with subset Russian + Latin glyphs
- **Code splitting**: automatic via Next.js App Router
- **TMDB data pre-cached** — no runtime API dependency for readers

---

## 14. Deployment

### Yandex Cloud (Primary)

```
Docker container:
  - Next.js standalone build
  - Node.js 20 runtime
  - Environment variables from Yandex Lockbox

Services:
  - Yandex Serverless Containers (or Compute VM)
  - Yandex S3 (image storage)
  - External Supabase (PostgreSQL)
  - Redis (Yandex Managed Redis) — optional, for session/cache
```

### Vercel (Fallback + TMDB Proxy)

```
Vercel project:
  - Next.js native deployment
  - Serverless functions for TMDB proxy
  - Cron jobs for TMDB batch sync
  - Environment: same Supabase DB, Yandex S3 storage
```

**Dual-deploy strategy:**
- Domain `cinefiles.ru` (or chosen domain) → Yandex Cloud
- `cinefiles.vercel.app` → Vercel (fallback, also hosts TMDB proxy)
- TMDB proxy is always on Vercel regardless of which deployment serves the site

### Cron Jobs

| Job | Platform | Schedule | Purpose |
|-----|----------|----------|---------|
| TMDB trending sync | Vercel | `0 0 * * *` (daily) | Cache trending movies/shows |
| TMDB cache cleanup | Vercel | `0 3 * * *` (daily) | Remove expired cache entries |
| Sitemap regeneration | Both | `0 6 * * *` (daily) | Rebuild sitemap.xml |
| Token cleanup | Both | `0 5 * * *` (daily) | Remove expired auth tokens |

---

## 15. Project Structure

```
cinefiles/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout (theme, fonts, analytics)
│   ├── page.tsx                  # Home page
│   ├── (public)/                 # Public route group
│   │   ├── [category]/
│   │   │   └── [slug]/
│   │   │       └── page.tsx      # Article detail
│   │   ├── tags/
│   │   │   └── page.tsx          # All tags
│   │   ├── tag/
│   │   │   └── [slug]/
│   │   │       └── page.tsx      # Tag page
│   │   ├── author/
│   │   │   └── [id]/
│   │   │       └── page.tsx      # Author page
│   │   ├── collections/
│   │   │   └── page.tsx
│   │   ├── collection/
│   │   │   └── [slug]/
│   │   │       └── page.tsx
│   │   ├── search/
│   │   │   └── page.tsx
│   │   ├── about/
│   │   │   └── page.tsx
│   │   └── legal/
│   │       └── page.tsx
│   ├── (admin)/                  # Admin route group (protected)
│   │   ├── layout.tsx            # Admin layout (sidebar nav)
│   │   ├── dashboard/
│   │   │   └── page.tsx
│   │   ├── articles/
│   │   │   ├── page.tsx          # Article list
│   │   │   ├── new/
│   │   │   │   └── page.tsx      # New article
│   │   │   └── [id]/
│   │   │       └── edit/
│   │   │           └── page.tsx  # Edit article
│   │   ├── tags/
│   │   │   └── page.tsx
│   │   ├── media/
│   │   │   └── page.tsx
│   │   ├── comments/
│   │   │   └── page.tsx
│   │   ├── collections/
│   │   │   └── page.tsx
│   │   ├── users/
│   │   │   └── page.tsx
│   │   └── settings/
│   │       └── page.tsx
│   └── api/                      # API routes
│       ├── articles/
│       ├── tags/
│       ├── comments/
│       ├── search/
│       ├── media/
│       ├── tmdb/                 # TMDB proxy (Vercel-only)
│       ├── auth/
│       │   ├── yandex/
│       │   ├── vk/
│       │   └── telegram/
│       ├── tribute/              # TR-BUTE integration
│       └── cron/
├── components/                   # React components
│   ├── ui/                       # Generic UI (Button, Modal, Toast, etc.)
│   ├── article/                  # ArticleCard, ArticleBody, ArticleMeta
│   ├── editor/                   # Block editor components
│   ├── tags/                     # TagChip, TagCloud, TMDBSearch
│   ├── comments/                 # CommentThread, CommentForm
│   ├── layout/                   # Header, Footer, Sidebar
│   └── tribute/                  # TributeProductCard, TributeSection
├── lib/                          # Server-side utilities
│   ├── config.ts                 # Environment variables (mirrors TR-BUTE pattern)
│   ├── db.ts                     # Prisma client
│   ├── tmdb.ts                   # TMDB client + cache logic
│   ├── storage.ts                # Yandex S3 operations
│   ├── auth.ts                   # JWT + OAuth helpers
│   ├── tribute-api.ts            # TR-BUTE API client
│   └── transliterate.ts          # Russian → Latin slug generation
├── prisma/
│   ├── schema.prisma             # Database schema
│   └── seed.ts                   # Initial categories, settings
├── styles/
│   ├── globals.css               # CSS variables, theme, reset
│   └── components/               # CSS Modules
├── locales/
│   ├── ru.json                   # Russian strings
│   └── en.json                   # English strings (future)
├── public/
│   ├── fonts/
│   └── icons/
├── docker/
│   └── Dockerfile                # Yandex Cloud deployment
├── docs/
│   ├── INTEGRATION.md            # TR-BUTE integration details
│   ├── ENV_VARS.md               # Environment variables
│   └── PATTERNS.md               # Conventions from TR-BUTE
├── .env.example
├── next.config.js
├── tsconfig.json
├── package.json
├── vercel.json
├── CLAUDE.md                     # Claude instructions for this project
└── README.md
```

---

## 16. Development Phases

### Phase 1: Foundation (Week 1-2)
- Next.js project setup with TypeScript
- Database schema (Prisma) + Supabase project
- Auth system (Yandex OAuth first)
- Basic layout (header, footer, theme toggle)
- CSS variables and global styles
- Config/env management

### Phase 2: Content System (Week 3-4)
- Article CRUD API
- Block-based content editor (admin)
- Article rendering (public)
- Image upload to Yandex S3
- Category and listing pages
- Basic SEO (meta tags, structured data)

### Phase 3: TMDB & Tagging (Week 5-6)
- TMDB proxy on Vercel
- TMDB cache layer in Supabase
- Tag system with TMDB autocomplete
- Tag pages (movies, people, topics)
- Article ↔ tag relationships
- TMDB batch sync cron

### Phase 4: TR-BUTE Integration (Week 7)
- TR-BUTE API endpoints (on TR-BUTE side)
- Product card component in CineFiles
- `tribute_products` content block
- "Related Articles" on TR-BUTE product pages
- Cross-site user linking

### Phase 5: Comments & Community (Week 8)
- Comment system with threading
- Moderation tools (admin)
- User profiles
- VK OAuth + Telegram Login Widget

### Phase 6: Polish & Launch (Week 9-10)
- Collections system
- Search (full-text)
- RSS feed
- Sitemap generation
- Performance optimization
- Yandex Cloud Docker deployment
- Vercel fallback deployment
- Final SEO audit

---

## 17. Future Development Strategy

### Monorepo Consideration

As both projects mature, consider migrating to a **Turborepo** monorepo:

```
tribute-platform/
├── apps/
│   ├── tribute/          # Current TR-BUTE
│   └── cinefiles/        # CineFiles
├── packages/
│   ├── shared-types/     # TypeScript interfaces for API contracts
│   ├── shared-ui/        # Shared React components (if TR-BUTE migrates to React)
│   └── shared-utils/     # Transliteration, date formatting, etc.
└── turbo.json
```

This is NOT needed for launch — it's a future consideration for when shared code becomes substantial.

### Cross-Project Development Workflow

For now (separate repos):

1. **API contract changes** — define in CineFiles `docs/INTEGRATION.md` AND TR-BUTE `docs/CINEFILES_INTEGRATION.md`
2. **Shared patterns** — document in CineFiles `docs/PATTERNS.md` (references TR-BUTE conventions)
3. **Breaking changes** — when TR-BUTE changes an API that CineFiles consumes, update both docs
4. **Feature branches** — each repo has its own branches; coordinate via matching ticket/issue IDs

### Integration Testing

- CineFiles has a `lib/tribute-api.ts` with mock mode for development
- TR-BUTE has corresponding mock for CineFiles API
- Integration tests run against staging URLs of both projects

---

## 18. Environment Variables (CineFiles)

```bash
# ============================================================
# Core
# ============================================================
NODE_ENV=production
APP_URL=https://cinefiles.ru
DATABASE_URL=postgresql://...                  # Supabase connection string
JWT_SECRET=...
SESSION_SECRET=...

# ============================================================
# Auth — Yandex OAuth
# ============================================================
YANDEX_CLIENT_ID=...
YANDEX_CLIENT_SECRET=...

# ============================================================
# Auth — VK ID
# ============================================================
VK_CLIENT_ID=...
VK_CLIENT_SECRET=...

# ============================================================
# Auth — Telegram Login Widget
# ============================================================
TELEGRAM_BOT_TOKEN=...                         # For login widget hash verification

# ============================================================
# Storage — Yandex S3
# ============================================================
YANDEX_S3_ENDPOINT=https://storage.yandexcloud.net
YANDEX_S3_REGION=ru-central1
YANDEX_S3_BUCKET=cinefiles-media
YANDEX_S3_ACCESS_KEY=...
YANDEX_S3_SECRET_KEY=...

# ============================================================
# TMDB Proxy
# ============================================================
TMDB_API_KEY=...                               # For Vercel proxy function
TMDB_PROXY_URL=https://cinefiles.vercel.app/api/tmdb  # Called from Yandex Cloud
TMDB_PROXY_SECRET=...                          # Shared secret for proxy auth

# ============================================================
# TR-BUTE Integration
# ============================================================
TRIBUTE_API_URL=https://buy-tribute.com/api    # TR-BUTE API base URL
TRIBUTE_API_KEY=...                            # API key for cross-site calls

# ============================================================
# Redis (Optional)
# ============================================================
REDIS_URL=...

# ============================================================
# Email (Yandex Postbox — for notifications)
# ============================================================
POSTBOX_API_KEY_ID=...
POSTBOX_API_KEY_SECRET=...
NOTIFICATION_FROM_EMAIL=noreply@cinefiles.ru
```

---

## 19. Security

### CSP Headers

```javascript
// next.config.js headers
{
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",  // Next.js requires unsafe-eval in dev
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://storage.yandexcloud.net https://*.userapi.com",
    "media-src 'self' https://storage.yandexcloud.net",
    "frame-src https://www.youtube.com https://vk.com https://rutube.ru",
    "connect-src 'self' https://api.themoviedb.org https://*.supabase.co https://buy-tribute.com",
    "font-src 'self'",
  ].join('; ')
}
```

### Additional Security
- CSRF protection via Next.js built-in double-submit cookie
- Rate limiting on API routes (especially auth and comments)
- Input sanitization for comments (DOMPurify on render)
- Admin routes protected by middleware role check
- TMDB proxy protected by shared secret header
- Image uploads: type validation, max size (5MB), virus scan (optional)

---

## 20. Monitoring & Analytics

### Self-Hosted (Privacy-First)

- **Yandex Metrica** — Russian-compliant analytics, heatmaps, session replay
- **Error tracking** — Sentry (self-hosted or cloud) for runtime errors
- **Uptime** — Yandex Cloud monitoring for health checks

No Google Analytics (unnecessary for Russian audience, GDPR/privacy concerns).
