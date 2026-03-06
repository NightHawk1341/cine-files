# Cart Logic Implementation Plan

This document captures all discrepancies between the intended product-to-cart behavior and the current implementation, along with the context and steps needed to fix each one.

---

## Table of Contents

1. [Custom Product Background Upload — Intentional Failure](#1-custom-product-background-upload--intentional-failure)
2. ["Выбрать"/"Выбран" Variant Selection Flow](#2-выбратьвыбран-variant-selection-flow)
3. [Text Labels for Product Types in Cart & Order Page](#3-text-labels-for-product-types-in-cart--order-page)
4. [Cart Page "Заменить" Intentional Failure for Custom Products](#4-cart-page-заменить-intentional-failure-for-custom-products)
5. [Variant Image as Miniature in Cart & Order Page](#5-variant-image-as-miniature-in-cart--order-page)
6. [Variation Number Sync Bug (Critical)](#6-variation-number-sync-bug-critical)

---

## 1. Custom Product Background Upload — Intentional Failure

### Intended Behavior
Products with `status='custom'` ("fake custom") should open the image upload modal but **intentionally fail** with the message: *"Не удалось загрузить изображение, используйте предложенные пользователями варианты"*. No error highlighting — just the message. This forces users to select from admin-provided backgrounds labeled "Фоны других пользователей" / "Предложенные пользователями фоны".

### Current Behavior
`public/js/pages/product/background-selection.js` (lines 186-237): The upload card opens a file picker, reads the file as a data URL, silently stores it locally, and displays it. The `getSelectedBackground()` function (lines 51-74) quietly substitutes `adminBackgrounds[0]?.url` as the `actualUrl`. The user sees their uploaded image but the admin's background is what gets used. **No error is shown — the deception is invisible.**

### Required Changes

**File: `public/js/pages/product/background-selection.js`**
- In `createUploadCard()` (lines 186-237), replace the file reader logic with:
  - After file selection, show a toast or inline message: "Не удалось загрузить изображение, используйте предложенные пользователями варианты"
  - Do NOT store the file or display it
  - Do NOT dispatch `backgroundSelected` event
  - No error highlighting on the upload card itself — just the message

**Note:** The upload card UI (the `+` button) should still appear so the deception looks real. It just always "fails".

---

## 2. "Выбрать"/"Выбран" Variant Selection Flow

### Intended Behavior
On the product page for оригинальные products (non-triptych, multiple Варианты images):
1. User scrubs through thumbnails (mobile) or hovers (desktop) on the carousel
2. When a variant image is shown, text reads "Показан вариант #N"
3. A "Выбрать" button appears
4. After clicking, the button changes to "Выбран" and the variant number auto-fills into the variation input
5. User can now choose a format (creating a combination)
6. Or user can type variant number manually

### Current Behavior
- **"Текущий вариант: #N"** label shows correctly when on a variant slide (`main.js:891`)
- **"Выбрать" button** shows correctly (`main.js:892`)
- Clicking "Выбрать" fills the `#variation-number-input` with the variant number (`main.js:902-908`)
- **Missing:** Button text never changes to "Выбран" after clicking
- **Missing:** No visual feedback that variant was selected (button stays as "Выбрать" even after selection)

### Required Changes

**File: `public/js/pages/product/main.js` (around line 900-909)**
- In the `selectVariantBtn.onclick` handler:
  - After setting `input.value = info.variantNum`, change button text to "Выбран"
  - Add a visual state class (e.g., `.selected`) for styling distinction
  - When carousel moves to a different variant slide, reset button to "Выбрать" (remove `.selected`)
  - When carousel moves to a slide that matches the currently selected variant number, show "Выбран"

**File: `public/js/pages/product/main.js` (around line 877-898, the carousel slide callback)**
- In the slide change callback, check if `info.variantNum` matches the current `#variation-number-input` value
- If match: show "Выбран" with selected state
- If no match: show "Выбрать" without selected state

**File: `public/css/product.css`**
- Add styles for `#select-variant-btn.selected` — distinct visual (e.g., brand color background, or border change)

---

## 3. Text Labels for Product Types in Cart & Order Page

### Intended Behavior
In **cart** and **order page**, each product item should show a type-specific text label:

| Product Type | Text Label | Image Shown |
|---|---|---|
| Product id=1 (true custom) | "Изображение пользователя" | User's uploaded image |
| Оригинальный product (with variant) | Name/number of the chosen variant (e.g., "Вариант 5") | Variant image |
| Custom product (fake custom) | "Изображение пользователя с дизайном TR/BUTE" | Product image with admin background |

### Current Behavior
- **Cart page** (`cart/item-rendering.js`): Shows product title + format. Has a `вар.` input column for originals but no descriptive text label for the type.
- **Order page** (`order.js:362-379`): Shows `[вар. N]` appended to property for numeric `variation_num`, or "Ссылка на постер" if URL. No special label for custom products or product id=1.
- **Profile page order list**: Not needed per requirements.

### Required Changes

**File: `public/js/pages/cart/item-rendering.js`**
- After the product title area, add a secondary label line:
  - If `product.id === CUSTOM_PRODUCT_ID` (id=1): render `<span class="cart-item-type-label">Изображение пользователя</span>`
  - If `product.status === 'custom'`: render `<span class="cart-item-type-label">Изображение пользователя с дизайном TR/BUTE</span>`
  - If `product.type === 'оригинал'` and has variation number: render `<span class="cart-item-type-label">Вариант ${varNum}</span>`

**File: `public/js/pages/order.js` (around lines 362-410)**
- Add similar type-specific labels in the order item rendering:
  - For product id=1: "Изображение пользователя"
  - For custom products: "Изображение пользователя с дизайном TR/BUTE"
  - For originals with `variation_num`: show variant name (e.g., "Вариант 5")

**File: `public/css/cart.css` and `public/css/order.css`**
- Style `.cart-item-type-label` / `.order-item-type-label` — secondary text color, smaller font

---

## 4. Cart Page "Заменить" Intentional Failure for Custom Products

### Intended Behavior
On the cart page, custom (fake custom, `status='custom'`) products should have a "Заменить" button that opens the image upload modal but **intentionally fails** — same as on product page. Message: "Не удалось загрузить изображение, используйте предложенные пользователями варианты". No error highlighting.

### Current Behavior
The "Заменить" button only appears for product id=1 (`isCustomProductWithInput` check at `item-rendering.js:49` is `product.id === window.CUSTOM_PRODUCT_ID`). Custom products (status='custom') don't get this button at all.

### Required Changes

**File: `public/js/pages/cart/item-rendering.js`**
- Expand the replace button rendering (around lines 100-105) to also show for `status='custom'` products
- Add a separate click handler for custom product replace buttons (around lines 260-284):
  - Instead of calling `showImageUploadModal()`, show a toast: "Не удалось загрузить изображение, используйте предложенные пользователями варианты"
  - Alternatively, open the modal but intercept the upload to always "fail" with that message
- The button label should be "Заменить" since admin background is already set

---

## 5. Variant Image as Miniature in Cart & Order Page

### Intended Behavior
- For **product id=1**: cart/order miniature shows the user's uploaded image (already works via `custom_url`)
- For **оригинальные products** with a chosen variant: miniature shows the specific **Варианты image** corresponding to the variant number, not the product's default/first image
- This should be **dynamic** — if user changes the variant number in cart, the miniature updates to match

### Current Behavior
- Cart (`item-rendering.js:69-71`): Shows `item.custom_url` for id=1, `item.image` for everything else
- Order page (`order.js:382-388`): Shows `custom_url` → `variation_num` (if URL) → `item.image`
- **No mechanism exists** to map variant number → variant image URL at cart display time

### Required Changes

This is the most complex change. Variant images are stored in `product_images` with `extra='варианты'`, but the cart only stores `variation_num` (a number like "5"). The mapping from variant number to image URL must be derived at render time.

**Approach A: Fetch variant images at cart render time**

**File: `public/js/pages/cart/item-rendering.js`**
- When rendering an item where `product.type === 'оригинал'` and `variationNum` is set:
  - Look up the product's images (available via the products API or cached from page load)
  - Filter to `extra === 'варианты'` AND `hidden_product !== true`
  - Index by variant number (variant #1 = first image, #2 = second, etc.)
  - Use that image URL as the miniature instead of `item.image`

**File: `public/js/pages/cart.js`**
- Product data is already fetched for cart rendering (`fetchProductData()`)
- Product images need to be included in the fetch or fetched separately
- The `/products/{id}/images` endpoint returns images with `extra` field — use this
- Cache the variant image mapping per product: `{ productId: { varNum: imageUrl } }`

**File: `public/js/pages/order.js`**
- Order items already include `item.image` from the DB
- For originals with `variation_num`, the correct variant image URL should be stored at checkout time (see below)

**Approach B: Store variant image URL at add-to-cart / checkout time**

**File: `public/js/pages/product/main.js` or `format-dropdown.js`**
- When adding to cart, also store `variant_image_url` on the cart item
- This avoids needing to re-derive the mapping at render time

**File: `api/orders/create.js`**
- At checkout, resolve variant_num → variant image URL and store in `order_items.image`
- This ensures order page always has the correct image

**Recommended: Combination of both**
- Store `variant_image_url` in the cart item when variant is selected (for cart page dynamic display)
- At checkout time, resolve and persist to `order_items.image` (for order page, which reads from DB)
- Keep the dynamic cart behavior (if user changes variant number, re-resolve the image)

### Variant Counting Note
The current code at `main.js:693` already correctly filters out `hidden_product` images before counting variants:
```js
let allImages = getProductImages(product.id).filter(img => !(typeof img === 'object' && img.hidden_product));
```
Then at lines 707-717, only `extra === 'варианты'` images are counted. This is correct — admin-hidden images are excluded from both the carousel and variant numbering.

The same filtering must be applied when resolving variant number → image URL in cart/order rendering.

---

## 6. Variation Number Sync Bug (Critical)

### Problem
Variation numbers entered by users are **not actually persisted to the database** despite the sync infrastructure existing.

### Root Cause
**File: `api/sync/cart.js` (line 64)**
```js
const { cart } = req.body;
```
The POST handler destructures only `cart` from the request body. The client sends `{ cart, variations }` (see `data-sync.js:73`), but the `variations` object is **completely ignored**.

Then at line 109:
```js
item.variation_num || item.variationNum || null
```
It tries to read `variation_num` from each cart item, but cart items in localStorage **don't have `variation_num`** on them — variations are stored separately in `tributeCartVariations` (`localStorage`) and sent as a separate `variations` object.

**Result:** `variation_num` is always `null` in the `user_cart` DB table. The GET handler (lines 44-50) correctly builds a variations map from DB rows, but since nothing was written, it's always empty. Cross-device sync of variation numbers is broken.

### Fix

**File: `api/sync/cart.js` (handlePost function, lines 62-129)**

1. Destructure `variations` from `req.body` alongside `cart` (line 64):
   ```js
   const { cart, variations } = req.body;
   ```

2. When inserting cart items (line 109), look up the variation from the `variations` object:
   ```js
   const variationKey = `${item.productId || item.product_id}_${item.property}`;
   const variationNum = (variations && variations[variationKey]) || item.variation_num || item.variationNum || null;
   ```

3. Use `variationNum` in the INSERT query parameter instead of the current expression.

### Verification
After fix, test by:
1. Adding an оригинальный product to cart with a variant number
2. Checking `user_cart` table in Supabase — `variation_num` should be populated
3. Logging in from another device/browser — variant numbers should appear

---

## File Reference Map

| File | Role |
|---|---|
| `public/js/pages/product/main.js` | Product page orchestration, carousel, variant selection |
| `public/js/pages/product/format-dropdown.js` | Product page format dropdown, add-to-cart |
| `public/js/pages/product/combinations.js` | Product page combination cards (custom + original) |
| `public/js/pages/product/background-selection.js` | Custom product background selection UI |
| `public/js/pages/cart.js` | Cart page orchestration, checkout validation |
| `public/js/pages/cart/item-rendering.js` | Cart item HTML rendering, event handlers |
| `public/js/pages/order.js` | Order page item rendering |
| `public/js/modules/product-grid.js` | Products grid format dropdown |
| `public/js/modules/header.js` | Search modal format dropdown |
| `public/js/core/data-sync.js` | Cart/favorites sync to server |
| `public/js/core/constants.js` | Format options (5 formats) |
| `api/sync/cart.js` | Server-side cart sync endpoint |
| `api/orders/create.js` | Order creation, item validation |
| `server/utils/cart-helpers.js` | Cart DB query helpers |
| `admin-miniapp/js/components/imageManager.js` | Admin image management (hidden flags) |

## Format Options Reference

There are exactly **5 format options** for regular products:
1. A3 без рамки
2. A2 без рамки
3. A1 без рамки
4. A3 в рамке
5. A2 в рамке

This means on grid/search surfaces, one variant of a product can have at most 5 formats = 5 cart entries. This is a natural UI constraint, not something to enforce programmatically.

## Image Visibility Flags (Admin)

`product_images` table has two boolean flags:
- `hidden` — "Скрыть с сетки" (hide from masonry grid on product page)
- `hidden_product` — "Скрыть с товара" (hide from product page entirely)

For variant counting, only images where `hidden_product = false` AND `extra = 'варианты'` are counted. This is already correct in `main.js:693,712`.

## Data Flow Summary

```
Product Page          Grid/Search           Cart Page
     |                    |                     |
     v                    v                     v
window.cart (localStorage: tributeCart)
window.cartVariations (localStorage: tributeCartVariations)
     |
     +-- cartUpdated event (syncs all open UIs)
     |
     v
data-sync.js → POST /api/sync/cart → user_cart table
                                      (variation_num BROKEN - fix #6)
     |
     v
Order creation → order_items table (variation_num, custom_url, image)
```
