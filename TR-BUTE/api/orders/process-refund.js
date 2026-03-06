/**
 * Process Refund via T-Bank
 * Processes an actual refund through T-Bank payment gateway
 * POST /api/orders/process-refund
 *
 * REQUIRES ADMIN AUTHENTICATION
 * Only admins can process refunds
 */

const { getPool } = require('../../lib/db');
const { success, error, unauthorized, notFound } = require('../../server/utils/response-helpers');
const { sendNotification } = require('../../lib/notifications');
const config = require('../../lib/config');
const tbank = require('../../server/services/payment/tbank');

const pool = getPool();

/**
 * Main handler
 * Requires admin authentication
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Security: Require admin authentication (supports both browser cookie and Telegram initData)
    let isAuthenticated = false;

    // Method 1: Check for admin JWT token from cookie (browser mode)
    const adminToken = req.headers.cookie
      ?.split('; ')
      .find(row => row.startsWith('admin_token='))
      ?.split('=')[1];

    if (adminToken) {
      const auth = require('../../auth');
      try {
        const adminUser = auth.verifyToken(adminToken);
        if (adminUser && adminUser.isAdmin) {
          isAuthenticated = true;
        }
      } catch (error) {
        console.log('[process-refund] Invalid admin token:', error.message);
      }
    }

    // Method 2: Check for Telegram authentication (miniapp mode)
    if (!isAuthenticated && req.headers['x-telegram-init-data']) {
      const initData = req.headers['x-telegram-init-data'];
      const crypto = require('crypto');

      try {
        // Parse initData
        const urlParams = new URLSearchParams(initData);
        const hash = urlParams.get('hash');
        const userDataStr = urlParams.get('user');

        if (hash && userDataStr) {
          urlParams.delete('hash');

          // Create data-check-string
          const dataCheckArr = [];
          for (const [key, value] of urlParams.entries()) {
            dataCheckArr.push(`${key}=${value}`);
          }
          dataCheckArr.sort();
          const dataCheckString = dataCheckArr.join('\n');

          // Create secret key and calculate hash
          const secretKey = crypto
            .createHmac('sha256', 'WebAppData')
            .update(config.telegram.adminBotToken)
            .digest();

          const calculatedHash = crypto
            .createHmac('sha256', secretKey)
            .update(dataCheckString)
            .digest('hex');

          if (calculatedHash === hash) {
            const userData = JSON.parse(userDataStr);
            // Check if user is admin
            const adminCheck = await pool.query(
              'SELECT id FROM admins WHERE telegram_id = $1',
              [userData.id]
            );

            if (adminCheck.rows.length > 0) {
              isAuthenticated = true;
            }
          }
        }
      } catch (error) {
        console.log('[process-refund] Telegram auth error:', error.message);
      }
    }

    if (!isAuthenticated) {
      return res.status(401).json({ error: 'Admin authentication required' });
    }

    const { order_id, refund_amount, refund_reason } = req.body;

    // Validate input
    if (!order_id) {
      return res.status(400).json({ error: 'order_id is required' });
    }

    // Validate T-Bank credentials
    if (!config.tbank.enabled) {
      console.error('T-Bank credentials not configured');
      return res.status(500).json({ error: 'Payment system not configured' });
    }

    // Fetch order details
    const orderResult = await pool.query(
      `SELECT o.id, o.user_id, o.payment_id, o.payment_provider, o.status, o.total_price, o.delivery_cost,
              u.telegram_id, u.vk_id, u.max_id, u.email, u.username, u.login_method
       FROM orders o
       LEFT JOIN users u ON o.user_id = u.id
       WHERE o.id = $1`,
      [order_id]
    );

    if (orderResult.rows.length === 0) {
      return notFound(res, 'Order');
    }

    const order = orderResult.rows[0];

    // Check if order has a payment_id
    if (!order.payment_id) {
      return res.status(400).json({
        error: 'Order does not have a payment ID',
        details: 'Cannot refund an order that was not paid online'
      });
    }

    // Check if order is in a refundable state
    const refundableStatuses = ['paid', 'in_work', 'shipped'];
    if (!refundableStatuses.includes(order.status)) {
      return res.status(400).json({
        error: 'Order cannot be refunded in current status',
        details: `Current status: ${order.status}`
      });
    }

    // Calculate refund amount
    const totalPrice = Number(order.total_price);
    const deliveryCost = Number(order.delivery_cost) || 0;
    const maxRefundAmount = totalPrice + deliveryCost;

    // If no refund_amount specified, refund the full amount
    const amountToRefund = refund_amount ? Number(refund_amount) : maxRefundAmount;

    // Validate refund amount
    if (amountToRefund <= 0 || amountToRefund > maxRefundAmount) {
      return res.status(400).json({
        error: 'Invalid refund amount',
        details: `Refund amount must be between 0 and ${maxRefundAmount} RUB`,
        max_refund_amount: maxRefundAmount
      });
    }

    console.log(`[process-refund] Processing refund for order #${order_id}:`, {
      payment_id: order.payment_id,
      payment_provider: order.payment_provider,
      amount: amountToRefund,
      reason: refund_reason
    });

    // Get T-Bank credentials
    const credentials = tbank.getCredentials();

    // Create refund via T-Bank Cancel API
    let refundResponse;
    try {
      refundResponse = await tbank.cancelPayment(
        order.payment_id, // PaymentId stored as payment_id
        amountToRefund,
        credentials
      );
      console.log('[process-refund] T-Bank refund response:', JSON.stringify(refundResponse, null, 2));
    } catch (tbankError) {
      console.error('[process-refund] T-Bank refund error:', {
        message: tbankError.message,
        response: tbankError.response
      });

      return res.status(500).json({
        error: 'Refund failed',
        message: tbankError.message,
        details: tbankError.response
      });
    }

    if (!refundResponse.success) {
      return res.status(500).json({
        error: 'Refund failed',
        message: 'T-Bank returned unsuccessful response',
        details: refundResponse.raw
      });
    }

    // Update order status to 'refunded'
    await pool.query(
      `UPDATE orders
       SET status = 'refunded',
           delivery_notes = COALESCE(delivery_notes, '') || $1,
           updated_at = NOW()
       WHERE id = $2`,
      [
        `\n\n✅ ВОЗВРАТ ОБРАБОТАН:\nСумма: ${amountToRefund}₽\nПричина: ${refund_reason || 'Не указана'}\nДата: ${new Date().toLocaleString('ru-RU')}\nПровайдер: T-Bank`,
        order_id
      ]
    );

    // Send notification to user
    try {
      const userEmail = order.email ||
        (order.login_method === 'yandex' && order.username ? `${order.username}@yandex.ru` : null);

      await sendNotification({
        userId: order.user_id,
        title: '💰 Возврат средств',
        message: `Ваш возврат был обработан!\n\nЗаказ: #${order_id}\nСумма возврата: ${amountToRefund}₽\n\nСредства вернутся на ваш счет в течение 3-5 рабочих дней.`,
        link: `${config.appUrl}/profile?order=${order_id}`,
        linkText: 'Посмотреть заказ',
        userTelegramId: order.telegram_id,
        userVkId: order.vk_id,
        userMaxId: order.max_id,
        userEmail: userEmail
      });
      console.log(`[process-refund] User notification sent for order #${order_id}`);
    } catch (notificationError) {
      console.error('[process-refund] Failed to send user notification:', notificationError.message);
    }

    return success(res, {
      message: 'Refund processed successfully',
      order_id: order_id,
      amount_refunded: amountToRefund,
      status: 'refunded'
    });

  } catch (err) {
    console.error('Error processing refund:', {
      error: err.message,
      stack: err.stack
    });
    return error(res, `Failed to process refund: ${err.message}`, 500);
  }
};
