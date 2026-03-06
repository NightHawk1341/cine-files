/**
 * Recently Viewed Products Module
 * Tracks products users have viewed and stores in localStorage
 */

const STORAGE_KEY = 'viewedProducts';
const MAX_PRODUCTS = 10;

/**
 * Get list of recently viewed products
 * @returns {Array} Array of product objects
 */
export function getViewedProducts() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.error('Error reading viewed products:', e);
    return [];
  }
}

/**
 * Add a product to the viewed list
 * @param {Object} product - Product object with at least id, title, image, price
 */
export function addViewedProduct(product) {
  if (!product || !product.id) return;

  try {
    let viewed = getViewedProducts();

    // Remove if already exists (will re-add to front)
    viewed = viewed.filter(p => p.id !== product.id);

    // Add to front with minimal data
    viewed.unshift({
      id: product.id,
      title: product.title,
      image: product.images?.[0] || product.image || '',
      price: product.price,
      slug: product.slug || product.id,
      viewedAt: Date.now()
    });

    // Keep only last N products
    if (viewed.length > MAX_PRODUCTS) {
      viewed = viewed.slice(0, MAX_PRODUCTS);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(viewed));
  } catch (e) {
    console.error('Error saving viewed product:', e);
  }
}

/**
 * Get viewed products excluding certain product IDs
 * @param {Array<string>} excludeIds - Product IDs to exclude
 * @param {number} limit - Maximum products to return
 * @returns {Array} Filtered array of products
 */
export function getViewedProductsExcluding(excludeIds = [], limit = 5) {
  const viewed = getViewedProducts();
  const filtered = viewed.filter(p => !excludeIds.includes(p.id));
  return filtered.slice(0, limit);
}

/**
 * Clear viewed products history
 */
export function clearViewedProducts() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error('Error clearing viewed products:', e);
  }
}

/**
 * Check if any products have been viewed
 * @returns {boolean}
 */
export function hasViewedProducts() {
  return getViewedProducts().length > 0;
}
