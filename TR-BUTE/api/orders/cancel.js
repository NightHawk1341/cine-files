/**
 * Cancel Order Endpoint
 * Allows users to cancel their orders with optional reason
 * POST /api/orders/cancel
 *
 * REQUIRES AUTHENTICATION (via middleware)
 */

const { getPool } = require('../../lib/db');
const { success, error, badRequest, methodNotAllowed } = require('../../server/utils/response-helpers');
const { requireUserOrder } = require('../../server/utils/order-queries');

const pool = getPool();

/**
 * Main handler
 * Authentication handled by middleware - req.userId is available
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  try {
    const userId = req.userId;
    const { order_id, cancellation_reason } = req.body;

    // Validate input
    if (!order_id) {
      return badRequest(res, 'order_id is required');
    }

    // Fetch order and verify ownership
    const order = await requireUserOrder(pool, order_id, userId, res);
    if (!order) return; // Response already sent

    // Only allow cancellation for pre-payment statuses
    const cancellableStatuses = ['awaiting_calculation', 'created', 'new', 'evaluation', 'reviewed', 'suggested', 'awaiting_payment', 'accepted'];
    if (!cancellableStatuses.includes(order.status)) {
      return badRequest(res, 'Order cannot be cancelled in current status', {
        current_status: order.status
      });
    }

    // Update order status and optionally store cancellation reason
    const updateQuery = `
      UPDATE orders
      SET status = 'cancelled',
          cancellation_reason = $1,
          updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;

    const updateResult = await pool.query(updateQuery, [
      cancellation_reason || null,
      order_id
    ]);

    const updatedOrder = updateResult.rows[0];

    // Return success
    return success(res, {
      order: {
        id: updatedOrder.id,
        status: updatedOrder.status,
        cancellation_reason: updatedOrder.cancellation_reason,
        updated_at: updatedOrder.updated_at
      }
    });

  } catch (err) {
    console.error('Error cancelling order:', err);
    return error(res, 'Failed to cancel order', 500);
  }
};
