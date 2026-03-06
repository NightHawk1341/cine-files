# Development Checklist

This checklist ensures all necessary steps are completed when adding new features to TR-BUTE.

## ✅ Adding New API Endpoints

When creating a new API endpoint (e.g., `/api/products/authors`), you MUST:

### 1. Create the Handler File
- [ ] Create handler in `/api/[category]/[endpoint-name].js`
- [ ] Export a function that handles the request
- [ ] Use response helpers: `success()`, `error()`, `badRequest()`, etc.

### 2. Register Route in Router
- [ ] **CRITICAL:** Add to `/server/routes/index.js`
- [ ] Require the handler at the top of the relevant section
- [ ] Mount the route with `app.get()` or `app.post()`
- [ ] Add authentication middleware if needed (`requireAdminAuth`, `authenticateToken`)
- [ ] For `/api/products/*` routes, add BEFORE the product router (line ~60-74)

### 3. Test the Endpoint
- [ ] Verify route responds (not 404)
- [ ] Check authentication works if required
- [ ] Verify response format matches expectations

## ✅ Adding New Database Fields

When adding a new field to a table (e.g., `author` to `products`), you MUST:

### 1. Create Migration
- [ ] Create migration file in `/migrations/`
- [ ] Use naming: `NNN_add_[field]_to_[table].sql`
- [ ] Include `ALTER TABLE` statement
- [ ] Add index if field will be queried/filtered

### 2. Update API Handlers
- [ ] **Create:** Add field to destructured `req.body` in `/api/[table]/create.js`
- [ ] **Create:** Add field to INSERT column list
- [ ] **Create:** Add field value to VALUES array
- [ ] **Update:** Add field to destructured `req.body` in `/api/[table]/update.js`
- [ ] **Update:** Add conditional update logic

### 3. Update Query Endpoints
- [ ] **Product queries:** Update ALL SELECT statements in `/server/routes/products.js`:
  - [ ] Main list query (`router.get('/')`)
  - [ ] Single product query (`router.get('/:idOrSlug')`)
  - [ ] Public list query (`module.exports.publicProductList`)
- [ ] Add field to SELECT columns in all relevant queries

### 4. Update Frontend
- [ ] Add field to admin form (if applicable)
- [ ] Add field to product display (if applicable)
- [ ] Add field to any statistics/analytics displays

## ✅ Adding Features with Multiple Authors (Tag System)

When implementing tag-based input (like keywords or authors):

- [ ] Create input field with unique ID
- [ ] Create display container for tags
- [ ] Create hidden input for storing comma-separated values
- [ ] Implement `initialize[Feature]Tags()` function
- [ ] Handle Enter key to add tags
- [ ] Handle comma to add tags
- [ ] Handle Backspace to remove last tag
- [ ] Handle click on × button to remove specific tag
- [ ] Update hidden input when tags change
- [ ] Parse initial values from data attribute
- [ ] Escape HTML in tag text to prevent XSS

## ✅ SPA (Single Page Application) Considerations

TR-BUTE uses client-side routing. When adding new features:

- [ ] Ensure all data fetching happens client-side via fetch/API calls
- [ ] Don't rely on server-side rendering for dynamic content
- [ ] Update route handlers if adding new page types
- [ ] Test navigation works without full page reload

## ✅ Adding a New Shared JS Module

When creating a module that should run on all pages (e.g. a new persistent UI widget):

- [ ] **Add `<script>` to every `public/pages/*.html`** — scripts in `index.html` do NOT carry over to other pages on direct URL visits
- [ ] Follow the standard load order: `button-grain.js` → `toast.js` → `mobile-feedback.js` → `utils.js` → `header.js` → `footer.js` → `bottom-nav.js` → `cart.js` → [page script] → `hints.js` → `tooltip.js`
- [ ] Verify `ar-view.html` intentionally omits `footer.js`, `cart.js`, and `mobile-feedback.js` — only add your module there if it makes sense in fullscreen camera mode
- [ ] Test by opening each page via direct URL (not SPA navigation from index) to confirm the module loads

## ✅ Adding a New Notification Type

When adding a new user-facing notification event (e.g., new order status, parcel event):

- [ ] Add notification function to `lib/notifications.js`
- [ ] **Telegram channel:** send via `user_bot` (Telegram Bot message) for users who logged in with Telegram
- [ ] **Email channel:** send via SMTP for users who logged in with Yandex OAuth
- [ ] Both channels must handle the same event — missing one causes that login type to get nothing silently
- [ ] Call both channel functions from the trigger point (webhook, cron job, or API handler)
- [ ] If the notification has admin-facing content (e.g., new order alert), implement admin bot notification separately

## ✅ Adding or Renaming an Order Status

When introducing a new order status or renaming an existing one:

- [ ] Update `server/utils/order-constants.js` — this is the source of truth for valid statuses
- [ ] Add `.status-{name}` CSS class to the frontend — both admin miniapp and user-facing views rely on this class for color-coding
- [ ] Update any hardcoded status strings in frontend JS files (`order.js`, `profile.js`, admin views)
- [ ] Update status transition logic if the new status has user- or system-initiated transitions
- [ ] Add the status to the order status table in `ORDER_FLOW.md`

## ✅ Modifying Cart or Favorites Data Structure

When changing how cart items or favorites are shaped (adding fields, renaming keys, etc.):

- [ ] Update the client-side module: `public/js/core/cart.js` or `public/js/core/favorites.js`
- [ ] **Update the matching sync endpoint** — `/api/sync/cart.js` for cart, `/api/sync/favorites.js` for favorites
- [ ] Both sides must use the same data shape or `data-sync.js` will corrupt stored data on next login
- [ ] If the DB table schema changes, update `user_cart` or `user_favorites` table accordingly
- [ ] Test by logging in on a device after making changes — sync runs on login and will surface mismatches

## ✅ Statistics/Analytics Features

When adding new statistics:

- [ ] Create analytics handler in `/api/analytics/[name].js`
- [ ] Register route in `/server/routes/index.js` under Analytics section
- [ ] Add `requireAdminAuth` middleware
- [ ] Support `period` query parameter (today/week/month/year/all)
- [ ] Update `/admin-miniapp/js/views/statistics.js`:
  - [ ] Fetch data in `loadStatistics()`
  - [ ] Add render function for your statistics
  - [ ] Add to `renderEnhancedStatistics()` HTML output
  - [ ] Include proper styling and formatting

## 🔍 Common Mistakes to Avoid

1. **404 Errors:** Forgetting to register route in `/server/routes/index.js`
2. **Missing Data:** Forgetting to add new field to SELECT queries
3. **Route Order:** Product-specific routes must come BEFORE `/api/products/:idOrSlug` catch-all
4. **Authentication:** Forgetting to add `requireAdminAuth` or `authenticateToken` middleware
5. **Null Values:** Not handling null/undefined values in SQL queries (`value || null`)
6. **XSS:** Not escaping user input in tag displays
7. **Event Bubbling:** Not stopping propagation in nested click handlers
8. **Telegram SDK leaking into regular browsers:** The Telegram WebApp SDK (`telegram-web-app.js`) creates `window.Telegram.WebApp` even outside Telegram (with empty `initData` and `platform='unknown'`). Any Telegram-specific code (viewport handlers, swipe disabling, body height manipulation) must check for actual Telegram context using `tg.initData.length > 0` or valid `tg.platform`, otherwise it will run in regular mobile browsers and can cause issues like scroll jumps. See `public/js/utils.js` `initTelegramWebApp()` for the pattern.

## 📝 Testing Checklist

Before pushing changes:

- [ ] Server starts without errors
- [ ] All API endpoints respond (not 404)
- [ ] Database queries work (no SQL errors)
- [ ] Frontend displays data correctly
- [ ] Forms save data correctly
- [ ] Authentication blocks unauthorized access
- [ ] No console errors in browser
- [ ] Mobile/responsive layout works

## 🚀 Deployment Checklist

- [ ] Run database migration on production
- [ ] Restart server to load new routes
- [ ] Clear any caches if applicable
- [ ] Test critical user flows
- [ ] Monitor error logs for issues
