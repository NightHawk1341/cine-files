/**
 * Get Order Counts by Status
 * GET /api/orders/get-order-counts?user_id=X
 *
 * Returns count of orders grouped by status categories
 */

const { getPool } = require('../../lib/db');
const pool = getPool();
const { success, error, badRequest, methodNotAllowed } = require('../../server/utils/response-helpers');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET']);
  }

  try {
    const { user_id } = req.query;

    if (!user_id) {
      return badRequest(res, 'user_id is required');
    }

    // Get order counts grouped by status category
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('pending_review', 'awaiting_payment')) as pending_count,
        COUNT(*) FILTER (WHERE status IN ('paid', 'shipped')) as active_count,
        COUNT(*) FILTER (WHERE status IN ('completed', 'cancelled', 'returned')) as completed_count,
        COUNT(*) as total_count
      FROM orders
      WHERE user_id = $1
    `, [user_id]);

    const counts = result.rows[0];

    return success(res, {
      pending: parseInt(counts.pending_count) || 0,
      active: parseInt(counts.active_count) || 0,
      completed: parseInt(counts.completed_count) || 0,
      total: parseInt(counts.total_count) || 0
    });

  } catch (err) {
    console.error('Error fetching order counts:', err);
    return error(res, 'Failed to fetch order counts', 500, { message: err.message });
  }
};
