# Plan: Remove TypeScript + Prisma, switch to JS + raw pg

Align CineFiles with TR-BUTE's architecture: plain JavaScript, raw PostgreSQL
via `pg` driver, no ORM, manual migrations.

**Note:** We keep Next.js App Router (it supports `.js`/`.jsx` natively). The
conversion targets the language and database layer, not the framework.

---

## File inventory

- **81 total `.ts`/`.tsx` files** to convert (excluding `.next/` build output)
- **~31 files** with direct Prisma usage (imports `prisma` from `@/lib/db`)
- **~50 files** that are pure TS (type annotations, interfaces) but no Prisma

---

## Phase 1: Database layer — replace Prisma with pg pool

**What changes:**
- Delete `prisma/schema.prisma`
- Rewrite `lib/db.ts` → `lib/db.js`: export a `getPool()` singleton using
  `new Pool({ connectionString: process.env.DATABASE_URL })`
- Add `pg` to dependencies, remove `@prisma/client` and `prisma`
- Verify `SQL_SCHEMA.sql` is up to date as the schema reference
- Rewrite `prisma/seed.ts` → `scripts/seed.js` using raw SQL

**Files:** 3 (lib/db, prisma/schema, seed)

## Phase 2: Convert lib/ files (TS → JS, Prisma → SQL)

**Files and changes:**

| File | Prisma? | Changes |
|------|---------|---------|
| `lib/db.ts` → `lib/db.js` | Yes | Complete rewrite (Pool singleton) |
| `lib/auth.ts` → `lib/auth.js` | Yes | `createSession`: INSERT INTO auth_tokens; `getCurrentUser`: SELECT FROM users |
| `lib/config.ts` → `lib/config.js` | No | Strip type annotation from `getEnvVar`, remove `as const` |
| `lib/api-utils.ts` → `lib/api-utils.js` | No | Strip types from `JwtPayload`, `AuthError`. Remove `interface` exports |
| `lib/types.ts` | N/A | **Delete entirely.** Block types become JSDoc `@typedef` in `lib/db.js` or inline |
| `lib/tmdb.ts` → `lib/tmdb.js` | Yes | `syncTmdbEntity`: INSERT/UPDATE tmdb_entities; cache: INSERT/SELECT tmdb_cache |
| `lib/transliterate.ts` → `lib/transliterate.js` | No | Strip type annotations only |
| `lib/storage.ts` → `lib/storage.js` | No | Strip type annotations only |
| `lib/tribute-api.ts` → `lib/tribute-api.js` | No | Strip types only |

**Files:** 9

## Phase 3: Convert API routes (19 files)

Each route file: rename `.ts` → `.js`, replace `prisma.model.method()` with
parameterized SQL, strip type annotations.

**Key SQL patterns needed:**

```
Prisma                          →  SQL
prisma.article.findMany()       →  SELECT ... FROM articles JOIN ... ORDER BY ... LIMIT $1 OFFSET $2
prisma.article.findFirst()      →  SELECT ... FROM articles WHERE slug = $1 LIMIT 1
prisma.article.findUnique()     →  SELECT ... FROM articles WHERE id = $1
prisma.article.create()         →  INSERT INTO articles (...) VALUES (...) RETURNING *
prisma.article.update()         →  UPDATE articles SET ... WHERE id = $1 RETURNING *
prisma.article.delete()         →  DELETE FROM articles WHERE id = $1
prisma.article.count()          →  SELECT COUNT(*) FROM articles WHERE ...
{ increment: 1 }               →  UPDATE articles SET view_count = view_count + 1
include: { tags: { include } }  →  Separate query or JOIN with JSON aggregation
```

**API route files:**

| File | Complexity |
|------|-----------|
| `app/api/articles/route.ts` | High — findMany with dynamic WHERE, includes, pagination, create with tags |
| `app/api/articles/[id]/route.ts` | High — GET/PUT/DELETE with ownership checks, tag replacement |
| `app/api/articles/related/route.ts` | Medium — findMany with OR conditions |
| `app/api/categories/route.ts` | Low — simple findMany |
| `app/api/tags/route.ts` | Medium — findMany/create with TMDB sync |
| `app/api/tags/[id]/route.ts` | Medium — CRUD |
| `app/api/comments/route.ts` | Medium — findMany/create, counter update |
| `app/api/comments/[id]/route.ts` | Medium — update/delete with counter |
| `app/api/admin/comments/[id]/moderate/route.ts` | Medium — status update with counter |
| `app/api/search/route.ts` | Medium — ILIKE search across articles + tags |
| `app/api/media/upload/route.ts` | Low — single INSERT after S3 upload |
| `app/api/auth/yandex/route.ts` | Low — OAuth redirect, user upsert |
| `app/api/auth/telegram/route.ts` | Low — redirect |
| `app/api/auth/telegram/callback/route.ts` | Medium — token verify, user upsert |
| `app/api/cron/token-cleanup/route.ts` | Low — DELETE expired tokens |
| `app/api/cron/tmdb-sync/route.ts` | Medium — batch sync |
| `app/api/cron/tmdb-cleanup/route.ts` | Low — DELETE expired cache |
| `app/api/tmdb/[...path]/route.ts` | None — proxy, no DB |
| `app/api/tmdb/search/route.ts` | None — proxy, no DB |
| `app/feed/rss.xml/route.ts` | Low — SELECT published articles |
| `app/sitemap.ts` → `.js` | Low — SELECT slugs |
| `app/robots.ts` → `.js` | None — static |

**Files:** ~22

## Phase 4: Convert page components (Server Components with Prisma)

These are React Server Components that call Prisma directly. Convert to
`pool.query()` with SQL.

| File | Prisma queries |
|------|---------------|
| `app/page.tsx` | findMany featured + recent articles |
| `app/(public)/[category]/page.tsx` | findUnique category, findMany articles, count |
| `app/(public)/[category]/[slug]/page.tsx` | findFirst article with includes, view increment |
| `app/(public)/tag/[slug]/page.tsx` | findUnique tag, findMany articles by tag |
| `app/(public)/tags/page.tsx` | findMany tags |
| `app/(public)/author/[id]/page.tsx` | findUnique user, findMany articles |
| `app/(public)/collection/[slug]/page.tsx` | findUnique collection with articles |
| `app/(public)/collections/page.tsx` | findMany collections |
| `app/(public)/search/page.tsx` | Likely client-side (calls API) |
| `app/(public)/about/page.tsx` | Likely static |
| `app/(public)/legal/page.tsx` | Likely static |
| `app/admin/layout.tsx` | Auth check |
| `app/admin/dashboard/page.tsx` | Counts/stats |
| `app/admin/articles/page.tsx` | findMany with filters |
| `app/admin/articles/new/page.tsx` | Likely client-side form |
| `app/admin/articles/[id]/edit/page.tsx` | findUnique for edit form |
| `app/admin/comments/page.tsx` | findMany comments |
| `app/admin/tags/page.tsx` | findMany tags |
| `app/admin/users/page.tsx` | findMany users |
| `app/admin/media/page.tsx` | findMany media |
| `app/admin/settings/page.tsx` | findMany app_settings |
| `app/admin/collections/page.tsx` | findMany collections |

**Files:** ~22

## Phase 5: Convert client components (no Prisma, just strip types)

These files have no database access. Just rename `.tsx` → `.jsx` and strip
TypeScript syntax (interfaces, type annotations, generics, `as` casts).

| Directory | Files | Notes |
|-----------|-------|-------|
| `components/article/` | 5 | ArticleBody, ArticleCard, ArticleMeta, ZoomableImage, index |
| `components/comments/` | 3 | CommentForm, CommentList, CommentItem |
| `components/editor/` | 1 | BlockEditor |
| `components/layout/` | 5 | Header, Footer, BottomNav, ThemeToggle, Providers |
| `components/tribute/` | 2 | ProductCard, TributeProductsBlock (RSC but no Prisma) |
| `components/ui/` | 8 | Toast, MobileModal, BottomSheet, ConfirmationModal, ImageZoom, ScrollToTop, Skeleton, Tooltip, index |
| `app/` root | 3 | layout, error, not-found |

**Files:** ~27

## Phase 6: Config and cleanup

- Delete `tsconfig.json`
- Create `jsconfig.json` with `{ "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["./*"] } } }`
- Update `package.json`:
  - Remove: `typescript`, `@types/node`, `@types/react`, `@types/react-dom`,
    `@types/jsonwebtoken`, `@types/bcryptjs`, `prisma`, `@prisma/client`, `tsx`
  - Add: `pg`
  - Update `db:seed` script to `node scripts/seed.js`
  - Remove `db:generate`, `db:push`, `db:migrate` scripts
  - Remove `postinstall: prisma generate`
- Delete `prisma/` directory entirely
- Delete `next-env.d.ts`
- Update `CLAUDE.md` to reflect new stack
- Update `docs/` references to Prisma

**Files:** ~8

---

## Execution order

Phases 1-2 first (foundation), then 3-4 together (routes + pages), then 5
(components — mechanical), then 6 (cleanup).

Within each phase, each file conversion is independent so multiple can be
done in parallel.

**Estimated scope:** ~81 file renames/rewrites. The heavy work is in phases
3-4 where Prisma queries become SQL (~44 files). Phase 5 is mechanical
type-stripping (~27 files).

---

## What stays the same

- Next.js App Router (framework)
- CSS Modules + CSS Variables (styling)
- All component logic and UI
- All business rules (auth, ownership, roles)
- Database schema (unchanged — same tables, same columns)
- `next.config.js` (already plain JS)
- All CSS files
- All locale files
- `SQL_SCHEMA.sql`

## Key risk: Server Components with SQL

Next.js Server Components currently call `prisma.article.findMany(...)`.
After conversion, they'll call `pool.query('SELECT ...')`. This works fine —
`pg` Pool is async and Server Components support `await`. The pattern is the
same as TR-BUTE's API handlers, just inside React Server Components instead
of Express routes.

Hot-reload in dev may create multiple Pool instances (same problem Prisma had).
The `getPool()` singleton pattern with `globalThis` caching handles this
identically to how the current Prisma singleton works.
