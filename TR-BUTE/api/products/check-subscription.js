/**
 * Check Product Release Subscription Status
 * GET /api/products/check-subscription?user_id=X&product_id=Y
 */

const { getPool } = require('../../lib/db');
const { success, error, badRequest, methodNotAllowed } = require('../../server/utils/response-helpers');

const pool = getPool();

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET']);
  }

  try {
    const { user_id, product_id } = req.query;

    // Validate input
    if (!user_id || !product_id) {
      return badRequest(res, 'user_id and product_id are required');
    }

    // Check if subscription exists
    const result = await pool.query(`
      SELECT id, created_at
      FROM product_release_notifications
      WHERE user_id = $1 AND product_id = $2
    `, [user_id, product_id]);

    const isSubscribed = result.rows.length > 0;

    return success(res, {
      subscribed: isSubscribed,
      subscription_date: isSubscribed ? result.rows[0].created_at : null
    });

  } catch (err) {
    console.error('Error checking subscription status:', err);
    return error(res, 'Failed to check subscription status', 500);
  }
};
