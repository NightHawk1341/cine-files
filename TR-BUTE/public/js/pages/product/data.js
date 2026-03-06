// ============================================================
// PRODUCT DATA MODULE
// Handles data loading and state management
// ============================================================

import { DataStore } from '../../core/data-store.js';
import { isLoggedIn } from '../../core/auth.js';
import { addImageSize, filterImagesByExtra } from '../../core/formatters.js';
export { addImageSize, filterImagesByExtra };

// ============ DATA STATE ============

export let allProducts = [];
export let allImagesByProduct = new Map();
export let allAdditionalImagesByProduct = new Map();
export let productPrices = {};
export let currentUser = null;
export let currentProduct = null;

// State setters for external updates
export const setCurrentProduct = (product) => {
  currentProduct = product;
};

export const setCurrentUser = (user) => {
  currentUser = user;
};

// ============ DATA LOADING ============

export async function loadProductData() {
  try {
    // Load products using DataStore (cached if coming from main page)
    allProducts = await DataStore.loadProducts();

    // Load product prices and user data in parallel
    const [pricesRes, userResult] = await Promise.all([
      fetch('/api/product-prices'),
      isLoggedIn() ? fetch('/api/auth/user', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('tributary_accessToken')}`
        }
      }).catch(() => null) : Promise.resolve(null)
    ]);

    if (!pricesRes.ok) throw new Error('Failed to load prices');
    const pricesData = await pricesRes.json();
    productPrices = {};
    pricesData.forEach(price => {
      productPrices[price.id] = price;
    });

    if (userResult && userResult.ok) {
      currentUser = await userResult.json();
    }

    return true;
  } catch (err) {
    console.error('Error loading product data:', err);
    return false;
  }
}

// Load images for a specific product (called after product is identified)
export async function loadProductImages(productId, fallbackImage) {
  // Skip if already loaded
  if (allImagesByProduct.has(productId) && allAdditionalImagesByProduct.has(productId)) {
    return;
  }

  // Try to find product in the public list for a fallback image
  const product = allProducts.find(p => p.id === productId);
  const imageFallback = fallbackImage || product?.image || null;

  try {
    const [imagesRes, additionalRes] = await Promise.all([
      fetch(`/products/${productId}/images`),
      fetch(`/products/${productId}/images-2`)
    ]);

    if (imagesRes.ok) {
      const imageData = await imagesRes.json();
      imageData.sort((a, b) => (a.sort_order ?? Infinity) - (b.sort_order ?? Infinity) || a.id - b.id);
      allImagesByProduct.set(productId, imageData.length > 0 ? imageData : (imageFallback ? [imageFallback] : []));
    } else {
      allImagesByProduct.set(productId, imageFallback ? [imageFallback] : []);
    }

    if (additionalRes.ok) {
      const additionalData = await additionalRes.json();
      additionalData.sort((a, b) => (a.sort_order ?? Infinity) - (b.sort_order ?? Infinity) || a.id - b.id);
      allAdditionalImagesByProduct.set(productId, additionalData.length > 0 ? additionalData : []);
    } else {
      allAdditionalImagesByProduct.set(productId, []);
    }
  } catch (err) {
    console.warn(`Failed to load images for product ${productId}`, err);
    allImagesByProduct.set(productId, imageFallback ? [imageFallback] : []);
    allAdditionalImagesByProduct.set(productId, []);
  }
}

// ============ DATA GETTERS ============

export const getProduct = (productId) => {
  const id = parseInt(productId);
  return allProducts.find(p => p.id === id) || allProducts.find(p => p.slug === productId);
};

export const getProductImages = (productId) => {
  return allImagesByProduct.get(productId) || [];
};

export const getProductAdditionalImages = (productId) => {
  return allAdditionalImagesByProduct.get(productId) || [];
};

// ============ LINKED PRODUCTS ============

export async function loadLinkedProducts(productId) {
  try {
    const response = await fetch(`/api/products/links?product_id=${productId}`);
    if (!response.ok) {
      return [];
    }
    const result = await response.json();
    return result.linked_products || [];
  } catch (error) {
    console.warn('Failed to load linked products:', error);
    return [];
  }
}

export async function loadTypeLinkedProduct(productId) {
  try {
    const response = await fetch(`/api/products/type-links?product_id=${productId}`);
    if (!response.ok) return null;
    const result = await response.json();
    return result.linked_product || null;
  } catch (error) {
    console.warn('Failed to load type-linked product:', error);
    return null;
  }
}

