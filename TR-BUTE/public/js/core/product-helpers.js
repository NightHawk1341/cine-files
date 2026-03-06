// ============================================================
// PRODUCT UTILITIES
// Product price and property helpers
// ============================================================

import { propertyToPriceId } from './constants.js';
import { getBaseProperty } from './formatters.js';
import { productPrices } from './state.js';

/**
 * Get product price for a given property
 * Priority: Product-specific price > Generic price table
 * @param {Object} product - Product object
 * @param {string} property - Property name (e.g., 'A3 без рамки')
 * @returns {number} Price in rubles
 * @example
 * getProductPrice(product, 'A3 без рамки') // 1500
 */
export const getProductPrice = (product, property) => {
  // Priority 1: Check if product has a specific price set (overrides discount_price)
  if (product.price && product.price > 0) {
    return parseFloat(product.price);
  }

  // Priority 2: Fall back to generic price table
  const baseProperty = getBaseProperty(property);
  const priceId = propertyToPriceId[baseProperty];
  if (!priceId || !productPrices[priceId]) return 0;

  const priceData = productPrices[priceId];
  // Use discount_price when discount is active, otherwise use base_price
  let price = product.discount ? priceData.discount_price : priceData.base_price;
  if (product.triptych) price *= 3;

  return price;
};

/**
 * Get product old price (before discount) for a given property
 * Returns null if no discount is active
 * @param {Object} product - Product object
 * @param {string} property - Property name
 * @returns {number|null} Old price in rubles, or null if no discount
 * @example
 * getProductOldPrice(product, 'A3 без рамки') // 2000 or null
 */
export const getProductOldPrice = (product, property) => {
  // Only show old price when discount is active
  if (!product.discount) return null;

  // Priority 1: Check if product has a specific old_price set (overrides base_price)
  if (product.old_price && product.old_price > 0) {
    return parseFloat(product.old_price);
  }

  // Priority 2: Fall back to generic price table base_price
  const baseProperty = getBaseProperty(property);
  const priceId = propertyToPriceId[baseProperty];
  if (!priceId || !productPrices[priceId]) return null;

  const priceData = productPrices[priceId];
  let oldPrice = priceData.base_price;
  if (product.triptych) oldPrice *= 3;

  return oldPrice;
};

/**
 * Sort products with custom product (ID=1) appearing first
 * @param {Array} products - Array of products
 * @param {boolean} skipCustomPriority - Skip custom product priority
 * @returns {Array} Sorted products
 */
export const sortProductsWithCustomFirst = (products, skipCustomPriority = false) => {
  if (!Array.isArray(products)) return [];

  // If skip custom priority or no custom product, return as-is
  if (skipCustomPriority) return products;

  const CUSTOM_PRODUCT_ID = 1;
  const customIndex = products.findIndex(p => p.id === CUSTOM_PRODUCT_ID);

  if (customIndex === -1) return products;

  // Move custom product to front
  const sorted = [...products];
  const [customProduct] = sorted.splice(customIndex, 1);
  sorted.unshift(customProduct);

  return sorted;
};
