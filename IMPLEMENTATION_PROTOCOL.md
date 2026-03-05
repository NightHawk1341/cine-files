# CineFiles — Implementation Protocol

## Before Starting Any Task

1. **Read relevant files first** — never modify code you haven't read
2. **Check `CLAUDE.md`** for conventions and gotchas
3. **Check `docs/`** for system-specific documentation
4. **Understand the block-based content model** if touching articles
5. **Understand the role system** if touching auth or API routes

## Code Style

### TypeScript
- Strict mode enabled — no `any` types unless absolutely necessary
- Use Prisma-generated types for database models
- Shared types live in `lib/types.ts`
- Prefer `interface` over `type` for object shapes

### React Components
- **Server Components by default** — only add `'use client'` when needed (event handlers, hooks, browser APIs)
- Page components are always Server Components
- Interactive components (forms, toggles, editors) are Client Components
- Use CSS Modules for styling — one module per component

### API Routes
- Use Next.js App Router route handlers (`route.ts`)
- Always validate auth with appropriate guard (`requireAuth`/`requireEditor`/`requireAdmin`)
- Return proper HTTP status codes (200, 201, 400, 401, 403, 404, 500)
- Return JSON responses with consistent shape: `{ data }` or `{ error: string }`
- Cap pagination limits to prevent abuse

### CSS
- **Never hardcode colors** — use CSS variables from `styles/globals.css`
- **Never use Google Fonts** — Montserrat is locally hosted
- Use `--shadow-sm/md/lg` for elevation
- Use `--skeleton-bg-base/highlight` for loading states
- All interactive elements need `.active` + `.active:hover` states
- Page styles: `styles/pages/{name}.module.css`
- Component styles: `styles/components/{name}.module.css`

## Adding New Features

### New Page
1. Determine if public or admin
2. Public: add under `app/(public)/` (route group)
3. Admin: add under `app/admin/` (direct segment)
4. Create corresponding CSS module in `styles/pages/`
5. Add Russian strings to `locales/ru.json`
6. If public, add URL to `app/sitemap.ts`

### New API Endpoint
1. Create route at `app/api/{resource}/route.ts`
2. Add appropriate auth guard
3. Validate all inputs
4. Use Prisma for database operations
5. Return consistent JSON shape
6. Update denormalized counts if applicable

### New Component
1. Create in appropriate `components/` subdirectory
2. Create CSS module in `styles/components/`
3. Use CSS variables for all colors
4. Add loading/skeleton states where appropriate
5. Ensure responsive design (mobile-first)

### New Content Block Type
1. Add type definition in `lib/types.ts`
2. Add rendering logic in `components/article/ArticleBody.tsx`
3. Add editing UI in `components/editor/BlockEditor.tsx`
4. If server-side data needed, use `customBlocks` injection pattern

### New Database Model
1. Add model to `prisma/schema.prisma`
2. Run `npx prisma migrate dev` to create migration
3. Run `npx prisma generate` to update client
4. Document in `docs/DATABASE.md`

### New Cron Job
1. Create route at `app/api/cron/{job-name}/route.ts`
2. Validate `Authorization: Bearer {CRON_SECRET}`
3. Add to `vercel.json` crons array
4. Document in `docs/CRON_JOBS.md`

### New OAuth Provider
1. Add OAuth IDs to User model in Prisma schema
2. Create auth route at `app/api/auth/{provider}/route.ts`
3. Add env vars to `lib/config.ts`
4. Document in `docs/AUTH_SYSTEM.md` and `docs/ENV_VARS.md`

### New Embed Provider
1. Add iframe rendering in `ArticleBody.tsx` embed block handler
2. Update CSP `frame-src` in `next.config.js`
3. Document the addition

### New Image Source
1. Add domain to `images.remotePatterns` in `next.config.js`
2. Update CSP `img-src` if needed

## Testing Changes

### Before Committing
1. Run `npm run lint` — fix all ESLint errors
2. Run `npm run build` — ensure production build succeeds
3. Test dark and light themes if UI changes
4. Test mobile responsive if layout changes
5. Verify Russian strings are in `locales/ru.json`

### API Changes
1. Test all CRUD operations
2. Test auth guards (unauthenticated, wrong role, correct role)
3. Test pagination and filtering
4. Test error cases (missing fields, invalid IDs, duplicates)

### Database Changes
1. Run `npx prisma migrate dev` — verify migration is clean
2. Check for cascade effects on related models
3. Update seed script if needed

## Deployment Checklist

1. All env vars set in target environment
2. `npx prisma migrate deploy` run against production DB
3. Docker: `DOCKER_BUILD=true` set during build
4. Vercel: cron schedules in `vercel.json` are correct
5. Security headers in `next.config.js` are intact
6. CSP allows all required external resources

## File Organization Rules

| What | Where |
|------|-------|
| Pages | `app/(public)/` or `app/admin/` |
| API routes | `app/api/` |
| React components | `components/{category}/` |
| Server utilities | `lib/` |
| Page CSS modules | `styles/pages/` |
| Component CSS modules | `styles/components/` |
| Russian strings | `locales/ru.json` |
| Database schema | `prisma/schema.prisma` |
| Documentation | `docs/` |
