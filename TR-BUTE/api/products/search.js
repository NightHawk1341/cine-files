/**
 * Product Search API
 * Searches products by keyword in title or key_word field
 * GET /api/products/search?query=космос
 */

const { getPool } = require('../../lib/db');
const { success, error, badRequest, methodNotAllowed } = require('../../server/utils/response-helpers');

const pool = getPool();

/**
 * Main handler
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET']);
  }

  try {
    const { query } = req.query;

    // Validate input
    if (!query || query.trim().length === 0) {
      return badRequest(res, 'query parameter is required');
    }

    const searchTerm = query.trim();

    // Search products by title, alt, or key_word.
    // Primary: case-insensitive substring match (ILIKE).
    // Fallback: trigram word-similarity for typo tolerance (requires pg_trgm extension).
    // Exact substring matches are ranked first; fuzzy matches follow by similarity score.
    const result = await pool.query(`
      SELECT
        id,
        title,
        alt,
        key_word,
        price,
        images,
        category,
        variations
      FROM products
      WHERE
        title ILIKE $1 OR
        alt ILIKE $1 OR
        key_word ILIKE $1 OR
        word_similarity($2, title) > 0.3 OR
        word_similarity($2, COALESCE(alt, '')) > 0.3 OR
        word_similarity($2, COALESCE(key_word, '')) > 0.3
      ORDER BY
        CASE
          WHEN title ILIKE $1 OR alt ILIKE $1 OR key_word ILIKE $1 THEN 0
          ELSE 1
        END,
        CASE
          WHEN title ILIKE $3 THEN 1
          WHEN alt ILIKE $3 THEN 2
          WHEN key_word ILIKE $3 THEN 3
          ELSE 4
        END,
        GREATEST(
          word_similarity($2, title),
          word_similarity($2, COALESCE(alt, '')),
          word_similarity($2, COALESCE(key_word, ''))
        ) DESC,
        title ASC
      LIMIT 5
    `, [`%${searchTerm}%`, searchTerm, `${searchTerm}%`]);

    // Format results
    const products = result.rows.map(product => {
      // Get first image URL
      let imageUrl = null;
      if (product.images && product.images.length > 0) {
        imageUrl = product.images[0];
      }

      // Get first price (from variations or base price)
      let displayPrice = product.price;
      if (product.variations && product.variations.length > 0) {
        // Try to get price from first variation
        const firstVariation = product.variations[0];
        if (firstVariation && typeof firstVariation === 'object') {
          displayPrice = firstVariation.price || product.price;
        }
      }

      return {
        id: product.id,
        title: product.title,
        price: displayPrice,
        image_url: imageUrl,
        category: product.category
      };
    });

    return success(res, {
      query: searchTerm,
      count: products.length,
      products: products
    });

  } catch (err) {
    console.error('Error searching products:', err);
    return error(res, 'Failed to search products', 500);
  }
};
