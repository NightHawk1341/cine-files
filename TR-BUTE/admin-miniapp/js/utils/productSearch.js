/**
 * utils/productSearch.js
 * Unified product search logic across admin interfaces
 */

import { apiGet } from './apiClient.js';

// Cache for linked variant metadata
let linkedVariantsCache = null;
let linkedVariantsCachePromise = null;

/**
 * Load and cache linked products data
 * Builds a map of product_id -> array of linked variant metadata
 * Only includes variants with status "available_via_var"
 */
async function loadLinkedVariantsCache() {
  if (linkedVariantsCache) {
    return linkedVariantsCache;
  }

  if (linkedVariantsCachePromise) {
    return linkedVariantsCachePromise;
  }

  linkedVariantsCachePromise = (async () => {
    try {
      const response = await apiGet('/api/products/links?all=true');
      if (!response.ok) throw new Error('Failed to load linked products');

      const data = await response.json();
      const groups = data.groups || [];

      // Build a map: product_id -> [linked variants with available_via_var status]
      const variantMap = new Map();

      for (const group of groups) {
        // Find all "available_via_var" products in this group
        const variants = group.filter(p => p.status === 'available_via_var');

        if (variants.length === 0) continue;

        // For each non-variant product in the group, attach the variant metadata
        for (const product of group) {
          if (product.status !== 'available_via_var') {
            // This is a main product - attach its linked variants
            const existing = variantMap.get(product.product_id) || [];
            variantMap.set(product.product_id, [...existing, ...variants]);
          }
        }
      }

      linkedVariantsCache = variantMap;
      return variantMap;
    } catch (error) {
      console.error('Error loading linked variants for search:', error);
      linkedVariantsCache = new Map();
      return linkedVariantsCache;
    }
  })();

  return linkedVariantsCachePromise;
}

/**
 * Invalidate the linked variants cache (call when products or links change)
 */
export function invalidateLinkedVariantsCache() {
  linkedVariantsCache = null;
  linkedVariantsCachePromise = null;
}

/**
 * Get linked variant metadata for search scoring
 * @param {number} productId - Product ID
 * @param {Map} variantMap - Map of product_id -> variants
 * @returns {Object} Object with title, alt, keywords combined from linked variants
 */
function getLinkedVariantFields(productId, variantMap) {
  const variants = variantMap?.get(productId) || [];
  if (variants.length === 0) {
    return { title: '', alt: '', keywords: '' };
  }

  // Combine all variant fields for search
  const titles = variants.map(v => v.title || '').join(' ').toLowerCase();
  const alts = variants.map(v => v.alt || '').join(' ').toLowerCase();
  const keywords = variants.map(v => v.key_word || '').join(' ').toLowerCase();

  return { title: titles, alt: alts, keywords };
}

/**
 * Search products by title, alt text, and keywords
 * @param {Array} products - Array of product objects
 * @param {string} query - Search query
 * @returns {Array} Filtered products matching the query
 */
export function searchProducts(products, query) {
  if (!query || query.length < 2) {
    return [];
  }

  const queryLower = query.toLowerCase().trim();

  return products.filter(product => {
    // Search in title
    const titleMatch = product.title?.toLowerCase().includes(queryLower);

    // Search in alt text
    const altMatch = product.alt?.toLowerCase().includes(queryLower);

    // Search in keywords (key_word field)
    const keywordMatch = product.key_word?.toLowerCase().includes(queryLower);

    // Match if found in any field
    return titleMatch || altMatch || keywordMatch;
  });
}

/**
 * Search products and sort by relevance
 * Also searches in linked variant metadata (products with status "available_via_var")
 * @param {Array} products - Array of product objects
 * @param {string} query - Search query
 * @param {number} limit - Maximum results to return
 * @param {Map} variantMap - Optional pre-loaded variant map (for sync usage)
 * @returns {Array} Filtered and sorted products
 */
export function searchProductsRelevance(products, query, limit = 10, variantMap = null) {
  if (!query || query.length < 2) {
    return [];
  }

  const queryLower = query.toLowerCase().trim();

  // Filter and score results
  const scored = products
    .map(product => {
      let score = 0;
      const title = product.title?.toLowerCase() || '';
      const alt = product.alt?.toLowerCase() || '';
      const keywords = product.key_word?.toLowerCase() || '';

      // Exact match in title = highest score
      if (title === queryLower) score += 100;
      // Title starts with query = high score
      else if (title.startsWith(queryLower)) score += 50;
      // Title contains query = medium score
      else if (title.includes(queryLower)) score += 25;

      // Alt text matches
      if (alt === queryLower) score += 80;
      else if (alt.startsWith(queryLower)) score += 40;
      else if (alt.includes(queryLower)) score += 20;

      // Keyword matches
      if (keywords === queryLower) score += 60;
      else if (keywords.startsWith(queryLower)) score += 30;
      else if (keywords.includes(queryLower)) score += 15;

      // Search in linked variants (available_via_var products)
      if (variantMap && score === 0) {
        const variantFields = getLinkedVariantFields(product.id, variantMap);

        // Variant title matches (lower score than main product)
        if (variantFields.title.includes(queryLower)) score += 18;

        // Variant alt matches
        if (variantFields.alt.includes(queryLower)) score += 15;

        // Variant keyword matches
        if (variantFields.keywords.includes(queryLower)) score += 12;
      }

      return { product, score };
    })
    .filter(item => item.score > 0) // Only items with matches
    .sort((a, b) => b.score - a.score) // Sort by relevance
    .slice(0, limit)
    .map(item => item.product);

  return scored;
}

/**
 * Search products with linked variant support (async version)
 * Loads linked variants cache and searches including variant metadata
 * @param {Array} products - Array of product objects
 * @param {string} query - Search query
 * @param {number} limit - Maximum results to return
 * @returns {Promise<Array>} Filtered and sorted products
 */
export async function searchProductsWithVariants(products, query, limit = 10) {
  const variantMap = await loadLinkedVariantsCache();
  return searchProductsRelevance(products, query, limit, variantMap);
}

/**
 * Preload the linked variants cache
 * Call this when loading products to have cache ready for search
 * @returns {Promise<void>}
 */
export async function preloadLinkedVariantsCache() {
  await loadLinkedVariantsCache();
}
