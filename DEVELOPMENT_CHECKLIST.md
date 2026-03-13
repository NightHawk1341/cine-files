# Development Checklist

Run through this checklist before submitting any changes.

## Before Writing Code
- [ ] Read `CLAUDE.md` and relevant docs in `docs/`
- [ ] Understand the existing code you are modifying
- [ ] Check if a shared UI component in `components/ui/` already solves the need

## CSS & Styling
- [ ] No hardcoded colors — all colors use CSS variables from `styles/globals.css`
- [ ] New CSS variables match TR-BUTE naming convention
- [ ] Light theme overrides added for any new dark-theme variables
- [ ] Interactive elements have `.active` + `.active:hover` states
- [ ] New styles placed in correct directory (`styles/pages/` or `styles/components/`)
- [ ] CSS Module selectors are pure (contain at least one local class)

## Components
- [ ] Client components have `'use client'` directive
- [ ] Server components do NOT have `'use client'` directive
- [ ] Props are typed with TypeScript interfaces
- [ ] No inline styles — use CSS Modules or global utility classes
- [ ] Hydration-safe patterns used (check mounted state before client-only features)

## Content & Localization
- [ ] User-facing strings added to `locales/ru.json`
- [ ] No emojis in code or UI
- [ ] No AI-sounding comments

## Security
- [ ] New image sources added to `images.remotePatterns` in `next.config.js`
- [ ] New embed providers added to CSP `frame-src` with `// csp=YYYYMM` comment
- [ ] API routes use appropriate auth guards (`requireAuth`, `requireEditor`, `requireAdmin`)
- [ ] No secrets in client-side code

## Before Completing
- [ ] Run `npm run check` (build + lint)
- [ ] Test in both dark and light themes
- [ ] Test on mobile viewport (bottom-nav visible, touch interactions work)
- [ ] Comment counts and denormalized fields updated if modifying comments/articles
