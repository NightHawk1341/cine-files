# Launch Audit Plan for TR-BUTE

Detailed codebase-grounded audit plan. Each item includes the exact file, line, and what to fix.

---

## 1. Dependency Vulnerability Audit (P0)

`npm audit` reports **12 vulnerabilities (4 low, 1 moderate, 7 high)**.

### 1.1 Fixable via `npm audit fix` (no breaking changes)

| Package | Severity | Issue | Used by |
|---------|----------|-------|---------|
| **axios** 1.12.x | high | DoS via `__proto__` in mergeConfig ([GHSA-43fc-jf86-j433](https://github.com/advisories/GHSA-43fc-jf86-j433)) | `server/routes/auth.js` (Yandex/VK OAuth), `api/payment/tbank/webhook.js`, `server/services/shipping/apiship.js` |
| **nodemailer** ≤7.0.10 | high | DoS in addressparser ([GHSA-rcmh-qjqh-p98v](https://github.com/advisories/GHSA-rcmh-qjqh-p98v)) | `lib/postbox.js` (email notifications) |
| **qs** ≤6.14.1 (via express/body-parser) | moderate | arrayLimit bypass DoS ([GHSA-w7fw-mjwx-w883](https://github.com/advisories/GHSA-w7fw-mjwx-w883)) | All POST endpoints via `express.json()` |
| **fast-xml-parser** 5.x (via @aws-sdk) | unspecified | Stack overflow in XMLBuilder ([GHSA-fj3w-jwp8-x2g3](https://github.com/advisories/GHSA-fj3w-jwp8-x2g3)) | `@aws-sdk/client-s3` (Yandex S3 uploads) |
| **jws** <3.2.3 | high | Improper HMAC verification ([GHSA-869p-cjfg-cm3x](https://github.com/advisories/GHSA-869p-cjfg-cm3x)) | Transitive via `jsonwebtoken` |
| **minimatch** ≤3.1.3 | high | Multiple ReDoS ([GHSA-3ppc-4f35-3m26](https://github.com/advisories/GHSA-3ppc-4f35-3m26)) | Transitive via nodemon (devDependency) |

### 1.2 Requires `--force` (breaking change)

| Package | Severity | Issue | Notes |
|---------|----------|-------|-------|
| **semver** 7.0–7.5.1 | high | ReDoS ([GHSA-c2qf-rxjj-qqgw](https://github.com/advisories/GHSA-c2qf-rxjj-qqgw)) | Via `nodemon@2.0.20` → `simple-update-notifier`. Fix upgrades nodemon to 3.x (breaking) |

### Action plan

1. `npm audit fix` — resolves axios, nodemailer, qs, fast-xml-parser, jws, minimatch
2. `npm audit fix --force` — upgrades nodemon to 3.x (devDependency only, low risk)
3. Run `npm run dev` to verify nodemon 3.x works
4. Run `npm run check:claude` to verify no regressions

---

## 2. Security Audit (P0)

Security posture is solid: JWT auth, parameterized queries, Helmet/CSP, 3-tier rate limiting, bot guard. The items below are the remaining gaps.

### 2.1 Error message leakage — `server.js:365`

```js
// CURRENT (leaks internals to client):
res.status(500).json({ error: 'Internal Server Error', message: err.message });

// FIX:
res.status(500).json({ error: 'Internal Server Error' });
```

`err.message` can contain DB connection strings, SQL errors, or file paths. The error is already logged to console on line 359–364.

### 2.2 Plaintext password fallback — `api/admin/browser-login.js:19-26`

The `verifyPassword()` function falls back to `inputPassword === storedPassword` when the stored password isn't a bcrypt hash. This means if `ADMIN_PASSWORD` or `EDITOR_PASSWORD` env vars are set as plaintext strings, they're compared without hashing.

**Fix:** Remove the plaintext fallback. Require bcrypt hashes in env vars, or hash on first comparison:
```js
async function verifyPassword(inputPassword, storedPassword) {
  if (!storedPassword) return false;
  const isBcryptHash = /^\$2[aby]\$\d+\$/.test(storedPassword);
  if (!isBcryptHash) return false; // Reject plaintext stored passwords
  return await bcrypt.compare(inputPassword, storedPassword);
}
```

### 2.3 Site lock password in source code — `server/middleware/site-lock.js:12`

The lockscreen password `ccritique` is hardcoded (SHA-256 hash on line 14, but the plain password is in a comment on line 12). This file is committed to git. If the lockscreen is temporary (per the TODO comment), remove it before launch. If it stays, move the hash to an env var.

### 2.4 CSP `unsafe-inline` — `server.js:25-26`

Both `scriptSrc` and `styleSrc` include `'unsafe-inline'`. This is required because:
- Telegram Web App SDK injects inline scripts
- VK Bridge SDK initialization uses inline script (line 16 in page HTMLs)
- Many components use inline styles

**Recommendation:** Document this in a `// SECURITY:` comment at the CSP block. Consider adding nonce-based CSP for scripts when Telegram SDK supports it.

### 2.5 SSL certificate validation disabled — `lib/db.js:37`

`rejectUnauthorized: false` for Supabase Transaction Pooler. The connection is still TLS-encrypted, but MITM is theoretically possible. Supabase documents this as required for their pooler.

**Action:** Check if Supabase has added proper CA support since this was written. If not, document the risk and leave as-is.

### 2.6 Payment webhook token skipped in dev — `api/payment/tbank/webhook.js:89-95`

In non-production, the webhook continues processing even if token verification fails. This is fine for dev but verify `NODE_ENV=production` is set in all deployment targets.

### 2.7 CORS allows null origin — `server.js:201`

`origin === 'null'` is allowed, which can be exploited by sandboxed iframes. The comment says it's for form submissions from inline HTML — verify this is still needed.

### 2.8 innerHTML usage — 286 occurrences across 58 frontend JS files

Most `innerHTML` assignments build HTML from server data (product titles, user names). While the server data comes from a trusted database, user-generated content (reviews, comments, usernames) could contain XSS payloads if not escaped.

**Key files to audit for user-supplied data in innerHTML:**
- `public/js/pages/profile.js:573` — username display
- `public/js/pages/customers.js` — user reviews/comments
- `public/js/pages/order.js:132` — order display
- `public/js/pages/product/comments.js` — user comments
- `public/js/pages/product/reviews.js` — user reviews

**Action:** Audit each innerHTML that renders user-generated content. Use `textContent` for plain text or escape HTML entities before insertion.

### 2.9 JWT tokens in localStorage — `public/js/core/auth.js:18-20`

Access and refresh tokens stored in `localStorage` are vulnerable to XSS. Combined with `unsafe-inline` in CSP, this is a risk. Moving to `httpOnly` cookies would be safer but requires significant refactoring of the auth flow.

**Action:** Note as accepted risk; mitigate by auditing XSS vectors (innerHTML above).

---

## 3. Data Integrity / Database Audit (P1)

### 3.1 No database indexes (beyond primary keys and UNIQUE constraints)

`SQL_SCHEMA.sql` defines **zero explicit indexes**. These queries will be slow at scale:

| Query pattern | Table | Suggested index |
|---------------|-------|-----------------|
| Orders by user | `orders` | `CREATE INDEX idx_orders_user_id ON orders(user_id);` |
| Orders by status | `orders` | `CREATE INDEX idx_orders_status ON orders(status);` |
| Order items by order | `order_items` | `CREATE INDEX idx_order_items_order_id ON order_items(order_id);` |
| Products by slug | `products` | Already has UNIQUE on slug (acts as index) |
| Products by status | `products` | `CREATE INDEX idx_products_status ON products(status);` |
| Auth tokens by user | `auth_tokens` | `CREATE INDEX idx_auth_tokens_user_id ON auth_tokens(user_id);` |
| Auth tokens expiry | `auth_tokens` | `CREATE INDEX idx_auth_tokens_expires_at ON auth_tokens(expires_at);` |
| User cart by user | `user_cart` | `CREATE INDEX idx_user_cart_user_id ON user_cart(user_id);` |
| User favorites by user | `user_favorites` | `CREATE INDEX idx_user_favorites_user_id ON user_favorites(user_id);` |
| Feedback by product | `user_feedback` | `CREATE INDEX idx_user_feedback_product_id ON user_feedback(product_id) WHERE NOT is_deleted;` |
| Order status history | `order_status_history` | `CREATE INDEX idx_order_status_history_order_id ON order_status_history(order_id);` |
| Product images by product | `product_images` | `CREATE INDEX idx_product_images_product_id ON product_images(product_id);` |
| Inline search log | `inline_search_log` | `CREATE INDEX idx_inline_search_log_created_at ON inline_search_log(created_at);` |

**Action:** Run `EXPLAIN ANALYZE` on the most common queries to confirm, then add indexes via Supabase SQL editor.

### 3.2 Numeric string concatenation risks — `price_at_purchase * quantity`

The `pg` driver returns `numeric` columns as strings. Several files do arithmetic on `price_at_purchase` without `Number()`:

| File | Line | Expression |
|------|------|------------|
| `api/orders/create.js:184` | `item.price_at_purchase * item.quantity` | No `Number()` wrap |
| `api/orders/create.js:348` | `item.price_at_purchase * item.quantity` | No `Number()` wrap |
| `api/orders/create.js:564` | `item.price_at_purchase * item.quantity` | No `Number()` wrap |
| `api/orders/get-by-id.js:70` | `item.price_at_purchase * item.quantity` | No `Number()` wrap |
| `api/orders/get-order.js:153` | `item.price_at_purchase * item.quantity` | No `Number()` wrap |
| `api/orders/get-user-orders.js:167` | `item.price_at_purchase * item.quantity` | No `Number()` wrap |
| `api/orders/parcels.js:198` | `sum + p.packaging_cost` | No `Number()` wrap |

Note: JavaScript's `*` operator coerces strings to numbers, so `"1500" * 2 = 3000` works correctly. The risk is with `+` operator: `"1500" + "300" = "1500300"`. The `parcels.js:198` line uses `+` and is the real risk.

**Action:** Wrap all `+` arithmetic on DB-sourced numeric values with `Number()`. The `*` cases are safe but wrapping for consistency is good practice.

### 3.3 Soft delete doesn't purge personal data

Account deletion (`server/routes/auth.js:463`) calls `soft_delete_user($1)` — a DB function not defined in `SQL_SCHEMA.sql`. Then deletes auth tokens. But:
- Order addresses (name, phone, postal address) in `order_addresses` are preserved
- Order items reference the user via `orders.user_id`
- `user_feedback` entries (with text content) are preserved
- `custom_uploads` (user images) are preserved
- `inline_search_log` / `inline_search_feedback` may have user_id references

**Action:** Define what "deletion" means for compliance. At minimum, the `soft_delete_user` function should anonymize PII in related tables (or document retention policy for order data).

### 3.4 No expired token cleanup

`auth_tokens` has `expires_at` but no cron job or scheduled task cleans up expired rows. Over time this table grows unbounded.

**Action:** Add a cron endpoint or Supabase scheduled function: `DELETE FROM auth_tokens WHERE expires_at < NOW()`.

---

## 4. Test Coverage Audit (P1)

**Current state:** Zero tests. No test framework, no test directory, no test scripts in `package.json`.

### Recommended test infrastructure

```bash
npm install --save-dev jest supertest
```

### Priority test cases

**Tier 1 — Auth & Security (blocks launch):**
- Telegram initData validation accepts valid signatures, rejects tampered ones
- JWT token generation, verification, and expiry
- Admin auth middleware rejects non-admin users
- Rate limiters trigger at configured thresholds
- Deleted users cannot log in (`is_deleted` check)

**Tier 2 — Payment flow (blocks launch):**
- T-Bank webhook handler processes CONFIRMED status correctly
- Webhook rejects invalid tokens in production mode
- Certificate code generation produces valid format (XXXX-XXXX)
- Order status transitions follow valid paths

**Tier 3 — Data integrity:**
- Cart sync: localStorage → DB and DB → localStorage round-trip
- Favorites sync consistency
- `Number()` wrapping: verify price calculations with string inputs
- Promo code validation (expired, max uses, min order amount)

**Tier 4 — API smoke tests:**
- `GET /api/products` returns valid product list
- `POST /api/orders/create` with valid/invalid payloads
- `GET /api/orders/get-user-orders` requires auth
- Admin endpoints reject non-admin tokens

### Files to test first (highest risk)

1. `auth.js` — Token generation/verification (core security)
2. `api/payment/tbank/webhook.js` — Payment processing (money)
3. `api/orders/create.js` — Order creation (business logic)
4. `server/middleware/admin-auth.js` — Admin access control
5. `public/js/core/data-sync.js` — Client-server data consistency

---

## 5. Performance Audit (P1)

### 5.1 No compression middleware

The server has no `compression` package. All 1.7MB of frontend JS (99 files) is served uncompressed. Vercel adds compression automatically, but Yandex Cloud deployment does not.

**Action:**
```bash
npm install compression
```
```js
// server.js, before static middleware
app.use(require('compression')());
```

### 5.2 No JS bundling or minification

99 JS files totaling 1,765,373 bytes are served individually. Each page load triggers 15-30 HTTP requests for scripts.

**Action:** Consider a build step with esbuild or Rollup for production. At minimum, enable HTTP/2 push or preload hints for critical scripts.

### 5.3 Static asset caching

`express.static` is configured but only image proxy has explicit `maxAge` (1 year at `server/routes/static.js:169`). The main static middleware at `server.js:244` uses defaults (no caching headers).

**Action:**
```js
app.use(express.static('public', { maxAge: '1d', etag: true }));
```

### 5.4 Connection pool sizing — `lib/db.js:42-47`

- `max: 20` connections
- `idleTimeoutMillis: 30000`
- `query_timeout: 45000`

Vercel serverless functions share no pool (each invocation creates a new one). This config is fine for Yandex Cloud (single server) but wasteful on Vercel.

**Action:** For Vercel, consider using Supabase's HTTP API or reducing `max` to 1-3 per lambda.

### 5.5 Missing database indexes

See Section 3.1. Without indexes, queries on `orders`, `order_items`, `user_cart`, `user_favorites`, and `user_feedback` will degrade as data grows.

---

## 6. Existing Validation Scripts Audit (P2)

### Current status: ALL PASSING

```
Route order OK — all /api/products/* specific routes registered before catch-all
Router selectors OK — all 19 contentSelectors found in HTML/JS
Page scripts OK — all required scripts present in 13 pages
Status sync OK — all 10 VALID_STATUSES present in client STATUS_NAMES
```

### Gaps in validation coverage

The validators don't check:

1. **Admin endpoint auth** — No validation that all `requireAdminAuth` routes are actually protected. A new route could be added without auth middleware.
2. **ARIA/accessibility** — No automated check for missing aria-labels on interactive elements.
3. **Unused CSS/JS** — No dead code detection for orphaned stylesheets or scripts.
4. **Env var documentation sync** — No check that `lib/config.js` and `docs/ENV_VARS.md` list the same variables.
5. **CSP completeness** — No validation that all external domains loaded by scripts are in CSP directives.

**Action:** These are nice-to-haves. The existing 4 validators are sufficient for launch.

---

## 7. Accessibility Audit (P2)

### 7.1 Focus indicators removed — 27 occurrences of `outline: none`

`outline: none` appears in 17 CSS files with no custom `:focus-visible` replacement (only 3 occurrences of `:focus-visible` exist, all in `mobile-feedback.css`).

**Affected files (partial list):**
- `public/css/header.css:524, 761, 1122`
- `public/css/cart.css:815, 1055, 1677`
- `public/css/product.css:764`
- `public/css/faq.css:55`
- `public/css/customers.css:424, 1257, 1323`
- `public/css/global.css:606, 828, 835, 850`

**Action:** Add `global.css` rule:
```css
:focus-visible {
  outline: 2px solid var(--brand-primary);
  outline-offset: 2px;
}
```
Then selectively remove `outline: none` or replace with `outline: none` only on `:focus:not(:focus-visible)`.

### 7.2 Minimal ARIA attributes — 6 total across 14 page HTMLs

Only 3 pages use any ARIA attributes:
- `product.html` — 4 occurrences
- `legal.html` — 1 occurrence
- `customers.html` — 1 occurrence

JS modules add some at runtime (`hints.js`, `mobile-modal.js`, `page-filters.js`), but most interactive elements lack:
- `role="dialog"` and `aria-modal="true"` on modals
- `aria-expanded` on dropdown toggles
- `aria-label` on icon-only buttons
- `role="navigation"` on nav elements

### 7.3 Keyboard navigation — partial support

**Working:**
- Escape key closes: catalog menu, search, FAQ carousel, image upload modal, mobile modals
- Arrow keys: emoji suggestions, FAQ carousel navigation
- Search input: Enter/Escape handling

**Missing:**
- Format dropdown (`product/format-dropdown.js`) — no keyboard arrow navigation
- Sort scrubber (`sort-scrubber.js`) — no keyboard support
- Filter buttons (`page-filters.js`) — no keyboard activation
- Mobile bottom sheets (`mobile-modal.js`) — no focus trapping
- Cart quantity controls — no keyboard increment/decrement

### 7.4 Touch targets

Many filter/tab buttons use small hit areas. No CSS files enforce `min-height: 44px` or `min-width: 44px` on interactive elements. This needs a manual audit on mobile devices.

---

## 8. Legal / Compliance Audit (P2)

### 8.1 Privacy policy — present, generally adequate

Located in `public/pages/legal.html`, the policy covers:
- Data collection scope (line 238+)
- Legal basis under 152-ФЗ (line 240)
- Data processing purposes (line 275+)
- Third-party sharing (line 300+)
- Data protection measures (line 313+)
- User rights: access, correction, deletion (line 332+)

### 8.2 Gaps in privacy policy

| Gap | Detail |
|-----|--------|
| **VK data collection** not mentioned | VK OAuth collects `vk_id`, `screen_name`, `photo_url` but policy only mentions Telegram and Yandex |
| **MAX platform** not mentioned | `max_id` is collected from MAX mini-app users |
| **localStorage keys** not disclosed | 12+ localStorage keys store user data client-side: `tributary_user`, `tributeCart`, `tributeFavorites`, `tributeNotifyList`, `tributeCartVariations`, hints, stories, theme, viewed products, recent searches, profile last seen |
| **Cookie types** not enumerated | `site_access_token`, `vk_miniapp_session`, `vk_pkce`, `admin_token` cookies are set but not listed in policy |
| **Data retention period** not specified | Policy says data is kept "as long as necessary" but doesn't give specific periods |
| **Supabase as data processor** not named | User data is stored on Supabase infrastructure |

### 8.3 Account deletion — soft delete only

`server/routes/auth.js:463` calls `soft_delete_user($1)` which sets `is_deleted=true` and `deleted_at=NOW()`. Auth tokens are deleted. But:
- **PII preserved:** Name, phone, address in `order_addresses`
- **Content preserved:** Reviews/comments in `user_feedback`
- **Images preserved:** Custom uploads in `custom_uploads`
- **Activity preserved:** Search logs in `inline_search_log`
- The `soft_delete_user` function is not in `SQL_SCHEMA.sql` — its exact behavior is unknown

**Action:** Document what data is retained post-deletion and why (legal obligation for tax records vs. laziness). For EU compliance (if applicable), implement proper data anonymization.

### 8.4 No cookie consent banner

No consent mechanism exists for cookies. Russian 152-ФЗ requires consent for personal data processing (already handled by the privacy policy acceptance). If targeting EU users, GDPR requires explicit cookie consent.

### 8.5 No data export functionality

Users can view their data but cannot export it in a machine-readable format (no "download my data" feature). Required by GDPR Article 20 if serving EU users.

---

## Priority Matrix

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| **P0** | 1.1 `npm audit fix` | 5 min | Closes 10 of 12 CVEs |
| **P0** | 2.1 Error leakage fix (`server.js:365`) | 5 min | Prevents info disclosure |
| **P0** | 2.2 Remove plaintext password fallback | 10 min | Prevents credential leak |
| **P0** | 2.3 Remove or env-var the site lock password | 10 min | Password in git history |
| **P0** | 1.2 `npm audit fix --force` (nodemon) | 10 min | Closes last 2 CVEs |
| **P1** | 3.1 Add database indexes | 30 min | Prevents slow queries at scale |
| **P1** | 3.2 Fix `Number()` wrapping in parcels.js | 10 min | Prevents price calculation bugs |
| **P1** | 5.1 Add compression middleware | 10 min | ~70% bandwidth reduction |
| **P1** | 5.3 Static asset caching headers | 5 min | Faster repeat visits |
| **P1** | 4.0 Set up test infrastructure | 2-4 hrs | Foundation for test coverage |
| **P1** | 3.4 Add expired token cleanup | 30 min | Prevents table bloat |
| **P2** | 7.1 Add focus-visible styles | 1 hr | Keyboard users can navigate |
| **P2** | 8.2 Update privacy policy for VK/MAX | 30 min | Legal compliance |
| **P2** | 8.3 Define data retention policy | 1 hr | Compliance clarity |
| **P2** | 2.8 Audit innerHTML for XSS | 2-3 hrs | Prevents stored XSS |
| **P3** | 7.2-7.4 Full accessibility pass | 4-8 hrs | WCAG AA compliance |
| **P3** | 5.2 JS bundling/minification | 4-8 hrs | Faster initial load |
| **P3** | 8.4-8.5 Cookie consent + data export | 4-8 hrs | GDPR compliance (if needed) |
