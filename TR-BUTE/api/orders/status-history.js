/**
 * Get Order Status History Endpoint
 * Returns the status change timeline for a specific order
 * GET /api/orders/status-history?order_id=123
 *
 * REQUIRES AUTHENTICATION (via middleware)
 * Users can only access their own orders
 */

const { getPool } = require('../../lib/db');
const { success, error, badRequest, forbidden, unauthorized, methodNotAllowed } = require('../../server/utils/response-helpers');

const pool = getPool();

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET']);
  }

  try {
    const userId = req.userId;
    const { order_id } = req.query;

    if (!userId) {
      return unauthorized(res, 'Authentication required');
    }

    if (!order_id) {
      return badRequest(res, 'order_id query parameter is required');
    }

    // Verify user owns the order
    const orderResult = await pool.query(
      'SELECT user_id FROM orders WHERE id = $1',
      [order_id]
    );

    if (orderResult.rows.length === 0) {
      return error(res, 'Order not found', 404);
    }

    if (String(orderResult.rows[0].user_id) !== String(userId)) {
      return forbidden(res, 'You can only access your own orders');
    }

    // Check if the table exists (graceful fallback before migration)
    let history = [];
    try {
      const historyResult = await pool.query(
        `SELECT old_status, new_status, changed_at
         FROM order_status_history
         WHERE order_id = $1
         ORDER BY changed_at ASC, id ASC`,
        [order_id]
      );
      history = historyResult.rows;
    } catch (tableErr) {
      if (tableErr.code === '42P01') {
        // Table doesn't exist yet — return empty history
        history = [];
      } else {
        throw tableErr;
      }
    }

    return success(res, { history });

  } catch (err) {
    console.error('Error fetching order status history:', err);
    return error(res, 'Failed to fetch status history', 500);
  }
};
