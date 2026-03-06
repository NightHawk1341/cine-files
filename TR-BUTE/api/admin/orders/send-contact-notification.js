/**
 * Send Contact Notification Endpoint
 * Admin sends notification to user asking them to contact support
 * POST /api/admin/orders/send-contact-notification
 *
 * Used when order status is 'on_hold' and admin needs user to reach out
 *
 * REQUIRES ADMIN AUTHENTICATION
 */

const { getPool } = require('../../../lib/db');
const { success, error, badRequest, unauthorized, notFound, methodNotAllowed } = require('../../../server/utils/response-helpers');
const { sendNotification } = require('../../../lib/notifications');
const config = require('../../../lib/config');
const pool = getPool();

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
    const { order_id, custom_message } = req.body;

    if (!order_id) {
      return badRequest(res, 'order_id is required');
    }

    // Get order with user info
    const orderResult = await pool.query(`
      SELECT
        o.id,
        o.status,
        o.user_id,
        u.telegram_id,
        u.vk_id,
        u.max_id,
        u.email,
        u.username,
        u.login_method,
        u.first_name
      FROM orders o
      JOIN users u ON o.user_id = u.id
      WHERE o.id = $1 AND o.is_deleted = false
    `, [order_id]);

    if (orderResult.rows.length === 0) {
      return notFound(res, 'Order not found');
    }

    const order = orderResult.rows[0];

    // Construct email for Yandex users
    let userEmail = order.email;
    if (!userEmail && order.login_method === 'yandex' && order.username) {
      userEmail = `${order.username}@yandex.ru`;
    }

    // Build notification message
    const greeting = order.first_name ? `${order.first_name}, ` : '';
    const defaultMessage = `${greeting}по вашему заказу #${order_id} требуется уточнение информации.

Пожалуйста, свяжитесь с нами любым удобным способом:
- Telegram: @seller_support
- Email: support@tribut.art

Мы готовы помочь решить любые вопросы!`;

    const message = custom_message || defaultMessage;

    // Send notification
    const sent = await sendNotification({
      userId: order.user_id,
      title: 'Требуется связь с поддержкой',
      message: message,
      link: `${config.appUrl}/order?id=${order_id}`,
      linkText: 'Открыть заказ',
      userTelegramId: order.telegram_id,
      userVkId: order.vk_id,
      userMaxId: order.max_id,
      userEmail: userEmail
    });

    if (!sent) {
      return error(res, 'Failed to send notification', 500);
    }

    // Record in order history
    try {
      await pool.query(`
        INSERT INTO order_edit_history (order_id, edited_by, editor_user_id, edit_type, edit_details, created_at)
        VALUES ($1, 'admin', $2, 'notification_sent', $3, NOW())
      `, [
        order_id,
        req.adminUser?.id,
        JSON.stringify({
          type: 'contact_request',
          custom_message: !!custom_message
        })
      ]);
    } catch (historyErr) {
      console.warn('Failed to record notification in history:', historyErr.message);
    }

    return success(res, {
      message: 'Notification sent successfully',
      order_id: order_id,
      sent_to: {
        telegram: !!order.telegram_id,
        email: !!userEmail
      }
    });

  } catch (err) {
    console.error('Error sending contact notification:', err);
    return error(res, 'Failed to send notification', 500);
  }
};
