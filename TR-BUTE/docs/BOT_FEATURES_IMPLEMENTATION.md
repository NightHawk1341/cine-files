# Bot Features Implementation Plan

This document describes 10 new features for the TR-BUTE bot ecosystem. Each section covers the what, where, and how of implementation.

---

## Table of Contents

1. [A1: Notification Action Buttons](#a1-notification-action-buttons)
2. [A3: Reorder Button in Telegram Bot](#a3-reorder-button-in-telegram-bot)
3. [A6: Review Prompt on Delivered Status](#a6-review-prompt-on-delivered-status)
4. [A7: Certificate Share & Download on Order Page](#a7-certificate-share--download-on-order-page)
5. [B13: Bulk Status Updates in Admin Miniapp](#b13-bulk-status-updates-in-admin-miniapp)
6. [C15: VK Bot Context-Aware Greetings](#c15-vk-bot-context-aware-greetings)
7. [D17: Picker & Favorites for MAX Bot](#d17-picker--favorites-for-max-bot)
8. [E19: Bot Analytics Dashboard](#e19-bot-analytics-dashboard)
9. [E20: Abandoned Cart Reminders](#e20-abandoned-cart-reminders)
10. [SQL Migrations Summary](#sql-migrations-summary)

---

## A1: Notification Action Buttons

**Goal:** Extend `getTelegramButtons()` in `api/notifications/send.js` so that every relevant notification type includes an inline action button. Also add equivalent buttons for MAX (which supports `inline_keyboard` with link buttons) and Email (already has HTML `<a>` buttons — just needs more link targets).

### Current State

`getTelegramButtons()` only returns buttons for 2 of 17 notification types:
- `delivery_cost_added` → "Оплатить заказ" (web_app link to order page)
- `order_shipped` → "Мои заказы" (web_app link to profile)

### Proposed Button Map

| Notification Type | Button Text | Link Target |
|---|---|---|
| `order_created` | 📦 Мой заказ | `/profile?order={orderId}` |
| `order_created_cert_only` | 📦 Мой заказ | `/profile?order={orderId}` |
| `order_created_cert_mixed` | 📦 Мой заказ | `/profile?order={orderId}` |
| `order_confirmed` | 📦 Мой заказ | `/profile?order={orderId}` |
| `delivery_cost_added` | 💳 Оплатить заказ | `/profile?order={orderId}` *(existing)* |
| `payment_received` | 📦 Мой заказ | `/profile?order={orderId}` |
| `order_shipped` | 📦 Отслеживать | `/profile?order={orderId}` |
| `parcel_at_pickup_point` | 📍 Детали заказа | `/profile?order={orderId}` |
| `storage_pickup_reminder` | 📍 Детали заказа | `/profile?order={orderId}` |
| `parcel_returned_to_sender` | 📦 Мой заказ | `/profile?order={orderId}` |
| `order_cancelled` | 🛍 Каталог | `/catalog` |
| `refund_processed` | 🛍 Каталог | `/catalog` |
| `product_available` | 🛍 Открыть товар | `/product/{productSlug}` |
| `certificate_delivered` | 📦 Мой заказ | `/profile?order={orderId}` |
| `contact_request` | 📦 Мой заказ | `/profile?order={orderId}` |
| `admin_response` | 📦 Мой заказ | `/profile?order={orderId}` |

### Files to Modify

| File | Change |
|---|---|
| `api/notifications/send.js` | Expand `getTelegramButtons()` switch to cover all 17 types. For `product_available`, use `data.productSlug` for the URL. |
| `lib/notifications.js` | In `sendMAXNotification` calls, pass `link` parameter derived from same logic (MAX already supports link buttons via `attachments`). Ensure `sendNotification()` forwards the `link` to the MAX channel when appropriate. |
| `lib/notifications.js` | In `sendEmailNotification` calls, ensure the `link` parameter is passed for all types (email already renders it as a styled `<a>` button). |

### Implementation Notes

- VK `notifications.send` API does **not** support inline buttons — no change needed there.
- The `link` parameter in `sendNotification()` is already forwarded to Telegram and Email. For MAX, verify that `sendMAXNotification` receives and uses the `link` from `sendNotification()`.
- `product_available` requires `productSlug` in the `data` object — verify that the caller (`api/notifications/send.js` or wherever availability notifications are triggered) passes it. If only `productId` is available, include a DB lookup for the slug.
- All URLs are relative — they get prefixed with `config.appUrl` (the Vercel domain) inside `sendTelegramNotification` and `sendMAXNotification`.

---

## A3: Reorder Button in Telegram Bot

**Goal:** Add a "Повторить заказ" (Reorder) button to the order list in the Telegram user bot. When tapped, it adds all items from that order to the user's cart.

### User Flow

1. User types "📦 Мои заказы" → bot shows last 10 orders.
2. Each order card now includes an inline button: **"🔄 Повторить заказ"** (`callback_data: reorder_{orderId}`).
3. User taps the button → bot:
   - Fetches order items for that order (excluding certificates — they can't be reordered).
   - For each item, inserts into `user_cart` (or updates quantity if same product+property+variation already in cart).
   - Replies with confirmation: "Товары из заказа #{orderId} добавлены в корзину ({N} шт.)" with a "🛒 Открыть корзину" web_app button.

### Files to Modify

| File | Change |
|---|---|
| `api/webhooks/user-bot.js` | **Order list rendering:** Add inline button row `[{ text: '🔄 Повторить', callback_data: 'reorder_{orderId}' }]` under each order in `handleMyOrders()`. |
| `api/webhooks/user-bot.js` | **Callback handler:** Add `reorder_` prefix handler in the callback_query routing section. |
| `server/utils/cart-helpers.js` *(or inline in user-bot.js)* | **Cart insertion logic:** Query `order_items` for the order, filter out certificate items (`certificate_id IS NULL`), then `INSERT INTO user_cart ... ON CONFLICT (user_id, product_id, property, variation_num) DO UPDATE SET quantity = user_cart.quantity + EXCLUDED.quantity`. |

### Implementation Notes

- Only show the reorder button for orders with at least one non-certificate item.
- Only show for orders where status is NOT `cancelled` (no point reordering a cancelled order with potentially unavailable items).
- Before inserting into cart, verify each product still exists and has status `available`. Skip unavailable products and mention them in the confirmation: "2 из 3 товаров добавлены (1 больше не продаётся)".
- The `user_cart` table has a composite pattern of `(user_id, product_id, property, variation_num)` — use `ON CONFLICT` to merge quantities.
- Need to look up the user's internal `id` from `telegram_id` (same pattern as existing `handleMyOrders`).

### Edge Cases

- Order contains only certificates → hide the reorder button entirely.
- Product was deleted or marked `not_for_sale` → skip it, inform user.
- User taps reorder on a very old order → still works, just checks product availability.

---

## A6: Review Prompt on Delivered Status

**Goal:** When an order reaches `delivered` status (or more precisely, when `PARCEL_AT_PICKUP_POINT` / delivery confirmation triggers), append a review prompt to the existing notification.

### Approach

Rather than adding a separate cron job or delayed message, piggyback on the existing notification flow:

1. When the order status changes to `delivered` (user confirms delivery via the "Получил заказ" button, or auto-confirmed), the system already sends a notification or updates the status.
2. **Add a new notification type `DELIVERY_REVIEW_PROMPT`** that fires when order status transitions to `delivered`.
3. The notification says something like: "Спасибо за покупку! Будем рады вашему отзыву — он поможет другим покупателям." with an inline button linking to the first product in the order.

### Alternative (Simpler)

Instead of a new notification type, **extend the `PARCEL_AT_PICKUP_POINT` notification message** with a review call-to-action line at the bottom, and add a second inline button "✍️ Оставить отзыв" that links to the product page.

**Recommended: go with the simpler approach** — add a review CTA to the `PARCEL_AT_PICKUP_POINT` notification since that's the moment the customer has the product in hand.

### Files to Modify

| File | Change |
|---|---|
| `lib/notifications.js` | In `getTelegramContent` for `PARCEL_AT_PICKUP_POINT`: append a review prompt line to the message. |
| `lib/notifications.js` | Same for `getEmailContent`, `getVKContent`, `getMAXContent`. |
| `lib/notifications.js` | In `NotificationTemplateRegistry` for `parcel_at_pickup_point`: add a `{reviewPrompt}` variable or simply hardcode the CTA in the default template (since it's not something admins would typically want to remove). |
| `api/notifications/send.js` | In `getTelegramButtons` for `parcel_at_pickup_point`: add a second button row: `[{ text: '✍️ Оставить отзыв', web_app: { url: productUrl } }]`. This requires passing `productSlug` (first item's product) in the notification data. |

### Data Requirements

The `PARCEL_AT_PICKUP_POINT` notification currently receives `{ orderId, storageDays, providerName }`. Need to also pass the **first product's slug** so we can link the review button. This means the caller (likely `api/cron/update-tracking.js` or the status update endpoint) needs to fetch one product slug from `order_items JOIN products`.

### Review Button Logic

- Link to `/product/{slug}#reviews` (the product page with reviews section scrolled into view).
- If the order has multiple products, link to the first non-certificate product.
- If the order contains only certificates, skip the review button (certificates don't have reviews).

---

## A7: Certificate Share & Download on Order Page

**Goal:** Add share and download buttons to the certificate image on the order detail page (public site).

### Current State

Certificate images are displayed on the order page as a clickable `<img>` wrapped in an `<a target="_blank">` link. There's a copy button for the certificate code. No share or download buttons exist.

### Proposed UI

Below the certificate image, add two buttons side by side:

```
[📥 Скачать]  [📤 Поделиться]
```

- **Download:** Fetches the image as a blob and triggers a browser download with filename `certificate-{code}.jpg`.
- **Share:** Uses `navigator.share()` (Web Share API) with the image file if supported, otherwise falls back to sharing the image URL via `window.sharing.shareBrowser()`.

### Files to Modify

| File | Change |
|---|---|
| `public/js/pages/order.js` | In the certificate image rendering block (around line 320-375), add the two buttons below the `<img>`. Wire up click handlers. |
| `public/css/order.css` | Add styles for `.order-cert-actions` container (flex row, gap, button styling using existing CSS variables). |

### Implementation Details

**Download button handler:**
```javascript
async function downloadCertImage(url, code) {
  const response = await fetch(url);
  const blob = await response.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `certificate-${code}.jpg`;
  a.click();
  URL.revokeObjectURL(a.href);
}
```

**Share button handler:**
```javascript
async function shareCertImage(url, code) {
  if (navigator.share) {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const file = new File([blob], `certificate-${code}.jpg`, { type: blob.type });
      await navigator.share({ files: [file], title: 'Подарочный сертификат TR/BUTE' });
      return;
    } catch (e) { /* falls through to URL share */ }
  }
  // Fallback: share URL
  window.sharing.shareBrowser({ url, title: 'Подарочный сертификат TR/BUTE' });
}
```

### Notes

- The `navigator.share({ files })` API requires HTTPS and a "secure context" — works in Telegram WebApp and most mobile browsers.
- On desktop where Web Share API is unavailable, the share button copies the image URL to clipboard with a toast notification.
- No backend changes needed — this is purely frontend.
- `public/js/core/sharing.js` is already loaded on the order page.

---

## B13: Bulk Status Updates in Admin Miniapp

**Goal:** Add bulk status update capability to the admin miniapp order management. When multiple orders are selected, show a "Change Status" action in the bulk bar.

### Current Bulk Bar

The bulk action bar currently has only 2 actions:
- "Снять выбор" (Deselect All)
- "Экспорт в Notion"

### Proposed Addition

Add a third button: **"Сменить статус"** (Change Status). When clicked:
1. Opens a modal/dropdown with allowed target statuses.
2. Admin selects a status → confirmation prompt: "Сменить статус {N} заказов на «{statusName}»?"
3. On confirm, sends a batch API request.
4. Shows result: "{X} из {N} обновлено" (some may fail due to invalid transitions).

### Allowed Bulk Transitions

Not all status transitions make sense in bulk. Limit the bulk dropdown to these practical transitions:

| Target Status | Use Case |
|---|---|
| `paid` | Batch-mark orders as paid (manual payment confirmation) |
| `shipped` | Batch-mark orders as shipped (after print batch completes) |
| `delivered` | Batch-mark orders as delivered |
| `on_hold` | Pause a group of orders |
| `cancelled` | Batch-cancel orders |

### Files to Modify

| File | Change |
|---|---|
| `admin-miniapp/js/views/orders/rendering.js` | Add "Сменить статус" button to bulk action bar HTML. |
| `admin-miniapp/js/views/orders/index.js` | Add click handler for `bulk-change-status`. Show a status picker modal. On selection, call new batch endpoint. |
| `admin-miniapp/js/views/orders/status.js` | Add `bulkUpdateStatus(orderIds, newStatus)` function that calls the batch API and handles results. |
| `server/routes/index.js` | Register new endpoint `POST /api/orders/bulk-update-status`. |
| New file: `api/orders/bulk-update-status.js` | Handler: receives `{ orderIds: number[], status: string }`, validates each order's transition using `order-constants.js` transition rules, updates valid ones, returns `{ updated: number, failed: number, errors: [{orderId, reason}] }`. Sends notifications for each successfully updated order where applicable (e.g., shipped → sends tracking notification). |

### Implementation Notes

- Use a transaction for the batch update so partial failures don't leave inconsistent state.
- Actually, **don't** use a single transaction — individual order failures shouldn't block others. Process each order independently and collect results.
- For `shipped` bulk status, optionally prompt for a tracking number (or allow blank if tracking is added later per-order).
- The status picker should show `STATUS_DISPLAY_NAMES` from `order-constants.js` with color badges.
- Add the endpoint to `server/routes/index.js` before the catch-all order routes.

### SQL for Batch Update

```sql
-- Per order (in a loop, not a single UPDATE):
UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 AND status = ANY($3)
-- $3 = array of statuses allowed to transition to $1 (from VALID_TRANSITIONS map)
```

Also insert into `order_status_history` for each updated order.

---

## C15: VK Bot Context-Aware Greetings

**Goal:** Distinguish between "user sent a message" and "user placed a VK Market order" in the VK bot, with separate greeting texts for each. Make both editable per community in the admin miniapp bots subtab.

### Current State

Both `message_new` and `market_order_new` events call the same `sendGreeting()` function with the same text. The greeting is sent once per user per community — whichever event fires first.

### Proposed Changes

#### 1. Two Greeting Types Per Community

Instead of a single `vk_1` / `vk_2` key in `bot_greetings`, store:

```json
{
  "vk_1_message": "Привет! Добро пожаловать в ...",
  "vk_1_market_order": "Спасибо за покупку в нашем магазине VK! ...",
  "vk_2_message": "...",
  "vk_2_market_order": "..."
}
```

Fallback: if `vk_1_market_order` is empty, use `vk_1_message` (the general greeting).

#### 2. Separate Greeting Tracking

Currently `bot_greeted_users` tracks a single boolean per user per community. To allow both greetings to fire (a user could message first, then place an order later, or vice versa), add a `greeting_type` column:

```sql
ALTER TABLE bot_greeted_users ADD COLUMN greeting_type VARCHAR DEFAULT 'message';
```

The combination `(platform, user_identifier, community_id, greeting_type)` determines uniqueness. This way:
- First message → sends `message` greeting, marks `greeting_type='message'`.
- Later market order → sends `market_order` greeting, marks `greeting_type='market_order'`.
- If user does both in reverse order, same logic applies.

#### 3. Admin Miniapp Bots Subtab Layout Update

**Current layout** (VK section):

```
[Toggle: VK greeting enabled]
[Input: Button URL]
[Textarea: Community 1 greeting]
[Textarea: Community 2 greeting]
[Toggle: Greet all VK users]
```

**New layout:**

```
[Toggle: VK greeting enabled]
[Input: Button URL]

── Сообщество 1 ──
[Textarea: Приветствие (сообщение)]     ← vk_1_message
[Textarea: Приветствие (заказ VK Market)] ← vk_1_market_order

── Сообщество 2 ──
[Textarea: Приветствие (сообщение)]     ← vk_2_message
[Textarea: Приветствие (заказ VK Market)] ← vk_2_market_order

[Toggle: Greet all VK users]
```

Group each community's two textareas under a section header for visual clarity.

### Files to Modify

| File | Change |
|---|---|
| `api/webhooks/vk-bot.js` | Split `sendGreeting()` into context-aware version. `message_new` handler passes `greetingType='message'`, `market_order_new` passes `greetingType='market_order'`. Load correct text from settings. Update `shouldGreet()` and `markGreeted()` to include `greeting_type`. |
| `admin-miniapp/js/views/project-management/bots.js` | Update `renderBotsSubtab()` to show 2 textareas per community (message + market_order). Update `saveBotGreetings()` and `loadBotGreetings()` to handle new keys. Group communities visually. |
| `api/settings/get.js` | Add new default keys to `DEFAULT_SETTINGS.bot_greetings` if needed. |
| `SQL_SCHEMA.sql` | Add `greeting_type` column to `bot_greeted_users` table definition. |

### Migration SQL

```sql
ALTER TABLE bot_greeted_users ADD COLUMN greeting_type VARCHAR DEFAULT 'message';
-- Existing rows get 'message' as default, which is correct (they were all message greetings).
```

---

## D17: Picker & Favorites for MAX Bot

**Goal:** Port the Telegram bot's card picker and favorites features to the MAX bot, achieving feature parity.

### Current MAX Bot Commands

| Command | Exists |
|---|---|
| `/start` | Yes |
| `/faq` | Yes |
| `/orders` | Yes |
| `/catalog` | Yes |
| `/search` | Yes |
| `/picker` | **No** |
| `/favorites` | **No** |

### Picker for MAX

The Telegram picker uses `editMessageMedia` to swap photos in-place with inline buttons. MAX API supports:
- Sending messages with `inline_keyboard` (link + callback buttons).
- Editing messages via `PUT /messages?message_id={id}`.
- Sending photos as attachments.

However, MAX's media editing capabilities may be more limited than Telegram's. Two approaches:

**Approach A: Photo + Callback Buttons (mirrors Telegram)**
- Send product image as a photo message with caption and inline keyboard (Skip/Like/Open).
- On callback, edit the message with the next product's image.
- Requires MAX API to support editing message attachments — needs verification.

**Approach B: Text-Based Picker (safe fallback)**
- Send product as a text message with title, price, and image URL (rendered as link preview).
- Inline buttons: Skip / Like / Open.
- On callback, send a new message (delete or ignore old one).

**Recommended: Start with Approach B** (text + buttons), then upgrade to photo-based if MAX API supports media editing.

### Picker Implementation

**Session management:** Use the same `session-store.js` with namespace `'max'` (already exists for MAX bot state tracking).

**State stored in session:**
```json
{
  "state": "picker",
  "pickerProducts": [/* shuffled product IDs */],
  "pickerIndex": 0,
  "pickerHistory": [{ "index": 0, "action": "left", "productId": 123 }],
  "pickerMessageId": "msg_abc123"
}
```

**Commands:**
- `/picker` or `🎴 подборщик` → Start picker, fetch eligible products, shuffle, send first card.
- Callback `picker_skip` → Advance index, send next card.
- Callback `picker_like` → Add to favorites, advance, send next card.
- Callback `picker_undo` → Revert last action, go back one card.

**Eligible products query** (same as Telegram bot):
```sql
SELECT id, title, slug, price, old_price, discount, triptych
FROM products
WHERE type = 'фирменный' AND status = 'available' AND triptych IS NULL
```

Exclude products already in user's favorites.

### Favorites Implementation

- `/favorites` or `❤️ избранное` → Paginated list of user's favorite products.
- Each product shown as a callback button (opens product URL) or text line.
- Navigation: `fav_page_0`, `fav_page_1`, etc.
- Page size: 5-7 items (same as Telegram).

### User Identity

MAX bot needs to map MAX user IDs to internal user IDs for favorites/picker progress. Current pattern in MAX bot's `/orders` handler:
```javascript
const user = await pool.query('SELECT id FROM users WHERE max_id = $1', [maxUserId]);
```

If user is not found (not logged into the web app), show a message: "Войдите в магазин, чтобы использовать подборщик" with a link button.

### Files to Modify

| File | Change |
|---|---|
| `api/webhooks/max-bot.js` | Add `/picker` and `/favorites` command handlers. Add callback routing for `picker_*` and `fav_page_*` prefixes. Add `handlePicker()`, `handlePickerAction()`, `handleFavoritesList()` functions. |
| `api/webhooks/max-bot.js` | Add main menu button row to greeting message: FAQ / Search / Orders / Picker / Favorites (callback buttons that trigger the respective handlers). |

### Shared Logic

Consider extracting picker product fetching and favorites querying into a shared utility (`lib/bot-helpers.js` or similar) so both Telegram and MAX bots use the same product selection logic. This prevents drift between the two implementations. The rendering layer stays bot-specific (Telegram uses photos, MAX uses text).

### Notes

- MAX callback buttons use `{ type: 'callback', text: '...', payload: 'picker_skip' }`.
- MAX message editing: `PUT https://platform-api.max.ru/messages?message_id={id}` with same body format.
- If the user is not registered (no `max_id` → `users.id` mapping), picker/favorites won't work. Show a login prompt.

---

## E19: Bot Analytics Dashboard

**Goal:** Add a "Боты" (Bots) subtab to the admin miniapp Statistics section that shows engagement metrics for all three bots.

### Metrics to Track

| Metric | Source |
|---|---|
| Messages received (per bot, per day) | New `bot_analytics` table |
| Commands used (breakdown by command) | New `bot_analytics` table |
| Picker sessions started / completed | New `bot_analytics` table |
| Picker likes / skips ratio | New `bot_analytics` table |
| Search queries (count + top queries) | New `bot_analytics` table |
| Notification delivery success/failure rate | Extend `notifications.js` logging |
| Unique users (per bot, per period) | New `bot_analytics` table |
| Greetings sent (per platform) | Query `bot_greeted_users` with date filter |

### Database

**New table: `bot_analytics`**

```sql
CREATE TABLE bot_analytics (
  id SERIAL PRIMARY KEY,
  platform VARCHAR NOT NULL,          -- 'telegram', 'vk', 'max'
  event_type VARCHAR NOT NULL,        -- 'message', 'command', 'callback', 'search', 'picker_start', 'picker_like', 'picker_skip', 'inline_query', 'notification_sent', 'notification_failed'
  event_detail VARCHAR,               -- command name, search query (truncated), notification type, etc.
  user_identifier VARCHAR,            -- platform-specific user ID
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bot_analytics_platform_created ON bot_analytics (platform, created_at);
CREATE INDEX idx_bot_analytics_event_type ON bot_analytics (event_type, created_at);
```

### Logging Integration

Add a lightweight `logBotEvent(platform, eventType, eventDetail, userIdentifier)` function in a new `lib/bot-analytics.js` helper. Call it from:

| File | Events to Log |
|---|---|
| `api/webhooks/user-bot.js` | `message`, `command:{name}`, `callback:{action}`, `picker_start`, `picker_like`, `picker_skip`, `inline_query`, `search` |
| `api/webhooks/admin-bot.js` | `command:{name}`, `callback:{action}` |
| `api/webhooks/vk-bot.js` | `message`, `market_order`, `greeting_sent` |
| `api/webhooks/max-bot.js` | `message`, `command:{name}`, `callback:{action}`, `search`, `picker_start`, `picker_like`, `picker_skip` |
| `lib/notifications.js` | `notification_sent:{type}`, `notification_failed:{type}` |

The logging call must be **fire-and-forget** (no `await`) to avoid slowing down bot responses.

### Admin Miniapp

**New subtab:** Add "Боты" to the Statistics section subtab list.

| File | Change |
|---|---|
| `admin-miniapp/js/views/statistics.js` | Add `bots` subtab entry with `canAccessBots` permission check. Add `renderBotsStats()` function. |
| New file: `admin-miniapp/js/views/statistics/bots.js` | Renders bot analytics dashboard — charts, tables, period selector integration. |
| `server/routes/index.js` | Register `GET /api/analytics/bot-stats`. |
| New file: `api/analytics/bot-stats.js` | Query `bot_analytics` table with period filter. Return aggregated metrics per platform, per event type. |

### Dashboard Layout

```
Period: [Today] [Week] [Month] [Year] [All]

┌─────────────────────────────────────────────┐
│ Telegram    │  VK        │  MAX              │
│ 1,234 msgs  │  89 msgs   │  156 msgs         │
│ 45 users    │  32 users  │  28 users         │
└─────────────────────────────────────────────┘

Top Commands (Telegram):
  /start ........... 312
  🎴 Подборщик ..... 189
  🔍 Найти постер .. 156
  ❤️ Избранное ..... 98

Picker Stats:
  Sessions: 189  │  Likes: 423  │  Skips: 891  │  Like ratio: 32%

Notifications:
  Sent: 1,024  │  Failed: 12  │  Success rate: 98.8%
  By type: order_created (312), delivery_cost_added (298), ...
```

### Notes

- The `bot_analytics` table will grow fast. Add a cleanup cron job (or retention policy) — e.g., aggregate rows older than 90 days into daily summaries, then delete raw rows. This can be a future optimization.
- `user_identifier` is stored for unique user counting but is **not** joined to the `users` table — it's just for cardinality counting via `COUNT(DISTINCT user_identifier)`.

---

## E20: Abandoned Cart Reminders

**Goal:** Send a notification to users who have items in their cart but haven't placed an order within a configurable time window. The feature must be toggleable per platform, with configurable timing and message variations.

### Settings Structure

New `app_settings` key: `abandoned_cart_reminders`

```json
{
  "enabled": true,
  "channels": {
    "telegram": true,
    "email": true,
    "vk": false,
    "max": true
  },
  "delay_hours": 48,
  "cooldown_hours": 168,
  "message_variations": [
    {
      "title": "Вы кое-что забыли!",
      "message": "В вашей корзине {itemCount} {itemWord} на сумму {cartTotal}₽. Оформите заказ, пока всё в наличии!"
    },
    {
      "title": "Ваши постеры ждут!",
      "message": "Мы сохранили вашу корзину — {itemCount} {itemWord} на {cartTotal}₽. Не упустите!"
    },
    {
      "title": "Напоминание о корзине",
      "message": "У вас есть незавершённый заказ: {itemCount} {itemWord} ({cartTotal}₽). Завершите покупку!"
    }
  ]
}
```

**Fields:**
- `enabled` — global on/off switch.
- `channels` — per-platform toggle (respects user's `notification_method` too).
- `delay_hours` — time since last cart update before first reminder (default 48h).
- `cooldown_hours` — minimum interval between reminders for the same user (default 7 days).
- `message_variations` — array of title/message pairs. System picks one randomly per send to keep messages varied.

### Cron Job

**New endpoint:** `GET /api/cron/abandoned-cart-reminders`
**Schedule:** `0 12 * * *` (daily at noon Moscow time) — pick an unused hour slot.

**Logic:**
1. Query users with non-empty carts where the most recent `user_cart.updated_at` is older than `delay_hours` ago.
2. Exclude users who:
   - Have `notifications_enabled = false`.
   - Were already sent a cart reminder within `cooldown_hours` (tracked via new `last_cart_reminder_at` column on `users` table, or a separate tracking table).
   - Have placed an order since their last cart update (cart is stale but they already bought).
3. For each eligible user:
   - Calculate `itemCount` and `cartTotal` from their `user_cart` items.
   - Pick a random message variation.
   - Apply template variables: `{itemCount}`, `{itemWord}` (pluralized), `{cartTotal}`.
   - Send via `sendNotification()` with channel check against `channels` config.
   - Update `last_cart_reminder_at`.

### Template Variables

| Variable | Description | Example |
|---|---|---|
| `{itemCount}` | Number of items in cart | `3` |
| `{itemWord}` | Pluralized "товар" | `товара` / `товаров` |
| `{cartTotal}` | Sum of item prices × quantities | `4 500` |

### Notification Type

Add `ABANDONED_CART` to `NotificationType`:
```javascript
ABANDONED_CART: 'abandoned_cart'
```

Add corresponding entries to:
- `NotificationTemplateRegistry` (group: `marketing`, label: "Напоминание о корзине").
- `getTelegramContent`, `getEmailContent`, `getVKContent`, `getMAXContent` — use the variation text from settings.
- `getTelegramButtons` — button: "🛒 Открыть корзину" → `/cart`.
- `applyTemplateVariables` — add `{itemCount}`, `{itemWord}`, `{cartTotal}`.

### Admin Miniapp Settings

Add an "Abandoned Cart" section to the **Site** subtab in Project Management (since it's a site-wide operational setting, not a bot-specific one), or create a dedicated section in the **Notifications** subtab.

**Recommended: Notifications subtab** — it's notification configuration.

**UI:**
```
── Напоминания о корзине ──

[Toggle: Включено]

Задержка (часов): [48]
Повтор не чаще (часов): [168]

Каналы:
  [x] Telegram  [x] Email  [ ] VK  [x] MAX

Вариации сообщений:
  ┌──────────────────────────────────┐
  │ Заголовок: [________________]    │
  │ Сообщение: [________________]    │
  │                        [Удалить] │
  └──────────────────────────────────┘
  [+ Добавить вариацию]
```

### Files to Modify

| File | Change |
|---|---|
| `lib/notifications.js` | Add `ABANDONED_CART` notification type. Add content generators for all 4 channels. Add template registry entry. Extend `applyTemplateVariables`. |
| `api/notifications/send.js` | Add `abandoned_cart` to `getTelegramButtons()`. |
| New file: `api/cron/abandoned-cart-reminders.js` | Cron handler with auth check, user querying, and notification sending loop. |
| `server/routes/index.js` | Register the cron endpoint. |
| `vercel.json` | Add cron entry: `{ "path": "/api/cron/abandoned-cart-reminders", "schedule": "0 12 * * *" }`. |
| `docs/CRON_JOBS.md` | Document the new cron job (job #5). |
| `admin-miniapp/js/views/project-management/notifications.js` *(or wherever notification settings live)* | Add "Abandoned Cart" configuration section. |
| `api/settings/get.js` | Add `abandoned_cart_reminders` to `DEFAULT_SETTINGS`. |
| `SQL_SCHEMA.sql` | Add `last_cart_reminder_at` column to `users` table. |

### Migration SQL

```sql
ALTER TABLE users ADD COLUMN last_cart_reminder_at TIMESTAMPTZ;
```

### Cart Total Query

```sql
SELECT
  u.id, u.telegram_id, u.email, u.vk_id, u.max_id, u.notification_method,
  COUNT(uc.id) AS item_count,
  SUM(
    CASE WHEN p.triptych IS NOT NULL THEN COALESCE(p.price, 0) * 3 * uc.quantity
         ELSE COALESCE(p.price, 0) * uc.quantity END
  ) AS cart_total,
  MAX(uc.updated_at) AS last_cart_update
FROM users u
JOIN user_cart uc ON uc.user_id = u.id
JOIN products p ON uc.product_id = p.id
WHERE u.notifications_enabled = true
  AND (u.last_cart_reminder_at IS NULL OR u.last_cart_reminder_at < NOW() - INTERVAL '{cooldown_hours} hours')
GROUP BY u.id
HAVING MAX(uc.updated_at) < NOW() - INTERVAL '{delay_hours} hours'
```

Then filter out users who placed an order since `last_cart_update`:
```sql
AND NOT EXISTS (
  SELECT 1 FROM orders o
  WHERE o.user_id = u.id AND o.created_at > MAX(uc.updated_at)
)
```

### Notes

- The `{itemWord}` pluralization uses Russian rules: 1 товар, 2-4 товара, 5+ товаров. Reuse existing pluralization helper if one exists, or add a simple one.
- Price calculation should use `Number()` on all DB values to avoid string concatenation.
- The cron job should process users in batches (e.g., 50 at a time) with small delays between batches to avoid hitting Telegram/VK rate limits.
- Message variations are stored in `app_settings`, not in `NotificationTemplateRegistry`. The registry entry defines the "structure" and default, while `app_settings` holds the admin-customized variations.

---

## SQL Migrations Summary

All SQL to be run manually in the Supabase SQL editor:

```sql
-- C15: VK Bot Context-Aware Greetings
ALTER TABLE bot_greeted_users ADD COLUMN greeting_type VARCHAR DEFAULT 'message';

-- E19: Bot Analytics Dashboard
CREATE TABLE bot_analytics (
  id SERIAL PRIMARY KEY,
  platform VARCHAR NOT NULL,
  event_type VARCHAR NOT NULL,
  event_detail VARCHAR,
  user_identifier VARCHAR,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_bot_analytics_platform_created ON bot_analytics (platform, created_at);
CREATE INDEX idx_bot_analytics_event_type ON bot_analytics (event_type, created_at);

-- E20: Abandoned Cart Reminders
ALTER TABLE users ADD COLUMN last_cart_reminder_at TIMESTAMPTZ;
```

---

## Implementation Order (Suggested)

Dependencies and complexity considered:

1. **A1: Notification Buttons** — Low effort, high visibility. No DB changes. Start here.
2. **A7: Certificate Share & Download** — Frontend-only, no DB changes. Quick win.
3. **A6: Review Prompt on Delivered** — Small extension of A1 work (adding buttons to notifications).
4. **A3: Reorder Button** — Moderate effort, touches cart logic.
5. **C15: VK Context-Aware Greetings** — DB migration needed, admin UI update.
6. **B13: Bulk Status Updates** — New API endpoint + admin UI. Moderate complexity.
7. **D17: MAX Picker & Favorites** — Largest feature. Depends on shared helper extraction.
8. **E19: Bot Analytics** — New table + logging integration across all bots. Do after D17 so MAX picker events are included.
9. **E20: Abandoned Cart Reminders** — New cron job, settings UI, notification type. Most complex standalone feature.
