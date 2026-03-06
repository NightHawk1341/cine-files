/**
 * Update Order Batch Status Endpoint
 * Update the internal batch status for orders (ready/not_ready)
 * POST /api/admin/orders/batch-status
 *
 * This is for internal admin tracking of which orders are ready
 * for the next shipment batch. Does NOT change the main order status.
 *
 * REQUIRES ADMIN AUTHENTICATION
 */

const { getPool } = require('../../../lib/db');
const { success, error, badRequest, unauthorized, methodNotAllowed } = require('../../../server/utils/response-helpers');
const { BATCH_STATUSES } = require('../../../server/utils/order-constants');
const pool = getPool();

/**
 * Record order edit in history
 */
async function recordEditHistory(pool, orderId, userId, editType, details) {
  try {
    await pool.query(`
      INSERT INTO order_edit_history (order_id, edited_by, editor_user_id, edit_type, edit_details, created_at)
      VALUES ($1, 'admin', $2, $3, $4, NOW())
    `, [orderId, userId, editType, JSON.stringify(details)]);
  } catch (err) {
    console.error('Failed to record edit history:', err.message);
  }
}

/**
 * Main handler
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  // Verify admin authentication
  if (!req.adminUser) {
    return unauthorized(res, 'Admin authentication required');
  }

  try {
    const { order_id, order_ids, batch_status } = req.body;

    // Support both single order and bulk update
    const orderIds = order_ids || (order_id ? [order_id] : []);

    if (orderIds.length === 0) {
      return badRequest(res, 'order_id or order_ids is required');
    }

    // Validate batch_status
    if (batch_status !== null && !BATCH_STATUSES.includes(batch_status)) {
      return badRequest(res, 'Invalid batch_status', {
        valid_values: [...BATCH_STATUSES, null],
        message: 'Use "ready", "not_ready", or null to clear'
      });
    }

    // Update orders
    const result = await pool.query(`
      UPDATE orders
      SET batch_status = $1,
          updated_at = NOW()
      WHERE id = ANY($2::bigint[])
        AND is_deleted = false
      RETURNING id, status, batch_status
    `, [batch_status, orderIds]);

    // Record edit history for each updated order
    for (const order of result.rows) {
      await recordEditHistory(pool, order.id, req.adminUser?.id, 'batch_status_changed', {
        batch_status: batch_status
      });
    }

    return success(res, {
      message: `Batch status updated for ${result.rows.length} order(s)`,
      updated_orders: result.rows,
      batch_status: batch_status
    });

  } catch (err) {
    console.error('Error updating batch status:', err);
    return error(res, 'Failed to update batch status', 500);
  }
};
