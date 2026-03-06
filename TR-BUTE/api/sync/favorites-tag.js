/**
 * Update Favorite Tag Endpoint
 * PATCH /api/favorites/tag - Update tag for a specific favorite
 *
 * REQUIRES AUTHENTICATION
 */

const { getPool } = require('../../lib/db');
const { success, error, badRequest, notFound, unauthorized, methodNotAllowed } = require('../../server/utils/response-helpers');

const pool = getPool();

/**
 * Main handler
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'PATCH') {
    return methodNotAllowed(res, ['PATCH']);
  }

  if (!req.userId) {
    return unauthorized(res, 'Authentication required');
  }

  try {
    const { productId, tag } = req.body;

    if (!productId) {
      return badRequest(res, 'Product ID is required');
    }

    // Validate tag value (must be null, "present", or "wish")
    if (tag !== null && tag !== 'present' && tag !== 'wish') {
      return badRequest(res, 'Invalid tag value. Must be null, "present", or "wish"');
    }

    // Check if favorite exists for this user
    const checkResult = await pool.query(
      'SELECT id FROM user_favorites WHERE user_id = $1 AND product_id = $2',
      [req.userId, productId]
    );

    if (checkResult.rows.length === 0) {
      return notFound(res, 'Favorite not found');
    }

    // Update the tag
    await pool.query(
      'UPDATE user_favorites SET tag = $1 WHERE user_id = $2 AND product_id = $3',
      [tag, req.userId, productId]
    );

    return success(res, { productId, tag });
  } catch (err) {
    console.error('Error updating favorite tag:', err);
    return error(res, 'Failed to update favorite tag', 500);
  }
};
