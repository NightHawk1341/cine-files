// ============================================================
// DATA LOADERS
// API data loading functions for prices and images
// ============================================================

import { productPrices, allImagesByProduct, setProductPrices, setAllImagesByProduct } from './state.js';

// Track loading state to prevent duplicate loads
let pricesLoaded = false;
let imagesLoaded = false;
let pricesLoading = false;
let imagesLoading = false;

/**
 * Check if prices data is available
 * @returns {boolean}
 */
export const isPricesLoaded = () => pricesLoaded && Object.keys(window.productPrices || {}).length > 0;

/**
 * Check if images data is available
 * @returns {boolean}
 */
export const isImagesLoaded = () => imagesLoaded && (window.allImagesByProduct?.size > 0);

/**
 * Load product prices from API
 * Fetches pricing data and updates the productPrices state
 * @param {boolean} force - Force reload even if already loaded
 * @returns {Promise<boolean>} - Returns true if data was loaded successfully
 * @example
 * await loadProductPrices()
 */
export const loadProductPrices = async (force = false) => {
  // Skip if already loaded (unless forced)
  if (!force && pricesLoaded && Object.keys(window.productPrices || {}).length > 0) {
    return true;
  }

  // Prevent concurrent loads
  if (pricesLoading) {
    // Wait for ongoing load to complete
    return new Promise(resolve => {
      const checkLoaded = setInterval(() => {
        if (!pricesLoading) {
          clearInterval(checkLoaded);
          resolve(pricesLoaded);
        }
      }, 50);
    });
  }

  pricesLoading = true;

  try {
    const res = await fetch('/api/product-prices');
    if (!res.ok) {
      console.warn(`Failed to load product prices: ${res.status} ${res.statusText}`);
      pricesLoading = false;
      return false;
    }

    const prices = await res.json();
    if (!Array.isArray(prices)) {
      console.warn('Product prices response is not an array');
      pricesLoading = false;
      return false;
    }

    const pricesObj = {};
    prices.forEach(price => {
      if (price.id) {
        pricesObj[price.id] = {
          discount_price: parseFloat(price.discount_price),
          base_price: parseFloat(price.base_price)
        };
      }
    });

    setProductPrices(pricesObj);
    window.productPrices = pricesObj; // For backward compatibility
    pricesLoaded = true;
    pricesLoading = false;

    // Dispatch event for listeners
    window.dispatchEvent(new CustomEvent('pricesLoaded', { detail: { prices: pricesObj } }));
    return true;
  } catch (e) {
    console.error('Error loading product prices:', e);
    pricesLoading = false;
    return false;
  }
};

/**
 * Load product images from API
 * Fetches all images and groups them by product ID
 * @param {boolean} force - Force reload even if already loaded
 * @returns {Promise<boolean>} - Returns true if data was loaded successfully
 * @example
 * await loadProductImages()
 */
export const loadProductImages = async (force = false) => {
  // Skip if already loaded (unless forced)
  if (!force && imagesLoaded && window.allImagesByProduct?.size > 0) {
    return true;
  }

  // Prevent concurrent loads
  if (imagesLoading) {
    // Wait for ongoing load to complete
    return new Promise(resolve => {
      const checkLoaded = setInterval(() => {
        if (!imagesLoading) {
          clearInterval(checkLoaded);
          resolve(imagesLoaded);
        }
      }, 50);
    });
  }

  imagesLoading = true;

  try {
    const res = await fetch('/api/all-images');
    if (!res.ok) {
      console.warn(`Failed to load product images: ${res.status} ${res.statusText}`);
      imagesLoading = false;
      return false;
    }

    const images = await res.json();
    if (!Array.isArray(images)) {
      console.warn('Product images response is not an array');
      imagesLoading = false;
      return false;
    }

    const imagesByProduct = new Map();
    images.forEach(img => {
      if (!imagesByProduct.has(img.product_id)) {
        imagesByProduct.set(img.product_id, []);
      }
      imagesByProduct.get(img.product_id).push(img);
    });

    // Update both ES6 module state and global state
    setAllImagesByProduct(imagesByProduct);
    window.allImagesByProduct = imagesByProduct;
    imagesLoaded = true;
    imagesLoading = false;

    // Dispatch event for listeners
    window.dispatchEvent(new CustomEvent('imagesLoaded', { detail: { count: imagesByProduct.size } }));
    return true;
  } catch (e) {
    console.error('Error loading product images:', e);
    imagesLoading = false;
    return false;
  }
};

/**
 * Ensure all data is loaded (prices and images)
 * Use this on SPA navigation to make sure data is available
 * @returns {Promise<boolean>}
 */
export const ensureDataLoaded = async () => {
  const results = await Promise.all([
    loadProductPrices(),
    loadProductImages()
  ]);
  return results.every(r => r);
};

// Make data loaders available globally for backward compatibility
if (typeof window !== 'undefined') {
  window.loadProductPrices = loadProductPrices;
  window.loadProductImages = loadProductImages;
}
