// ============================================================
// GLOBAL STATE MANAGEMENT
// Centralized application state
// ============================================================

/**
 * Product image data indexed by product ID
 * @type {Map<number, Array>}
 */
export let allImagesByProduct = new Map();

/**
 * Additional product image data indexed by product ID
 * @type {Map<number, Array>}
 */
export let allAdditionalImagesByProduct = new Map();

/**
 * Product price data indexed by price ID
 * @type {Object}
 */
export let productPrices = {};

/**
 * User's favorite products
 * @type {Set<number>}
 */
export let favorites = new Set();

/**
 * Shopping cart data (productId -> quantity)
 * @type {Object}
 */
export let cart = {};

/**
 * Cart variation data (productId -> variation/custom text)
 * Stores variation numbers AND custom poster text for CUSTOM_PRODUCT_ID
 * @type {Object}
 */
export let cartVariations = {};

/**
 * Active carousel state for product cards
 * @type {Set<number>}
 */
export let activeCarousels = new Set();

/**
 * Admin user status flag
 * @type {boolean}
 */
export let isAdmin = false;

/**
 * Update product images data
 * Modifies in-place to maintain ES6 module binding references
 * @param {Map} newImages - New images map
 */
export function setAllImagesByProduct(newImages) {
  // Clear and repopulate to maintain ES6 module binding references
  allImagesByProduct.clear();
  newImages.forEach((value, key) => allImagesByProduct.set(key, value));
  if (typeof window !== 'undefined') {
    window.allImagesByProduct = allImagesByProduct;
  }
}

/**
 * Update additional product images data
 * Modifies in-place to maintain ES6 module binding references
 * @param {Map} newImages - New additional images map
 */
export function setAllAdditionalImagesByProduct(newImages) {
  // Clear and repopulate to maintain ES6 module binding references
  allAdditionalImagesByProduct.clear();
  newImages.forEach((value, key) => allAdditionalImagesByProduct.set(key, value));
  if (typeof window !== 'undefined') {
    window.allAdditionalImagesByProduct = allAdditionalImagesByProduct;
  }
}

/**
 * Update product prices
 * Modifies in-place to maintain ES6 module binding references
 * @param {Object} newPrices - New prices object
 */
export function setProductPrices(newPrices) {
  // Clear existing entries
  Object.keys(productPrices).forEach(key => delete productPrices[key]);
  // Copy new entries
  Object.assign(productPrices, newPrices);
  if (typeof window !== 'undefined') {
    window.productPrices = productPrices;
  }
}

/**
 * Update favorites set
 * @param {Set} newFavorites - New favorites set
 */
export function setFavorites(newFavorites) {
  favorites = newFavorites;
}

/**
 * Update cart
 * @param {Object} newCart - New cart object
 */
export function setCart(newCart) {
  cart = newCart;
}

/**
 * Update cart variations
 * @param {Object} newVariations - New variations object
 */
export function setCartVariations(newVariations) {
  cartVariations = newVariations;
}

/**
 * Update admin status
 * @param {boolean} status - Admin status
 */
export function setIsAdmin(status) {
  isAdmin = status;
}

// Make state available globally for debugging and backward compatibility
if (typeof window !== 'undefined') {
  window.appState = {
    get allImagesByProduct() { return allImagesByProduct; },
    get allAdditionalImagesByProduct() { return allAdditionalImagesByProduct; },
    get productPrices() { return productPrices; },
    get favorites() { return favorites; },
    get cart() { return cart; },
    get cartVariations() { return cartVariations; },
    get activeCarousels() { return activeCarousels; },
    get isAdmin() { return isAdmin; }
  };

  // Also export directly on window for backward compatibility with non-module scripts
  window.allImagesByProduct = allImagesByProduct;
  window.allAdditionalImagesByProduct = allAdditionalImagesByProduct;
}
