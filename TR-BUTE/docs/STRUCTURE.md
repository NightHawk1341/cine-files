# TR-BUTE Codebase Structure

> **Last Updated:** February 20, 2026
> **Platform:** Node.js/Express E-commerce with Telegram Web App

This document provides a comprehensive overview of the TR-BUTE e-commerce application structure.

---

## Quick Reference

| Component | Location | Description |
|-----------|----------|-------------|
| **Backend API** | `/api/`, `/server/` | Express.js REST API |
| **Frontend SPA** | `/public/` | Vanilla JS single-page application |
| **Admin Panel** | `/admin-miniapp/` | Admin management interface |
| **Database** | `/lib/`, `/migrations/` | PostgreSQL with Supabase |
| **Documentation** | `/docs/` | Feature specifications |

---

## Technology Stack

- **Runtime:** Node.js 16+
- **Backend:** Express.js REST API
- **Database:** PostgreSQL (Supabase hosted)
- **Frontend:** Vanilla JavaScript SPA
- **Authentication:** JWT + Telegram Web App / Yandex OAuth
- **Payments:** T-Bank (primary), CloudPayments, YooKassa (legacy)
- **Shipping:** CDEK API v2, ApiShip (Pochta Russia)
- **Storage:** Supabase for images
- **Deployment:** Vercel (primary), Docker/Yandex Cloud (staging)

---

## Directory Structure

```
TR-BUTE/
├── server.js                    # Express server entry point
├── auth.js                      # JWT utilities
├── admin-login.html             # Admin authentication page
├── package.json                 # Dependencies & scripts
├── vercel.json                  # Vercel deployment config
├── Dockerfile                   # Docker build (Yandex Cloud)
│
├── admin-miniapp/               # Admin panel application
├── api/                         # Serverless API handlers
├── server/                      # Backend services & routes
├── public/                      # Frontend SPA
├── lib/                         # Configuration & database
├── migrations/                  # Database migrations
├── docs/                        # Feature documentation
└── scripts/                     # Utility scripts
```

---

## Root Level Files

### Core Application

| File | Purpose |
|------|---------|
| `server.js` | Express server entry point - initializes app, loads config, mounts routes |
| `auth.js` | JWT token generation and verification utilities |
| `admin-login.html` | Admin authentication page |

### Configuration

| File | Purpose |
|------|---------|
| `package.json` | Dependencies: express, pg, jsonwebtoken, axios, etc. |
| `vercel.json` | Vercel deployment - serverless functions config |
| `Dockerfile` | Multi-stage Docker build for Yandex Cloud |
| `.gitignore` | Git exclusion patterns |

### Documentation

See `/docs/` directory for comprehensive documentation:
- `STRUCTURE.md` - Codebase organization
- `FEATURES.md` - Platform features
- `ORDER_FLOW.md` - Order lifecycle
- `SHIPPING.md` - Shipping integration
- `ADMIN_MINIAPP.md` - Admin panel
- `THEMING.md` - Theme system
- `AR_VIEW.md` - AR visualization feature
- `ANTI_SCRAPING.md` - Anti-scraping and bot protection
- `SQL_SCHEMA.sql` - Database schema (root level)

---

## Admin Miniapp (`/admin-miniapp/`)

Complete single-page application for platform management. See `ADMIN_MINIAPP.md` for detailed documentation.

```
admin-miniapp/
├── index.html                   # Entry point
├── style.css                    # Admin UI styles
└── js/
    ├── main.js                  # Router & view management
    ├── state.js                 # Global state management
    ├── config.js                # Configuration
    ├── auth.js                  # Admin authentication
    ├── utils.js                 # Utilities & status helpers
    ├── theme.js                 # Light/dark theme
    ├── navigation.js            # Navigation component
    │
    ├── components/
    │   └── imageManager.js      # Image upload & management
    │
    ├── utils/
    │   ├── apiClient.js         # API request wrapper
    │   ├── modalManager.js      # Modal dialog handling
    │   ├── pendingChanges.js    # Unsaved changes detection
    │   └── productSearch.js     # Product search utility
    │
    └── views/
        ├── dashboard.js         # Overview stats
        ├── orders.js            # Order management (+ submodules)
        ├── orders/              # Order submodules
        │   ├── index.js         # Orders list & table
        │   ├── details.js       # Order detail view
        │   ├── filters.js       # Status/date filtering
        │   ├── items.js         # Order items editor
        │   ├── product-search.js# Add products to orders
        │   ├── rendering.js     # Table render logic
        │   ├── shipping.js      # Shipping calculations
        │   ├── status.js        # Status update logic
        │   └── toggles.js       # Processing/urgent flags
        ├── products.js          # Product & catalog editor
        ├── catalogs.js          # Catalog management
        ├── feedback.js          # Reviews moderation
        ├── feed.js              # Activity feed
        ├── statistics.js        # Analytics & reports
        ├── channel.js           # Telegram channel posting
        ├── shipments.js         # Shipment calendar & batching
        └── project-management.js# Settings & emergency mode
```

---

## API Endpoints (`/api/`)

Serverless-style API handlers compatible with Vercel functions.

### Orders (`/api/orders/`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `create.js` | POST | Create new order |
| `get-order.js` | GET | Get single order |
| `get-by-id.js` | GET | Get order by ID |
| `get-user-orders.js` | GET | Get user's orders |
| `cancel.js` | POST | Cancel order |
| `confirm.js` | POST | User confirms order |
| `edit.js` | PUT | User edits order |
| `update.js` | PATCH | Update order details |
| `update-status.js` | PATCH | Admin status update |
| `update-delivery.js` | PATCH | Update delivery info |
| `search.js` | GET | Search orders (admin) |
| `get-order-counts.js` | GET | Order statistics |
| `toggle-processed.js` | PATCH | Toggle processed flag |
| `toggle-urgent.js` | PATCH | Toggle urgent flag |
| `toggle-notion-sync.js` | PATCH | Toggle Notion sync |
| `confirm-delivery.js` | POST | User confirms delivery |
| `request-refund.js` | POST | User requests refund |
| `process-refund.js` | POST | Admin processes refund |
| `parcels.js` | GET/POST | Parcel management |
| `create-shipment.js` | POST | Create shipping via API |
| `tracking.js` | GET | Get shipment tracking |
| `return-action.js` | POST | User submits return-to-sender action |

**Order Items** (`/api/orders/items/`):
- `add.js` - Add item to order
- `remove.js` - Remove item from order
- `update.js` - Update item quantity

### Products (`/api/products/`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `create.js` | POST | Create product (admin) |
| `update.js` | PATCH | Update product (admin) |
| `search.js` | GET | Search products |
| `reorder.js` | PATCH | Reorder products |
| `subscribe-release.js` | POST | Subscribe to release |
| `check-subscription.js` | GET | Check subscription status |
| `subscribed.js` | GET | Get user subscriptions |
| `send-release-notifications.js` | POST | Notify subscribers |
| `links.js` | GET/POST | Manage product variants |

**Product Images** (`/api/products/images/`):
- `add.js`, `get.js`, `update.js`, `delete.js`, `reorder.js`

### Catalogs (`/api/catalogs/`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `create.js` | POST | Create catalog |
| `update.js` | POST | Update catalog |
| `delete.js` | POST | Delete catalog |
| `reorder.js` | POST | Reorder catalogs |
| `add-product.js` | POST | Add product to catalog |
| `remove-product.js` | POST | Remove from catalog |

### Payment (`/api/payment/`)

| Endpoint | Description |
|----------|-------------|
| `tbank/create-link.js` | T-Bank payment link |
| `tbank/webhook.js` | T-Bank webhook |
| `tbank/check-status.js` | T-Bank status check |

### Shipping (`/api/shipping/`)

| Endpoint | Description |
|----------|-------------|
| `calculate.js` | Calculate shipping rates |
| `services.js` | List available services |
| `points.js` | Get CDEK pickup points |

### Admin (`/api/admin/`)

| Endpoint | Description |
|----------|-------------|
| `verify.js` | Verify admin credentials |
| `faq/categories.js` | FAQ categories CRUD |
| `faq/items.js` | FAQ items CRUD |
| `orders/batch-status.js` | Bulk status updates |
| `orders/send-contact-notification.js` | Notify users |
| `shipments/settings.js` | Next shipment date |
| `shipments/calendar.js` | Shipment calendar |
| `parcel-storage-settings.js` | Storage day settings per provider/service |

### Other Endpoints

| Path | Description |
|------|-------------|
| `/api/user/profile.js` | User profile |
| `/api/user/update-email.js` | Update payment email |
| `/api/users/hide-photo.js` | Toggle photo visibility |
| `/api/reviews/` | Review verification & upload |
| `/api/feedback/` | Feedback management |
| `/api/sync/` | Cart, favorites, picker sync |
| `/api/settings/` | App settings |
| `/api/faq/` | FAQ categories & items |
| `/api/webhooks/` | Telegram bot webhooks |
| `/api/cron/update-tracking.js` | Auto-update tracking |
| `/api/analytics/` | Dashboard & product stats |
| `/api/certificates/` | Certificate generation |

---

## Server Backend (`/server/`)

### Security (`server.js`)

The server uses `helmet` middleware for comprehensive security headers:

| Header | Purpose |
|--------|---------|
| Content-Security-Policy | Controls allowed resources (scripts, styles, images) |
| Strict-Transport-Security | Enforces HTTPS connections |
| X-Frame-Options | Prevents clickjacking attacks |
| X-Content-Type-Options | Prevents MIME sniffing |
| Cross-Origin policies | Controls cross-origin resource sharing |

### Middleware (`/server/middleware/`)

| File | Purpose |
|------|---------|
| `authenticate.js` | JWT authentication - validates tokens, attaches user to request |
| `admin-auth.js` | Admin-only route protection - checks ADMIN_API_KEY |
| `telegram-validation.js` | Validates Telegram Web App initData |
| `bot-guard.js` | Anti-scraping: UA blocklist, headless detection, rate limiting |
| `site-lock.js` | Temporary password lock for development |

### Routes (`/server/routes/`)

| File | Purpose |
|------|---------|
| `index.js` | Main router aggregator - mounts all route modules |
| `auth.js` | Authentication: `/api/auth/telegram`, `/api/auth/yandex`, `/api/auth/refresh` |
| `products.js` | Product routes |
| `sync.js` | Data synchronization routes |
| `admin.js` | Admin routes (`/api/admin/*`) |
| `feedback.js` | Feedback routes |
| `image-proxy.js` | Proxied image serving |
| `static.js` | Static HTML page routes |

### Services (`/server/services/`)

```
services/
├── shipping/
│   ├── index.js              # Unified shipping interface
│   ├── cdek.js               # CDEK API v2 (OAuth2, tariffs, tracking)
│   ├── apiship.js            # ApiShip/Pochta integration
│   └── parcel-calculator.js  # Parcel packaging logic
│
└── payment/
    └── tbank.js              # T-Bank payment integration
```

### Utilities (`/server/utils/`)

| File | Purpose |
|------|---------|
| `response-helpers.js` | Standardized API responses: `success()`, `error()`, `notFound()`, etc. |
| `order-queries.js` | Reusable order queries: `fetchOrder()`, `requireOrder()`, etc. |
| `order-constants.js` | Order statuses, delivery methods, status colors |
| `cart-helpers.js` | Shopping cart utilities |
| `validation.js` | Input validators |
| `toggle-factory.js` | Factory for boolean field toggle endpoints |
| `role-check.js` | Role-based access control helpers |
| `tracking-parser.js` | Shipping tracking number parsing |

---

## Frontend (`/public/`)

### Pages (`/public/pages/`)

| HTML File | Route | Description |
|-----------|-------|-------------|
| `catalog.html` | `/` | Product catalog/homepage |
| `product.html` | `/product/:slug` | Product detail |
| `cart.html` | `/cart` | Shopping cart (view/edit items) |
| `checkout.html` | `/checkout` | Order checkout (shipping, payment) |
| `favorites.html` | `/favorites` | Saved favorites |
| `order.html` | `/order/:id` | Order tracking |
| `profile.html` | `/profile` | User profile |
| `faq.html` | `/faq` | FAQ page |
| `info.html` | `/info` | Information |
| `legal.html` | `/legal` | Legal information (offer, privacy, delivery, returns) |
| `customers.html` | `/customers` | Customer reviews |
| `certificate.html` | `/certificate` | Certificate |
| `picker.html` | `/picker` | Product picker |
| `ar-view.html` | `/ar-view` | AR poster visualization |

### CSS Architecture (`/public/css/`)

The frontend uses a layered CSS system. Styles are split between globally loaded files and page-specific files loaded dynamically by the SPA router.

#### Global CSS (loaded on every page)

| File | Purpose |
|------|---------|
| `global.css` | CSS variables, theme rules (dark/light), shared @imports, footer-push flex rule |
| `header.css` | Fixed header bar, body padding-top, search bar |
| `footer.css` | Footer component |
| `bottom-nav.css` | Mobile bottom navigation bar |
| `router.css` | Page transition animations, loading progress bar |
| `grain.css` | Animated grain texture effect |
| `page-layouts.css` | Shared page layout patterns (overlay base, padding, content width, headers) |
| `skeleton.css` | Loading skeleton animations |
| `components.css` | Shared small components (buttons, badges, toasts) |

**`global.css` @imports:** `router.css`, `grain.css`, `page-layouts.css`

#### Page-Specific CSS (loaded dynamically per route)

| File | Page |
|------|------|
| `catalog.css` | Product catalog |
| `product.css` | Product detail |
| `product-grid.css` | Product card grid (shared by catalog, favorites, picker, profile) |
| `cart.css` | Shopping cart |
| `checkout.css` | Order checkout |
| `favorites.css` | Saved favorites |
| `order.css` | Order detail |
| `profile.css` | User profile |
| `faq.css` | FAQ page |
| `info.css` | Information page |
| `legal.css` | Legal page |
| `customers.css` | Customer reviews, comments, suggestions |
| `certificate.css` | Gift certificates |
| `picker.css` | Product picker (swipe) |
| `ar-view.css` | AR poster visualization |
| `hints.css` | UI hint tooltips |
| `tabs.css` | Shared tab component |

#### UI Module CSS (loaded with their JS module)

| File | Module |
|------|--------|
| `mobile-modal.css` | All modal dialogs, bottom sheets, and toasts |
| `mobile-feedback.css` | Feedback widget |
| `image-upload-modal.css` | Image upload dialog |
| `emoji-suggestions.css` | Emoji autocomplete |

#### Component CSS (`/public/css/components/`)

| File | Purpose |
|------|---------|
| `horizontal-card.css` | Horizontal product card layout (checkout, cart, order) |
| `cards.css` | Shared card styles |
| `forms.css` | Form input styles |
| `modals.css` | Modal overlay styles |
| `carousels.css` | Carousel/slider styles |
| `ui-elements.css` | Small reusable UI elements |
| `tooltip.css` | Smart tooltip bubble and bordered arrow styles |

#### CSS File Roles

- **`global.css`** — Loaded on ALL pages. Contains CSS variables and theme definitions.
- **`style.css`** — **Home page only** (`index.html`). Despite its generic name, this is NOT a global file.
- **`page-layouts.css`** — Shared page layout patterns. Uses grouped selectors with existing class names to avoid HTML/JS changes.
- **`{page}.css`** — Page-specific styles. Override `page-layouts.css` defaults. Loaded by the SPA router.

#### Page Wrapper Naming

Most pages follow `.{page}-page-overlay` + `.{page}-page-content`. Non-standard exceptions:

| Page | Wrapper class |
|------|--------------|
| info | `.info-page` |
| legal | `.legal-page` |
| certificate | `.certificate-page-container` |
| ar-view | `.ar-view-page` |

### Core Modules (`/public/js/core/`)

Loaded on every page:

| Module | Purpose |
|--------|---------|
| `auth.js` | Authentication management, token refresh |
| `router.js` | SPA routing system |
| `state.js` | Global state (favorites, cart, images) |
| `data-sync.js` | Background sync with server |
| `data-store.js` | Data caching, API deduplication |
| `formatters.js` | Data formatting utilities |
| `favorites.js` | Favorites management |
| `app-settings.js` | Application settings |
| `loading-state.js` | Loading state coordination |
| `module-config.js` | Module configuration per page |
| `viewed-products.js` | Recently viewed tracking |
| `constants.js` | Global constants |
| `data-loaders.js` | Data loading utilities |
| `product-helpers.js` | Product utilities |
| `ui-helpers.js` | UI helper functions |
| `sharing.js` | Social sharing functionality |

### UI Modules (`/public/js/modules/`)

Reusable components:

| Module | Purpose |
|--------|---------|
| `header.js` | Top navigation bar |
| `bottom-nav.js` | Mobile bottom navigation |
| `footer.js` | Footer component |
| `product-grid.js` | Product card grid |
| `cart.js` | Cart widget/modal |
| `toast.js` | Toast notifications |
| `skeleton-loader.js` | Loading skeletons |
| `loading-bar.js` | Top progress bar for page loads |
| `zoom.js` | Image zoom |
| `faq-popup.js` | FAQ modal |
| `mobile-feedback.js` | Feedback widget |
| `mobile-modal.js` | All modal dialogs, bottom sheets, and toasts |
| `mobile-sort-sheet.js` | Sort/filter interface |
| `sort-scrubber.js` | Alphabetical fast navigation |
| `button-grain.js` | Animated grain texture effect |
| `theme.js` | Dark/light theme toggle |
| `hints.js` | UI hints and tooltips |
| `stories-popup.js` | Stories-style content viewer |
| `ar-tracking.js` | AR poster tracking (optical flow) |
| `depth-estimation.js` | TensorFlow.js depth model |
| `tooltip.js` | Smart hover/long-press tooltips for icon-only buttons |

### Page Logic (`/public/js/pages/`)

| Module | Description |
|--------|-------------|
| `catalog.js` | Product listing, filtering, search |
| `product.js` | Product detail, reviews, carousel, pricing |
| `cart.js` | Cart display, item management |
| `checkout.js` | Order form, shipping selection, order submission |
| `profile.js` | User profile, order history |
| `order.js` | Order tracking, editing, reviews |
| `favorites.js` | Favorites management |
| `faq.js` | FAQ interactions |
| `info.js` | Info page |
| `legal.js` | Legal page navigation |
| `picker.js` | Product picker |
| `customers.js` | Customer reviews |
| `certificate.js` | Certificate generation |
| `ar-view.js` | AR poster visualization, Three.js, depth estimation |

---

## Configuration & Database (`/lib/`)

| File | Purpose |
|------|---------|
| `config.js` | Environment configuration loader with validation |
| `db.js` | PostgreSQL connection pool (singleton, max 20 connections) |
| `notifications.js` | Notification service |
| `session-store.js` | Session storage |

---

## Database Migrations (`/migrations/`)

Plain SQL files, run via Supabase SQL Editor or `psql`.

| File | Purpose |
|------|---------|
| `add-manual-sort.sql` | Add `is_manual_sort` boolean to products |
| `add-promo-codes.sql` | Create `promo_codes` table, add promo columns to orders |
| `add-vk-id.sql` | Add `vk_id` column to users for VK OAuth |

---

## Documentation (`/docs/`)

| File | Purpose |
|------|---------|
| `STRUCTURE.md` | Codebase organization (this file) |
| `FEATURES.md` | Platform features documentation |
| `ORDER_FLOW.md` | Order lifecycle and statuses |
| `SHIPPING.md` | Shipping integration guide |
| `ADMIN_MINIAPP.md` | Admin panel documentation |
| `THEMING.md` | Theme system implementation |
| `AR_VIEW.md` | AR visualization feature |
| `ANTI_SCRAPING.md` | Anti-scraping and bot protection |

---

## Request Flow

```
Client Request
     ↓
server.js (Express)
     ↓
Middleware (CORS, JSON, Auth)
     ↓
server/routes/index.js
     ↓
Route Handler (auth.js, products.js, etc.)
     ↓
API Handler (/api/*)
├── Uses server/utils/* helpers
├── Queries database via lib/db.js
└── Returns via response-helpers.js
     ↓
Response to Client
```

---

## Authentication Flow

```
1. User visits site
2. Telegram Web App initializes
3. Frontend: core/auth.js loads tokens from localStorage
4. If no tokens: POST /api/auth/telegram
   ├── Validates Telegram data
   ├── Creates/updates user in database
   └── Returns JWT tokens (access + refresh)
5. Frontend stores tokens in localStorage
6. Subsequent requests include Authorization: Bearer <token>
7. Backend middleware validates and attaches req.user
8. Token expiry: POST /api/auth/refresh with refresh token
```

---

## Key Patterns

### Response Format
```javascript
// Success
{ success: true, data: { ... } }

// Error
{ success: false, error: "Error message" }
```

### Database Queries
```javascript
// Parameterized queries (SQL injection safe)
pool.query('SELECT * FROM orders WHERE id = $1', [orderId])

// Reusable queries
const order = await requireOrder(pool, orderId, res);
if (!order) return; // 404 already sent
```

### Error Handling
```javascript
try {
  // Database operations
  return success(res, data);
} catch (err) {
  console.error('Error:', err);
  return error(res, 'Internal server error', 500);
}
```

---

## File Count Summary

| Category | Count | Location |
|----------|-------|----------|
| API Handlers | 102 | `/api/` |
| Route Modules | 8 | `/server/routes/` |
| Middleware | 5 | `/server/middleware/` |
| Server Utils | 8 | `/server/utils/` |
| Services | 5 | `/server/services/` |
| Frontend Pages (HTML) | 14 | `/public/pages/` |
| Frontend Pages (JS) | 22 | `/public/js/pages/` |
| Frontend Modules | 28 | `/public/js/modules/` |
| Frontend Core | 16 | `/public/js/core/` |
| Frontend CSS (top-level) | 32 | `/public/css/` |
| Frontend CSS (components) | 6 | `/public/css/components/` |
| Admin Views | 20 | `/admin-miniapp/js/views/` |

---

## Deployment

### Primary: Vercel

Production deployments use Vercel's serverless platform. Configuration in `vercel.json`.

### Secondary: Yandex Cloud

Docker-based deployment to Yandex Cloud Serverless Containers for staging/alternative hosting.

#### CI/CD Workflows

| Workflow | Trigger | Image Tag |
|----------|---------|-----------|
| `deploy-yandex.yml` | Push to `main` / Manual | `latest` |
| `deploy-yandex-staging.yml` | Push to `develop` / Manual | `staging` |
| `cleanup-registry.yml` | Manual | N/A |

**Cost note:** Vulnerability scanning is disabled in Container Registry settings to avoid scanning charges (~13.5 ₽/scan). Storage costs are minimal (~3 ₽/GB/month).

#### Container Registry Management

To reduce registry storage costs, the deployment workflows:
- Use a single tag per deployment (`latest` or `staging`)
- Automatically clean up old images after each deployment
- Keep only 3 most recent images for rollback

#### Manual Cleanup

To clean up old images manually:
1. Go to GitHub → **Actions** → **Cleanup Container Registry**
2. Click **Run workflow**
3. Configure options:
   - `keep_count`: Images to keep (default: 3)
   - `dry_run`: Preview mode (default: true)
   - `image_name`: Specific image or empty for all

#### Required Secrets

| Secret | Description |
|--------|-------------|
| `YC_SA_JSON_KEY` | Service Account JSON key |
| `YC_REGISTRY_ID` | Container Registry ID |
| `YC_CONTAINER_ID` | Production Container ID |
| `YC_CONTAINER_ID_STAGING` | Staging Container ID |
| `YC_SERVICE_ACCOUNT_ID` | Service Account ID |

#### Service Account Roles

Required roles for the service account:
- `container-registry.images.pusher` - Push images
- `container-registry.images.deleter` - Delete old images
- `serverless.containers.admin` - Deploy containers

---

## Related Documentation

- **Order Flow:** See `ORDER_FLOW.md` for complete order processing documentation
- **Admin Panel:** See `ADMIN_MINIAPP.md` for admin interface documentation
- **Features:** See `FEATURES.md` for key features documentation
- **Shipping:** See `SHIPPING.md` for shipping integration documentation
- **Theming:** See `THEMING.md` for dark/light theme system
- **Anti-Scraping:** See `ANTI_SCRAPING.md` for bot protection
- **Database:** See `SQL_SCHEMA.sql` for complete database schema
