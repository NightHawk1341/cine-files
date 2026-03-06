/**
 * Get User's Subscribed Products
 * GET /api/products/subscribed?user_id=X
 */

const { getPool } = require('../../lib/db');
const { success, error, badRequest, methodNotAllowed } = require('../../server/utils/response-helpers');

const pool = getPool();

/**
 * Helper function to execute query with retry logic
 */
async function queryWithRetry(queryFn, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await queryFn();
    } catch (err) {
      if (attempt < maxRetries && (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.message.includes('timeout'))) {
        console.log(`Query failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); // Exponential backoff
        continue;
      }
      throw err;
    }
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET']);
  }

  try {
    const { user_id, product_id } = req.query;

    // If checking subscription for a specific product
    if (product_id) {
      // Get user ID from authentication
      const userId = req.userId;
      if (!userId) {
        return badRequest(res, 'User not authenticated');
      }

      const result = await queryWithRetry(() => pool.query(`
        SELECT EXISTS(
          SELECT 1 FROM product_release_notifications
          WHERE user_id = $1 AND product_id = $2
        ) as subscribed
      `, [userId, product_id]));

      return success(res, {
        subscribed: result.rows[0]?.subscribed || false
      });
    }

    // Get all subscribed products for user
    if (!user_id) {
      return badRequest(res, 'user_id is required');
    }

    const result = await queryWithRetry(() => pool.query(`
      SELECT
        p.id,
        p.title,
        p.slug,
        (
          SELECT url FROM product_images
          WHERE product_images.product_id = p.id
          ORDER BY COALESCE(sort_order, 999), id LIMIT 1
        ) as image_url,
        p.status,
        prn.created_at as subscribed_at
      FROM product_release_notifications prn
      JOIN products p ON prn.product_id = p.id
      WHERE prn.user_id = $1 AND p.status = 'coming_soon'
      ORDER BY prn.created_at DESC
    `, [user_id]));

    return success(res, {
      products: result.rows,
      count: result.rows.length
    });

  } catch (err) {
    console.error('Error fetching subscribed products:', err);
    return error(res, 'Failed to fetch subscribed products', 500);
  }
};
