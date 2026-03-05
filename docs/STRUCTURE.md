# CineFiles — Project Structure

## Directory Layout

```
cine-files/
├── app/                              # Next.js App Router
│   ├── layout.tsx                    # Root layout (Header/Footer/BottomNav, theme script)
│   ├── page.tsx                      # Home page
│   ├── sitemap.ts                    # Dynamic XML sitemap
│   ├── robots.ts                     # robots.txt generation
│   │
│   ├── (public)/                     # Public pages (route group — no URL segment)
│   │   ├── [category]/
│   │   │   ├── page.tsx              # Category article listing (paginated)
│   │   │   └── [slug]/page.tsx       # Article detail page
│   │   ├── tag/[slug]/page.tsx       # Tag detail (articles + TMDB overview)
│   │   ├── tags/page.tsx             # All tags grouped by type
│   │   ├── author/[id]/page.tsx      # Author profile + published articles
│   │   ├── collections/page.tsx      # Collections listing
│   │   ├── collection/[slug]/page.tsx# Collection detail (article grid)
│   │   ├── search/page.tsx           # Search results (articles + tags)
│   │   ├── about/page.tsx            # About page
│   │   └── legal/page.tsx            # Legal/privacy
│   │
│   ├── admin/                        # Admin panel (direct segment, NOT route group)
│   │   ├── layout.tsx                # Admin layout with sidebar + JWT verification
│   │   ├── dashboard/page.tsx        # Dashboard overview
│   │   ├── articles/
│   │   │   ├── page.tsx              # Article list with status filters
│   │   │   ├── new/page.tsx          # Create article
│   │   │   └── [id]/edit/page.tsx    # Edit article
│   │   ├── tags/page.tsx             # Tag management + TMDB search
│   │   ├── media/page.tsx            # Media library
│   │   ├── comments/page.tsx         # Comment moderation
│   │   ├── collections/page.tsx      # Collection management
│   │   ├── users/page.tsx            # User management
│   │   └── settings/page.tsx         # Site settings
│   │
│   └── api/                          # API routes
│       ├── auth/yandex/route.ts      # Yandex OAuth entry
│       ├── articles/
│       │   ├── route.ts              # GET list / POST create
│       │   ├── [id]/route.ts         # GET / PUT / DELETE by ID or slug
│       │   └── related/route.ts      # Related articles (by product/tag)
│       ├── tags/
│       │   ├── route.ts              # GET list / POST create
│       │   └── [id]/route.ts         # GET / PUT / DELETE
│       ├── comments/
│       │   ├── route.ts              # GET list / POST create
│       │   └── [id]/route.ts         # PUT edit / DELETE
│       ├── admin/comments/[id]/moderate/route.ts  # Admin moderation
│       ├── categories/route.ts       # GET categories with counts
│       ├── media/upload/route.ts     # POST image upload (S3)
│       ├── search/route.ts           # GET full-text search
│       ├── tmdb/
│       │   ├── [...path]/route.ts    # TMDB proxy (geo-bypass)
│       │   └── search/route.ts       # TMDB autocomplete (admin)
│       ├── cron/
│       │   ├── tmdb-sync/route.ts    # Daily TMDB entity refresh
│       │   ├── tmdb-cleanup/route.ts # Daily cache expiry cleanup
│       │   └── token-cleanup/route.ts# Daily expired token removal
│       └── feed/rss.xml/route.ts     # RSS feed
│
├── components/
│   ├── layout/                       # Header, Footer, BottomNav, ThemeToggle
│   ├── article/                      # ArticleBody, ArticleCard, ArticleMeta
│   ├── editor/                       # BlockEditor (admin content editor)
│   ├── comments/                     # CommentList, CommentItem, CommentForm
│   └── tribute/                      # TributeProductsBlock, ProductCard
│
├── lib/                              # Server-side utilities
│   ├── auth.ts                       # JWT sign/verify, session helpers
│   ├── api-utils.ts                  # requireAuth/requireEditor/requireAdmin guards
│   ├── config.ts                     # Environment variable parsing
│   ├── db.ts                         # Prisma singleton
│   ├── tmdb.ts                       # TMDB API + caching + entity sync
│   ├── storage.ts                    # Yandex S3 upload (AWS4-HMAC-SHA256)
│   ├── transliterate.ts              # Russian → Latin slug generation
│   ├── tribute-api.ts               # TR-BUTE API integration
│   └── types.ts                      # Shared TypeScript types
│
├── styles/
│   ├── globals.css                   # CSS variables (dark/light), reset, animations
│   ├── pages/                        # Page-level CSS modules
│   └── components/                   # Component-level CSS modules
│
├── locales/
│   ├── ru.json                       # Russian strings (primary)
│   └── en.json                       # English strings (fallback)
│
├── prisma/
│   ├── schema.prisma                 # Database schema (12 models)
│   └── seed.ts                       # Seeding script
│
├── public/
│   ├── fonts/                        # Montserrat WOFF2 (locally hosted)
│   └── icons/                        # PNG icons
│
├── docker/Dockerfile                 # Multi-stage production build
├── middleware.ts                      # Admin route protection
├── next.config.js                    # Image patterns, security headers, CSP
├── vercel.json                       # Vercel config + cron schedules
├── tsconfig.json                     # TypeScript strict mode
└── package.json                      # Dependencies
```

## Key Architecture Decisions

### Admin uses `/admin/` segment, NOT `(admin)` route group
This prevents path conflicts with dynamic `[category]` routes in `(public)/`. A route group `(admin)` would still produce `/admin/...` URLs that collide with catch-all category slugs.

### `(public)` route group for shared layout
All public pages share the same layout (Header/Footer/BottomNav) without adding a URL segment.

### Server components by default
All pages and most components are React Server Components. Only interactive components (comments, editor, theme toggle) use `'use client'`.

### Block-based content model
Articles store content as a JSON array of typed blocks (`paragraph`, `heading`, `image`, `quote`, `list`, `embed`, `divider`, `spoiler`, `infobox`, `tribute_products`, `movie_card`). This allows rich, flexible layouts without a traditional WYSIWYG editor.
