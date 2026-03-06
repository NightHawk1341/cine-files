/**
 * Subscribe/Unsubscribe to Product Release Notifications
 * POST /api/products/subscribe-release
 */

const { getPool } = require('../../lib/db');
const { success, error, badRequest, notFound, methodNotAllowed } = require('../../server/utils/response-helpers');
const pool = getPool();

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  try {
    // Get user ID from authentication middleware
    const userId = req.userId;
    if (!userId) {
      return badRequest(res, 'Authentication required');
    }

    const { product_id, action } = req.body;

    // Validate input
    if (!product_id) {
      return badRequest(res, 'product_id is required');
    }

    if (!action || !['subscribe', 'unsubscribe'].includes(action)) {
      return badRequest(res, 'action must be either "subscribe" or "unsubscribe"');
    }

    // Verify product exists and is coming_soon
    const productCheck = await pool.query(
      'SELECT id, status FROM products WHERE id = $1',
      [product_id]
    );

    if (productCheck.rows.length === 0) {
      return notFound(res, 'Product not found');
    }

    const product = productCheck.rows[0];
    if (product.status !== 'coming_soon') {
      return badRequest(res, 'Subscriptions are only available for coming soon products');
    }

    if (action === 'subscribe') {
      // Subscribe user to product release
      await pool.query(`
        INSERT INTO product_release_notifications (user_id, product_id)
        VALUES ($1, $2)
        ON CONFLICT (user_id, product_id) DO NOTHING
      `, [userId, product_id]);

      return success(res, {
        success: true,
        message: 'Successfully subscribed to product release',
        subscribed: true
      });
    } else {
      // Unsubscribe user from product release
      await pool.query(`
        DELETE FROM product_release_notifications
        WHERE user_id = $1 AND product_id = $2
      `, [userId, product_id]);

      return success(res, {
        success: true,
        message: 'Successfully unsubscribed from product release',
        subscribed: false
      });
    }

  } catch (err) {
    console.error('Error managing release subscription:', err);
    return error(res, 'Failed to manage subscription', 500);
  }
};
