# Admin Miniapp

> **Last Updated:** January 22, 2026
> **Location:** `/admin-miniapp/`

The Admin Miniapp is a complete single-page application for managing the TR-BUTE e-commerce platform.

---

## Access & Authentication

**Entry Point:** `/admin-miniapp/index.html`

**Authentication:**
- Cookie-based JWT authentication
- Supports two roles: **Admin** and **Editor**
- Admin/Editor credentials stored in environment variables
- Auth token stored in HTTP-only secure cookie

**Environment Variables:**
```bash
# Admin credentials (full access)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_admin_password

# Editor credentials (limited access)
EDITOR_USERNAME=editor
EDITOR_PASSWORD=your_editor_password
```

**Login Flow:**
1. Navigate to `/admin/login`
2. Enter admin or editor credentials
3. POST `/api/admin/browser-login` validates credentials
4. JWT token stored in HTTP-only cookie
5. Role-based UI displayed based on permissions

---

## Roles & Permissions

### Admin Role
- Full access to all features
- Can configure editor permissions
- Can manage orders, products, statistics, and all settings

### Editor Role
- Limited access based on admin-configured permissions
- **Available features:**
  - Products management (cannot delete/set status to "not_for_sale")
  - Stories management
  - Feed (reviews, comments, suggestions - without orders)
- **Restricted features:**
  - Orders management
  - Project settings (except Stories if enabled)
  - Statistics (can be enabled by admin)
  - Editor settings configuration

### Configuring Editor Permissions

Admin can configure editor permissions in:
**Project Management → Редактор (Editor) tab**

Available permissions:
| Permission | Description | Editor Default |
|------------|-------------|----------------|
| Товары (Products) | Access to product management | ✅ Enabled |
| Stories | Access to stories management | ✅ Enabled |
| Лента (Feed) | Access to activity feed | ✅ Enabled |
| Статистика (Statistics) | Access to analytics | ❌ Disabled |

**Built-in restrictions for Editor (cannot be changed):**
- Cannot delete products (set status to "not_for_sale")
- Cannot see orders in activity feed
- Cannot access project management settings
- Cannot configure editor permissions

---

## Architecture

```
admin-miniapp/
├── index.html           # Entry point, loads all JS
├── style.css            # Admin UI styles
└── js/
    ├── main.js          # Router, view management
    ├── state.js         # Global state
    ├── config.js        # Configuration
    ├── auth.js          # Authentication
    ├── utils.js         # Utilities, status helpers
    ├── theme.js         # Light/dark theme
    ├── navigation.js    # Navigation component
    ├── components/      # Reusable components
    ├── utils/           # Utility modules
    └── views/           # Page views (tabs)
```

### Core Modules

| Module | Purpose |
|--------|---------|
| `main.js` | Router, view lifecycle, navigation |
| `state.js` | Global state management |
| `auth.js` | Admin authentication, token management |
| `config.js` | API base URL, settings |
| `utils.js` | Status helpers, formatting, utilities |
| `theme.js` | Light/dark theme toggle |
| `navigation.js` | Tab navigation component |

### Utility Modules

| Module | Purpose |
|--------|---------|
| `utils/apiClient.js` | API requests with auth headers |
| `utils/modalManager.js` | Modal dialog handling |
| `utils/pendingChanges.js` | Unsaved changes detection |
| `utils/productSearch.js` | Unified product search |

### Components

| Component | Purpose |
|-----------|---------|
| `components/imageManager.js` | Image upload, reorder, delete |

---

## Views (Tabs)

### 1. Dashboard (`views/dashboard.js`)

**Purpose:** Overview statistics and quick metrics

**Features:**
- Order counts by status
- Recent orders
- Revenue metrics
- Quick actions

### 2. Orders (`views/orders.js` + submodules)

**Purpose:** Complete order management

**File Structure:**
```
views/orders/
├── index.js         # Main orders list, table rendering
├── details.js       # Order detail modal
├── filters.js       # Status, date, search filters
├── items.js         # Add/edit/remove order items
├── product-search.js# Search products to add
├── rendering.js     # Table row rendering
├── shipping.js      # Shipping cost display
├── status.js        # Status update logic
└── toggles.js       # Processed/urgent toggles
```

**Features:**
- Filterable order list (status, date range, search)
- Order detail view with full information
- Edit order items (add, remove, change quantity)
- Update delivery information
- Change order status
- Toggle processed/urgent flags
- Send contact notifications (for on_hold)
- View and add tracking information

**Order Table Columns:**
- Order ID
- Customer name
- Status (color-coded badge)
- Total price
- Date
- Processed flag
- Urgent flag
- Actions

**Status Filter Options:**
```javascript
['all', 'created', 'awaiting_payment', 'paid', 'confirmed',
 'shipped', 'delivered', 'on_hold', 'refund_requested',
 'refunded', 'cancelled']
```

### 3. Products (`views/products.js`)

**Purpose:** Product and catalog management

**Features:**
- Product list with search
- Create new products
- Edit product details:
  - Title, description, keywords
  - Prices (base, discount)
  - Status (available, coming_soon, not_for_sale, test, available_via_var)
  - Genre, type, quality
  - Triptych flag
- Image management:
  - Upload images
  - Reorder images
  - Delete images
  - Set image types (main, detail, etc.)
- Catalog assignment
- Product variants/links

**Product Status Options:**
```javascript
['available', 'coming_soon', 'not_for_sale', 'test', 'available_via_var']
```

### 4. Catalogs (`views/catalogs.js`)

**Purpose:** Catalog organization

**Features:**
- Create new catalogs
- Edit catalog details (title, description, slug)
- Set cover image
- Reorder catalogs (drag-and-drop)
- Add/remove products from catalogs
- Delete catalogs

### 5. Feedback (`views/feedback.js`)

**Purpose:** Reviews and feedback moderation

**Features:**
- View all feedback (reviews, comments, suggestions)
- Filter by type
- Mark as read/unread
- Hide/show feedback
- View user details
- Respond to feedback

**Feedback Types:**
- `review` - Product reviews with rating
- `comment` - General comments
- `suggestion` - User suggestions

### 6. Feed (`views/feed.js`)

**Purpose:** Activity feed viewer

**Features:**
- Real-time activity log
- Order updates
- User actions
- System events
- Filterable by event type

### 7. Statistics (`views/statistics.js`)

**Purpose:** Analytics and reports

**Features:**
- Sales overview
- Revenue trends
- Product performance
- Customer metrics
- Order statistics
- Date range selection

### 8. Channel (`views/channel.js`)

**Purpose:** Telegram channel posting

**Features:**
- Compose posts
- Include product images
- Schedule posts
- Share product updates
- Announcement templates

### 9. Shipments (`views/shipments.js`)

**Purpose:** Shipment calendar and batch management

**Features:**
- Monthly calendar view
- Orders grouped by shipment date
- Set next shipment date
- Mark orders as Ready/Not Ready
- View order counts per date
- Batch management workflow

**Calendar Interface:**
```
┌─────┬─────┬─────┬─────┬─────┬─────┬─────┐
│ Mon │ Tue │ Wed │ Thu │ Fri │ Sat │ Sun │
├─────┼─────┼─────┼─────┼─────┼─────┼─────┤
│  1  │  2  │ [3] │  4  │  5  │  6  │  7  │
│     │     │  5  │     │     │     │     │
└─────┴─────┴─────┴─────┴─────┴─────┴─────┘
        [3] = next shipment date
         5  = order count
```

**Batch Status Toggle:**
- Click date to see orders
- Toggle [Ready] / [Not Ready] for each order
- Ready orders included in batch

### 10. Project Management (`views/project-management.js`)

**Purpose:** System settings, stories, and content management

**Subtabs:**
- **Orders** - Order status configuration
- **Estimates** - Cost estimation management
- **FAQ** - FAQ categories and items management
- **Stories** - Stories/announcements for users
- **Post** - Social media posting settings
- **Site** - Emergency mode and system settings

**Stories Management:**
- Create/edit/delete stories
- Drag-and-drop reordering
- Image URL input (VK CDN supported)
- Optional title and link button
- Duration configuration per story
- Start/end date scheduling
- Active/inactive toggle

**Site Settings:**
- Emergency mode toggle (disables checkout)
- Order submission toggle
- Delivery method configuration
- Maintenance mode
- System configuration

---

## API Client

All API calls use the centralized `apiClient.js`:

```javascript
import { apiGet, apiPost, apiPatch, apiDelete } from './utils/apiClient.js';

// GET request
const orders = await apiGet('/api/orders/search?status=paid');

// POST request
await apiPost('/api/orders/update-status', { order_id: 123, status: 'shipped' });

// PATCH request
await apiPatch('/api/orders/update', { order_id: 123, tracking_number: 'ABC123' });
```

**Features:**
- Automatic auth header injection
- Error handling
- Response parsing
- Retry logic for network errors

---

## State Management

Global state in `state.js`:

```javascript
const state = {
  orders: [],
  products: [],
  catalogs: [],
  currentOrder: null,
  filters: {
    status: 'all',
    dateFrom: null,
    dateTo: null,
    search: ''
  },
  // ... other state
};
```

**State Updates:**
- Direct mutation for simple updates
- Event-based updates for cross-component communication

---

## Modal Manager

Centralized modal handling:

```javascript
import { showModal, hideModal, showConfirm } from './utils/modalManager.js';

// Show custom modal
showModal({
  title: 'Edit Order',
  content: formHTML,
  onConfirm: async () => { /* save changes */ }
});

// Confirmation dialog
const confirmed = await showConfirm('Delete this order?');
if (confirmed) {
  await deleteOrder(orderId);
}
```

---

## Product Search

Unified search across product fields:

```javascript
import { searchProducts } from './utils/productSearch.js';

// Searches: title, alt (alternate name), key_word
const results = await searchProducts('sunset');
```

**Search Fields:**
- `title` - Product title
- `alt` - Alternate title
- `key_word` - Keywords

---

## Status Helpers

In `utils.js`:

```javascript
// Get status display name
getStatusDisplayName('awaiting_payment'); // "Awaiting Payment"

// Get status color
getStatusColor('paid'); // { bg: '#81C784', text: '#000' }

// Get status badge HTML
getStatusBadge('shipped'); // <span class="status-badge status-shipped">Shipped</span>
```

---

## Theme Support

Light/dark theme toggle:

```javascript
import { toggleTheme, getCurrentTheme } from './theme.js';

// Toggle theme
toggleTheme(); // switches between light/dark

// Get current theme
const theme = getCurrentTheme(); // 'light' or 'dark'
```

**CSS Variables:**
```css
:root {
  --bg-primary: #ffffff;
  --text-primary: #000000;
  /* ... */
}

[data-theme="dark"] {
  --bg-primary: #1a1a1a;
  --text-primary: #ffffff;
  /* ... */
}
```

---

## Pending Changes Detection

Warn before leaving with unsaved changes:

```javascript
import { markDirty, markClean, hasPendingChanges } from './utils/pendingChanges.js';

// Mark form as having unsaved changes
markDirty('orderForm');

// Check before navigation
if (hasPendingChanges()) {
  const leave = confirm('You have unsaved changes. Leave anyway?');
  if (!leave) return;
}

// Clear after save
markClean('orderForm');
```

---

## Image Manager Component

Reusable image management:

```javascript
import { ImageManager } from './components/imageManager.js';

const imageManager = new ImageManager({
  container: '#image-container',
  productId: 123,
  onUpload: async (file) => { /* upload to API */ },
  onDelete: async (imageId) => { /* delete from API */ },
  onReorder: async (imageIds) => { /* update order */ }
});
```

**Features:**
- Drag-and-drop upload
- Image preview
- Reorder via drag-and-drop
- Delete confirmation
- Upload progress

---

## Navigation

Tab-based navigation:

```javascript
// View definitions in main.js
const views = {
  dashboard: { load: loadDashboard },
  orders: { load: loadOrders },
  products: { load: loadProducts },
  catalogs: { load: loadCatalogs },
  feedback: { load: loadFeedback },
  feed: { load: loadFeed },
  statistics: { load: loadStatistics },
  channel: { load: loadChannel },
  shipments: { load: loadShipments },
  'project-management': { load: loadProjectManagement }
};

// Navigate to view
navigateTo('orders');
```

**Navigation Events:**
- `beforeNavigate` - Check for pending changes
- `afterNavigate` - Load new view

---

## API Endpoints Used

### Orders
- `GET /api/orders/search` - List orders with filters
- `GET /api/orders/get-by-id` - Get order details
- `PATCH /api/orders/update-status` - Change status
- `PATCH /api/orders/update` - Update order
- `POST /api/orders/items/add` - Add item
- `DELETE /api/orders/items/remove` - Remove item
- `PATCH /api/orders/items/update` - Update item quantity
- `PATCH /api/orders/toggle-processed` - Toggle processed
- `PATCH /api/orders/toggle-urgent` - Toggle urgent
- `POST /api/admin/orders/batch-status` - Set batch status
- `POST /api/admin/orders/send-contact-notification` - Send notification

### Products
- `GET /api/products/search` - Search products
- `POST /api/products/create` - Create product
- `PATCH /api/products/update` - Update product
- `POST /api/products/images/add` - Upload image
- `DELETE /api/products/images/delete` - Delete image
- `PATCH /api/products/images/reorder` - Reorder images

### Catalogs
- `POST /api/catalogs/create` - Create catalog
- `POST /api/catalogs/update` - Update catalog
- `POST /api/catalogs/delete` - Delete catalog
- `POST /api/catalogs/reorder` - Reorder catalogs
- `POST /api/catalogs/add-product` - Add product
- `POST /api/catalogs/remove-product` - Remove product

### Shipments
- `GET /api/admin/shipments/settings` - Get settings
- `POST /api/admin/shipments/settings` - Update settings
- `GET /api/admin/shipments/calendar` - Get calendar data

### Editor Settings (Admin only)
- `GET /api/admin/editor/settings` - Get editor permissions
- `POST /api/admin/editor/settings` - Update editor permissions

### Authentication
- `POST /api/admin/browser-login` - Browser login (admin/editor)
- `GET /api/admin/browser-verify` - Verify JWT and get user data
- `POST /api/admin/logout` - Logout and clear cookie

### Other
- `POST /api/admin/verify` - Verify Telegram admin credentials
- `GET /api/analytics/dashboard` - Dashboard stats
- `GET /api/feedback/*` - Feedback management

---

## Styling

### CSS Classes

**Status Badges:**
```css
.status-badge { /* base badge styles */ }
.status-created { background: #FFC107; }
.status-awaiting_payment { background: #FF9800; }
.status-paid { background: #81C784; }
/* ... etc */
```

**Layout:**
```css
.admin-container { /* main container */ }
.admin-header { /* top header */ }
.admin-nav { /* navigation tabs */ }
.admin-content { /* view content area */ }
```

**Components:**
```css
.admin-table { /* data tables */ }
.admin-form { /* forms */ }
.admin-modal { /* modals */ }
.admin-card { /* cards */ }
.admin-btn { /* buttons */ }
```

---

## Files Reference

| File | Lines | Purpose |
|------|-------|---------|
| `index.html` | ~50 | Entry point, script loading |
| `style.css` | ~800 | All admin styles |
| `js/main.js` | ~200 | Router, view management |
| `js/state.js` | ~50 | Global state |
| `js/config.js` | ~20 | Configuration |
| `js/auth.js` | ~100 | Authentication |
| `js/utils.js` | ~150 | Utilities |
| `js/views/orders.js` | ~500 | Order management |
| `js/views/orders/*.js` | ~1000 | Order submodules |
| `js/views/products.js` | ~400 | Product management |
| `js/views/shipments.js` | ~300 | Shipment calendar |
