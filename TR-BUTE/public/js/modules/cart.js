// ============================================================
// CART MODULE
// Cart counter functionality for header and bottom-nav
// ============================================================

// Make cart available globally for other scripts to use
window.cart = window.cart || {};

/**
 * Load cart from localStorage
 */
function loadCart() {
  try {
    const saved = localStorage.getItem('tributeCart');
    if (saved) {
      let parsed = JSON.parse(saved);

      // Handle corrupted format where localStorage contains { cart: {...}, variations: {...} }
      if (parsed && parsed.cart && typeof parsed.cart === 'object' && !parsed.productId) {
        console.warn('Detected corrupted cart format, fixing...');
        parsed = parsed.cart;
        localStorage.setItem('tributeCart', JSON.stringify(parsed));
      }

      // Filter out invalid entries
      const validCart = {};
      for (const key of Object.keys(parsed)) {
        const item = parsed[key];
        // Valid cart items must have a productId or be certificates
        if (item && typeof item === 'object') {
          if (item.type === 'certificate' || item.type === 'certificate_redemption') {
            validCart[key] = item;
          } else if (item.productId || /^\d+_/.test(key)) {
            validCart[key] = item;
          } else {
            console.warn('Filtering out invalid cart entry:', key, item);
          }
        }
      }

      window.cart = validCart;

      // Save cleaned cart back to localStorage
      if (Object.keys(validCart).length !== Object.keys(parsed).length) {
        localStorage.setItem('tributeCart', JSON.stringify(validCart));
      }
    }
  } catch (e) {
    console.error('Error loading cart:', e);
  }
  updateCartCount();
}

/**
 * Get total number of items in cart
 * @returns {number} Total items count
 */
function getCartCount() {
  let totalItems = 0;
  for (const key in window.cart) {
    const item = window.cart[key];
    // Only count checked items (items that are not unchecked)
    if (item.checked !== false) {
      // Ensure quantity is a valid number
      const quantity = parseInt(item.quantity) || 0;
      totalItems += quantity;
    }
  }
  return totalItems;
}

/**
 * Get total price of checked items in cart using stored unitPrice values.
 * Returns 0 if no items have a unitPrice stored yet.
 * @returns {number}
 */
function getCartTotal() {
  let total = 0;
  for (const key in window.cart) {
    const item = window.cart[key];
    if (item.checked === false) continue;
    const qty = parseInt(item.quantity) || 0;
    if (item.type === 'certificate') {
      total += (parseFloat(item.amount) || 0);
    } else if (item.unitPrice) {
      total += (parseFloat(item.unitPrice) || 0) * qty;
    }
  }
  return total;
}

/**
 * Format a price number as a compact Russian string for the bottom nav label.
 * @param {number} price
 * @returns {string}
 */
function formatCartTotal(price) {
  if (price <= 0) return '';
  // Use non-breaking space as thousands separator
  const formatted = price.toLocaleString('ru-RU', { maximumFractionDigits: 0 });
  return formatted + '\u00a0₽';
}

/**
 * Update cart counter displays on page
 */
function updateCartCount() {
  const totalItems = getCartCount();
  const cartTotal = getCartTotal();

  // Update all cart counter elements
  const cartCounters = document.querySelectorAll('.cart-count-header, .cart-count-bottom-nav');
  cartCounters.forEach(counter => {
    counter.textContent = totalItems;
    // Update tooltip with current count
    counter.dataset.tooltip = `Товаров в корзине: ${totalItems}`;
  });

  // Update bottom nav cart label: show sum when cart has items, otherwise "Корзина"
  const bottomNavCartLabel = document.querySelector('.cart-toggle-button-mobile .bottom-nav-label');
  if (bottomNavCartLabel) {
    if (totalItems > 0 && cartTotal > 0) {
      bottomNavCartLabel.textContent = formatCartTotal(cartTotal);
    } else {
      bottomNavCartLabel.textContent = 'Корзина';
    }
  }

  // Add/remove has-cart-count class on cart buttons to toggle icon/counter display
  const cartButtons = document.querySelectorAll('.cart-toggle-button-header, .cart-toggle-button-mobile');
  cartButtons.forEach(button => {
    if (totalItems > 0) {
      button.classList.add('has-cart-count');
    } else {
      button.classList.remove('has-cart-count');
    }
  });
}

/**
 * Get total number of favorited products
 */
function getFavoritesCount() {
  try {
    const saved = localStorage.getItem('tributeFavorites');
    if (saved) return JSON.parse(saved).length;
  } catch (e) {}
  return 0;
}

/**
 * Update favorites counter displays on page
 */
function updateFavoritesCountUI() {
  const count = getFavoritesCount();
  document.querySelectorAll('.favorites-count-header, .favorites-count-bottom-nav').forEach(el => {
    el.textContent = count > 0 ? count : '';
  });
  document.querySelectorAll('.favorites-toggle-button-header, .favorites-toggle-button-mobile').forEach(btn => {
    btn.classList.toggle('has-favorites-count', count > 0);
  });
}

window.updateFavoritesCountUI = updateFavoritesCountUI;

/**
 * Initialize cart module
 */
function initCart() {
  loadCart();
  updateFavoritesCountUI();

  // Listen for storage events (when cart is updated in another tab/window)
  window.addEventListener('storage', (e) => {
    if (e.key === 'tributeCart') {
      loadCart();
    }
    if (e.key === 'tributeFavorites') {
      updateFavoritesCountUI();
    }
  });

  // Listen for custom cart update events (when cart is updated on same page)
  window.addEventListener('cartUpdated', () => {
    loadCart();
  });

  // Listen for favorites update events
  window.addEventListener('favoritesUpdated', updateFavoritesCountUI);
}

// Auto-initialize when script loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCart);
} else {
  initCart();
}

// Export functions for use by other scripts
window.cartModule = {
  getCartCount,
  getCartTotal,
  updateCartCount,
  loadCart
};