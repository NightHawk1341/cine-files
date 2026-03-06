/**
 * Verify Purchase Helper
 * Checks if a user has purchased a specific product
 * This is used to set the verified_purchase flag on reviews
 */

const { getPool } = require('../../lib/db');
const pool = getPool();

/**
 * Check if user has purchased a product
 * Returns true if user has an order with status 'paid', 'shipped', or 'completed'
 * that contains the specified product
 */
async function checkUserHasPurchased(userId, productId) {
  try {
    const result = await pool.query(`
      SELECT EXISTS(
        SELECT 1
        FROM orders o
        JOIN order_items oi ON o.id = oi.order_id
        WHERE o.user_id = $1
          AND oi.product_id = $2
          AND o.status IN ('paid', 'shipped', 'completed')
      ) AS has_purchased
    `, [userId, productId]);

    return result.rows[0].has_purchased;
  } catch (error) {
    console.error('Error checking purchase verification:', error);
    return false;
  }
}

/**
 * API Endpoint to verify purchase
 * GET /api/reviews/verify-purchase?user_id=123&product_id=456
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { user_id, product_id } = req.query;

    // Validate input - product_id is required, but user_id being missing just means not purchased
    if (!product_id) {
      return res.status(400).json({
        error: 'product_id is required'
      });
    }

    // If no user_id, user is not logged in, so they haven't purchased
    if (!user_id) {
      return res.status(200).json({
        success: true,
        user_id: null,
        product_id: parseInt(product_id),
        verified_purchase: false
      });
    }

    const hasPurchased = await checkUserHasPurchased(user_id, product_id);

    return res.status(200).json({
      success: true,
      user_id: parseInt(user_id),
      product_id: parseInt(product_id),
      verified_purchase: hasPurchased
    });

  } catch (error) {
    console.error('Error verifying purchase:', error);
    return res.status(500).json({
      error: 'Failed to verify purchase',
      message: error.message
    });
  }
};

// Export helper function for use in other modules
module.exports.checkUserHasPurchased = checkUserHasPurchased;
