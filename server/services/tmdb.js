const { config } = require('../../lib/config');
const { getPool } = require('../../lib/db');

/**
 * Fetch from the TMDB proxy (Vercel, US region — bypasses Russian IP blocks).
 * @param {string} path
 * @returns {Promise<object|null>}
 */
async function fetchFromProxy(path) {
  const proxyUrl = config.tmdb.proxyUrl;
  if (!proxyUrl) return null;

  try {
    const response = await fetch(`${proxyUrl}/${path}`, {
      headers: { 'X-Proxy-Secret': config.tmdb.proxySecret },
    });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

/**
 * Check cache, fetch from proxy if miss, store in cache.
 * @param {string} cacheKey
 * @param {string} path
 * @param {number} [ttlHours=24]
 * @returns {Promise<object|null>}
 */
async function getCachedOrFetch(cacheKey, path, ttlHours = 24) {
  const pool = getPool();

  // Check cache
  const { rows } = await pool.query(
    `SELECT response, expires_at FROM tmdb_cache WHERE cache_key = $1`,
    [cacheKey]
  );

  if (rows[0] && new Date(rows[0].expires_at) > new Date()) {
    return rows[0].response;
  }

  // Fetch from proxy
  const data = await fetchFromProxy(path);
  if (!data) return null;

  // Store in cache (upsert)
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
  await pool.query(
    `INSERT INTO tmdb_cache (cache_key, response, expires_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (cache_key)
     DO UPDATE SET response = $2, expires_at = $3`,
    [cacheKey, JSON.stringify(data), expiresAt]
  );

  return data;
}

/**
 * Search TMDB via proxy.
 * @param {string} query
 * @param {string} [language='ru-RU']
 * @returns {Promise<Array>}
 */
async function searchTmdb(query, language = 'ru-RU') {
  const cacheKey = `search/multi?query=${encodeURIComponent(query)}&lang=${language}`;
  const path = `search/multi?query=${encodeURIComponent(query)}&language=${language}`;

  const data = await getCachedOrFetch(cacheKey, path, 1);
  return data?.results ?? [];
}

/**
 * Get a single TMDB entity (movie, tv, or person).
 * @param {'movie'|'tv'|'person'} type
 * @param {number} tmdbId
 * @param {string} [language='ru-RU']
 * @returns {Promise<object|null>}
 */
async function getTmdbEntity(type, tmdbId, language = 'ru-RU') {
  const cacheKey = `${type}/${tmdbId}?lang=${language}`;
  const path = `${type}/${tmdbId}?language=${language}&append_to_response=credits`;
  return getCachedOrFetch(cacheKey, path, 24);
}

/**
 * Sync a TMDB entity into our tmdb_entities table.
 * @param {'movie'|'tv'|'person'} type
 * @param {number} tmdbId
 * @returns {Promise<object|null>}
 */
async function syncTmdbEntity(type, tmdbId) {
  const data = await getTmdbEntity(type, tmdbId);
  if (!data) return null;

  const pool = getPool();
  const titleRu = data.title || data.name || null;
  const titleEn = data.original_title || data.original_name || null;
  const credits = data.credits || null;

  const { rows } = await pool.query(
    `INSERT INTO tmdb_entities (tmdb_id, entity_type, title_ru, title_en, metadata, credits, last_synced_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (tmdb_id, entity_type)
     DO UPDATE SET title_ru = $3, title_en = $4, metadata = $5, credits = $6, last_synced_at = NOW()
     RETURNING *`,
    [tmdbId, type, titleRu, titleEn, JSON.stringify(data), credits ? JSON.stringify(credits) : null]
  );

  return rows[0] || null;
}

module.exports = { searchTmdb, getTmdbEntity, syncTmdbEntity, getCachedOrFetch };
