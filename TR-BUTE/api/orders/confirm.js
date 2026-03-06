/**
 * Confirm Order Endpoint
 * User confirms their order, transitioning it from 'created' to 'awaiting_payment'
 * POST /api/orders/confirm
 *
 * REQUIRES AUTHENTICATION
 * Only the order owner can confirm their order
 */

const { getPool } = require('../../lib/db');
const { success, error, badRequest, unauthorized, forbidden, methodNotAllowed } = require('../../server/utils/response-helpers');
const { requireUserOrder } = require('../../server/utils/order-queries');
const { sendNotification, sendAdminNotification } = require('../../lib/notifications');
const { getMigratedStatus } = require('../../server/utils/order-constants');
// Note: USER_EDITABLE_STATUSES was removed (always empty). This endpoint is
// not registered in routes/index.js and is effectively dead code.
const pool = getPool();
const config = require('../../lib/config');

/**
 * Record order edit in history
 */
async function recordEditHistory(client, orderId, userId, editType, details) {
  try {
    await client.query(`
      INSERT INTO order_edit_history (order_id, edited_by, editor_user_id, edit_type, edit_details, created_at)
      VALUES ($1, 'user', $2, $3, $4, NOW())
    `, [orderId, userId, editType, JSON.stringify(details)]);
  } catch (err) {
    console.error('Failed to record edit history:', err.message);
    // Don't fail the main operation
  }
}

/**
 * Main handler
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  const client = await pool.connect();

  try {
    // Verify authentication
    if (!req.userId) {
      return unauthorized(res, 'Authentication required');
    }

    const { order_id } = req.body;

    if (!order_id) {
      return badRequest(res, 'order_id is required');
    }

    // Get the order and verify ownership
    const order = await requireUserOrder(pool, order_id, req.userId, res);
    if (!order) return; // Response already sent

    // Order editing/confirmation by users has been removed — always reject.
    // This endpoint is not registered and never reached at runtime.
    return badRequest(res, 'Order cannot be confirmed in current status', {
      current_status: order.status
    });

    // Start transaction
    await client.query('BEGIN');

    // Update order status to 'awaiting_payment'
    const updateResult = await client.query(`
      UPDATE orders
      SET status = 'awaiting_payment',
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [order_id]);

    const updatedOrder = updateResult.rows[0];

    // Record the status change in history
    await recordEditHistory(client, order_id, req.userId, 'status_changed', {
      from: order.status,
      to: 'awaiting_payment',
      action: 'user_confirmed'
    });

    await client.query('COMMIT');

    // Send notification to user about payment
    try {
      const userResult = await pool.query(
        'SELECT telegram_id, vk_id, max_id, email, username, login_method FROM users WHERE id = $1',
        [req.userId]
      );

      if (userResult.rows.length > 0) {
        const user = userResult.rows[0];
        let userEmail = user.email;
        if (!userEmail && user.login_method === 'yandex' && user.username) {
          userEmail = `${user.username}@yandex.ru`;
        }

        const totalWithDelivery = Number(updatedOrder.total_price) + Number(updatedOrder.delivery_cost || 0) + Number(updatedOrder.packaging_cost || 0);

        await sendNotification({
          userId: req.userId,
          title: 'Заказ подтверждён - ожидает оплаты',
          message: `Заказ #${order_id} подтверждён и ожидает оплаты.

Итого к оплате: ${totalWithDelivery} руб.

Пожалуйста, оплатите заказ в ближайшее время. Ссылка на оплату доступна на странице заказа.`,
          link: `${config.appUrl}/order?id=${order_id}`,
          linkText: 'Перейти к оплате',
          userTelegramId: user.telegram_id,
          userVkId: user.vk_id,
          userMaxId: user.max_id,
          userEmail: userEmail
        });
      }
    } catch (notifError) {
      console.error('Failed to send confirmation notification:', notifError.message);
    }

    // Notify admin about confirmed order
    try {
      const totalWithDelivery = Number(updatedOrder.total_price) + Number(updatedOrder.delivery_cost || 0) + Number(updatedOrder.packaging_cost || 0);

      await sendAdminNotification({
        title: 'Заказ подтверждён',
        message: `Заказ #${order_id} подтверждён пользователем. Ожидает оплаты: ${totalWithDelivery} руб.`,
        link: `${config.appUrl}/admin-miniapp/index.html`,
        linkText: 'Открыть админку'
      });
    } catch (notifError) {
      console.error('Failed to send admin notification:', notifError.message);
    }

    // Return success
    return success(res, {
      message: 'Order confirmed successfully',
      order: {
        id: updatedOrder.id,
        status: updatedOrder.status,
        total_price: updatedOrder.total_price,
        delivery_cost: updatedOrder.delivery_cost,
        packaging_cost: updatedOrder.packaging_cost,
        updated_at: updatedOrder.updated_at
      }
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error confirming order:', err);
    return error(res, 'Failed to confirm order', 500);
  } finally {
    client.release();
  }
};
