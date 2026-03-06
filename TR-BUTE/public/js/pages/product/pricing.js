// ============================================================
// PRODUCT PRICING MODULE
// Handles price calculations and format management
// ============================================================

import { productPrices } from './data.js';
import { formatNumberRussian, getBaseProperty } from '../../core/formatters.js';
export { formatNumberRussian };

// ============ CONSTANTS ============

export const formatOptions = [
  { value: 'A3 без рамки', label: 'A3 без рамки' },
  { value: 'A2 без рамки', label: 'A2 без рамки' },
  { value: 'A1 без рамки', label: 'A1 без рамки' },
  { value: 'A3 в рамке', label: 'A3 в рамке' },
  { value: 'A2 в рамке', label: 'A2 в рамке' }
];

export const triptychFormatOptions = [
  { value: 'A3 без рамки', label: '3 A3 без рамок' },
  { value: 'A2 без рамки', label: '3 A2 без рамок' },
  { value: 'A1 без рамки', label: '3 A1 без рамок' },
  { value: 'A3 в рамке', label: '3 A3 в рамках' },
  { value: 'A2 в рамке', label: '3 A2 в рамках' }
];

export const propertyToPriceId = {
  'A3 без рамки': 1,
  'A2 без рамки': 2,
  'A1 без рамки': 3,
  'A3 в рамке': 4,
  'A2 в рамке': 5
};

export const propertyDimensions = {
  'A3 без рамки': '29,7 × 42,0 см',
  'A2 без рамки': '42,0 × 59,4 см',
  'A1 без рамки': '59,4 × 84,1 см',
  'A3 в рамке': '29,7 × 42,0 см',
  'A2 в рамке': '42,0 × 59,4 см'
};

// ============ PRICE HELPERS ============

export const getTriptychProperty = (property) => {
  const mapping = {
    'A3 без рамки': '3 A3 без рамок',
    'A2 без рамки': '3 A2 без рамок',
    'A1 без рамки': '3 A1 без рамок',
    'A3 в рамке': '3 A3 в рамках',
    'A2 в рамке': '3 A2 в рамках'
  };
  return mapping[property] || property;
};

export { getBaseProperty };

export const getProductProperty = (product, property) => {
  return product.triptych ? getTriptychProperty(property) : property;
};

export const getProductPrice = (product, property) => {
  // PRIORITY 1: Use product-specific price if available (overrides discount_price)
  if (product.price && product.price > 0) {
    let price = product.price;
    // Triptych = 3 panels
    if (product.triptych) price *= 3;
    return parseFloat(price);
  }

  // PRIORITY 2: Fall back to generic product_prices table
  const baseProperty = getBaseProperty(property);
  const priceId = propertyToPriceId[baseProperty];
  if (!priceId || !productPrices[priceId]) return 0;

  const priceData = productPrices[priceId];
  // Use discount_price when discount is active, otherwise use base_price
  let price = product.discount ? priceData.discount_price : priceData.base_price;
  if (product.triptych) price *= 3;

  return price;
};

export const getProductOldPrice = (product, property) => {
  // Only show old price when discount is active
  if (!product.discount) return null;

  // PRIORITY 1: Use product-specific old_price if available (overrides base_price)
  if (product.old_price && product.old_price > 0) {
    let price = product.old_price;
    // Triptych = 3 panels
    if (product.triptych) price *= 3;
    return parseFloat(price);
  }

  // PRIORITY 2: Fall back to generic product_prices table base_price
  const baseProperty = getBaseProperty(property);
  const priceId = propertyToPriceId[baseProperty];
  if (!priceId || !productPrices[priceId]) return null;

  const priceData = productPrices[priceId];
  let price = priceData.base_price;
  if (product.triptych) price *= 3;

  return price;
};

// ============ FORMAT HELPERS ============

export const getSelectedFormat = () => {
  const btn = document.querySelector('.format-select-button');
  return btn ? btn.textContent.trim() : 'A3 без рамки';
};

export const isItemInCart = (productId, format, product) => {
  if (!product) return false;
  const displayProperty = getProductProperty(product, format);
  const key = `${productId}_${displayProperty}`;
  return !!window.cart[key];
};

