const { config } = require('./config');

const MOCK_PRODUCTS = [
  {
    id: 1,
    name: 'Фигурка — Тестовый продукт',
    price: 2999,
    imageUrl: '/icons/placeholder.svg',
    url: 'https://buy-tribute.com/products/1',
  },
];

// In-memory cache for auto-matched products: cacheKey -> { data, expiresAt }
const _tributeMatchCache = new Map();
const _TRIBUTE_CACHE_TTL = 60 * 60 * 1000; // 1 hour
const _MATCH_TAG_TYPES = new Set(['movie', 'series', 'person', 'genre']);

/**
 * Fetch products from TR-BUTE by IDs.
 * @param {number[]} ids
 * @returns {Promise<Array>}
 */
async function fetchTributeProducts(ids) {
  if (config.isDev) {
    return MOCK_PRODUCTS.filter((p) => ids.includes(p.id));
  }

  try {
    const response = await fetch(
      `${config.tribute.apiUrl}/products/by-ids?ids=${ids.join(',')}`
    );
    if (!response.ok) return [];
    return response.json();
  } catch {
    return [];
  }
}

/**
 * Check if a user exists in TR-BUTE by OAuth provider.
 * @param {string} provider
 * @param {string} providerId
 * @returns {Promise<number|null>}
 */
async function checkTributeUser(provider, providerId) {
  if (config.isDev) return null;

  try {
    const response = await fetch(
      `${config.tribute.apiUrl}/users/by-provider?provider=${provider}&id=${providerId}`
    );
    if (!response.ok) return null;
    const data = await response.json();
    return data.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Search TR-BUTE products by article tag names.
 * Calls /products/search for each relevant tag in parallel and deduplicates results.
 * @param {Array<{slug: string, nameRu: string, tagType: string}>} tags
 * @returns {Promise<Array>} normalized product objects { id, name, price, imageUrl, url }
 */
async function searchTributeProductsByTags(tags) {
  if (config.isDev) return MOCK_PRODUCTS;

  const relevant = tags
    .filter(t => _MATCH_TAG_TYPES.has(t.tagType))
    .slice(0, 5);

  if (relevant.length === 0) return [];

  const cacheKey = 'tribute-match:' + relevant.map(t => t.slug).sort().join(',');
  const cached = _tributeMatchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  try {
    const batches = await Promise.all(relevant.map(t => _tributeSearchByName(t.nameRu)));
    const seen = new Set();
    const products = [];
    for (const batch of batches) {
      for (const p of batch) {
        if (!seen.has(p.id)) {
          seen.add(p.id);
          products.push(p);
          if (products.length >= 10) break;
        }
      }
      if (products.length >= 10) break;
    }
    _tributeMatchCache.set(cacheKey, { data: products, expiresAt: Date.now() + _TRIBUTE_CACHE_TTL });
    return products;
  } catch {
    return [];
  }
}

async function _tributeSearchByName(name) {
  try {
    const res = await fetch(
      `${config.tribute.apiUrl}/products/search?query=${encodeURIComponent(name)}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    const items = Array.isArray(data) ? data : (data.products || []);
    const tributeBase = config.tribute.apiUrl.replace(/\/api\/?$/, '');
    return items.map(p => ({
      id: p.id,
      name: p.title || p.name || '',
      price: p.price,
      imageUrl: p.image_url || p.imageUrl || null,
      url: p.url || `${tributeBase}/products/${p.id}`,
    }));
  } catch {
    return [];
  }
}

module.exports = { fetchTributeProducts, checkTributeUser, searchTributeProductsByTags };
