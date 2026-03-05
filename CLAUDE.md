# CineFiles — Claude Instructions

## Project Overview
CineFiles is a cinema/entertainment news and review site. Russian-language primary, i18n-ready.

## Tech Stack
- **Framework**: Next.js 14+ (App Router), TypeScript strict mode
- **Database**: PostgreSQL (Supabase) via Prisma ORM
- **Styling**: CSS Modules + CSS Variables (dark/light themes)
- **Auth**: Yandex OAuth (primary), VK ID, Telegram Login Widget
- **Storage**: Yandex S3 for images
- **Deployment**: Yandex Cloud (Docker) primary, Vercel fallback

## Key Conventions
- **Never hardcode colors** — always use CSS variables from `styles/globals.css`
- **Font loading**: Montserrat from `/fonts/`, never Google Fonts
- **Skeleton loading**: use `--skeleton-bg-base` and `--skeleton-bg-highlight`
- **Shadows**: use `--shadow-sm`, `--shadow-md`, `--shadow-lg`
- **All interactive elements** need `.active` + `.active:hover` states
- **Russian-first UI** — all strings in `locales/ru.json`
- **Slug generation**: Russian → Latin transliteration via `lib/transliterate.ts`

## Commands
- `npm run dev` — development server
- `npm run build` — production build
- `npm run lint` — ESLint
- `npx prisma db push` — sync schema to DB
- `npx prisma generate` — generate Prisma client
- `npx prisma migrate dev` — create migration

## Project Structure
- `app/` — Next.js App Router pages and API routes
- `app/(public)/` — public pages
- `app/admin/` — admin panel (protected)
- `components/` — React components
- `lib/` — server-side utilities (auth, db, tmdb, storage, config)
- `styles/` — CSS globals and modules
- `locales/` — i18n string files
- `prisma/` — database schema and seeds

## CSS Variable Naming
Same variable names as TR-BUTE (sister project). Only values differ.

## Progress
- **Phase 1: Foundation** — COMPLETE
  - Next.js 14 + TypeScript strict, Prisma schema (12 tables), CSS variables (dark/light),
    layout components (Header/Footer/BottomNav/ThemeToggle), lib utilities (auth, db, tmdb,
    storage, transliterate, config, tribute-api, types), localization (ru/en), all public
    and admin page stubs, API routes, middleware, Dockerfile, vercel.json, robots/sitemap
  - Note: Admin uses `/admin/` segment (not route group) to avoid path conflicts
- **Phase 2: Content System** — IN PROGRESS
