# Claude Instructions for TR-BUTE

## Required Reading Before Any Implementation

Before implementing features, adding API endpoints, or modifying database schemas, read:

1. **DEVELOPMENT_CHECKLIST.md** - Common mistakes to avoid
2. **.claude/README.md** - Implementation protocols and validation commands
3. **docs/ENV_VARS.md** - Full list of environment variables, which deployment targets need them, and deprecated vars
4. **docs/CONDITIONAL_VISIBILITY.md** - All JS-driven conditional visibility and styling across the public site
5. **docs/CRON_JOBS.md** - All cron jobs, their schedules, and Vercel/Yandex Cloud platform limits

## Key Gotchas

- **Cron jobs must respect platform limits** - Vercel Hobby plan only allows daily (or less frequent) cron schedules — expressions running more than once per day fail deployment. When adding or modifying cron jobs: (1) add the schedule to `vercel.json` `crons` array, (2) register the route in `server/routes/index.js`, (3) update `docs/CRON_JOBS.md`. Current count: 4 jobs out of 100 max. See `docs/CRON_JOBS.md` for full details on Vercel and Yandex Cloud limits.
- **Conditional visibility/styling must be documented** - When adding JS-driven `classList` toggling or `style.*` changes that affect visibility or appearance, add an entry to `docs/CONDITIONAL_VISIBILITY.md` in the appropriate page/module section.
- **Telegram SDK leaks into regular browsers** - Always check for actual Telegram context (`tg.initData.length > 0` or valid `tg.platform`) before running Telegram-specific code. See `public/js/utils.js` for the pattern.
- **API routes must be registered** - Creating a handler file is not enough; register in `/server/routes/index.js`
- **SELECT queries need updating** - When adding DB fields, update ALL SELECT queries in `/server/routes/products.js`
- **Never add auto-migrations in server.js** - The database is hosted on Supabase and schema changes are applied manually by the user via the Supabase SQL editor. When adding or renaming columns, provide the `ALTER TABLE` SQL in your response for the user to run — do NOT add startup `ALTER TABLE` calls or migration scripts to `server.js` or anywhere else. Update `SQL_SCHEMA.sql` to reflect the new schema.
- **Hardcoded colors break light theme** - Some page CSS files still use hardcoded dark-mode colors (e.g., `rgba(65, 65, 65, 0.5)`, `#1e1e1e`, `#E0E0E0`). Always use CSS variables from `global.css` (e.g., `var(--border-color)`, `var(--bg-secondary)`, `var(--text-primary)`).
- **Active elements need active+hover states** - Any interactive element with an `.active` state must also have a `.active:hover` rule (inside `@media (hover: hover)`) so hovering an active element looks distinct from hovering an inactive one. The active+hover style should be a visual progression of the active state, not a regression to the inactive hover. Common patterns: for filter/tab buttons, add a glow (`box-shadow: 0 0 0.15rem var(--...-border), 0 0 4px var(--...-border)`) or increase an existing glow; for buttons with bg fills, bump to `var(--bg-quaternary)`. Exception: elements where hover is intentionally neutral (e.g. nav items that use underline animation) — those already handle active+hover via pseudo-element rules.
- **Router contentSelectors must match HTML** - The SPA router in `router.js` has a `contentSelectors` array that must match the actual class names in the page HTML. Mismatches cause page swap failures.
- **`index.html` is NOT a template for other pages** - `index.html` is one SPA entry point; `public/pages/*.html` are separate pages served on direct URL visits. Scripts in `index.html` do NOT run on other pages. When adding a shared module (e.g. `tooltip.js`, `cart.js`, `mobile-feedback.js`), add its `<script>` tag to **every** `public/pages/*.html` file that needs it — not just `index.html`. Standard shared-module load order in each page: `button-grain.js` → `toast.js` → `mobile-feedback.js` → `utils.js` → `header.js` → `footer.js` → `bottom-nav.js` → `cart.js` → [page script] → `hints.js` → `tooltip.js`. Exception: `ar-view.html` intentionally omits `footer.js`, `cart.js`, and `mobile-feedback.js` (fullscreen camera UI).
- **Don't write AI-sounding comments** - Keep code comments brief and technical. Avoid phrases like "Enhanced for better UX", "Optimized for performance", "Elegant solution", or task/ticket references like "TASK #6" in production code.
- **New admin miniapp projectManagement subtab requires editor toggle** - When adding a new subtab to the `projectManagement` section in `admin-miniapp/js/views/project-management.js`, you MUST also: (1) add a `{ key: 'canAccessXxx', label: '...' }` entry to the `projectManagement.subtabs` array in `renderEditorSubtab()`, (2) add `canAccessXxx: getCheckboxValue(...)` to `saveEditorPermissions()`, and (3) add the subtab to the `subtabMap` inside `renderSubtabContent()`. Omitting any of these means editors can't have their access configured for the new subtab.
- **Notifications are channel-split by login method** - Telegram users receive notifications via Telegram Bot (`lib/notifications.js` → `user_bot`); Yandex OAuth users receive email; VK users receive VK messages. When adding a new notification type, implement all three channels. Sending only some means affected login types get nothing silently.
- **New notification types require three additions** - When adding a new `NotificationType` constant and its hardcoded content switch cases, you MUST also: (1) add an entry to `NotificationTemplateRegistry` in `lib/notifications.js` (so admins can customise the template), (2) add any new `{variable}` placeholders to `applyTemplateVariables()` in the same file, and (3) add a `{ emoji, label, hint }` entry to `EMOJI_DEFS` in `admin-miniapp/js/views/project-management/emoji.js` for every emoji used in the new notification title.
- **Numeric notification params must be cast with Number()** - PostgreSQL `numeric`/`decimal` columns are returned as strings by the `pg` driver. Always wrap DB-sourced price/cost/amount values in `Number()` before arithmetic (e.g. `Number(order.total_price) + Number(order.delivery_cost || 0)`). Skipping this causes silent string concatenation: `"1500" + "300"` → `"1500300"`.
- **Order statuses live in two places** - Adding or renaming a status requires updating both `server/utils/order-constants.js` (the source of truth) and the matching `.status-{name}` CSS class in the frontend. Missing either breaks admin or user views. Run `npm run check:status-sync` to verify that client `STATUS_NAMES` in `public/js/pages/order/constants.js` covers all `VALID_STATUSES`.
- **VK CDN image sizes are controlled via `cs=WxH`** - Replace the existing `cs=` value to select a different resolution. Do NOT add a `size=` parameter — it does not work on VK CDN. Example URL: `https://sun9-50.userapi.com/...?quality=95&as=32x38,480x574,...&from=bu&cs=360x0` → to get 480px width replace with `cs=480x0`. The `as=` parameter lists all available sizes; in some places the codebase dynamically picks the exact `WxH` pair from that list (e.g. `cs=480x574`), which is also valid. Both `addImageSize()` in `formatters.js` and `addSize()` in `product-recomendation.js` handle this via `cs=` replacement.
- **T-Bank is the only payment provider** - CloudPayments and YooKassa have been removed. All payment logic lives in `api/payment/tbank/`. Reference the provider label via `PAYMENT_PROVIDER_LABEL` exported from `admin-miniapp/js/utils.js` — never hardcode `'T-Bank'` in display strings.
- **Admin order detail template is in a separate file** - HTML builder functions (`buildModalContent`, `buildAddressHTML`, etc.) live in `admin-miniapp/js/views/orders/detail-template.js`. The orchestration (`viewOrderDetails`, event listeners) stays in `details.js`. Keep template builders in `detail-template.js` to avoid growing `details.js` past ~600 lines.
- **Cart/favorites shape changes need both ends** - Data lives in localStorage AND in DB (`user_cart`, `user_favorites`). `data-sync.js` syncs them. If you change the data structure of either, update both the client-side module and the corresponding `/api/sync/` endpoint or the sync will corrupt data on next login.
- **Environment variables are documented** - All env vars are centralized in `lib/config.js` and documented in `docs/ENV_VARS.md`. When adding a new env var, add it to both places. Some vars are deployment-mode-specific (Vercel vs Yandex Cloud) — check the doc before assuming a var is available.
- **New external services need CSP entries** - When integrating any third-party service that loads scripts, iframes, images, fonts, or makes API calls, add the required domains to the `contentSecurityPolicy` directives in `server.js`. Check which directives are needed: `scriptSrc` (external JS), `frameSrc` (embedded iframes), `connectSrc` (fetch/XHR), `imgSrc` (images), `styleSrc` (CSS), `fontSrc` (fonts). Tag new entries with a `// csp=YYYYMM` comment. Missing entries cause silent resource blocks that only appear in browser DevTools.
- **Dropdowns must scroll into view when opened** - Any dropdown that toggles via `classList.add/toggle('active')` must scroll the viewport so the opened dropdown is fully visible, accounting for header height and bottom nav height (mobile ≤1024px only). Use a 100ms `setTimeout` after adding the `active` class so the dropdown has time to render before measuring. Reference implementation in `public/js/pages/product/main.js` (`renderFormatDropdown`). The pattern:
  ```js
  setTimeout(() => {
    const headerHeight = document.querySelector('.header')?.offsetHeight || 60;
    const rect = dropdown.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const isAboveViewport = rect.top < headerHeight;
    const isBelowViewport = rect.bottom > viewportHeight;
    if (isAboveViewport || isBelowViewport) {
      if (isBelowViewport) {
        const bottomNavEl = window.innerWidth <= 1024 ? document.querySelector('.bottom-nav') : null;
        const bottomNavHeight = bottomNavEl ? bottomNavEl.offsetHeight : 0;
        window.scrollTo({ top: window.pageYOffset + rect.bottom - viewportHeight + 20 + bottomNavHeight, behavior: 'smooth' });
      } else {
        window.scrollTo({ top: window.pageYOffset + rect.top - headerHeight - 10, behavior: 'smooth' });
      }
    }
  }, 100);
  ```
  Exceptions: header-internal dropdowns (e.g. `.header-search-format-dropdown`) and input suggestion dropdowns (e.g. address autocomplete) do not need this — they are already within the visible area by nature.

## Public Site CSS Architecture

### File Roles
- **`global.css`** — Loaded on ALL pages. Imports shared modules (`router.css`, `grain.css`, `page-layouts.css`). Contains CSS variables, theme rules, and the flex layout rule that pushes footer down.
- **`style.css`** — **HOME PAGE ONLY** (`index.html`). Despite its generic name, this file is NOT global. Do not add general-purpose styles here.
- **`page-layouts.css`** — Shared page layout patterns (overlay base, padding, content width, page headers). Uses grouped selectors with existing class names — no new classes.
- **`{page}.css`** — Page-specific styles loaded dynamically by the SPA router. Override `page-layouts.css` defaults for page-specific needs.

### Page Wrapper Naming Convention
Most pages follow: `.{page}-page-overlay` + `.{page}-page-content`

**Non-standard exceptions (do NOT rename — too risky):**
| Page | Wrapper class | Content class |
|------|--------------|---------------|
| info | `.info-page` | — |
| legal | `.legal-page` | — |
| certificate | `.certificate-page-container` | `.certificate-content` |
| ar-view | `.ar-view-page` | — |

### When Adding a New Page
1. Add the overlay selector to `page-layouts.css` grouped rules (overlay base, padding, content width, header)
2. Add the overlay selector to `global.css` flex rule (pushes footer down)
3. Add the `contentSelector` in `router.js` so the SPA router can swap content
4. Create the page-specific CSS file for unique styles only — don't duplicate shared patterns

### Modularization Approach
- Use **grouped selectors** with existing class names. Never introduce new base classes that would require HTML/JS changes.
- Page CSS files should only contain overrides and page-specific styles, not repeat shared patterns.
- When a property is identical across 3+ pages, move it to `page-layouts.css`.

## CSS Variables Quick Reference

All theming uses variables from `global.css`. Never hardcode colors. Most-used:

```
Backgrounds:   --bg-primary  --bg-secondary  --bg-tertiary  --bg-quaternary  --bg-overlay
Text:          --text-primary  --text-secondary  --text-tertiary  --text-inverse
Borders:       --border-color  --border-hover  --border-active  --divider
Brand:         --brand-primary  --brand-secondary  --brand-hover  --brand-muted
Shadows:       --shadow-sm  --shadow-md  --shadow-lg  --modal-popup-shadow
Status:        --status-pending  --status-info  --status-success  --status-warning
               --status-error  --status-purple  --status-shipped  --status-confirmed
               --status-paid  --status-hold  (each has a matching --status-*-bg)
Cards:         --card-bg  --card-bg-hover  --card-border  --card-border-hover
Tabs:          --tab-inactive-bg  --tab-active-bg  --tab-counter-bg
Interactive:   --link-color  --link-hover  --favorite-color
Glass:         --glass-bg  --glass-border
Skeleton:      --skeleton-bg-base  --skeleton-bg-highlight
```

Dark theme defaults live in `:root`; light theme overrides are in `html[data-theme="light"]`. Both blocks are in `global.css`.

## All 14 Page HTML Files

When adding a shared `<script>` module, it must go in ALL of these (except `ar-view.html` — see exception note above):

```
public/pages/ar-view.html       public/pages/cart.html
public/pages/catalog.html       public/pages/certificate.html
public/pages/checkout.html      public/pages/customers.html
public/pages/faq.html           public/pages/favorites.html
public/pages/info.html          public/pages/legal.html
public/pages/order.html         public/pages/picker.html
public/pages/product.html       public/pages/profile.html
```

## Validation Scripts

Run `npm run check:claude` before completing any task — it runs all four linters:
- `validate-routes.js` — product-specific routes must be registered before `app.use('/api/products')` catch-all
- `validate-router-selectors.js` — every `contentSelectors` entry in `router.js` must exist in HTML or JS
- `validate-page-scripts.js` — every non-ar-view page HTML must include all required shared scripts
- `validate-status-sync.js` — client `STATUS_NAMES` must cover all server `VALID_STATUSES`

Individual scripts: `npm run check:routes`, `npm run check:selectors`, `npm run check:page-scripts`, `npm run check:status-sync`

## Route Registration Rules

All routes live in `server/routes/index.js` as flat `app.get/post/put/patch/delete` calls. There is no separate router file to create for new endpoints — just add the `require` + `app.*` lines to the appropriate section.

**Ordering constraints (violations cause silent 404s or wrong handler):**
1. Product-specific routes (e.g. `/api/products/search`, `/api/products/authors`) must be registered **before** `app.use('/api/products', productRouter)` — the router has a `/:idOrSlug` catch-all.
2. Dynamic parameter routes (e.g. `app.get('/api/orders/:orderId', ...)`) must come **after** all specific routes in the same prefix group.

## New Page Checklist (all four places)

Adding a new page requires four coordinated changes:
1. `public/css/page-layouts.css` — add overlay selector to grouped rules
2. `public/css/global.css` — add overlay selector to the `flex: 1 0 auto` rule (~line 665)
3. `public/js/core/router.js` — add `contentSelector` entry
4. Create `public/css/{page}.css` for page-specific styles only

## Before Completing Features

Run validation:
```bash
npm run check:claude
```
