/**
 * Order Return Action Endpoint
 * User chooses what to do when their parcel is returned to sender
 * POST /api/orders/return-action
 *
 * REQUIRES AUTHENTICATION
 *
 * Body:
 * {
 *   order_id: number,
 *   action: 'retry' | 'cancel'
 * }
 *
 * retry: User wants re-delivery (will pay 2x delivery cost)
 * cancel: User wants to cancel and get refund for products only (no delivery cost)
 */

const { getPool } = require('../../lib/db');
const { success, error, badRequest, unauthorized, notFound, methodNotAllowed } = require('../../server/utils/response-helpers');
const { requireUserOrder } = require('../../server/utils/order-queries');
const pool = getPool();

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  if (!req.userId) {
    return unauthorized(res, 'Authentication required');
  }

  const { order_id, action } = req.body;

  if (!order_id) {
    return badRequest(res, 'order_id is required');
  }

  if (!action || !['retry', 'cancel'].includes(action)) {
    return badRequest(res, 'action must be "retry" or "cancel"');
  }

  try {
    const order = await requireUserOrder(pool, order_id, req.userId, res);
    if (!order) return;

    // Must be a returned order
    if (!order.returned_to_sender_at) {
      return badRequest(res, 'This order has not been returned to sender');
    }

    // Don't allow changing action after it's been set
    if (order.return_action) {
      return badRequest(res, `Return action already set to: ${order.return_action}`);
    }

    await pool.query(`
      UPDATE orders
      SET return_action = $1,
          return_action_requested_at = NOW(),
          updated_at = NOW()
      WHERE id = $2
    `, [action, order_id]);

    const message = action === 'retry'
      ? 'Запрос на повторную доставку отправлен. Администратор свяжется с вами для подтверждения и выставления счёта.'
      : 'Запрос на отмену заказа отправлен. Администратор подтвердит возврат стоимости товаров.';

    return success(res, { action, message });
  } catch (err) {
    console.error('Error setting return action:', err);
    return error(res, 'Failed to set return action', 500);
  }
};
