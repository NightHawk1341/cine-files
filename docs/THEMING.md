# CineFiles — Theming & CSS

## CSS Architecture

CineFiles uses **CSS Modules + CSS Variables** with dark/light theme support. No CSS-in-JS libraries.

## Theme Variables

All colors are defined in `styles/globals.css` as CSS custom properties. Variable names match the sister project TR-BUTE — only values differ.

### Core Variables

```css
/* Backgrounds */
--bg-primary          /* Main page background */
--bg-secondary        /* Card/section backgrounds */
--bg-tertiary         /* Nested/elevated backgrounds */
--bg-input            /* Form input backgrounds */

/* Text */
--text-primary        /* Main body text */
--text-secondary      /* Muted/supporting text */
--text-tertiary       /* Disabled/placeholder text */

/* Brand */
--brand-primary       /* Primary accent (links, buttons) */
--brand-hover         /* Hover state for brand elements */

/* Borders */
--border-primary      /* Main borders */
--border-secondary    /* Subtle dividers */

/* Shadows */
--shadow-sm           /* Subtle elevation */
--shadow-md           /* Cards, dropdowns */
--shadow-lg           /* Modals, popovers */

/* Skeleton loading */
--skeleton-bg-base    /* Skeleton placeholder base */
--skeleton-bg-highlight  /* Skeleton shimmer highlight */
```

### Dark Theme (Default)
- Background: `#0d0d0d` (near-black)
- Text: `#E0E0E0` (light gray)
- Brand: `#4a90d9` (blue accent)
- Borders: `rgba(65, 65, 65, 0.5)`

### Light Theme
- Background: `#f2ede4` (warm beige)
- Text: `#1c160e` (dark brown)
- Brand: `#2d6ab5` (darker blue)
- Borders: `rgba(80, 60, 30, 0.15)`

## Rules

1. **NEVER hardcode colors** — always reference CSS variables
2. **Font**: Montserrat loaded from `/fonts/` (WOFF2), NEVER Google Fonts
3. **Shadows**: use `--shadow-sm`, `--shadow-md`, `--shadow-lg` only
4. **Skeleton loaders**: use `--skeleton-bg-base` and `--skeleton-bg-highlight`
5. **Interactive elements**: must have `.active` + `.active:hover` states
6. **Transitions**: theme changes use `--theme-transition` (disabled on page load to prevent FOUC)
7. **Grain overlay**: a subtle texture animation is applied globally for visual depth

## Theme Toggle

`ThemeToggle.tsx` reads/writes `localStorage('theme')` and sets `data-theme` attribute on `<html>`. The root layout includes an inline script to prevent FOUC by applying the theme before paint.

## CSS Module Conventions

- Page styles: `styles/pages/{page-name}.module.css`
- Component styles: `styles/components/{component-name}.module.css`
- Editor styles: `styles/components/editor/blocks.module.css`

## Responsive Breakpoints

- Mobile: default (font-size 18px)
- Desktop: `@media (min-width: 768px)` (font-size 16px)
- Custom scrollbar styling on desktop
- `BottomNav` visible only on mobile
