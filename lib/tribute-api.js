const { config } = require('./config');

const _TRIBUTE_HEADERS = {
  'Accept': 'application/json',
  'Accept-Language': 'ru-RU,ru;q=0.9',
  'User-Agent': 'CineFiles/1.0 (cross-site integration)',
};

const _TRIBUTE_TIMEOUT_MS = 5000;

const MOCK_PRODUCTS = [
  {
    id: 1,
    name: 'Фигурка — Тестовый продукт',
    price: 2999,
    imageUrl: '/icons/placeholder.svg',
    url: 'https://buy-tribute.com/product?id=1',
  },
];

// In-memory caches
const _tributeMatchCache = new Map();
const _TRIBUTE_CACHE_TTL = 60 * 60 * 1000; // 1 hour
const _MATCH_TAG_TYPES = new Set(['movie', 'series', 'person', 'genre']);

// Cached product catalog for local matching
let _catalogCache = null;
let _catalogExpiresAt = 0;
const _CATALOG_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * Fetch products from TR-BUTE by IDs.
 * @param {number[]} ids
 * @returns {Promise<Array>}
 */
async function fetchTributeProducts(ids) {
  if (config.isDev) {
    return MOCK_PRODUCTS.filter((p) => ids.includes(p.id));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), _TRIBUTE_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${config.tribute.apiUrl}/products/by-ids?ids=${ids.join(',')}`,
      { headers: _TRIBUTE_HEADERS, signal: controller.signal }
    );
    if (!response.ok) {
      console.warn('TR-BUTE /products/by-ids returned', response.status);
      return [];
    }
    const data = await response.json();
    const items = Array.isArray(data) ? data : (data.products || []);
    const tributeBase = config.tribute.apiUrl.replace(/\/api\/?$/, '');
    return items.map(p => ({
      id: p.id,
      name: p.title || p.name || '',
      price: p.price,
      imageUrl: p.image_url || p.imageUrl || p.image || (p.media && p.media.variants && p.media.variants.card) || null,
      url: p.url || (p.slug ? `${tributeBase}/${p.slug}` : `${tributeBase}/product?id=${p.id}`),
    }));
  } catch (err) {
    if (err.name !== 'AbortError') console.warn('TR-BUTE /products/by-ids error:', err.message);
    return [];
  } finally {
    clearTimeout(timeout);
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), _TRIBUTE_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${config.tribute.apiUrl}/users/by-provider?provider=${provider}&id=${providerId}`,
      { headers: _TRIBUTE_HEADERS, signal: controller.signal }
    );
    if (!response.ok) return null;
    const data = await response.json();
    return data.id ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch the full TR-BUTE product catalog (cached).
 * Uses the API /products endpoint which includes primary images.
 * @returns {Promise<Array>} raw product objects from TR-BUTE
 */
async function _fetchCatalog() {
  if (_catalogCache && _catalogExpiresAt > Date.now()) return _catalogCache;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), _TRIBUTE_TIMEOUT_MS);

  try {
    const res = await fetch(
      `${config.tribute.apiUrl}/products`,
      { headers: _TRIBUTE_HEADERS, signal: controller.signal }
    );
    if (!res.ok) return _catalogCache || [];
    const data = await res.json();
    const items = Array.isArray(data) ? data : (data.products || []);
    _catalogCache = items.filter(p =>
      p.status === 'available' || p.status === 'coming_soon'
    );
    _catalogExpiresAt = Date.now() + _CATALOG_CACHE_TTL;
    return _catalogCache;
  } catch {
    return _catalogCache || [];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Search TR-BUTE products by article tag names.
 * Fetches the product catalog and matches locally by title, ip_names, and keywords.
 * @param {Array<{slug: string, nameRu: string, nameEn: string, tagType: string}>} tags
 * @returns {Promise<Array>} normalized product objects { id, name, price, imageUrl, url }
 */
async function searchTributeProductsByTags(tags) {
  if (config.isDev) return MOCK_PRODUCTS;

  const relevant = tags
    .filter(t => _MATCH_TAG_TYPES.has(t.tagType))
    .slice(0, 5);

  if (relevant.length === 0) return [];

  const searchTerms = [];
  for (const t of relevant) {
    if (t.nameRu) searchTerms.push(t.nameRu.toLowerCase());
    if (t.nameEn) searchTerms.push(t.nameEn.toLowerCase());
  }
  if (searchTerms.length === 0) return [];

  const cacheKey = 'tribute-match:' + searchTerms.sort().join(',');
  const cached = _tributeMatchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  try {
    const catalog = await _fetchCatalog();
    const tributeBase = config.tribute.apiUrl.replace(/\/api\/?$/, '');
    const matched = [];
    const seen = new Set();

    for (const p of catalog) {
      if (seen.has(p.id)) continue;
      const haystack = [
        p.title,
        p.name,
        p.ip_names,
        p.keywords,
        p.alt,
        p.slug,
      ].filter(Boolean).join(' ').toLowerCase();

      const isMatch = searchTerms.some(term => haystack.includes(term));
      if (isMatch) {
        seen.add(p.id);
        matched.push({
          id: p.id,
          name: p.title || p.name || '',
          price: p.price ? Number(p.price) : null,
          imageUrl: p.image_url || p.imageUrl || p.image || (p.media && p.media.variants && p.media.variants.card) || null,
          url: p.slug ? `${tributeBase}/${p.slug}` : `${tributeBase}/product?id=${p.id}`,
        });
        if (matched.length >= 10) break;
      }
    }

    if (matched.length > 0) {
      _tributeMatchCache.set(cacheKey, { data: matched, expiresAt: Date.now() + _TRIBUTE_CACHE_TTL });
    }
    return matched;
  } catch {
    return [];
  }
}

module.exports = { fetchTributeProducts, checkTributeUser, searchTributeProductsByTags };
