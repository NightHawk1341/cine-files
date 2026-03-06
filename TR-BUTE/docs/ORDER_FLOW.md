# Order Flow

> **Last Updated:** February 24, 2026

This document describes how orders flow through the TR-BUTE e-commerce platform.

---

## Quick Overview

```
Cart -> [Auto delivery] -> Awaiting Payment -> Paid -> Confirmed -> Shipped -> Delivered
     -> [Manual delivery] -> Created (awaiting delivery calc) -> Awaiting Payment -> Paid -> ...
                                   |                                    |
                                   v                                    v
                               Cancelled                           On Hold / Refund Flow
```

---

## Order Statuses

The system uses 10 order statuses:

| Status | User Display | Admin Display | Color |
|--------|--------------|---------------|-------|
| `created` | Awaiting Delivery Calc | Awaiting Delivery Calc | Yellow |
| `awaiting_payment` | Awaiting Payment | Awaiting Payment | Orange |
| `paid` | Paid | Paid | Light Green |
| `confirmed` | Confirmed | Confirmed | Light Blue |
| `shipped` | In Transit | Shipped | Blue |
| `delivered` | Delivered | Delivered | Green |
| `on_hold` | Contact Support | On Hold | Grey |
| `refund_requested` | Refund Requested | Refund Requested | Purple |
| `refunded` | Refunded | Refunded | Dark Purple |
| `cancelled` | Cancelled | Cancelled | Red |

---

## Order Lifecycle

### 1. Order Creation

**User Flow:**
1. User adds items to cart on `/cart` page
2. Clicks "Checkout" → navigates to `/checkout` page
3. Selects shipping provider (CDEK or Pochta Russia)
4. Chooses delivery type (PVZ/Courier)
5. Fills in delivery details (name, phone, address)
6. System attempts to calculate shipping cost via provider API
7. Submits order

**After Submission — two paths:**

#### Path A: Auto-calculated delivery (`awaiting_payment`)

If delivery cost was calculated at checkout (CDEK/Pochta API returned a price):
- Order is created with status `awaiting_payment` immediately
- User is redirected to `/order?id=<order_id>` and sees the **Pay** button right away
- User is notified: "Delivery cost calculated, you can pay now"
- Admin is notified: "New order — delivery already calculated"

#### Path B: Manual delivery (`created`)

If delivery cost could not be calculated at checkout (e.g., international, unknown postal code):
- Order is created with status `created`
- User is redirected to `/order?id=<order_id>` and sees a message: "We will calculate delivery and notify you"
- No pay button is shown yet
- Admin is notified: "New order — please fill in delivery details"

**What's Stored:**
- Order items with prices at time of purchase
- Delivery address
- Shipping provider and service
- Delivery cost (if calculated)

**User Cannot Edit:** Orders are locked immediately after submission. No editing of items, address, or delivery type is possible.

### 2. Admin Sets Delivery (Manual Flow Only)

**Admin Flow:**
1. Admin opens the order in the admin panel
2. Fills in delivery cost, shipment date, timeframe
3. Saves the delivery details
4. Order status automatically transitions to `awaiting_payment`
5. User is notified via Telegram/email/VK: "Delivery calculated, total amount, pay now"
6. User can now pay on the order page

### 3. Payment Processing (`awaiting_payment` → `paid`)

**Payment Flow:**
1. User clicks "Pay" button on the order page
2. Email collected if not yet stored (required for T-Bank receipts per 54-ФЗ)
3. T-Bank payment session initiated
4. User completes payment
5. T-Bank webhook received
6. Status changes to `paid`
7. User and admin notified

### 4. Admin Confirmation (`confirmed`)

**Admin Flow:**
1. Admin reviews paid order
2. Verifies items are in stock
3. Marks order as confirmed
4. Status changes to `confirmed`
5. User notified

### 5. Shipping (`shipped`)

**Admin Flow:**
1. Admin creates shipment manually in CDEK/Pochta portal
2. Enters tracking number in admin panel
3. Changes status to `shipped`
4. User receives tracking number notification

**Tracking:**
- Tracking number stored in `orders.tracking_number`
- Auto-tracking via CRON job updates `tracking_history`
- User can view tracking timeline on order page

### 6. Delivery (`delivered`)

**Automatic Delivery:**
- CRON job polls CDEK/Pochta APIs
- When delivery confirmed, status auto-changes to `delivered`
- User notified

**Manual Delivery:**
- User clicks "I received it" button
- Status changes to `delivered`

**After Delivery:**
- User can leave reviews on products

---

## Alternative Flows

### Parcel at Pickup Point Flow

When tracking changes to "arrived at pickup point" (CDEK: `READY_FOR_PICKUP`, Pochta: `arrived`/`ready_for_pickup`), the cron job (`/api/cron/update-tracking`) triggers a storage countdown flow:

1. Cron records `arrived_at_point_at` and calculates `storage_deadline` from admin-configured storage days (per provider/service type)
2. Sends `parcel_at_pickup_point` notification with the deadline date
3. Sends daily `storage_pickup_reminder` notifications (color-coded by urgency) until the parcel is picked up or returned
4. Order page tracking section shows a live countdown timer

**Admin Storage Settings:**
- Configured per provider and service type (CDEK PVZ, CDEK Courier, Pochta Standard/Express/Courier)
- Managed in Admin Panel > Project Management > Хранение tab
- Stored in `app_settings` under `parcel_storage_settings`

### Return-to-Sender Flow

When tracking detects a return status (CDEK: `RETURNED`, Pochta: `returned`):

1. Cron records `returned_to_sender_at`
2. Sends `parcel_returned_to_sender` notification with two choices:
   - **Retry delivery** — re-delivery at 2× the original shipping cost
   - **Cancel with refund** — product-only refund (shipping not refunded)
3. User's choice is stored in `orders.return_action` for admin to process
4. Order page shows the return action choice UI

### On Hold Flow

When issues arise with an order:

1. Admin changes status to `on_hold`
2. Admin sends contact notification (button in admin panel)
3. User notified: "Please contact support"
4. After resolution, admin changes to appropriate status

### Refund Flow

```
Paid/Confirmed -> refund_requested -> refunded
                          |
                          v
                      on_hold (if declined)

Shipped/Delivered -> Contact Support Modal -> refund_requested (optional)
```

**For Paid/Confirmed/In Work Orders:**
1. User clicks "Запросить возврат" button on order page
2. Confirmation modal shown
3. User provides refund reason
4. Status changes to `refund_requested`
5. Admin reviews request
6. Admin either:
   - Approves: processes refund, status -> `refunded`
   - Declines: status -> `on_hold`, user contacted

**For Shipped Orders:**
1. User clicks "Запросить возврат" button
2. Warning modal shown: "Order already shipped"
3. Two options presented:
   - **"Связаться с поддержкой"** - Opens contact modal (recommended)
   - **"Все равно запросить возврат"** - Proceeds with refund request
4. If user proceeds, follows normal refund flow

**For Delivered Orders:**
1. User clicks "Запросить возврат" button
2. Warning modal shown: "Return policy notice"
3. Two options presented:
   - **"Связаться с поддержкой"** - Opens contact modal (recommended)
   - **"Все равно запросить возврат"** - Proceeds with refund request
4. If user proceeds, follows normal refund flow

### Cancellation

- Admin can cancel any order -> `cancelled`
- User can cancel in `created` or `awaiting_payment` status
- Cancellation reason stored in `orders.cancellation_reason`

---

## Batch Shipment Management

### Shipment Calendar

Admin can manage orders for batch shipping:

1. Set next shipment date in Project Management
2. View orders grouped by shipment date
3. Mark orders as "Ready" or "Not Ready" for batch
4. Batch status stored in `orders.batch_status`

**Batch Status Values:**
- `ready` - Order ready to ship in this batch
- `not_ready` - Order not ready yet
- `null` - Not assigned to batch

### Shipment Date Display

- Admin sets global `next_shipment_date` in settings
- Users see this date when placing orders
- Estimated delivery = shipment date + transit days from API

---

## Status Transitions

### User-Initiated Transitions

| From | To | Action |
|------|----|--------|
| `created` | `cancelled` | Cancel order |
| `awaiting_payment` | `cancelled` | Cancel order |
| `shipped` | `delivered` | Click "I received it" |
| `*` | `refund_requested` | Request refund |

### System-Initiated Transitions

| From | To | Trigger |
|------|----|---------|
| `awaiting_payment` | `paid` | Payment webhook |
| `shipped` | `delivered` | Tracking API shows delivered |

### Admin-Initiated Transitions

| From | To | Action |
|------|----|--------|
| `created` | `awaiting_payment` | Save delivery cost/details |
| Any | Any | Manual status change |

---

## Editing Permissions

### User Editing

Orders are **not editable** after submission. All fields (items, address, delivery type) are locked immediately.

### Admin Editing

| Status | Can Edit? | What |
|--------|-----------|------|
| Any | Yes | Items, quantities, address, delivery, status |

**Edit Tracking:**
- Changes logged to `order_edit_history` table
- Admin edits marked on items (`admin_modified`, `admin_added`)

---

## Notifications

| Event | User Channel | Admin Channel |
|-------|--------------|---------------|
| Order created (auto delivery) | Telegram/Email — pay now | Telegram |
| Order created (manual delivery) | Telegram/Email — awaiting calc | Telegram |
| Delivery calculated → awaiting_payment | Telegram/Email — pay now | - |
| Paid | Telegram/Email | Telegram |
| Confirmed | Telegram/Email | - |
| Shipped | Telegram/Email + tracking | - |
| Delivered | Telegram/Email | - |
| On hold (contact) | Telegram/Email (manual) | - |
| Refunded | Telegram/Email | - |
| Cancelled | Telegram/Email | - |
| Parcel arrived at pickup point | Telegram/VK/Email | - |
| Daily pickup reminder (storage) | Telegram/VK/Email | - |
| Parcel returned to sender | Telegram/VK/Email | - |

**Notification Channel:**
- Telegram users: via user_bot
- Yandex login users: via email
- VK users: via VK messages

---

## Database Schema

### Key Order Fields

```sql
orders (
  id, user_id, status,
  total_price, delivery_cost,
  delivery_type, shipping_provider_id,
  tracking_number, tracking_history,
  shipment_date, estimated_delivery_min, estimated_delivery_max,
  batch_status,
  -- Parcel pickup / return-to-sender tracking (auto-created by cron)
  arrived_at_point_at, arrival_notified,
  storage_deadline, last_storage_notification_at,
  returned_to_sender_at,
  return_action, return_action_requested_at,
  processed, urgent, notion_synced,
  created_at, updated_at
)

order_items (
  id, order_id, product_id,
  title, quantity, property, variation_num,
  price_at_purchase, image,
  admin_added, admin_modified, deleted_by_admin
)

order_addresses (
  id, order_id,
  surname, name, phone,
  postal_index, address, comment
)
```

### Status History

Edit history tracked in `order_edit_history`:
- `edit_type`: item_added, item_removed, quantity_changed, address_changed, etc.
- `edited_by`: 'user' or 'admin'
- `edit_details`: JSON with change details

---

## API Endpoints

### User Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/orders/create` | POST | Create order from cart |
| `/api/orders/get-order` | GET | Get order details |
| `/api/orders/get-user-orders` | GET | List user's orders |
| `/api/orders/cancel` | POST | Cancel order (created/awaiting_payment only) |
| `/api/orders/confirm-delivery` | POST | Mark as delivered |
| `/api/orders/request-refund` | POST | Request refund |
| `/api/orders/tracking` | GET | Get tracking info |
| `/api/orders/return-action` | POST | Submit return-to-sender action choice |

### Admin Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/orders/search` | GET | Search orders |
| `/api/orders/update-status` | PATCH | Change status |
| `/api/orders/update` | PATCH | Update order |
| `/api/orders/update-delivery` | POST | Set delivery cost/date (auto-transitions created → awaiting_payment) |
| `/api/orders/items/add` | POST | Add item |
| `/api/orders/items/remove` | DELETE | Remove item |
| `/api/orders/items/update` | PATCH | Update quantity |
| `/api/admin/orders/batch-status` | POST | Set batch status |
| `/api/admin/orders/send-contact-notification` | POST | Send contact request |
| `/api/admin/shipments/settings` | GET/POST | Shipment date settings |
| `/api/admin/shipments/calendar` | GET | Calendar data |
| `/api/admin/parcel-storage-settings` | GET/PUT | Per-provider storage day settings |

---

## Status Colors (CSS)

```css
.status-created { background: #FFC107; color: #000; }
.status-awaiting_payment { background: #FF9800; color: #fff; }
.status-paid { background: #81C784; color: #000; }
.status-confirmed { background: #64B5F6; color: #000; }
.status-shipped { background: #2196F3; color: #fff; }
.status-delivered { background: #4CAF50; color: #fff; }
.status-on_hold { background: #9E9E9E; color: #fff; }
.status-refund_requested { background: #CE93D8; color: #000; }
.status-refunded { background: #9C27B0; color: #fff; }
.status-cancelled { background: #F44336; color: #fff; }
```

---

## Constants

Defined in `server/utils/order-constants.js`:

```javascript
const VALID_STATUSES = [
  'created', 'awaiting_payment', 'paid', 'confirmed',
  'shipped', 'delivered', 'on_hold',
  'refund_requested', 'refunded', 'cancelled'
];

// User editing is disabled — orders are locked after submission
const USER_EDITABLE_STATUSES = [];
const REVIEW_ALLOWED_STATUSES = ['shipped', 'delivered'];
const BATCH_STATUSES = ['ready', 'not_ready'];
```

---

## Related Files

| File | Purpose |
|------|---------|
| `server/utils/order-constants.js` | Status definitions, colors |
| `server/utils/order-queries.js` | Reusable order queries |
| `api/orders/*.js` | Order API handlers |
| `api/orders/create.js` | Order creation (auto-sets awaiting_payment if delivery known) |
| `api/orders/update-delivery.js` | Admin sets delivery → auto-transitions created → awaiting_payment |
| `public/js/pages/order.js` | User order page (+ sub-modules in `order/`) |
| `public/js/pages/order/tracking.js` | Storage countdown + return action UI |
| `api/cron/update-tracking.js` | Tracking poll + parcel pickup/return notifications |
| `api/orders/return-action.js` | Return-to-sender action endpoint |
| `api/admin/parcel-storage-settings.js` | Admin storage settings API |
| `admin-miniapp/js/views/orders.js` | Admin order management |
