/**
 * Request Refund Endpoint
 * Allows users to request a refund for their paid orders
 * POST /api/orders/request-refund
 *
 * REQUIRES AUTHENTICATION
 * Users can only request refunds for their own orders
 */

const { getPool } = require('../../lib/db');
const { success, error, unauthorized, notFound } = require('../../server/utils/response-helpers');
const { sendAdminNotification } = require('../../lib/notifications');
const config = require('../../lib/config');

const pool = getPool();

/**
 * Main handler
 * Requires authentication - user can only request refund for their own orders
 * Authentication handled by middleware - req.userId is available
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Security: Use authenticated user's ID from token
    if (!req.userId) {
      return unauthorized(res, 'Authentication required');
    }

    const userId = req.userId;
    const { order_id, refund_reason } = req.body;

    // Validate input
    if (!order_id) {
      return res.status(400).json({ error: 'order_id is required' });
    }

    if (!refund_reason || refund_reason.trim() === '') {
      return res.status(400).json({ error: 'refund_reason is required' });
    }

    // Fetch order and verify ownership
    const orderResult = await pool.query(
      'SELECT id, user_id, status, total_price, delivery_cost FROM orders WHERE id = $1',
      [order_id]
    );

    if (orderResult.rows.length === 0) {
      return notFound(res, 'Order');
    }

    const order = orderResult.rows[0];

    // Verify user owns this order
    if (order.user_id !== userId) {
      return res.status(403).json({ error: 'You do not have permission to request refund for this order' });
    }

    // Verify order is in a refundable state
    const refundableStatuses = ['paid', 'in_work', 'shipped'];
    if (!refundableStatuses.includes(order.status)) {
      return res.status(400).json({
        error: 'Order cannot be refunded in current status',
        details: `Orders can only be refunded when they are paid, in work, or shipped. Current status: ${order.status}`
      });
    }

    // Update order status to 'refund_requested' and store refund reason
    await pool.query(
      `UPDATE orders
       SET status = 'refund_requested',
           refund_reason = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [refund_reason, order_id]
    );

    // Send notification to admin using unified notification system
    try {
      const totalWithDelivery = (Number(order.total_price) || 0) + (Number(order.delivery_cost) || 0);

      console.log(`[request-refund] Sending admin notification for refund request on order #${order_id}`);

      // Send simple text notification without emojis or buttons
      await sendAdminNotification({
        title: 'Запрос на возврат',
        message: `Пользователь запросил возврат средств для заказа #${order_id}\n\nСумма: ${totalWithDelivery}₽\nПричина: ${refund_reason}`,
        link: `${config.appUrl}/admin-miniapp`,
        linkText: 'Обработать возврат'
      });

      console.log(`[request-refund] Admin notification sent for refund request on order #${order_id}`);
    } catch (notificationError) {
      console.error('[request-refund] Failed to send admin notification:', notificationError.message);
    }

    return success(res, {
      message: 'Refund request submitted successfully',
      order_id: order_id
    });

  } catch (err) {
    console.error('Error processing refund request:', {
      error: err.message,
      stack: err.stack,
      user_id: req.userId
    });
    return error(res, `Failed to process refund request: ${err.message}`, 500);
  }
};
