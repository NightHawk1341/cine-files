/**
 * Update Order Status Endpoint
 * Updates order status, delivery cost, and tracking number
 * POST /api/orders/update-status
 */

const { getPool } = require('../../lib/db');
const { success, error, badRequest, methodNotAllowed } = require('../../server/utils/response-helpers');
const { requireOrder } = require('../../server/utils/order-queries');
const { sendNotification, NotificationType } = require('../../lib/notifications');
const { parseTrackingInput } = require('../../server/utils/tracking-parser');
const pool = getPool();
const config = require('../../lib/config');
const axios = require('axios');
const { VALID_STATUSES, VALID_DELIVERY_TYPES } = require('../../server/utils/order-constants');

/**
 * Send notification to user via unified notification system
 * Supports both Telegram and Email based on user's login method
 */
async function notifyUserUnified(userId, orderId, status, deliveryCost, trackingNumber, totalPrice) {
  try {
    // Get user's contact info
    const userResult = await pool.query(
      'SELECT telegram_id, vk_id, max_id, email, username, login_method FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      console.log(`User ${userId} not found, skipping notification`);
      return;
    }

    const user = userResult.rows[0];

    // Construct email for Yandex users if needed
    let userEmail = user.email;
    if (!userEmail && user.login_method === 'yandex' && user.username) {
      userEmail = `${user.username}@yandex.ru`;
    }

    // Map status to notification type for unified system
    // Supports both new and legacy statuses
    let notificationType;
    let notificationData;

    switch (status) {
      // Order created - initial confirmation (legacy)
      case 'new':
        notificationType = NotificationType.ORDER_CREATED;
        notificationData = { orderId };
        break;

      // Admin calculated delivery cost (legacy manual flow)
      case 'evaluation':
        if (deliveryCost && deliveryCost > 0) {
          notificationType = NotificationType.DELIVERY_COST_ADDED;
          notificationData = { orderId, deliveryCost, totalPrice };
        } else {
          console.log(`[update-status] Skipping evaluation notification - no delivery cost added`);
          return null;
        }
        break;

      // Awaiting payment (delivery cost set or cert-only/auto-calc)
      case 'awaiting_payment':
        notificationType = NotificationType.DELIVERY_COST_ADDED;
        notificationData = { orderId, deliveryCost, totalPrice };
        break;

      // Payment received
      case 'paid':
        notificationType = NotificationType.PAYMENT_RECEIVED;
        notificationData = { orderId };
        break;

      // Certificate pending manual upload - no notification to user
      case 'awaiting_certificate':
        console.log(`[update-status] Skipping awaiting_certificate notification - admin action pending`);
        return null;

      // Order shipped
      case 'shipped':
        notificationType = NotificationType.ORDER_SHIPPED;
        notificationData = { orderId, trackingNumber };
        break;

      // Order delivered
      case 'delivered':
        notificationType = NotificationType.ORDER_SHIPPED;
        notificationData = { orderId, trackingNumber };
        break;

      // Order cancelled
      case 'cancelled':
        notificationType = NotificationType.ORDER_CANCELLED;
        notificationData = { orderId };
        break;

      // Refund processed
      case 'refunded':
        notificationType = NotificationType.REFUND_PROCESSED;
        notificationData = { orderId, refundAmount: totalPrice };
        break;

      // Order on hold - user should contact support
      case 'on_hold':
        notificationType = NotificationType.CONTACT_REQUEST;
        notificationData = {
          orderId,
          customMessage: `По вашему заказу #${orderId} требуется уточнение. Пожалуйста, свяжитесь с нами для решения вопроса.`
        };
        break;

      // Refund requested by user
      case 'refund_requested':
        notificationType = NotificationType.CONTACT_REQUEST;
        notificationData = {
          orderId,
          customMessage: `Ваш запрос на возврат средств по заказу #${orderId} получен. Мы рассмотрим его в ближайшее время и свяжемся с вами.`
        };
        break;

      default:
        console.log(`[update-status] No notification configured for status: ${status}`);
        return null;
    }

    if (notificationType) {
      await sendNotification({
        type: notificationType,
        data: notificationData,
        link: `${config.appUrl}/profile?order=${orderId}`,
        linkText: 'Открыть заказ',
        userTelegramId: user.telegram_id,
        userVkId: user.vk_id,
        userMaxId: user.max_id,
        userEmail: userEmail
      });
      console.log(`Unified notification sent to user ${userId} for status ${status}`);
    }
  } catch (error) {
    console.error('Failed to notify user:', error.message);
    // Don't fail the update if notification fails
  }
}

/**
 * Main handler
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  try {
    const {
      order_id,
      status,
      delivery_cost,
      tracking_number,
      shipment_date,
      delivery_timeframe,
      delivery_notes,
      delivery_type,
      receipt_url
    } = req.body;

    // Validate input
    if (!order_id) {
      return badRequest(res, 'order_id is required');
    }

    // Validate status if provided
    if (status && !VALID_STATUSES.includes(status)) {
      return badRequest(res, 'Invalid status', { valid_statuses: VALID_STATUSES });
    }

    // Validate delivery_type if provided
    if (delivery_type && !VALID_DELIVERY_TYPES.includes(delivery_type)) {
      return badRequest(res, 'Invalid delivery_type', { valid_types: VALID_DELIVERY_TYPES });
    }

    // Fetch current order
    const currentOrder = await requireOrder(pool, order_id, res);
    if (!currentOrder) return; // Response already sent

    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (status) {
      updates.push(`status = $${paramCount++}`);
      values.push(status);
    }

    if (delivery_cost !== undefined) {
      updates.push(`delivery_cost = $${paramCount++}`);
      values.push(delivery_cost);
    }

    if (tracking_number !== undefined) {
      // Parse tracking input - handles both URL and raw tracking number
      const parsedTracking = parseTrackingInput(tracking_number);
      const cleanTrackingNumber = parsedTracking.trackingNumber || tracking_number;

      updates.push(`tracking_number = $${paramCount++}`);
      values.push(cleanTrackingNumber);
    }

    if (shipment_date !== undefined) {
      updates.push(`shipment_date = $${paramCount++}`);
      values.push(shipment_date || null);
    }

    if (delivery_timeframe !== undefined) {
      updates.push(`delivery_timeframe = $${paramCount++}`);
      values.push(delivery_timeframe || null);
    }

    if (delivery_notes !== undefined) {
      updates.push(`delivery_notes = $${paramCount++}`);
      values.push(delivery_notes || null);
    }

    if (delivery_type) {
      updates.push(`delivery_type = $${paramCount++}`);
      values.push(delivery_type);
    }

    if (receipt_url !== undefined) {
      updates.push(`receipt_url = $${paramCount++}`);
      values.push(receipt_url || null);
    }

    updates.push(`updated_at = NOW()`);

    if (updates.length === 1) {
      // Only updated_at was added
      return res.status(400).json({ error: 'No fields to update' });
    }

    // Add order_id as last parameter
    values.push(order_id);

    // Execute update
    const updateQuery = `
      UPDATE orders
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const updateResult = await pool.query(updateQuery, values);
    const updatedOrder = updateResult.rows[0];

    // Calculate total with delivery (explicit Number() casts: pg returns numeric columns as strings)
    const totalWithDelivery = Number(updatedOrder.total_price) + Number(updatedOrder.delivery_cost || 0);

    // Send notification to user if status changed
    if (status && status !== currentOrder.status) {
      // IMPORTANT: Only send notification if this is NOT when user accepts delivery terms
      // Admin sends notification when they set delivery cost (status -> 'evaluation')
      // We don't want to send duplicate when user accepts (status -> 'reviewed')
      const shouldNotify = !(currentOrder.status === 'evaluation' && status === 'reviewed');

      if (shouldNotify) {
        // Use direct call instead of setImmediate for serverless compatibility
        notifyUserUnified(
          updatedOrder.user_id,
          order_id,
          status,
          updatedOrder.delivery_cost,
          updatedOrder.tracking_number,
          totalWithDelivery
        ).catch(error => {
          console.error('[update-status] Failed to notify user:', error.message);
        });
      } else {
        console.log(`[update-status] Skipping duplicate notification - user accepting delivery terms (${currentOrder.status} -> ${status})`);
      }
    }

    // Send notification when receipt URL is added
    if (receipt_url && receipt_url !== currentOrder.receipt_url) {
      console.log(`[update-status] Receipt URL added for order #${order_id}, notifying user`);
      try {
        const notificationUrl = `${config.appUrl}/api/notifications/send`;
        await axios.post(notificationUrl, {
          user_id: updatedOrder.user_id,
          type: 'payment_received',
          data: {
            orderId: order_id,
            receiptUrl: receipt_url
          }
        }, { timeout: 5000 });
        console.log(`[update-status] Receipt notification sent to user ${updatedOrder.user_id}`);
      } catch (error) {
        console.error('[update-status] Failed to send receipt notification:', error.message);
      }
    }

    // Return success
    return success(res, {
      order: {
        id: updatedOrder.id,
        user_id: updatedOrder.user_id,
        total_price: updatedOrder.total_price,
        delivery_cost: updatedOrder.delivery_cost,
        total_with_delivery: totalWithDelivery,
        status: updatedOrder.status,
        payment_id: updatedOrder.payment_id,
        tracking_number: updatedOrder.tracking_number,
        delivery_type: updatedOrder.delivery_type,
        shipment_date: updatedOrder.shipment_date,
        delivery_timeframe: updatedOrder.delivery_timeframe,
        delivery_notes: updatedOrder.delivery_notes,
        created_at: updatedOrder.created_at,
        updated_at: updatedOrder.updated_at
      }
    });

  } catch (err) {
    console.error('Error updating order status:', err);
    return error(res, 'Failed to update order', 500);
  }
};
