/**
 * Slug Generator Utility
 * Generates URL-friendly slugs from Russian text
 * Handles transliteration and special cases for TR/BUTE products
 */

/**
 * Transliteration map for Russian to Latin characters
 */
const TRANSLITERATION_MAP = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
  'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
  'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
  'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
  'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
};

/**
 * Transliterate Russian text to Latin characters
 * @param {string} text - Russian text to transliterate
 * @returns {string} Transliterated text
 */
function transliterate(text) {
  return text
    .toLowerCase()
    .split('')
    .map(char => TRANSLITERATION_MAP[char] || char)
    .join('');
}

/**
 * Generate a URL-friendly slug from a product title
 * @param {string} title - Product title (can be in Russian or English)
 * @param {object} options - Additional options
 * @param {boolean} options.isTribute - Whether this is a tribute ([/]) product
 * @param {boolean} options.isTriptych - Whether this is a triptych product
 * @returns {string} URL-friendly slug
 */
function generateProductSlug(title, options = {}) {
  let slug = title;

  // Remove [/] marker if present (tribute products)
  slug = slug.replace(/\[\/\]/g, '');

  // Transliterate Russian characters to Latin
  slug = transliterate(slug);

  // Convert to lowercase and replace spaces/special chars with hyphens
  slug = slug
    .toLowerCase()
    .trim()
    // Replace multiple spaces with single space
    .replace(/\s+/g, ' ')
    // Replace spaces with hyphens
    .replace(/\s/g, '-')
    // Remove special characters except hyphens
    .replace(/[^a-z0-9-]/g, '')
    // Replace multiple hyphens with single hyphen
    .replace(/-+/g, '-')
    // Remove leading/trailing hyphens
    .replace(/^-|-$/g, '');

  // Add suffix for special product types
  if (options.isTribute) {
    slug += '-tribute';
  }
  if (options.isTriptych) {
    slug += '-triptych';
  }

  return slug;
}

/**
 * Generate a slug for a catalog title
 * @param {string} title - Catalog title in Russian
 * @returns {string} URL-friendly slug in English
 */
function generateCatalogSlug(title) {
  // Predefined catalog title mappings (Russian -> English)
  const catalogMappings = {
    'новинки': 'new',
    'популярное': 'popular',
    'игры': 'games',
    'фильмы': 'movies',
    'сериалы': 'series',
    'аниме': 'anime',
    'фирменные': 'tribute',
    'триптих': 'triptych',
    'триптихи': 'triptych',
    'хиты продаж': 'bestsellers',
    'коллекции': 'collections'
  };

  const lowerTitle = title.toLowerCase().trim();

  // Check if we have a predefined mapping
  if (catalogMappings[lowerTitle]) {
    return catalogMappings[lowerTitle];
  }

  // Fallback: transliterate and slugify
  return transliterate(lowerTitle)
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Ensure slug is unique by appending a number if needed
 * @param {string} baseSlug - Base slug to make unique
 * @param {Function} checkExists - Async function that checks if slug exists
 * @param {number|null} excludeId - ID to exclude from uniqueness check (for updates)
 * @returns {Promise<string>} Unique slug
 */
async function ensureUniqueSlug(baseSlug, checkExists, excludeId = null) {
  let slug = baseSlug;
  let counter = 1;

  while (await checkExists(slug, excludeId)) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
}

module.exports = {
  transliterate,
  generateProductSlug,
  generateCatalogSlug,
  ensureUniqueSlug
};
