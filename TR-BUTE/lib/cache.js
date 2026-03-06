/**
 * Redis Cache Utility
 * Reuses the existing Redis connection from session-store.js
 * Falls back to no caching if Redis is unavailable.
 */
const { getRedisClient } = require('./session-store');
const KEY_PREFIX = 'cache:';
/**
 * Get a cached value
 * @param {string} key - Cache key
 * @returns {*} Parsed data or null
 */
async function cacheGet(key) {
  const client = getRedisClient();
  if (!client) return null;
  try {
    const data = await client.get(KEY_PREFIX + key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.warn('Cache get error:', err.message);
    return null;
  }
}
/**
 * Set a cached value
 * @param {string} key - Cache key
 * @param {*} data - Data to cache (will be JSON serialized)
 * @param {number} ttlSeconds - Time to live in seconds
 */
async function cacheSet(key, data, ttlSeconds) {
  const client = getRedisClient();
  if (!client) return;
  try {
    await client.setex(KEY_PREFIX + key, ttlSeconds, JSON.stringify(data));
  } catch (err) {
    console.warn('Cache set error:', err.message);
  }
}
/**
 * Delete cache keys matching a pattern
 * @param {string} pattern - Key pattern (supports * wildcard)
 */
async function cacheDelete(pattern) {
  const client = getRedisClient();
  if (!client) return;
  try {
    const fullPattern = KEY_PREFIX + pattern;
    // Use SCAN to avoid blocking with KEYS on large datasets
    let cursor = '0';
    do {
      const [nextCursor, keys] = await client.scan(cursor, 'MATCH', fullPattern, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await client.del(...keys);
      }
    } while (cursor !== '0');
  } catch (err) {
    console.warn('Cache delete error:', err.message);
  }
}
/**
 * Cache-aside wrapper: check cache, call fetchFn on miss, store result
 * @param {string} key - Cache key
 * @param {number} ttlSeconds - TTL in seconds
 * @param {Function} fetchFn - Async function to call on cache miss
 * @returns {*} Cached or freshly fetched data
 */
async function withCache(key, ttlSeconds, fetchFn) {
  // Try cache first
  const cached = await cacheGet(key);
  if (cached !== null) return cached;
  // Cache miss: call the fetch function
  const data = await fetchFn();
  // Store in cache (non-blocking)
  cacheSet(key, data, ttlSeconds).catch(() => {});
  return data;
}
module.exports = {
  cacheGet,
  cacheSet,
  cacheDelete,
  withCache
};