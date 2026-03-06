/**
 * Content Moderation Engine
 *
 * Checks user-submitted text against a configurable banned-word list.
 * Handles character substitutions (Latin lookalikes, numbers, separators)
 * to catch circumvention attempts.
 */

const { getPool } = require('./db');

// Character substitution map: normalize Latin lookalikes, numbers, specials → Cyrillic
const CHAR_SUBSTITUTIONS = {
  // Latin → Cyrillic lookalikes
  'a': 'а', 'b': 'б', 'c': 'с', 'e': 'е', 'h': 'н', 'k': 'к',
  'm': 'м', 'o': 'о', 'p': 'р', 't': 'т', 'x': 'х', 'y': 'у',
  // Number → Cyrillic
  '0': 'о', '3': 'з', '4': 'ч', '6': 'б',
  // Special → Cyrillic
  '@': 'а',
  // Cyrillic normalization
  'ё': 'е'
};

// In-memory cache
let wordsCache = null;
let wordsCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

let configCache = null;
let configCacheTime = 0;

/**
 * Normalize text for comparison:
 * 1. Lowercase
 * 2. Apply character substitutions
 * 3. Strip separators between Cyrillic-range chars (catches б.л.я, х-у-й)
 * 4. Collapse repeated consecutive chars (catches блляяя)
 */
function normalizeText(text) {
  if (!text) return '';

  let result = text.toLowerCase();

  // Apply character substitutions
  let normalized = '';
  for (const ch of result) {
    normalized += CHAR_SUBSTITUTIONS[ch] || ch;
  }

  // Strip common separators (., -, _, *, spaces) between Cyrillic chars
  // Match: cyrillic char + one or more separators + cyrillic char
  normalized = normalized.replace(
    /([а-яё])[\s.\-_*,!?;:]+([а-яё])/g,
    '$1$2'
  );
  // Run twice — first pass may leave new adjacencies uncollapsed
  normalized = normalized.replace(
    /([а-яё])[\s.\-_*,!?;:]+([а-яё])/g,
    '$1$2'
  );

  // Collapse repeated consecutive characters (блляя → бля)
  normalized = normalized.replace(/(.)\1+/g, '$1');

  return normalized;
}

/**
 * Load active words from DB (cached)
 */
async function loadWords() {
  const now = Date.now();
  if (wordsCache && (now - wordsCacheTime) < CACHE_TTL) {
    return wordsCache;
  }

  try {
    const pool = getPool();
    const result = await pool.query(
      'SELECT word, category FROM moderation_words WHERE is_active = true'
    );

    // Pre-normalize all words for fast matching
    wordsCache = result.rows.map(row => ({
      original: row.word,
      normalized: normalizeText(row.word),
      category: row.category
    }));
    wordsCacheTime = now;

    return wordsCache;
  } catch (err) {
    console.error('[moderation] Error loading words:', err.message);
    // If table doesn't exist yet, return empty list
    if (err.code === '42P01') {
      wordsCache = [];
      wordsCacheTime = now;
      return wordsCache;
    }
    return wordsCache || [];
  }
}

/**
 * Load moderation config from app_settings (cached)
 */
async function getModerationConfig() {
  const now = Date.now();
  if (configCache && (now - configCacheTime) < CACHE_TTL) {
    return configCache;
  }

  const defaults = {
    enabled: true,
    check_reviews: true,
    check_comments: true,
    check_suggestions: true
  };

  try {
    const pool = getPool();
    const result = await pool.query(
      "SELECT value FROM app_settings WHERE key = 'moderation_config'"
    );

    if (result.rows.length > 0) {
      configCache = { ...defaults, ...result.rows[0].value };
    } else {
      configCache = defaults;
    }
    configCacheTime = now;
    return configCache;
  } catch (err) {
    console.error('[moderation] Error loading config:', err.message);
    return configCache || defaults;
  }
}

/**
 * Check text against banned word list.
 *
 * @param {string} text - User-submitted text
 * @param {string} [type] - Feedback type ('review', 'comment', 'suggestion')
 * @returns {Promise<{passed: boolean, matchedWords: string[]}>}
 */
async function checkText(text, type) {
  const config = await getModerationConfig();

  // Moderation disabled globally
  if (!config.enabled) {
    return { passed: true, matchedWords: [] };
  }

  // Per-type toggle
  if (type === 'review' && !config.check_reviews) return { passed: true, matchedWords: [] };
  if (type === 'comment' && !config.check_comments) return { passed: true, matchedWords: [] };
  if (type === 'suggestion' && !config.check_suggestions) return { passed: true, matchedWords: [] };

  const words = await loadWords();
  if (!words || words.length === 0) {
    return { passed: true, matchedWords: [] };
  }

  const normalizedText = normalizeText(text);
  const matchedWords = [];

  for (const entry of words) {
    if (normalizedText.includes(entry.normalized)) {
      matchedWords.push(entry.original);
    }
  }

  return {
    passed: matchedWords.length === 0,
    matchedWords
  };
}

/**
 * Invalidate cached word list (call after admin CRUD operations)
 */
function invalidateCache() {
  wordsCache = null;
  wordsCacheTime = 0;
  configCache = null;
  configCacheTime = 0;
}

module.exports = {
  checkText,
  normalizeText,
  invalidateCache,
  getModerationConfig
};
