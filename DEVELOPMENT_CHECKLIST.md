# Development Checklist

This checklist ensures all necessary steps are completed when adding new features to CineFiles.

## Adding New API Endpoints

When creating a new API endpoint, you MUST:

### 1. Create the Handler File
- [ ] Create handler in `api/[endpoint-name].js`
- [ ] Export a factory function: `function list({ pool, config }) { return handler }`
- [ ] Use parameterized SQL only (`$1, $2` placeholders)

### 2. Register Route
- [ ] **CRITICAL:** Add `require` + `app.*` line to `server/routes/index.js`
- [ ] Add authentication middleware if needed (`requireAuth`, `requireEditor`, `requireAdmin`)
- [ ] Specific routes MUST come before parameterized catch-all routes in the same prefix group

### 3. Verify
- [ ] Run `npm run check:claude` — all validators must pass
- [ ] Test endpoint responds (not 404)
- [ ] Check auth blocks unauthorized access

## Adding New Database Fields

When adding a field to a table, you MUST:

### 1. Create Migration
- [ ] Create migration file in `migrations/`
- [ ] Use naming: `NNN_description.sql` (e.g. `002_add_subtitle_to_articles.sql`)
- [ ] Include `ALTER TABLE` statement
- [ ] Provide the SQL in your response for the user to run in Supabase SQL editor
- [ ] Do NOT add auto-migrations to `server.js` or anywhere else

### 2. Update Schema Reference
- [ ] Update `SQL_SCHEMA.sql` to reflect new structure

### 3. Update API Handlers
- [ ] **Create/Update handlers:** Add field to INSERT/UPDATE column lists
- [ ] **List/Detail handlers:** Add field to ALL SELECT statements
- [ ] **Cast numeric columns** with `Number()` before arithmetic

### 4. Update Frontend
- [ ] Add field to page display (if user-facing)
- [ ] Add field to admin form (if editable)

## Adding a New Page

When adding a new page to the SPA, you MUST:

### 1. Create Page Script
- [ ] Create `public/js/pages/[page].js`
- [ ] Register via `Router.registerPage('/route', { init, cleanup, styles: [...] })`
- [ ] `init()` must show skeleton loading states before API fetch, not empty containers
- [ ] `cleanup()` must reset module state, clear timers, remove body-appended elements

### 2. Create Page CSS
- [ ] Create `public/css/[page].css` for page-specific styles only
- [ ] Use CSS variables — NEVER hardcode colors
- [ ] Reference in page script's `styles` array

### 3. Register in index.html
- [ ] Add `<script src="/js/pages/[page].js"></script>` to `index.html`
- [ ] Place BEFORE catch-all routes (`article.js`, `category.js`)

### 4. Validate
- [ ] Run `npm run check:claude`
- [ ] Test page loads via SPA navigation AND direct URL
- [ ] Verify cleanup works (navigate away and back — no stale state)

## Adding a New Module (persistent UI)

### 1. Create Module
- [ ] Create `public/js/modules/[module].js` as an IIFE
- [ ] Return public API object (e.g. `{ init, show, hide }`)

### 2. Register
- [ ] Add `<script>` tag to `index.html` in the Modules section (after core, before components/pages)
- [ ] If module appends to `document.body`, ensure consuming pages remove it in `cleanup()`

### 3. Style
- [ ] Add CSS to `public/css/[module].css`
- [ ] Add `<link>` to `index.html` global CSS section

## Adding a New Component (content renderer)

### 1. Create Component
- [ ] Create `public/js/components/[component].js` as an IIFE
- [ ] Return public API object (e.g. `{ build, render }`)

### 2. Register
- [ ] Add `<script>` tag to `index.html` in the Components section (after modules, before pages)

### 3. Style
- [ ] Add CSS to `public/css/[component].css`
- [ ] Add `<link>` to `index.html` global CSS section

## Adding New Environment Variables

- [ ] Add to `lib/config.js` using `requireEnv()` or `getEnv()`
- [ ] Add `-e VAR_NAME="${{ secrets.VAR_NAME }}"` to `.github/workflows/deploy-yandex.yml` docker run command
- [ ] Vercel reads from project settings automatically
- [ ] Document in `docs/ENV_VARS.md`

## Modifying CSS or Theming

- [ ] Use CSS variables from `public/css/global.css` — never hardcode colors
- [ ] CSS variable names match TR-BUTE (sister project)
- [ ] Test in both dark and light themes
- [ ] Interactive elements need `.active` + `.active:hover` states (inside `@media (hover: hover)`)
- [ ] If adding page-specific CSS, reference it in the page script's `styles` array

## Common Mistakes to Avoid

1. **404 Errors:** Forgetting to register route in `server/routes/index.js`
2. **Route Order:** Specific routes must come BEFORE parameterized catch-all routes
3. **Script Order:** Catch-all page scripts (`article.js`, `category.js`) must be LAST in `index.html`
4. **Missing Cleanup:** Not implementing `cleanup()` causes stale state on repeat visits
5. **Body-Appended DOM:** Modals/overlays appended to `document.body` survive navigation — remove in `cleanup()`
6. **Style Leaks:** Page CSS not in `styles` array stays in `<head>` after navigation
7. **Inline Styles on Persistent Elements:** Using `element.style.*` on header/footer/body leaks across pages — use `classList`
8. **Hardcoded Colors:** Break light theme — always use CSS variables
9. **Number() Cast:** PostgreSQL returns numeric columns as strings — wrap with `Number()` before arithmetic
10. **Missing Skeletons:** Pages must show skeleton loading states before API fetch, not empty containers

## Before Completing Any Task

```bash
npm run check:claude
```

All validators must pass before committing.
