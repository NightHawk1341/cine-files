/**
 * Create T-Bank Payment Session
 *
 * POST /api/payment/tbank/create-link
 *
 * Calls T-Bank Init API and returns the PaymentURL for the iframe widget.
 */

const { getPool } = require('../../../lib/db');
const tbank = require('../../../server/services/payment/tbank');
const { RECEIPT_DELIVERY_NAMES } = require('../../../server/utils/order-constants');

const pool = getPool();

/**
 * Check if user is an admin by telegram_id
 * Used to set test price of 10 RUB for admin orders
 */
async function isUserAdmin(telegramId) {
  if (!telegramId) return false;
  try {
    const result = await pool.query(
      'SELECT id FROM admins WHERE telegram_id = $1',
      [telegramId]
    );
    return result.rows.length > 0;
  } catch (error) {
    console.error('[tbank] Error checking admin status:', error);
    return false;
  }
}

const APP_URL = process.env.APP_URL || 'https://buy-tribute.com';

const CUSTOM_PRODUCT_ID = 1;

/**
 * Build a human-readable receipt item name from order item data.
 * Format: "Постер формата A2 без рамки: Ghost of Tsushima (фирменный)"
 */
function buildReceiptItemName(item) {
  if (item.certificate_id) {
    const amount = Math.round(Number(item.price_at_purchase));
    return `Подарочный сертификат на сумму ${amount} руб`;
  }

  // Remove " [/]" suffix used to mark official (фирменный) prints in titles
  const cleanTitle = (item.title || '').replace(/ \[\/\]$/, '').trim();

  const property = item.property || '';
  // Triptych properties are stored as "3 A3 без рамок", "3 A2 без рамок", etc.
  const isTriptychProperty = /^3 /.test(property);
  const formatStr = isTriptychProperty ? property.slice(2).trim() : property;

  if (item.product_id === CUSTOM_PRODUCT_ID) {
    return `Кастомный постер формата ${formatStr}`.substring(0, 128);
  }

  if (isTriptychProperty || item.triptych) {
    return `Постеры формата ${formatStr}: ${cleanTitle} (триптих)`.substring(0, 128);
  }

  const typeLabel = item.product_type ? ` (${item.product_type})` : '';
  return `Постер формата ${formatStr}: ${cleanTitle}${typeLabel}`.substring(0, 128);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { order_id, context } = req.body;

    // Validate input
    if (!order_id) {
      return res.status(400).json({
        success: false,
        error: 'order_id is required'
      });
    }

    // Get T-Bank credentials
    const credentials = tbank.getCredentials();

    if (!credentials.terminalKey || !credentials.password) {
      console.error('T-Bank credentials not configured');
      return res.status(500).json({
        success: false,
        error: 'Payment system not configured'
      });
    }

    // Fetch order with user info and shipping details for receipt
    const orderResult = await pool.query(`
      SELECT o.id, o.user_id, o.total_price, o.delivery_cost, o.packaging_cost, o.status,
             o.delivery_type, o.shipping_provider_id, o.shipping_service_id,
             sp.display_name AS shipping_provider_name,
             ss.display_name AS shipping_service_name,
             u.email, u.payment_email, u.username, u.login_method, u.telegram_id
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN shipping_providers sp ON sp.id = o.shipping_provider_id
      LEFT JOIN shipping_services ss ON ss.id = o.shipping_service_id
      WHERE o.id = $1 AND o.is_deleted = false
    `, [order_id]);

    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    const order = orderResult.rows[0];

    // Get customer email — prefer payment_email (set via checkout prompt),
    // fall back to account email or Yandex-derived email
    let customerEmail = order.payment_email || order.email;
    if (!customerEmail && order.login_method === 'yandex' && order.username) {
      customerEmail = `${order.username}@yandex.ru`;
    }

    // Validate order status - allow both new and legacy statuses
    const validStatuses = ['awaiting_payment', 'reviewed', 'accepted'];
    if (!validStatuses.includes(order.status)) {
      return res.status(400).json({
        success: false,
        error: 'Order is not ready for payment',
        details: {
          current_status: order.status,
          valid_statuses: validStatuses
        }
      });
    }

    // Calculate total amount
    const totalPrice = Number(order.total_price) || 0;
    const deliveryCost = Number(order.delivery_cost) || 0;
    const packagingCost = Number(order.packaging_cost) || 0;
    let totalAmount = totalPrice + deliveryCost + packagingCost;

    console.log(`[tbank] Payment calculation for order ${order_id}:`, {
      totalPrice,
      deliveryCost,
      packagingCost,
      totalAmount,
      raw_delivery_cost: order.delivery_cost,
      raw_packaging_cost: order.packaging_cost
    });

    // Check if user is admin - use test price of 10 RUB for admin orders
    const userIsAdmin = await isUserAdmin(order.telegram_id);
    if (userIsAdmin) {
      console.log(`[tbank] Admin order detected (telegram_id: ${order.telegram_id}), setting test price of 10 RUB`);
      totalAmount = 10;
    }

    if (totalAmount <= 0 || isNaN(totalAmount)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid order amount'
      });
    }

    // Warn if delivery cost is not set (unless admin test order)
    if (!userIsAdmin && (order.delivery_cost === null || order.delivery_cost === undefined)) {
      console.warn(`[tbank] Warning: Order ${order_id} has no delivery cost set. Payment will only include product total.`);
    }

    // Fetch order items with product details for proper receipt naming
    const itemsResult = await pool.query(`
      SELECT oi.title, oi.quantity, oi.price_at_purchase,
             oi.property, oi.product_id, oi.certificate_id,
             p.type AS product_type, p.triptych
      FROM order_items oi
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = $1 AND oi.deleted_by_admin = false
    `, [order_id]);

    // Build delivery receipt name from shipping service or delivery_type fallback
    let deliveryName = 'Доставка';
    if (order.shipping_service_name) {
      deliveryName = order.shipping_service_name;
    } else if (order.delivery_type && RECEIPT_DELIVERY_NAMES[order.delivery_type]) {
      deliveryName = RECEIPT_DELIVERY_NAMES[order.delivery_type];
    }

    const orderItems = itemsResult.rows;

    // Build receipt for fiscal compliance
    let receipt;
    if (userIsAdmin) {
      // For admin orders, adjust prices to sum to 10 RUB
      const originalItemsTotal = orderItems.reduce((sum, item) =>
        sum + Number(item.price_at_purchase) * item.quantity, 0);
      const originalTotal = originalItemsTotal + deliveryCost + packagingCost;

      const testItems = orderItems.map((item) => {
        const itemTotal = Number(item.price_at_purchase) * item.quantity;
        const proportion = originalTotal > 0 ? itemTotal / originalTotal : 1 / orderItems.length;
        const pricePerUnit = Math.round((10 * proportion / item.quantity) * 100) / 100;
        return {
          title: `${buildReceiptItemName(item)} (тестовый продукт)`.substring(0, 128),
          price: pricePerUnit,
          quantity: item.quantity
        };
      });

      // Adjust last item to ensure total is exactly 10 RUB
      const currentTotal = testItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
      if (testItems.length > 0) {
        const diff = 10 - currentTotal;
        testItems[testItems.length - 1].price = Math.round((testItems[testItems.length - 1].price + diff / testItems[testItems.length - 1].quantity) * 100) / 100;
      }

      receipt = tbank.buildReceipt({
        items: testItems,
        deliveryCost: 0,
        deliveryName,
        email: customerEmail,
        taxation: 'usn_income'
      });
    } else {
      receipt = tbank.buildReceipt({
        items: orderItems.map(item => ({
          title: buildReceiptItemName(item),
          price: Number(item.price_at_purchase),
          quantity: item.quantity
        })),
        deliveryCost: deliveryCost + packagingCost,
        deliveryName,
        email: customerEmail,
        taxation: 'usn_income'
      });
    }

    // Count existing payment attempts to generate unique T-Bank OrderId
    // T-Bank requires OrderId to be unique per terminal; retries with the same
    // OrderId are rejected with ErrorCode 8 ("Заказ с таким order_id уже существует")
    const attemptResult = await pool.query(
      'SELECT COUNT(*) as count FROM payment_transactions WHERE order_id = $1 AND provider = $2',
      [order_id, 'tbank']
    );
    const attemptNumber = Number(attemptResult.rows[0].count) + 1;
    const tbankOrderId = `${order_id}_${attemptNumber}`;

    // Mark any previous pending transactions as expired
    if (attemptNumber > 1) {
      await pool.query(
        `UPDATE payment_transactions SET status = 'expired', updated_at = NOW()
         WHERE order_id = $1 AND provider = 'tbank' AND status = 'pending'`,
        [order_id]
      );
      console.log(`[tbank] Payment attempt #${attemptNumber} for order ${order_id}, previous pending transactions marked as expired`);
    }

    // Build notification URL for webhook
    const notificationUrl = `${APP_URL}/api/payment/tbank/webhook`;

    // Call T-Bank Init API
    const initParams = {
      amount: totalAmount,
      orderId: tbankOrderId,
      description: `Оплата заказа #${order_id}`,
      customerEmail,
      receipt,
      notificationUrl,
      successUrl: `${APP_URL}/api/payment/tbank/result?status=success&order=${order_id}&from=${context}`,
      failUrl: `${APP_URL}/api/payment/tbank/result?status=fail&order=${order_id}&from=${context}`
    };

    // SpeedPay widget integration requires connection_type in DATA
    if (context === 'widget') {
      initParams.data = { connection_type: 'Widget' };
    }

    const paymentResult = await tbank.initPayment(initParams, credentials);

    // Update order status to 'awaiting_payment' if it was 'reviewed' (legacy)
    if (order.status === 'reviewed') {
      await pool.query(`
        UPDATE orders
        SET status = 'awaiting_payment', payment_provider = 'tbank', updated_at = NOW()
        WHERE id = $1
      `, [order_id]);

      console.log(`[tbank] Order ${order_id} status updated to 'awaiting_payment'`);
    }

    // Log payment transaction attempt
    await pool.query(`
      INSERT INTO payment_transactions (order_id, provider, transaction_id, amount, currency, status)
      VALUES ($1, 'tbank', $2, $3, 'RUB', 'pending')
    `, [order_id, paymentResult.paymentId, totalAmount]);

    // Return payment URL for frontend iframe
    return res.status(200).json({
      success: true,
      data: {
        paymentUrl: paymentResult.paymentUrl,
        paymentId: paymentResult.paymentId,
        order_id,
        amount: totalAmount,
        totalBreakdown: {
          products: totalPrice,
          delivery: deliveryCost,
          packaging: packagingCost,
          total: totalAmount
        }
      }
    });

  } catch (error) {
    console.error('[tbank/create-link] Error:', error);

    return res.status(500).json({
      success: false,
      error: 'Failed to create payment link',
      message: error.message
    });
  }
};
