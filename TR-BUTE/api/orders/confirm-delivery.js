/**
 * Confirm Delivery Endpoint
 * Allows users to confirm they have received their order
 * POST /api/orders/confirm-delivery
 */

const { getPool } = require('../../lib/db');
const { success, error, badRequest, unauthorized, methodNotAllowed } = require('../../server/utils/response-helpers');
const { sendNotification } = require('../../lib/notifications');
const pool = getPool();
const config = require('../../lib/config');

/**
 * Main handler
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  try {
    // User authentication handled by authenticateToken middleware
    const user = req.user;
    if (!user || !user.id) {
      return unauthorized(res, 'Authentication required');
    }

    const { order_id } = req.body;

    // Validate input
    if (!order_id) {
      return badRequest(res, 'order_id is required');
    }

    // Fetch order and verify ownership
    const orderResult = await pool.query(
      `SELECT id, user_id, status, tracking_number
       FROM orders
       WHERE id = $1`,
      [order_id]
    );

    if (orderResult.rows.length === 0) {
      return badRequest(res, 'Order not found');
    }

    const order = orderResult.rows[0];

    // Verify user owns this order
    if (order.user_id !== user.id) {
      return unauthorized(res, 'You do not have permission to update this order');
    }

    // Check if order is in a valid status for delivery confirmation
    const validStatuses = ['shipped', 'parcel_ready'];
    if (!validStatuses.includes(order.status)) {
      return badRequest(res, 'Order cannot be confirmed as delivered in current status', {
        current_status: order.status,
        valid_statuses: validStatuses
      });
    }

    // Update order status to delivered
    const updateResult = await pool.query(
      `UPDATE orders
       SET status = 'delivered',
           user_confirmed_delivery = true,
           delivered_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, status, delivered_at, user_confirmed_delivery`,
      [order_id]
    );

    const updatedOrder = updateResult.rows[0];

    // Log the confirmation
    console.log(`[confirm-delivery] User ${user.id} confirmed delivery for order #${order_id}`);

    // Send notification to admin about user confirmation
    try {
      const adminNotifyResponse = await fetch(`${config.appUrl}/api/admin/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `📦 Пользователь подтвердил получение заказа #${order_id}`,
          type: 'order_delivered'
        })
      });
      if (!adminNotifyResponse.ok) {
        console.log('[confirm-delivery] Admin notification failed (non-critical)');
      }
    } catch (notifyErr) {
      console.log('[confirm-delivery] Admin notification error (non-critical):', notifyErr.message);
    }

    // Return success
    return success(res, {
      message: 'Delivery confirmed successfully',
      order: {
        id: updatedOrder.id,
        status: updatedOrder.status,
        delivered_at: updatedOrder.delivered_at,
        user_confirmed_delivery: updatedOrder.user_confirmed_delivery
      }
    });

  } catch (err) {
    console.error('Error confirming delivery:', err);
    return error(res, 'Failed to confirm delivery', 500);
  }
};
