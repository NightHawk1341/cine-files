/**
 * Favorites Sync Endpoints
 * GET /api/sync/favorites - Get user favorites with tags
 * POST /api/sync/favorites - Sync favorites list
 *
 * REQUIRES AUTHENTICATION
 */

const { getPool } = require('../../lib/db');
const { success, error, badRequest, unauthorized, methodNotAllowed } = require('../../server/utils/response-helpers');

const pool = getPool();

/**
 * Main handler - routes to GET or POST based on method
 */
module.exports = async function handler(req, res) {
  if (!req.userId) {
    return unauthorized(res, 'Authentication required');
  }

  switch (req.method) {
    case 'GET':
      return handleGet(req, res);
    case 'POST':
      return handlePost(req, res);
    default:
      return methodNotAllowed(res, ['GET', 'POST']);
  }
};

/**
 * GET - Fetch user favorites with tags
 */
async function handleGet(req, res) {
  try {
    const result = await pool.query(
      'SELECT product_id, tag FROM user_favorites WHERE user_id = $1 ORDER BY created_at DESC',
      [req.userId]
    );

    // Return both simple array (for backwards compatibility) and detailed objects
    return success(res, {
      favorites: result.rows.map(r => r.product_id),
      favoritesWithTags: result.rows.map(r => ({ productId: r.product_id, tag: r.tag }))
    });
  } catch (err) {
    console.error('Error fetching favorites:', err);
    return error(res, 'Failed to fetch favorites', 500);
  }
}

/**
 * POST - Sync favorites list (replace all)
 */
async function handlePost(req, res) {
  try {
    const { favorites } = req.body;

    if (!Array.isArray(favorites)) {
      return badRequest(res, 'Favorites must be an array');
    }

    // Clear existing favorites
    await pool.query('DELETE FROM user_favorites WHERE user_id = $1', [req.userId]);

    // Insert new favorites
    if (favorites.length > 0) {
      const placeholders = favorites.map((_, i) => `($1, $${i + 2})`).join(',');
      await pool.query(
        `INSERT INTO user_favorites (user_id, product_id) VALUES ${placeholders}`,
        [req.userId, ...favorites]
      );
    }

    return success(res, { saved: true });
  } catch (err) {
    console.error('Error syncing favorites:', err);
    return error(res, 'Failed to sync favorites', 500);
  }
}
