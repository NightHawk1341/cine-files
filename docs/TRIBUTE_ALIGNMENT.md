# TR-BUTE ↔ CineFiles Alignment Plan

This document catalogs every difference between CineFiles and TR-BUTE that must be resolved to achieve code parity. Organized by priority and effort.

## Implementation Progress

| Phase | Description | Status |
|---|---|---|
| 1 | CSS Variables + Globals | COMPLETE |
| 2 | Header Overhaul | COMPLETE |
| 3 | Bottom Nav Alignment | COMPLETE |
| 4 | Footer Alignment | COMPLETE |
| 5 | Shared UI Components | PENDING |
| 6 | Dev Process & Docs | PENDING |

### Build Fix Applied
- Removed duplicate `:global(.footer)` rule from `bottom-nav.module.css` — CSS Modules require at least one local class in selectors. The footer padding rule already exists correctly in `footer.module.css` (line 131-135) using the local `.footer` class.

### Phase 1 Changes Applied
- Dark theme backgrounds aligned: `#121212`, `#1e1e1e`, `#2b2b2b`, `#3a3a3a`
- `--text-inverse` and `--removing-overlay-bg` updated to match new bg-primary
- `--bg-overlay` opacity adjusted from 0.85 to 0.8
- `--bottom-nav-height` changed from clamp to fixed `76px`
- Added 30+ missing CSS variables: icon-scale, page-padding-*, brand aliases, product-card-*, filter-btn-*, type-btn-*, reset-btn-*, gift-btn-*, filter-group-*, filter-pill-*, dropdown-accent-*, format-dropdown-bg, telegram-color, yandex-color
- `--active-page-color` changed from `var(--brand-primary)` to independent value `#4a90d9`
- Added `html { touch-action: manipulation }` and `svg { fill: currentColor }`
- Added `body.sheet-open` state for bottom sheets
- Added `.btn-icon`, `.btn-filter`, `.btn-favorite` global utility classes
- Added complete toast notification CSS (container, variants, animations)
- Added z-index organization comment block
- Added mobile page spacing via `--page-padding-top-mobile`
- All light theme overrides completed for new variables

---

## 1. CLAUDE.md & Development Rules

### What TR-BUTE has that CineFiles lacks

| TR-BUTE Rule | CineFiles Status | Action |
|---|---|---|
| `.claude/README.md` with implementation protocols | Missing entirely | Create `.claude/` dir with equivalent protocols |
| `DEVELOPMENT_CHECKLIST.md` at repo root | Missing | Create adapted version |
| "Never use emojis in code or UI" | Not stated | Add to CLAUDE.md |
| "Don't write AI-sounding comments" | Not stated | Add to CLAUDE.md |
| "Active elements need `.active` + `.active:hover` states" | Mentioned but not enforced | Add enforcement language |
| "Hardcoded colors break light theme" warning | Mentioned | Keep |
| "Run `npm run check:claude` before completing any task" | No validation scripts exist | Create lint/validation scripts |
| "Conditional visibility/styling must be documented" | No `CONDITIONAL_VISIBILITY.md` | Create if applicable |
| "New external services need CSP entries" with `// csp=YYYYMM` comments | Not practiced | Add convention |
| "Dropdowns must scroll into view when opened" | Not addressed | Add convention |
| Detailed SPA lifecycle docs | N/A (Next.js handles this) | Skip — architectural difference |
| Route registration rules | N/A (Next.js file-based routing) | Skip — architectural difference |
| Page-specific DOM cleanup rules | N/A (React handles this) | Skip — architectural difference |

### CLAUDE.md Structure Differences

TR-BUTE's CLAUDE.md starts with **"Required Reading Before Any Implementation"** — a list of docs to read before touching code. CineFiles should adopt this pattern.

TR-BUTE has a **"Key Gotchas"** section with 25+ items. CineFiles has 11. The following gotchas from TR-BUTE should be ported (adapted for Next.js):

- Never use emojis
- Don't write AI-sounding comments
- Active elements need active+hover states
- Hardcoded colors break light theme
- New external services need CSP entries
- Dropdowns must scroll into view when opened
- MutationObserver/ResizeObserver must not modify their own observed target
- Image process changes require doc update

---

## 2. CSS Variables — Dark Theme

### Variables that MATCH (same name, same or intentionally different value)

These are correctly aligned — variable **names** match, **values** differ by design (brand identity):

| Variable | TR-BUTE | CineFiles | Status |
|---|---|---|---|
| `--header-height` | `clamp(3.25rem, 3rem + 1vw, 3.75rem)` | Same | OK |
| `--footer-height` | `auto` | Same | OK |
| `--font-size-mobile` | `18px` | Same | OK |
| `--font-size-desktop` | `16px` | Same | OK |
| `--heading-mobile` | `24px` | Same | OK |
| `--heading-desktop` | `32px` | Same | OK |
| `--page-title-size` | `20px` | Same | OK |
| `--page-title-size-mobile` | `18px` | Same | OK |
| `--bg-primary-t` | `rgba(18, 18, 18, 0)` | `rgba(13, 13, 13, 0)` | OK (derived from bg-primary) |
| `--text-primary` | `#E0E0E0` | Same | OK |
| `--text-secondary` | `#a3a3a3` | Same | OK |
| `--text-tertiary` | `#818181` | Same | OK |
| `--border-color` | `rgba(65, 65, 65, 0.5)` | Same | OK |
| `--border-hover` | `rgba(143, 143, 143, 0.5)` | Same | OK |
| `--divider` | `rgba(65, 65, 65, 0.3)` | Same | OK |
| All `--status-*` colors | Match | Match | OK |
| `--link-color` | `#66b3db` | Same | OK |
| `--link-hover` | `#8ec8e8` | Same | OK |
| `--favorite-color` | `#e91e63` | Same | OK |
| `--shadow-color` | `rgba(0, 0, 0, 0.3)` | Same | OK |
| `--shadow-sm/md/lg` | Match | Match | OK |
| `--modal-popup-shadow` | Match | Match | OK |
| `--skeleton-bg-base/highlight` | Match | Match | OK |
| `--glass-bg/border` | Match | Match | OK |
| `--card-*` variables | Match | Match | OK |
| `--tab-*` variables | Similar (differ in color) | Intentional | OK |
| `--indicator-*` | Match | Match | OK |
| `--neutral-btn-*` | Match | Match | OK |
| `--grain-opacity` | `0.12` | Same | OK |

### Variables MISSING from CineFiles (must add)

| Variable | TR-BUTE Value | Purpose |
|---|---|---|
| `--bottom-nav-height` (fixed) | `76px` | TR-BUTE uses fixed 76px; CineFiles uses clamp. **Align format** |
| `--icon-scale` | `1` | SVG icon scaling |
| `--page-padding-top-mobile` | `14px` | Mobile page spacing |
| `--page-padding-bottom-mobile` | `60px` | Mobile page spacing |
| `--icon-color` | `var(--brand-primary)` | Icon theming |
| `--primary` | `var(--brand-secondary)` | Alias for brand secondary |
| `--primary-hover` | `var(--brand-hover)` | Alias for brand hover |
| `--active-page-color` (independent) | `#fbe98a` | TR-BUTE uses raw value; CineFiles uses `var(--brand-primary)`. Should be an **independent variable** |
| `--tab-counter-active-bg` | `rgba(6, 111, 163, 0.3)` | Active tab counter |
| `--tab-counter-active-color` | `#9cddfd` | Active tab counter text |
| `--product-card-border` | `#292929` | Product/article card border |
| `--product-card-hover-bg` | `#1c1c1c` | Product/article card hover |
| `--product-card-hover-border` | `#6b6b6b` | Product/article card hover border |
| `--format-dropdown-bg` | `#0f0f0f` | Dropdown background |
| `--filter-btn-hover-*` | 3 variables | Filter button hover state (blue) |
| `--filter-btn-active-*` | 3 variables | Filter button active state (blue) |
| `--filter-btn-glow` | `#0088CC` | Filter button glow |
| `--type-btn-hover-*` | 3 variables | Type button hover (orange) |
| `--type-btn-active-*` | 3 variables | Type button active (orange) |
| `--type-btn-glow` | `#ff8c00` | Type button glow |
| `--reset-btn-hover-bg/border` | 2 variables | Reset/danger button |
| `--gift-btn-hover-bg/border` | 2 variables | Gift/success button |
| `--filter-group-bg/border/shadow` | 3 variables | Filter group container |
| `--filter-pill-bg/border` | 2 variables | Filter pills |
| `--dropdown-accent-*` | 4 variables | Dropdown accent colors |
| `--telegram-color` | `#0088cc` | Telegram brand color |
| `--yandex-color` | `#FC3F1D` | Yandex brand color |
| `--product-special-hover-bg/border` | 2 variables | Special/featured card hover |

### Variables with WRONG values (must fix)

| Variable | TR-BUTE | CineFiles | Fix |
|---|---|---|---|
| `--bg-primary` | `#121212` | `#0d0d0d` | Change to `#121212` |
| `--bg-secondary` | `#1e1e1e` | `#1a1a1a` | Change to `#1e1e1e` |
| `--bg-tertiary` | `#2b2b2b` | `#272727` | Change to `#2b2b2b` |
| `--bg-quaternary` | `#3a3a3a` | `#363636` | Change to `#3a3a3a` |
| `--bg-overlay` | `rgba(0, 0, 0, 0.8)` | `rgba(0, 0, 0, 0.85)` | Change to `0.8` |
| `--removing-overlay-bg` | `rgba(18, 18, 18, 0.72)` | `rgba(13, 13, 13, 0.72)` | Change to match new bg-primary |
| `--text-inverse` | `#121212` | `#0d0d0d` | Change to `#121212` |
| `--border-active` | `rgba(255, 149, 0, 0.5)` (orange) | `rgba(74, 144, 217, 0.5)` (blue) | Keep CineFiles blue — intentional brand difference |

### Light Theme Variables — Differences

The light themes are already well-aligned. Both use the warm parchment palette (`#f2ede4`). The following light-theme variables are missing from CineFiles and must be added to match TR-BUTE's light theme completeness:

- All `--filter-btn-*` light overrides
- All `--type-btn-*` light overrides
- All `--neutral-btn-*` light overrides (partially present)
- `--reset-btn-hover-*` light overrides
- `--gift-btn-hover-*` light overrides
- `--filter-group-*` light overrides
- `--filter-pill-*` light overrides
- `--dropdown-accent-*` light overrides
- `--product-card-*` light overrides

---

## 3. Header Component

### Structural Differences

| Aspect | TR-BUTE | CineFiles | Action |
|---|---|---|---|
| **Architecture** | Vanilla JS + CSS | React + CSS Modules | Keep React — adapt patterns |
| **Z-index** | `1000` | `999` | Change to `1000` |
| **Layout** | Left buttons / Center logo / Right buttons | Linear: hamburger, logo, nav, actions | **Restructure to match** |
| **Left section** | Back button, burger, search button | Only hamburger | Add back button pattern, search button to left |
| **Center** | Logo (responsive: full/short/mini) | Logo (static, left-aligned) | **Center logo, add responsive variants** |
| **Right section** | Icon buttons (favorites, cart equiv.), profile | Theme toggle + search icon | Adapt: theme toggle + profile/login |
| **Desktop nav** | Via button-text items in icon groups | Inline nav links | Keep nav links (content site pattern) |
| **Mobile search** | Bottom sheet with results | Link to /search page | Add mobile search sheet |
| **Counter badges** | Cart/favorites counters on icons | None | Add notification/unread counters if applicable |
| **Header hide/show** | Slide up/down on scroll | Static transition rule exists but unused | Implement scroll-hide behavior |
| **Will-change** | `transform` | `transform` | OK |
| **Transition** | Desktop only, 0.3s ease | Desktop only, 0.3s ease | OK |
| **Active page underline** | 30% → 100% on hover | 30% → 100% on hover | OK |
| **Pressed-to-active** | `brightness(0.7)` + filter transition | Same pattern | OK |

### Header Button States (TR-BUTE Pattern)

TR-BUTE buttons follow this pattern consistently:
```
default:     color: --text-tertiary
hover:       opacity: 0.7 (desktop only, via @media(hover:hover))
active:      color: --active-page-color, fill: --active-page-color
pressed:     filter: brightness(0.7) + 0.1s ease transition
```

CineFiles implements this partially. The `iconButton` hover uses opacity correctly, active states exist. Must ensure all buttons follow this exact pattern.

### Logo Responsive Behavior

TR-BUTE has three logo variants:
- Full logo: shows above 300px
- Short logo: shows 200-300px
- Mini logo: shows 100-200px
- Hidden below 100px

CineFiles has a static text logo. Need to:
1. Keep text-based logo (different brand)
2. Add responsive behavior (truncate/hide at breakpoints)

---

## 4. Bottom Navigation

### Structural Differences

| Aspect | TR-BUTE | CineFiles | Action |
|---|---|---|---|
| **Items** | 5 (customers, picker, home, favorites, cart) | 4 (home, news, tags, search) | Keep CineFiles items — different functionality |
| **Ordering** | Explicit CSS `order` property | DOM order | Add explicit `order` if needed |
| **Counter badges** | Cart + favorites count badges | None | Add comment notification count if applicable |
| **Icon wrap** | `.bottom-nav-icon-wrap` (positions counters) | `.iconWrap` class exists but unused in JSX | Wire up icon-wrap in JSX |
| **Bottom nav height** | `76px` fixed | `clamp(3.75rem, 3.5rem + 1vw, 4.25rem)` | **Change to match TR-BUTE's approach** |
| **Button class naming** | `.bottom-nav-button` | `.item` (CSS Module) | OK — CSS Modules scope this |
| **Active class** | `.active-page` | `.itemActive` | OK — CSS Modules |
| **Pressed state** | `.mobile-pressed-to-active` | `.pressedToActive` | OK — matches pattern |
| **SVG scaling** | `transform: scale(var(--icon-scale))` | No scaling | Add `--icon-scale` usage |
| **Label styling** | 10px, weight 500, margin-top 3px | Same | OK |
| **Footer padding** | `calc(var(--actual-bottom-nav-height, 60px) + var(--filter-at-bottom-height, 0px))` | `calc(20px + var(--bottom-nav-height))` | Align to use `--actual-bottom-nav-height` pattern |

---

## 5. Footer Component

### Structural Differences

| Aspect | TR-BUTE | CineFiles | Action |
|---|---|---|---|
| **Links section** | Pill-shaped container with rounded button links | Same pattern (pills in `--bg-secondary`) | OK |
| **Social section** | Collapsible/expandable, responsive icon variants | Static row of icons | Add collapse behavior for consistency |
| **Responsive breakpoints** | 1024px (bottom padding), 550px (compact icons), 413px (stack), 350px (mini icons) | 768px (bottom padding), 413px (stack) | Add intermediate breakpoints |
| **Spinner** | Has a `.spinner` class for loading states | No spinner | Add spinner class |
| **Meta note** | Small centered text with reduced opacity | `.copyright` section | OK — equivalent |

---

## 6. Missing Shared Components

### Components TR-BUTE has that CineFiles needs

| Component | TR-BUTE Implementation | CineFiles Action |
|---|---|---|
| **Mobile Modal** | `.mobile-modal-overlay` + `.mobile-modal` — centered dialog with handle bar, header/body/footer, action sheet items, primary/danger variants | **Create**: `components/ui/MobileModal.tsx` + CSS |
| **Mobile Bottom Sheet** | `.mobile-bottom-sheet-overlay` + `.mobile-bottom-sheet` — slide-up from bottom, handle bar, draggable, scrollable body, sort sheet variant | **Create**: `components/ui/BottomSheet.tsx` + CSS |
| **Toast Notifications** | `.bottom-toast` — fixed position, color variants (default/success/error/warning), swipe-to-dismiss on mobile, click-to-dismiss on desktop | **Create**: `components/ui/Toast.tsx` + CSS + context provider |
| **Confirmation Modal** | `.confirmation-modal-overlay` + `.confirmation-modal` — slideUp animation, icon with status colors, cancel/confirm buttons | **Create**: `components/ui/ConfirmationModal.tsx` + CSS |
| **Image Zoom** | `.zoom-overlay` — full-screen image viewer, carousel with swipe, indicators, loading states, previous/next arrows | **Create**: `components/ui/ImageZoom.tsx` + CSS |
| **Skeleton Loading** | Comprehensive skeleton system — grid, cards, lists, product detail, with responsive behavior | **Expand**: Current `.skeleton` class is minimal. Create `components/ui/Skeleton.tsx` + dedicated CSS |
| **Scroll-to-Top** | Fixed button, responsive positioning, visibility toggling | **Create**: `components/ui/ScrollToTop.tsx` + CSS |
| **FAQ Carousel** (desktop) | Full-screen card carousel with navigation | May not apply to CineFiles — evaluate |
| **Button Grain** | Tactile button feedback effect | **Create**: `components/ui/ButtonGrain.tsx` or CSS-only |
| **Mobile Feedback** | Touch feedback patterns | **Create**: shared touch feedback utility |
| **Tooltip** | Smart hover tooltips for icon-only buttons | **Create**: `components/ui/Tooltip.tsx` + CSS |

---

## 7. Global CSS Patterns Missing from CineFiles

### Body/HTML Rules

| Rule | TR-BUTE | CineFiles | Action |
|---|---|---|---|
| `html { touch-action: manipulation }` | Present | Missing | Add |
| SVG icon coloring `svg { fill: currentColor }` | Present | Missing | Add (carefully — check for conflicts) |
| `.btn-icon`, `.btn-filter`, `.btn-favorite` utilities | Present | Missing | Add as global utilities |
| Filter toolbar sticky positioning | Present | Not applicable yet | Add when filters are built |
| Toast container fixed positioning + stacking | Present | Missing | Add with Toast component |
| Image reload overlay | Present | Missing | Add |
| Z-index for toasts (`10003`), popups (`10000-20000`) | Partially present | Add complete z-index map |

### Toast System in globals.css

TR-BUTE defines comprehensive toast styles in globals.css:
- Fixed container with stacking effect (`data-stack-index`)
- Desktop: slide-in from right
- Mobile: slide-in from above, swipe to dismiss
- Animation keyframes for enter/leave
- Color variants

CineFiles has `z-index: 10003` for `.toast-container` but no actual toast CSS.

---

## 8. Naming Conventions

### CSS Class Naming

| Pattern | TR-BUTE | CineFiles | Action |
|---|---|---|---|
| **BEM-like naming** | `.bottom-nav-button`, `.bottom-nav-label`, `.header-icon-button` | CSS Modules: `.item`, `.label`, `.iconButton` | OK — CSS Modules make short names safe |
| **State classes** | `.active-page`, `.mobile-pressed-to-active`, `.in-cart` | `.itemActive`, `.pressedToActive` | OK — camelCase is React convention |
| **Page wrappers** | `.{page}-page-overlay` + `.{page}-page-content` | Various patterns | **Standardize** to TR-BUTE pattern |

### CSS Variable Naming

Both use `--kebab-case`. CineFiles mostly matches. Must add missing variables from Section 2.

### Component File Naming

| Pattern | TR-BUTE | CineFiles | Alignment |
|---|---|---|---|
| **CSS files** | `kebab-case.css` | `kebab-case.module.css` | OK — CSS Modules suffix is Next.js convention |
| **JS/TS files** | `kebab-case.js` | `PascalCase.tsx` | OK — React convention for components |
| **Directories** | `kebab-case` | `kebab-case` | OK |

---

## 9. Theming System

### Differences

| Aspect | TR-BUTE | CineFiles | Action |
|---|---|---|---|
| **Storage key** | `tributary-theme` | `theme` | **Change to `cinefiles-theme`** for consistency with the pattern of prefixed storage keys |
| **Theme applied to** | `<body data-theme>` | `<html data-theme>` | **Align**: CineFiles uses `html[data-theme]` in CSS selectors. TR-BUTE uses `html[data-theme]` in CSS but applies to `body` in JS. Check which is correct. Both CSS files use `html[data-theme="light"]` — the JS API in TR-BUTE uses `ThemeManager`. CineFiles should standardize. |
| **ThemeManager API** | `window.ThemeManager.get()`, `.set()`, `window.toggleTheme()`, `themechange` event | React state in ThemeToggle component | Add a global `ThemeManager`-like API via React context |
| **FOUC prevention** | Inline script in HTML head | Inline script in layout | OK — same pattern |

---

## 10. Documentation Gaps

### Docs CineFiles is missing (that TR-BUTE has)

| Document | Purpose | CineFiles Action |
|---|---|---|
| `CONDITIONAL_VISIBILITY.md` | All JS-driven visibility toggling | Create if UI patterns warrant it |
| `NAMING_CONVENTIONS_AUDIT.md` | Naming consistency tracking | Create — useful for alignment tracking |
| `SPA_LIFECYCLE.md` | Navigation lifecycle | N/A for Next.js |
| `IMAGE_PROCESS.md` | Image types, upload flows, variants, display rules | Create — CineFiles has image handling |
| `ORDER_FLOW.md` | Order processing | N/A — no orders in CineFiles |
| `SHIPPING.md` | Shipping system | N/A |
| `ANTI_SCRAPING.md` | Anti-scraping measures | Create if applicable |
| `DEPENDENCY_PERFORMANCE_ANALYSIS.md` | Performance analysis | Nice-to-have |
| `PROJECT_STRUCTURE.md` (detailed) | TR-BUTE's is 23KB | CineFiles has `STRUCTURE.md` — review and expand |

---

## 11. Font Loading

Both projects use the same approach:
- Montserrat variable font
- Locally hosted WOFF2
- `font-display: swap`
- Same unicode ranges

**Status: ALIGNED** — no changes needed.

---

## 12. Responsive Design

### Breakpoint Alignment

| Breakpoint | TR-BUTE | CineFiles | Status |
|---|---|---|---|
| Mobile | `max-width: 768px` | Same | OK |
| Touch devices | `(hover: none) and (pointer: coarse)` | Same | OK |
| Desktop hover | `@media (hover: hover)` | Same | OK |
| Tablet / mid | `max-width: 900px` (hides button-text) | Not used | Add if needed |
| Large mobile | `max-width: 1024px` (bottom padding adjustments) | Not used | Add |

### Desktop/Mobile Utility Classes

Both use `.desktop-only` and `.mobile-only` with the same media queries. **ALIGNED.**

---

## 13. Z-Index Map

### TR-BUTE Z-Index Organization

```
1           grain-overlay
999-1000    header
998         mobile nav overlay
1001        bottom-nav
10000       popups/overlays base
10002       zoom overlay, confirmation modal
10003       toast-container
20000       FAQ carousel overlay
99999       progress bar
```

### CineFiles Z-Index

```
1           grain-overlay
999         header
998         mobile nav overlay
1001        bottom-nav
10003       toast-container
99999       progress bar
```

**Action**: Add the missing z-index layers (10000, 10002, 20000) as comments in globals.css for reference.

---

## 14. Accessibility & Interaction Patterns

### Shared Patterns (already aligned)

- Focus resets (`outline: none !important`)
- Tap highlight transparent
- User-select controls
- Touch-action manipulation
- `prefers-reduced-motion` media query
- Semantic HTML elements

### Patterns to add from TR-BUTE

- `body.sheet-open` state (fixed positioning with contained overscroll)
- Scroll-into-view for opened dropdowns
- Safe-area-inset considerations for notched devices

---

## 15. Implementation Priority

### Phase 1: Foundation (CSS Variables + Globals)
1. Fix dark theme background values to match TR-BUTE (`#121212`, `#1e1e1e`, `#2b2b2b`, `#3a3a3a`)
2. Add all missing CSS variables
3. Add missing light theme overrides
4. Add missing global CSS rules (body states, SVG coloring, etc.)
5. Update z-index comments

### Phase 2: Header Overhaul
1. Restructure header: left buttons / center logo / right buttons
2. Add responsive logo behavior
3. Implement scroll-hide
4. Match button states exactly
5. Add mobile search sheet

### Phase 3: Bottom Nav Alignment
1. Align bottom-nav height variable
2. Add icon-wrap for counter positioning
3. Add `--icon-scale` support

### Phase 4: Footer Alignment
1. Add social section collapse behavior
2. Add intermediate responsive breakpoints
3. Add spinner class

### Phase 5: Shared UI Components
1. **Toast system** (highest impact — needed for all user feedback)
2. **Mobile Modal** (needed for confirmations, forms)
3. **Bottom Sheet** (needed for mobile interactions)
4. **Confirmation Modal** (needed for delete/destructive actions)
5. **Image Zoom** (needed for article images)
6. **Scroll-to-Top** button
7. **Skeleton system** expansion
8. **Tooltip** component

### Phase 6: CLAUDE.md & Dev Process
1. Rewrite CLAUDE.md to match TR-BUTE's structure
2. Create `.claude/README.md`
3. Create `DEVELOPMENT_CHECKLIST.md`
4. Add validation scripts (`npm run check:claude`)
5. Create missing documentation

---

## 16. What NOT to change (architectural differences)

These differences are inherent to the tech stack and should NOT be aligned:

| Aspect | TR-BUTE | CineFiles | Reason to keep different |
|---|---|---|---|
| Framework | Express + Vanilla JS (SPA) | Next.js 14 (App Router) | Fundamental architecture |
| CSS approach | Global CSS files | CSS Modules | Next.js convention, better scoping |
| Component format | HTML templates + JS | React TSX | Next.js convention |
| Routing | Custom SPA router | Next.js file-based routing | Framework feature |
| DB ORM | Raw SQL via `pg` | Prisma | Already established |
| State management | Module-level JS variables | React state/context | Framework feature |
| Page scripts | `registerPage()` + init/cleanup | React component lifecycle | Framework feature |
| Build system | Node.js + bundling | Next.js build | Framework feature |
| Admin panel | Telegram miniapp | Next.js admin routes | Different admin approach |

---

## Summary

**Total changes needed**: ~85 items across 6 phases

**Effort estimate by phase**:
- Phase 1 (CSS Variables): ~30 variable additions/changes in globals.css
- Phase 2 (Header): Component restructure + new CSS
- Phase 3 (Bottom Nav): Minor tweaks
- Phase 4 (Footer): Minor tweaks
- Phase 5 (UI Components): 8 new components — largest effort
- Phase 6 (Dev Process): Documentation + scripts

The goal is visual and behavioral parity while respecting the Next.js/React architecture. Users should not be able to tell the sites are built differently — they should feel like the same platform serving different content.
