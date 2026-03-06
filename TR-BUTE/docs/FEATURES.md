# Platform Features

> **Last Updated:** February 20, 2026

This document describes the key features of the TR-BUTE e-commerce platform.

---

## Table of Contents

1. [Authentication](#authentication)
2. [Product System](#product-system)
3. [Shopping Cart](#shopping-cart)
4. [Order System](#order-system)
5. [Payment Integration](#payment-integration)
6. [Shipping Integration](#shipping-integration)
7. [Review System](#review-system)
8. [Favorites](#favorites)
9. [Notifications](#notifications)
10. [Admin Features](#admin-features)
11. [FAQ System](#faq-system)
12. [Stories System](#stories-system)
13. [Certificates](#certificates)
14. [Product Picker](#product-picker)
15. [Theme System](#theme-system)
16. [AR View](#ar-view)
17. [Hints System](#hints-system)
18. [Tooltip System](#tooltip-system)
19. [Products Header](#products-header)
20. [Parcel Pickup & Return Flow](#parcel-pickup--return-flow)

---

## Authentication

### Telegram Web App Login

**Primary authentication method:**
1. User opens app via Telegram
2. Telegram Web App SDK provides `initData`
3. Backend validates signature with bot token
4. JWT tokens issued (access + refresh)

**Files:**
- `server/routes/auth.js` - POST /api/auth/telegram
- `server/middleware/telegram-validation.js`
- `public/js/core/auth.js`

### Yandex OAuth Login

**Alternative for web users:**
1. User clicks "Login with Yandex"
2. Redirected to Yandex OAuth
3. Callback receives auth code
4. Backend exchanges for user info
5. JWT tokens issued

**Files:**
- `server/routes/auth.js` - GET /auth/yandex/callback
- POST /api/auth/yandex

### Token Refresh

- Access token expires (short-lived)
- Refresh token used to get new access token
- POST /api/auth/refresh

---

## Product System

### Product Data

**Product Fields:**
- `title` - Product name
- `alt` - Alternate name (for search)
- `key_word` - Keywords (for search)
- `description` - Full description
- `genre` - Category (anime, nature, etc.)
- `type` - Product type
- `status` - Availability status
- `price`, `old_price` - Pricing
- `triptych` - Is multi-panel art
- `slug` - URL-friendly identifier

**Product Status:**
| Status | Description |
|--------|-------------|
| `available` | For sale |
| `coming_soon` | Pre-release |
| `not_for_sale` | Display only |
| `test` | Testing, hidden |
| `available_via_var` | Available through variant product |

### Product Images

**Multiple images per product:**
- Stored in `product_images` table
- Hosted on Supabase storage
- Sortable order
- Image types: main, detail, etc.

**Files:**
- `api/products/images/*.js`
- `admin-miniapp/js/components/imageManager.js`

### Product Variants

**Linked products as variants:**
- Products linked via `product_link_groups`
- Each variant has `variant_name`
- Displayed as options on product page

**Example:** Same artwork in different sizes linked as variants.

**Files:**
- `api/products/links.js`
- `product_link_groups`, `product_link_items` tables

### Product Pricing

**Format-based pricing:**
- Prices stored in `product_prices` table
- Different prices for: A3, A2, A1
- Different prices for: frameless, framed
- Discount and base prices

### Catalogs

**Product organization:**
- Products grouped into catalogs
- Catalog has title, description, cover image
- Sortable catalog order
- Products can be in multiple catalogs

**Files:**
- `api/catalogs/*.js`
- `admin-miniapp/js/views/catalogs.js`

### Alphabetical Scrubber

**Quick navigation for large catalogs:**
- Vertical letter picker on the right side of catalog
- Grouped letter labels (e.g., "A-D", "E-H") for compact display
- Expandable: tap group to see individual letters
- Smooth scroll to first product starting with selected letter
- Shows only letters that have matching products

**Features:**
- Touch-friendly design for mobile
- Automatic letter grouping based on product distribution
- Visual feedback on active letter
- Fade-in animation when catalog loads

**Files:**
- `public/js/pages/catalog.js` - Scrubber logic
- `public/css/catalog.css` - Scrubber styling

---

## Shopping Cart

### Cart Features

- Add products with quantity
- Select format and options
- Update quantities
- Remove items
- Check/uncheck items
- Persistent storage

### Cart Sync

**Multi-device sync:**
- Cart stored in `user_cart` table
- Synced on login
- Background sync updates

**Files:**
- `api/sync/cart.js`
- `public/js/core/data-sync.js`
- `public/js/pages/cart.js` - Cart display and item management
- `public/js/pages/checkout.js` - Order form and submission

### Cart to Order

1. User clicks "Checkout" on cart page
2. Navigates to `/checkout` page
3. Selects shipping provider (CDEK, Pochta)
4. Selects delivery type (PVZ, courier)
5. Fills address form
6. Reviews shipping cost
7. Creates order from cart items
8. Cart cleared on order creation

---

## Order System

See `ORDER_FLOW.md` for complete documentation.

### Key Features

- 10 order statuses
- User can edit in `created` status
- Admin can edit at any status
- Tracking integration
- Review system on delivered orders
- Refund workflow with status-specific modals

### Profile Page Order List

**Simplified order cards:**
- Single "Открыть заказ" button on each order card
- No action buttons (refund, pay, etc.) on list view
- All order actions available on order detail page
- Clicking order card or button navigates to order page

**Files:**
- `public/js/pages/profile.js` - Profile order list
- `public/css/profile.css` - Order card styling

### Order Detail Page

**Order actions:**
- Context-aware action buttons based on status
- Refund request with two-button modal for shipped/delivered orders
- Contact support modal for issue reporting
- Payment button for awaiting_payment status
- Delivery confirmation for shipped orders

**Modal System:**
- All modals use `mobile-modal.js` for consistent styling
- Action sheets, confirmations, prompts, and alerts
- Bottom sheet on mobile, centered modal on desktop
- Theme-aware styling

**Files:**
- `public/js/pages/order.js` - Order page UI and actions
- `public/js/modules/mobile-modal.js` - Modal system
- `public/css/mobile-modal.css` - Modal styling
- `public/css/order.css` - Order page styles

---

## Payment Integration

### T-Bank (Primary)

**Inline payment overlay:**
1. Generate payment link: POST /api/payment/tbank/create-link
2. Open T-Bank payment form in iframe overlay
3. User completes payment (card, SBP, T-Pay)
4. Webhook received: POST /api/payment/tbank/webhook
5. Order status updated to `paid`

**Features:**
- Inline iframe overlay (no redirect)
- SBP (fast payment system) support
- T-Pay one-click payment
- Receipt generation

**Files:**
- `server/services/payment/tbank.js`
- `api/payment/tbank/*.js`
- `public/css/order.css` (T-Bank payment overlay styles)

---

## Shipping Integration

See `SHIPPING.md` for complete documentation.

### Supported Providers

| Provider | Type | Features |
|----------|------|----------|
| CDEK | Direct API v2 | PVZ, Courier, Tracking |
| Pochta Russia | Via ApiShip | Standard, 1st Class, Courier, EMS |

### Key Features

- Rate calculation
- Pickup point search (CDEK)
- Auto-tracking updates
- Parcel packaging calculator

---

## Review System

### User Reviews

**Who can review:**
- Only users who purchased the product
- Verified via `order_items` check

**Review content:**
- Rating (1-5 stars)
- Text review
- Optional image

**Where to review:**
- Order page (for shipped/delivered orders)
- Product page (if purchased)

**Files:**
- `api/reviews/*.js`
- `public/js/pages/order.js` - review section
- `public/js/pages/product.js` - reviews display

### Feedback Types

| Type | Description |
|------|-------------|
| `review` | Product review with rating |
| `comment` | General comment |
| `suggestion` | User suggestion |

### Admin Moderation

- View all feedback
- Mark as read/unread
- Hide inappropriate content
- Respond to feedback

**Files:**
- `api/feedback/*.js`
- `admin-miniapp/js/views/feedback.js`

---

## Favorites

### Features

- Add/remove products from favorites
- Tag favorites for organization
- Sync across devices
- Display count on product cards

### Implementation

**Files:**
- `api/sync/favorites.js`
- `public/js/core/favorites.js`
- `public/js/pages/favorites.js`

**Table:** `user_favorites`

---

## Notifications

### Channels

| Login Type | Channel |
|------------|---------|
| Telegram | Telegram Bot Messages |
| Yandex | Email |

### User Notifications

- Order status changes
- Payment confirmation
- Shipping updates
- Delivery confirmation
- Contact requests (on_hold)
- Parcel arrived at pickup point (with storage deadline)
- Parcel storage reminders (daily until pickup or return)
- Parcel returned to sender (with retry / refund options)

### Admin Notifications

- New orders
- Payment received
- Refund requests

### Implementation

**Files:**
- `lib/notifications.js`
- `api/webhooks/user-bot.js`
- `api/webhooks/admin-bot.js`

---

## Admin Features

See `ADMIN_MINIAPP.md` for complete documentation.

### Dashboard

- Order statistics
- Revenue overview
- Recent activity

### Order Management

- Filter and search orders
- Update status
- Edit order items
- Send notifications
- Batch shipment management

### Product Management

- CRUD products
- Image management
- Catalog organization
- Variant linking

### Analytics

- Sales reports
- Product performance
- Customer metrics

### Settings

- Emergency mode
- Shipment calendar
- Global configuration

---

## FAQ System

### Structure

- Categories with icons
- Items under categories
- Sortable order
- Image support for items

### Admin Management

- CRUD categories
- CRUD items
- Reorder items

### User Display

- Collapsible categories
- Search functionality
- Popup modal on product pages

**Files:**
- `api/faq/*.js`
- `api/admin/faq/*.js`
- `public/js/pages/faq.js`
- `public/js/modules/faq-popup.js`

---

## Stories System

### Instagram/VK-like Stories

TR/BUTE includes a stories feature for communicating new features and updates to users.

### Features

| Feature | Description |
|---------|-------------|
| **Auto-show on first visit** | Stories popup shown automatically to new users |
| **Seen tracking** | Remembers which stories user has viewed |
| **Sectioned progress border** | Visual indicator showing story count and viewed status |
| **Pause on interaction** | Press (desktop) or hold (mobile) to pause |
| **Navigation** | Tap left/right or swipe to navigate between stories |
| **Link support** | Optional call-to-action button per story |
| **Scheduling** | Start and end dates for timed campaigns |

### User Flow

1. User visits site for first time
2. Stories popup shows automatically (if active stories exist)
3. User views stories, progress saved to localStorage
4. Stories circle appears in FAQ popup header (top-right)
5. Circle border shows segments per story (colored = unseen)
6. User can tap circle to view stories again

### Admin Management

Stories are managed in Admin Panel > Project Management > Stories tab:
- Add/edit/delete stories
- Drag to reorder
- Set image URL (VK CDN supported)
- Optional title and link button
- Configure duration per story
- Schedule start/end dates
- Toggle active/inactive

### Implementation

**API Endpoints:**
- `GET /api/stories/active` - Get active stories (public)
- `GET /api/admin/stories` - Get all stories (admin)
- `POST /api/admin/stories` - Create story
- `PUT /api/admin/stories` - Update story
- `DELETE /api/admin/stories` - Delete story
- `POST /api/admin/stories/reorder` - Reorder stories

**Storage:**
- Stories data: `stories` database table
- Seen tracking: `localStorage` key `tributary_seen_stories`
- Auto-shown flag: `localStorage` key `tributary_stories_auto_shown`

**Files:**
- `api/stories/active.js` - Public endpoint
- `api/admin/stories/index.js` - Admin CRUD
- `api/admin/stories/reorder.js` - Reorder endpoint
- `public/js/modules/stories-popup.js` - Popup component
- `public/js/modules/faq-popup.js` - Integration with FAQ popup
- `admin-miniapp/js/views/project-management.js` - Admin UI

**Database Table: `stories`**

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial | Primary key |
| `title` | text | Optional title overlay |
| `image_url` | text | Story image URL (required) |
| `link_url` | text | Optional CTA link |
| `link_text` | text | CTA button text |
| `duration` | integer | Display time in ms (default: 5000) |
| `is_active` | boolean | Whether story is active |
| `starts_at` | timestamp | Optional start date |
| `ends_at` | timestamp | Optional end date |
| `sort_order` | integer | Display order |
| `created_at` | timestamp | Creation time |
| `updated_at` | timestamp | Last update time |

---

## Certificates

### Gift Certificates

**Features:**
- Multiple templates
- Custom recipient name
- Variable amounts
- PDF generation
- Physical delivery option

**Workflow:**
1. User selects template
2. Enters recipient and amount
3. Purchases certificate (order created)
4. PDF generated on payment
5. Delivered via email/physical

**Redemption:**
- Unique certificate code
- Applied at checkout
- Tracks redeemer and order

**Tables:**
- `certificate_templates`
- `certificates`

**Files:**
- `api/certificates/index.js`
- `public/js/pages/certificate.js`

---

## Product Picker

### Interactive Product Discovery

**Features:**
- Swipe-based interface
- Like/dislike products
- Progress tracking
- History navigation

**User Flow:**
1. User enters picker
2. Products shown one at a time
3. Swipe right = like (add to favorites)
4. Swipe left = pass
5. Progress saved across sessions

**Files:**
- `api/sync/picker.js`
- `public/js/pages/picker.js`

**Table:** `user_picker_progress`

---

## Recently Viewed

### Tracking

- Last 20 products viewed
- Stored in localStorage
- Displayed on relevant pages

**Files:**
- `public/js/core/viewed-products.js`

---

## Release Subscriptions

### Coming Soon Products

**Features:**
- Subscribe to product release
- Notification when available
- Check subscription status

**Files:**
- `api/products/subscribe-release.js`
- `api/products/check-subscription.js`
- `api/products/send-release-notifications.js`

---

## Data Synchronization

### Background Sync

**Synced Data:**
- Cart items
- Favorites
- Picker progress

**Implementation:**
- Periodic sync in background
- Sync on page focus
- Sync on user action

**Files:**
- `public/js/core/data-sync.js`
- `api/sync/*.js`

---

## Loading States

### Progress Bar

**Top loading indicator:**
- Animated gradient bar at top of viewport
- Shows during page loads and refreshes
- 2px height with brand gradient (orange → yellow)
- Auto-hides when page is ready

**Implementation:**
- `public/css/router.css` - Progress bar styles
- `public/js/modules/loading-bar.js` - Show/hide logic
- Loaded on all pages in `<head>` section

**Behavior:**
- Shows immediately when page starts loading
- Animates to ~70% width during load
- Completes to 100% and fades out when `DOMContentLoaded` fires
- Also appears briefly on `beforeunload` (navigation away)

### Skeleton Loaders

**Coordinated loading:**
- Module-based loading states
- Skeleton screens during load
- Progressive content reveal

**Files:**
- `public/js/core/loading-state.js`
- `public/js/modules/skeleton-loader.js`

---

## UI Components

### Reusable Modules

| Module | Purpose |
|--------|---------|
| `header.js` | Navigation bar |
| `bottom-nav.js` | Mobile navigation |
| `footer.js` | Footer |
| `product-grid.js` | Product cards |
| `cart.js` | Cart widget |
| `toast.js` | Notifications |
| `zoom.js` | Image zoom |
| `mobile-modal.js` | All modal dialogs, bottom sheets, and toasts |
| `sort-scrubber.js` | Alphabetical fast navigation |
| `ar-tracking.js` | AR poster tracking |
| `depth-estimation.js` | ML depth estimation for AR |
| `tooltip.js` | Smart hover/long-press tooltips for icon-only buttons |

---

## Emergency Mode

### Site Lockdown

**When enabled:**
- Checkout disabled
- Message displayed to users
- Orders cannot be created

**Configuration:**
- Toggle in admin panel
- Stored in `app_settings`

**Files:**
- `public/js/core/app-settings.js`
- `admin-miniapp/js/views/project-management.js`

---

## External Services

| Service | Purpose |
|---------|---------|
| PostgreSQL (Supabase) | Database |
| Supabase Storage | Image hosting |
| T-Bank | Payment processing |
| CDEK | Shipping (direct) |
| ApiShip | Shipping (Pochta) |
| Telegram Bot API | Notifications |
| Yandex SMTP | Email service |
| Vercel | Hosting |

---

## Theme System

TR/BUTE supports dark (default) and light themes.

### Features

- Dark mode (default) and light mode
- Theme preference persisted in localStorage
- Toggle in Profile page settings
- Unified color system with CSS variables
- Status colors unified with admin miniapp
- Skeleton loaders adapt to theme

### How It Works

1. `theme.js` loads early in `<head>` to prevent flash
2. Theme read from localStorage (key: `tributary-theme`)
3. Applied via `data-theme` attribute on `<body>`
4. CSS variables switch automatically

### Toggle Location

Profile page > Settings > "Light theme" toggle

### Implementation

**Files:**
- `public/css/global.css` - All CSS variables for theming
- `public/js/modules/theme.js` - Theme toggle logic
- `public/css/profile.css` - Toggle button styles

**JavaScript API:**
```javascript
window.ThemeManager.get()    // Get current theme
window.ThemeManager.set('light')  // Set theme
window.toggleTheme()         // Toggle theme
```

See **[THEMING.md](./THEMING.md)** for full documentation.

---

## AR View

### Augmented Reality Poster Visualization

TR/BUTE includes an advanced AR feature that allows users to visualize posters on their walls before purchasing.

### Features

| Feature | Description |
|---------|-------------|
| **Live Camera Mode** | Real-time poster placement using device camera |
| **Image Upload Mode** | Upload wall photo for static visualization |
| **Custom Poster Upload** | Upload any image for visualization |
| **Size Selection** | A3, A2, A1 format options |
| **Frame Options** | With or without black metal frame |
| **Corner Mode** | Manual wall perspective definition |
| **Triptych Support** | Multi-panel artwork with adjustable gaps |

### Technology

- **Three.js** - 3D rendering engine
- **TensorFlow.js** - Depth estimation for wall detection
- **Optical Flow** - Poster tracking across video frames

### User Flow

1. User clicks "AR Preview" on product page
2. Grants camera permission or uploads wall photo
3. Depth model loads (progress indicator shown)
4. Tap to place poster on wall
5. Adjust size and frame options
6. Navigate to product when ready to purchase

### Implementation

**Files:**
- `public/pages/ar-view.html` - AR page template
- `public/js/pages/ar-view.js` - AR logic
- `public/css/ar-view.css` - AR styling

**Route:** `/ar-view?slug=product-slug`

See **[AR_VIEW.md](./AR_VIEW.md)** for complete documentation.

---

## Hints System

### Platform-Specific User Hints

TR/BUTE includes a hints system that provides contextual guidance to users based on their platform.

### Features

| Feature | Description |
|---------|-------------|
| **Platform Detection** | Detects Telegram Desktop, macOS, iOS, Android, and web |
| **Dismissible Hints** | Users can dismiss hints permanently |
| **LocalStorage Persistence** | Dismissed hints remembered across sessions |
| **Timed Auto-Hide** | Hints automatically hide after 5 seconds if not dismissed |
| **Corner Glow Effect** | Pulsating glow animation draws attention |
| **Animated Arrow** | Bouncing arrow points to relevant UI element |

### Current Hints

| Hint ID | Platform | Message | Purpose |
|---------|----------|---------|---------|
| `desktop-resize-hint` | Telegram Desktop (tdesktop, macos) | "Вы можете увеличить окно каталога" | Inform users they can resize the miniapp window |

### How It Works

1. `hints.js` loads on page
2. Detects platform via `Telegram.WebApp.platform`
3. Checks localStorage for previously dismissed hints
4. Shows relevant hints with glow + arrow + bubble
5. Auto-hides after 5 seconds OR user clicks X
6. If X clicked, stores dismissal in localStorage

### Visual Design

- **Glow**: Quarter-circle radial gradient at bottom-right corner, pulsating animation
- **Arrow**: Points diagonally toward corner (resize handle area)
- **Bubble**: Positioned above the glow, contains text and close button
- **Theme-aware**: Uses CSS variables for colors

### Implementation

**Files:**
- `public/css/hints.css` - Hint styling and animations
- `public/js/modules/hints.js` - Hint logic and platform detection

**LocalStorage Key:** `tribute-dismissed-hints` (JSON array of hint IDs)

### JavaScript API

```javascript
// Show a custom hint
window.HintsManager.show({
  id: 'my-hint-id',
  text: 'Hint message here',
  duration: 5000,  // optional, default 5000ms
  onDismiss: () => console.log('Dismissed')  // optional callback
});

// Check if hint was dismissed
window.HintsManager.isDismissed('my-hint-id');

// Manually dismiss a hint
window.HintsManager.dismiss('my-hint-id');

// Get platform info
window.HintsManager.getPlatform();
// Returns: { isTelegram: boolean, platform: string, isDesktop: boolean, isMobile: boolean }
```

### Platform Detection Values

| Platform | `Telegram.WebApp.platform` |
|----------|----------------------------|
| Telegram Desktop (Windows/Linux) | `tdesktop` |
| Telegram for macOS | `macos` |
| iOS App | `ios` |
| Android App | `android` |
| Telegram Web A | `weba` |
| Telegram Web K | `webk` |
| Not in Telegram / Unknown | `unknown` |

---

## Tooltip System

### Smart Hover Tooltips for Icon-Only Buttons

TR/BUTE includes a tooltip module that surfaces labels for icon-only buttons across the entire site. Tooltips are positioned dynamically to stay within the viewport and support both desktop hover and mobile long-press (miniapp only).

### Behavior

| Environment | Trigger | Behavior |
|-------------|---------|----------|
| **Desktop** (hover or fine pointer) | 200ms hover delay | Shows above/below anchor, hides on mouseleave or click |
| **Mobile – Miniapp only** (Telegram / VK) | 500ms long-press hold | Shows on hold completion; any movement >10px cancels; linger 1.5s after finger lifts; dismisses on scroll |
| **Mobile – Regular browser** | — | No touch tooltips (context menu is not suppressed, long-press conflicts with OS menu) |

### Design

- Tooltip bubble: `--bg-secondary` background, `--border-color` border, rounded corners
- Arrow: two-layer CSS triangle (border layer + fill layer) for a 1px bordered arrow
- Placement: prefers above anchor; falls back to below if not enough space
- Horizontal shift: centers over anchor, clamped to viewport edges with 8px padding; arrow offset adjusts to always point at the anchor center

### Miniapp Detection

Touch tooltips activate only inside Telegram MiniApp or VK MiniApp because those environments suppress the OS long-press context menu, making a 500ms hold safe. Detection uses:
- `window.Telegram.WebApp.initData.length > 0` or a non-empty/non-unknown `platform`
- `URLSearchParams('vk_app_id')` for VK

### Element Coverage

Tooltips are attached to any element matching `TOOLTIP_SELECTORS` in `tooltip.js`. The module uses a `title` → `data-tooltip` promotion: if an element has a `title` attribute, it is moved to `data-tooltip` (removing the native browser tooltip) on first attachment.

Covered element groups: header icon buttons, footer social buttons, product card buttons (add, variant dropdown, format ±), product page (favorite, share, variant items), cart (check, delete, favorite), favorites (tag button), picker controls, AR buttons, scroll-to-top, scrubber trigger, inline search clear, stories circle, image reload button.

**Scrub container exclusion:** Elements inside `.product-carousel-thumbnails` and `.product-variants-list` are excluded — those containers handle their own touch tooltip logic via `carousel.js`.

### SPA Safety

- `spa:pageleave` event triggers `hideTooltip()` to prevent stale tooltips persisting across navigations
- `document.contains(anchor)` guard in `showTooltip` prevents errors from anchors removed during navigation
- A `MutationObserver` re-runs `initTooltips()` (debounced 100ms) whenever DOM children change, so dynamically injected elements (header, product cards, etc.) are covered automatically

### Implementation

**Files:**
- `public/js/modules/tooltip.js` - Tooltip lifecycle, positioning, event handlers
- `public/css/components/tooltip.css` - Tooltip and arrow styles (imported via `components.css`)

**Key constants (tooltip.js):**

| Constant | Value | Purpose |
|----------|-------|---------|
| `HOVER_DELAY` | 200ms | Delay before hover tooltip appears |
| `TOUCH_HOLD_DELAY` | 500ms | Hold duration to trigger mobile tooltip |
| `TOUCH_LINGER` | 1500ms | How long tooltip stays after finger lifts |
| `TOUCH_MOVE_THRESH` | 10px | Finger movement that cancels hold |
| `TOOLTIP_GAP` | 8px | Gap between tooltip and anchor |

---

## Products Header

### Sticky Sub-Header for Catalog and Favorites

The `.products-header` is a secondary sticky bar that sits directly below the main navigation header on the catalog (`/`) and favorites (`/favorites`) pages. It contains sort controls, filter toggles, and layout options relevant to the current page.

### Scroll Behavior

- **Scroll down:** both the main header and `.products-header` slide up together (via CSS `transform`), freeing screen space for content
- **Scroll up:** both bars reappear in sequence
- The products-header `top` property is dynamically set by `header.js` to exactly the height of the main header so they are always flush

### Implementation

**CSS:**
- `.products-header` defined in `global.css` with `position: sticky`, `z-index: 998`
- Scroll hide/show logic in `public/js/modules/header.js` via `updateCachedHeights()` and the scroll event listener

**Affected pages:**
- `public/pages/catalog.html` + `public/css/catalog.css`
- `public/pages/favorites.html` + `public/css/favorites.css`

---

## Parcel Pickup & Return Flow

### Storage Countdown, Pickup Reminders, and Return-to-Sender

When a shipped parcel arrives at the pickup point (CDEK or Pochta), the system automatically tracks the storage deadline and notifies the user, then handles the outcome if the parcel is not collected.

### Arrival Detection

The CRON job (`/api/cron/update-tracking`, runs every 4 hours) polls CDEK and Pochta tracking APIs. When it detects an "arrived at pickup point" status:

| Provider | Status codes |
|----------|-------------|
| CDEK | `READY_FOR_PICKUP` |
| Pochta | `arrived`, `ready_for_pickup` |

On first detection, the cron records `arrived_at_point_at` and calculates `storage_deadline` using per-provider storage day settings configured in Admin > Project Management > Хранение tab.

### User Notifications

| Event | Notification |
|-------|-------------|
| Parcel arrived at pickup point | `parcel_at_pickup_point` — sent once with deadline |
| Daily storage reminder (until pickup or return) | `storage_pickup_reminder` — color-coded by urgency |
| Parcel returned to sender | `parcel_returned_to_sender` — with two action choices |

All notifications support Telegram, VK, and email channels.

### Order Page – Tracking Section

When the parcel is at the pickup point, the order page shows:
- **Storage countdown timer** — color-coded green → yellow → red as the deadline approaches
- **"Проблемы с заказом" button** — opens a modal with four problem types: parcel not arrived, wrong address, missed pickup, refund request; each type includes instructions and support contact links

### Return-to-Sender Flow

When the cron detects a return status (`CDEK: RETURNED`, `Pochta: returned`), the user is notified with two options:
1. **Retry delivery** — re-delivery at 2× the original shipping cost
2. **Cancel with refund** — product-only refund (shipping not refunded)

The user's choice is stored in `orders.return_action` for admin to process.

### Admin Storage Settings

Admin configures storage days per provider and service type in Admin Panel > Project Management > Хранение sub-tab:
- CDEK PVZ
- CDEK Courier
- Pochta Standard
- Pochta Express
- Pochta Courier

Settings stored in `app_settings` under key `parcel_storage_settings`.

### New API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/parcel-storage-settings` | GET / PUT | Read/write storage day settings |
| `/api/orders/return-action` | POST | User submits return action choice |

### New Database Columns (`orders`)

| Column | Purpose |
|--------|---------|
| `arrived_at_point_at` | Timestamp when parcel arrived at pickup point |
| `arrival_notified` | Boolean — prevents duplicate arrival notifications |
| `storage_deadline` | Calculated deadline date |
| `last_storage_notification_at` | Timestamp of last reminder sent |
| `returned_to_sender_at` | Timestamp when return status detected |
| `return_action` | User's choice: `retry` or `cancel_refund` |
| `return_action_requested_at` | When user submitted the return action |

Columns are auto-created by the cron via `ALTER TABLE IF NOT EXISTS`.

### Implementation

**Files:**
- `api/cron/update-tracking.js` - Tracking poll + all notification triggers
- `api/admin/parcel-storage-settings.js` - Storage settings API
- `api/orders/return-action.js` - User return action endpoint
- `lib/notifications.js` - New notification types added
- `public/js/pages/order/tracking.js` - Storage countdown + return choice UI
- `admin-miniapp/js/views/project-management.js` - Хранение settings tab
