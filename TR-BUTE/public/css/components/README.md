# Horizontal Product Card Module

A unified, reusable component for displaying product items horizontally across the site.

## 📍 Location
- **CSS**: `/public/css/components/horizontal-card.css`
- **JS**: `/public/js/modules/horizontal-card.js`

## ✅ Best Used For

The horizontal card module is **ideal for display-only scenarios** where you need to show product information without complex interactions:

- ✅ **Checkout cart summary** (currently implemented)
- ✅ **Order confirmation screens**
- ✅ **Email/receipt displays**
- ✅ **Simple product listings**
- ✅ **Recently viewed items**
- ✅ **Purchase history previews**

## 🔧 Complex Interactive Features

For pages with complex interactive features, use a **hybrid approach**:

**✅ Supported via hybrid integration:**
- Quantity controls (+/- buttons) → Cart, Order pages
- Delete/edit/restore actions → Order page
- Form inputs (variation numbers, custom URLs) → Cart page
- Selection checkboxes → Cart page
- Property dropdowns → Cart page
- Image upload/background selection → Cart page
- Review forms or ratings → Order page

**How it works:**
Instead of using `renderHorizontalCard()`, add horizontal-card CSS classes to your existing elements:
- `horizontal-card` → Main container
- `horizontal-card-image` → Product image
- `horizontal-card-content` → Content wrapper
- `horizontal-card-title` → Product title

This lets you inherit base styling while keeping your custom HTML structure and functionality.

## 🎨 Variants

### Compact
```js
renderHorizontalCard({
  image: '/path/to/image.jpg',
  title: 'Product Name',
  details: 'Size x Quantity',
  price: 5000,
  compact: true,
  interactive: false
});
```
Perfect for checkout summaries and tight spaces.

### Interactive
```js
renderHorizontalCard({
  image: '/path/to/image.jpg',
  title: 'Product Name',
  details: 'Size x Quantity',
  price: 5000,
  href: '/product?id=123',
  interactive: true
});
```
Adds hover effects and makes the entire card clickable.

### Special Styles
```js
renderHorizontalCard({
  image: '/path/to/triptych.jpg',
  title: 'Triptych Artwork',
  details: 'Large x 1',
  price: 15000,
  triptych: true,        // Adds layered shadow effect
  customProduct: false
});

renderHorizontalCard({
  image: '/path/to/custom.jpg',
  title: 'Custom Poster',
  details: 'Medium x 1',
  price: 3500,
  triptych: false,
  customProduct: true    // Adds wavy yellow border
});
```

## 📋 API

### `renderHorizontalCard(options)`

Returns HTML string for the card.

**Parameters:**
- `image` (string, required): Product image URL
- `title` (string, required): Product title
- `details` (string, required): Product details (property, quantity, etc.)
- `price` (number, required): Product price
- `oldPrice` (number, optional): Original price for discount display
- `href` (string, optional): Link URL (makes card clickable)
- `compact` (boolean, default: false): Use compact variant
- `interactive` (boolean, default: true): Enable hover effects
- `triptych` (boolean, default: false): Apply triptych shadow effect
- `customProduct` (boolean, default: false): Apply custom product styling
- `status` (string, optional): Status badge text
- `statusClass` (string, optional): Status badge CSS class

### `createHorizontalCard(options)`

Returns DOM element instead of HTML string. Same parameters as `renderHorizontalCard()`.

## 🚀 Usage Example

### In HTML
```html
<link rel="stylesheet" href="/css/components/horizontal-card.css">
```

### In JavaScript
```javascript
import { renderHorizontalCard } from '../modules/horizontal-card.js';

const cardHTML = renderHorizontalCard({
  image: addImageSize(item.image, '480x0'),
  title: item.title,
  details: `${item.property} x ${item.quantity}`,
  price: item.price * item.quantity,
  oldPrice: item.old_price * item.quantity,
  compact: true,
  interactive: false
});

containerEl.innerHTML += cardHTML;
```

## 🎯 Migration Status

| Page | Status | Approach |
|------|--------|----------|
| Checkout (`/pages/checkout.html`) | ✅ Fully migrated | Uses `renderHorizontalCard()` with compact variant |
| Cart (`/pages/cart.html`) | ✅ Base classes | Inherits horizontal-card styling + custom interactive features |
| Order (`/pages/order.html`) | ✅ Base classes | Inherits horizontal-card styling + custom interactive features |

### Migration Approach

**Checkout** uses the horizontal card module directly via `renderHorizontalCard()` since it's a simple display-only scenario.

**Cart & Order** pages use a hybrid approach:
- Add `horizontal-card`, `horizontal-card-image`, `horizontal-card-content`, `horizontal-card-title` classes to existing elements
- Inherit base styling from horizontal-card.css
- Keep specialized HTML structure and interactive features intact
- Override/extend styles in page-specific CSS files (cart.css, order.css)

This approach provides:
- ✅ Consistent base styling across all product cards
- ✅ Specialized pages keep their complex functionality
- ✅ Single source of truth for core card styles
- ✅ Easy global styling updates

## 💡 Future Considerations

The horizontal card module is designed to be flexible:
1. **Full integration** (like checkout) - Use `renderHorizontalCard()` for simple display scenarios
2. **Hybrid integration** (like cart/order) - Add base classes to inherit styling while keeping custom structure
3. **Custom slots** - Use `imageWrapper`, `contentExtra`, `meta` parameters for custom content

The module prioritizes **flexibility and reusability** while allowing specialized implementations when needed.

## 📦 Benefits

✨ **Consistent styling** across display-only product cards
✨ **Reduced CSS duplication** (~50-100 lines saved per migration)
✨ **Easier maintenance** with single source of truth
✨ **Better accessibility** with semantic HTML
✨ **Responsive by default** with mobile-optimized breakpoints
