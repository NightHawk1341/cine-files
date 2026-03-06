// ============================================================
// CENTRALIZED DATA STORE
// Single source of truth for product data across all pages
// ============================================================

/**
 * DataStore - Centralized caching layer for product data
 *
 * Benefits:
 * - Load products once, share everywhere (99% fewer HTTP requests)
 * - Faster page transitions (instant if cached)
 * - Lower memory usage (single copy of data)
 * - Consistent data across pages
 *
 * Usage:
 *   import { DataStore } from '../core/data-store.js';
 *   const products = await DataStore.loadProducts();
 *   const product = DataStore.getProduct(123);
 */
export class DataStore {
  static cache = {
    products: null,
    images: new Map(),
    prices: null,
    lastFetch: null
  };

  static listeners = new Set();

  /**
   * Load all products with intelligent caching
   * @param {boolean} forceRefresh - Force reload even if cached
   * @returns {Promise<Array>} Array of products
   */
  static async loadProducts(forceRefresh = false) {
    const now = Date.now();
    const cacheAge = now - (this.cache.lastFetch || 0);
    const maxAge = 5 * 60 * 1000; // 5 minutes

    if (!forceRefresh && this.cache.products && cacheAge < maxAge) {
      return this.cache.products;
    }

    try {
      const response = await fetch('/products');

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const products = await response.json();

      this.cache.products = products;
      this.cache.lastFetch = now;

      // Notify listeners of data update
      this.notifyListeners('products', products);

      return products;

    } catch (error) {
      console.error('[DataStore] Failed to load products:', error);

      // Return stale cache if available (graceful degradation)
      if (this.cache.products) {
        console.warn('[DataStore] Using stale cache due to error');
        return this.cache.products;
      }

      throw error;
    }
  }

  /**
   * Get a single product by ID
   * @param {number|string} productId - Product ID
   * @returns {Object|null} Product object or null
   */
  static getProduct(productId) {
    if (!this.cache.products) {
      console.warn('[DataStore] getProduct called before loadProducts');
      return null;
    }

    const id = parseInt(productId, 10);
    return this.cache.products.find(p => p.id === id) || null;
  }

  /**
   * Get products by category
   * @param {string} category - Category name
   * @returns {Array} Products in category
   */
  static getProductsByCategory(category) {
    if (!this.cache.products) {
      console.warn('[DataStore] getProductsByCategory called before loadProducts');
      return [];
    }

    return this.cache.products.filter(p => p.category === category);
  }

  /**
   * Cache images for a product
   * @param {number} productId - Product ID
   * @param {Array} images - Array of image URLs
   */
  static setImages(productId, images) {
    this.cache.images.set(productId, images);
  }

  /**
   * Get cached images for a product
   * @param {number} productId - Product ID
   * @returns {Array|null} Array of image URLs or null
   */
  static getImages(productId) {
    return this.cache.images.get(productId) || null;
  }

  /**
   * Cache all product prices
   * @param {Object} prices - Price object keyed by product ID
   */
  static setPrices(prices) {
    this.cache.prices = prices;
  }

  /**
   * Get price for a product
   * @param {number} productId - Product ID
   * @returns {Object|null} Price object or null
   */
  static getPrice(productId) {
    if (!this.cache.prices) {
      return null;
    }
    return this.cache.prices[productId] || null;
  }

  /**
   * Clear all cached data
   */
  static clearCache() {
    this.cache = {
      products: null,
      images: new Map(),
      prices: null,
      lastFetch: null
    };
    this.notifyListeners('cache-cleared', null);
  }

  /**
   * Register a listener for data changes
   * @param {Function} callback - Callback(eventType, data)
   */
  static addListener(callback) {
    this.listeners.add(callback);
  }

  /**
   * Remove a registered listener
   * @param {Function} callback - Previously registered callback
   */
  static removeListener(callback) {
    this.listeners.delete(callback);
  }

  /**
   * Notify all listeners of a data change
   * @private
   */
  static notifyListeners(eventType, data) {
    this.listeners.forEach(callback => {
      try {
        callback(eventType, data);
      } catch (error) {
        console.error('[DataStore] Listener error:', error);
      }
    });
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  static getStats() {
    const now = Date.now();
    const cacheAge = this.cache.lastFetch ? now - this.cache.lastFetch : null;

    return {
      hasProducts: !!this.cache.products,
      productCount: this.cache.products?.length || 0,
      imageCount: this.cache.images.size,
      hasPrices: !!this.cache.prices,
      cacheAgeSeconds: cacheAge ? Math.floor(cacheAge / 1000) : null,
      listenerCount: this.listeners.size
    };
  }
}

// Make available globally for debugging
if (typeof window !== 'undefined') {
  window.DataStore = DataStore;
}
