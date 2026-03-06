/**
 * Create Order Endpoint
 * Creates a new order with items and address
 * POST /api/orders/create
 *
 * REQUIRES AUTHENTICATION
 * Order will be created for the authenticated user
 */

const { getPool } = require('../../lib/db');
const { success, error, badRequest, unauthorized, notFound, methodNotAllowed } = require('../../server/utils/response-helpers');
const pool = getPool();
const config = require('../../lib/config');
const axios = require('axios');
const { sendNotification, sendAdminNotification, NotificationType } = require('../../lib/notifications');

// Ensure order_items allows NULL product_id/property for certificate rows (lazy migration)
let orderItemsNullableReady = false;
async function ensureOrderItemsNullable() {
  if (orderItemsNullableReady) return;
  try {
    await pool.query(`ALTER TABLE order_items ALTER COLUMN product_id DROP NOT NULL`);
    await pool.query(`ALTER TABLE order_items ALTER COLUMN property DROP NOT NULL`);
    orderItemsNullableReady = true;
  } catch (err) {
    // Column may already be nullable — treat as success
    orderItemsNullableReady = true;
  }
}

// Ensure promo_codes table and orders promo columns exist (lazy migration)
let promoColumnsReady = false;
async function ensurePromoColumns() {
  if (promoColumnsReady) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS promo_codes (
        id serial PRIMARY KEY,
        code varchar NOT NULL UNIQUE,
        type varchar NOT NULL DEFAULT 'fixed' CHECK (type IN ('fixed', 'percent')),
        value numeric NOT NULL,
        min_order_amount numeric DEFAULT 0,
        max_uses integer,
        uses_count integer DEFAULT 0,
        valid_from timestamp without time zone,
        valid_until timestamp without time zone,
        is_active boolean DEFAULT true,
        created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_code_id integer REFERENCES promo_codes(id)`);
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount numeric DEFAULT 0`);
    promoColumnsReady = true;
  } catch (err) {
    console.error('[order-create] Failed to add promo columns:', err.message);
  }
}

/**
 * Send order confirmation notification to user via the typed notification system.
 * Selects the appropriate notification type based on certificate content and
 * whether delivery was pre-calculated (automatic) or needs admin review (manual).
 *
 * @param {number} userId
 * @param {number} orderId
 * @param {Object} ctx
 * @param {boolean} ctx.isCertOnly    - All items are certificates
 * @param {boolean} ctx.hasCerts      - At least one item is a certificate
 * @param {boolean} ctx.isAutoCalculated - Delivery cost was pre-calculated at checkout
 */
async function sendOrderNotificationToUser(userId, orderId, { isCertOnly = false, hasCerts = false, isAutoCalculated = false } = {}) {
  try {
    const userResult = await pool.query(
      'SELECT telegram_id, vk_id, max_id, email, username, login_method FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      console.log(`User ${userId} not found for notification`);
      return;
    }

    const user = userResult.rows[0];

    // For Yandex users, construct email from username if email is not set
    let userEmail = user.email;
    if (!userEmail && user.login_method === 'yandex' && user.username) {
      userEmail = `${user.username}@yandex.ru`;
    }

    // Pick notification type based on certificate context
    let notificationType;
    if (isCertOnly) {
      notificationType = NotificationType.ORDER_CREATED_CERT_ONLY;
    } else if (hasCerts) {
      notificationType = NotificationType.ORDER_CREATED_CERT_MIXED;
    } else {
      notificationType = NotificationType.ORDER_CREATED;
    }

    const sent = await sendNotification({
      type: notificationType,
      data: { orderId, isAutoCalculated },
      link: `${config.appUrl}/profile?order=${orderId}`,
      linkText: 'Посмотреть заказ',
      userTelegramId: user.telegram_id,
      userVkId: user.vk_id,
      userMaxId: user.max_id,
      userEmail: userEmail
    });

    if (sent) {
      console.log(`Order notification (${notificationType}) sent to user ${userId} for order ${orderId}`);
    } else {
      console.log(`Failed to send order notification to user ${userId}`);
    }
  } catch (error) {
    console.error('Error sending order notification to user:', error.message);
    // Don't throw - notification failure shouldn't break order creation
  }
}

/**
 * Validate order data
 * Note: user_id comes from authentication, not from request body
 */
function validateOrderData(data) {
  const errors = [];

  // user_id is not validated here - it comes from req.userId (authentication)

  if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
    errors.push('items array is required and must not be empty');
  }

  if (!data.address) {
    errors.push('address object is required');
  } else {
    // PDF certificate-only orders need no physical or contact details — sent to account email
    const isCertOnlyPdf =
      data.certificate_delivery_type === 'pdf' &&
      Array.isArray(data.items) &&
      data.items.length > 0 &&
      data.items.every(item => item.is_certificate);

    const required = isCertOnlyPdf
      ? []
      : ['surname', 'name', 'phone', 'postal_index', 'address'];

    for (const field of required) {
      if (!data.address[field]) {
        errors.push(`address.${field} is required`);
      }
    }
  }

  // Validate each item (handle both regular products and certificates)
  if (data.items && Array.isArray(data.items)) {
    data.items.forEach((item, index) => {
      if (item.is_certificate) {
        // Certificate item validation
        if (!item.certificate_id) errors.push(`items[${index}].certificate_id is required for certificates`);
        if (!item.title) errors.push(`items[${index}].title is required`);
        if (!item.price_at_purchase && item.price_at_purchase !== 0) errors.push(`items[${index}].price_at_purchase is required`);
      } else {
        // Regular product item validation
        if (!item.product_id) errors.push(`items[${index}].product_id is required`);
        if (!item.title) errors.push(`items[${index}].title is required`);
        if (!item.quantity || item.quantity < 1) errors.push(`items[${index}].quantity must be >= 1`);
        if (!item.price_at_purchase && item.price_at_purchase !== 0) errors.push(`items[${index}].price_at_purchase is required`);
        if (!item.property) errors.push(`items[${index}].property is required`);
      }
    });
  }

  return errors;
}

/**
 * Calculate total price from items
 */
function calculateTotalPrice(items) {
  return items.reduce((sum, item) => {
    return sum + (item.price_at_purchase * item.quantity);
  }, 0);
}

/**
 * Generate a random order ID (6-8 digits)
 * Ensures uniqueness by checking against existing orders
 */
async function generateRandomOrderId(client) {
  const maxAttempts = 10;

  for (let i = 0; i < maxAttempts; i++) {
    // Generate random 6-8 digit number
    const randomId = Math.floor(100000 + Math.random() * 90000000);

    // Check if it already exists
    const existing = await client.query(
      'SELECT id FROM orders WHERE id = $1',
      [randomId]
    );

    if (existing.rows.length === 0) {
      return randomId;
    }
  }

  throw new Error('Failed to generate unique order ID after multiple attempts');
}

/**
 * Main handler
 * Requires authentication - creates order for authenticated user
 * Authentication handled by middleware - req.userId is available
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  const client = await pool.connect();

  try {
    // Security: Use authenticated user's ID, not from request body
    if (!req.userId) {
      return unauthorized(res, 'Authentication required to create orders');
    }

    const userId = req.userId;
    const {
      items,
      address,
      delivery_type,
      country,
      certificate_delivery_type = 'pdf',
      // Shipping data from frontend calculation
      shipping_code,
      delivery_cost,
      packaging_cost,
      cdek_pickup_point,
      shipping_provider,
      estimated_delivery_days,
      express_delivery,
      pvz_code,
      pvz_address,
      // Promo code
      promo_code
    } = req.body;

    // Debug logging for delivery information
    console.log('[order-create] Delivery information received:', {
      delivery_type,
      shipping_provider,
      delivery_cost,
      packaging_cost,
      shipping_code,
      promo_code: promo_code || null
    });

    // Validate input
    const validationErrors = validateOrderData(req.body);
    if (validationErrors.length > 0) {
      return badRequest(res, 'Validation failed', { details: validationErrors });
    }

    // Ensure promo code columns exist
    await ensurePromoColumns();
    // Ensure order_items allows NULL product_id/property for certificate rows
    await ensureOrderItemsNullable();

    // Verify user exists (should always pass since we have req.userId)
    const userCheck = await client.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      return notFound(res, 'User not found');
    }

    // Validate that all regular products are available for purchase
    const productIds = items
      .filter(item => !item.is_certificate && item.product_id)
      .map(item => item.product_id);

    if (productIds.length > 0) {
      const productCheck = await client.query(
        `SELECT id, title, status, type FROM products WHERE id = ANY($1::int[])`,
        [productIds]
      );

      const unavailableProducts = productCheck.rows.filter(
        p => p.status === 'coming_soon' || p.status === 'test'
      );

      if (unavailableProducts.length > 0) {
        const titles = unavailableProducts.map(p => p.title).join(', ');
        return badRequest(res, 'Cannot create order with unavailable products', {
          details: `The following products are not available for purchase: ${titles}`
        });
      }

      // Validate variation_num for original products (excluding custom product id=1)
      const CUSTOM_PRODUCT_ID = 1;
      const productTypeMap = {};
      productCheck.rows.forEach(p => { productTypeMap[p.id] = p.type; });

      for (const item of items.filter(i => !i.is_certificate)) {
        const productType = productTypeMap[item.product_id];
        if (productType === 'оригинал' && item.product_id !== CUSTOM_PRODUCT_ID) {
          if (!item.variation_num || String(item.variation_num).trim() === '') {
            return badRequest(res, `Не указан вариант для товара: ${item.title || item.product_id}`);
          }
        }
      }
    }

    // Check if user is also an admin (for testing purposes, admins get 10 ruble delivery)
    const adminCheck = await client.query(
      'SELECT id FROM admins WHERE telegram_id IN (SELECT telegram_id FROM users WHERE id = $1)',
      [userId]
    );

    let finalDeliveryCost = delivery_cost;
    if (adminCheck.rows.length > 0) {
      // User is admin - use 10 rubles for testing
      finalDeliveryCost = 10;
      console.log(`[order-create] Admin user ${userId} ordering - setting delivery cost to 10 rubles for testing`);
    }

    // Fetch global shipment date to stamp on the order at creation time
    let globalShipmentDate = null;
    try {
      const shipmentResult = await pool.query(
        'SELECT next_shipment_date FROM shipment_settings ORDER BY id DESC LIMIT 1'
      );
      globalShipmentDate = shipmentResult.rows[0]?.next_shipment_date || null;
    } catch (err) {
      console.error('[order-create] Could not fetch global shipment date:', err.message);
    }

    // Calculate total price (before discount)
    const itemsTotal = calculateTotalPrice(items);

    // Validate certificate redemption min_cart_amount floors
    const redemptionItems = items.filter(item => item.is_certificate && item.is_redemption && (item.min_cart_amount || 0) > 0);
    if (redemptionItems.length > 0) {
      const regularItemsTotal = items
        .filter(item => !item.is_certificate)
        .reduce((sum, item) => sum + item.price_at_purchase * item.quantity, 0);

      for (const redemption of redemptionItems) {
        if (regularItemsTotal < parseFloat(redemption.min_cart_amount)) {
          return badRequest(res, `Сертификат можно применить только при сумме товаров от ${redemption.min_cart_amount}₽`);
        }
      }
    }

    // Validate promo code if provided
    let promoCodeId = null;
    let discountAmount = 0;

    if (promo_code) {
      // Certificate and promo can't be combined
      const hasCertificates = items.some(item => item.is_certificate);
      if (hasCertificates) {
        return badRequest(res, 'Промо-код нельзя использовать вместе с сертификатом');
      }

      const promoResult = await client.query(
        'SELECT id, code, type, value, min_order_amount, max_uses, uses_count, valid_from, valid_until, is_active FROM promo_codes WHERE UPPER(code) = UPPER($1)',
        [promo_code]
      );

      if (promoResult.rows.length === 0) {
        return badRequest(res, 'Промо-код не найден');
      }

      const promo = promoResult.rows[0];

      if (!promo.is_active) {
        return badRequest(res, 'Промо-код неактивен');
      }
      if (promo.valid_until && new Date(promo.valid_until) < new Date()) {
        return badRequest(res, 'Срок действия промо-кода истёк');
      }
      if (promo.valid_from && new Date(promo.valid_from) > new Date()) {
        return badRequest(res, 'Промо-код ещё не активен');
      }
      if (promo.max_uses && promo.uses_count >= promo.max_uses) {
        return badRequest(res, 'Промо-код исчерпан');
      }
      if (promo.min_order_amount && itemsTotal < parseFloat(promo.min_order_amount)) {
        return badRequest(res, `Минимальная сумма заказа для этого промо-кода: ${promo.min_order_amount}₽`);
      }

      // Calculate discount
      if (promo.type === 'fixed') {
        discountAmount = Math.min(parseFloat(promo.value), itemsTotal);
      } else if (promo.type === 'percent') {
        discountAmount = Math.round(itemsTotal * parseFloat(promo.value) / 100);
      }

      promoCodeId = promo.id;
      console.log(`[order-create] Promo code ${promo.code} applied: -${discountAmount}₽ (${promo.type} ${promo.value})`);
    }

    // Total price after discount
    const totalPrice = itemsTotal - discountAmount;

    // Default delivery type if not provided
    const selectedDeliveryType = delivery_type || 'pochta';

    // Start transaction
    await client.query('BEGIN');

    // Generate random order ID
    const orderId = await generateRandomOrderId(client);

    // 1. Create order with shipping data if provided
    const hasShippingData = finalDeliveryCost > 0 || packaging_cost > 0;
    // PDF cert-only orders need no delivery calculation — go straight to awaiting_payment.
    // Physical orders go to awaiting_payment only when shipping was pre-calculated.
    const isPdfCertOnlyOrder = certificate_delivery_type === 'pdf' && items.every(i => i.is_certificate);
    const initialStatus = (hasShippingData || isPdfCertOnlyOrder) ? 'awaiting_payment' : 'created';

    const orderResult = await client.query(`
      INSERT INTO orders (
        id, user_id, total_price, status, delivery_type, country,
        delivery_cost, packaging_cost, promo_code_id, discount_amount,
        shipment_date, delivery_timeframe, express_delivery, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
      RETURNING *
    `, [
      orderId,
      userId,
      totalPrice,
      initialStatus,
      selectedDeliveryType,
      country || null,
      typeof finalDeliveryCost === 'number' ? finalDeliveryCost : null,
      typeof packaging_cost === 'number' ? packaging_cost : null,
      promoCodeId,
      discountAmount,
      globalShipmentDate,
      estimated_delivery_days || null,
      express_delivery === true || express_delivery === 'true' ? true : null
    ]);

    const order = orderResult.rows[0];

    // 2. Create order items (handle both regular products and certificates)
    for (const item of items) {
      if (item.is_certificate) {
        // Handle certificate item — link by ID (code is generated after payment)
        const certUpdateResult = await client.query(`
          UPDATE certificates
          SET purchase_order_id = $1,
              delivery_type = $2
          WHERE id = $3
          RETURNING id
        `, [orderId, certificate_delivery_type, item.certificate_id]);

        if (certUpdateResult.rows.length === 0) {
          throw new Error(`Certificate ID ${item.certificate_id} not found`);
        }

        const certificateId = certUpdateResult.rows[0].id;

        // Create order item with certificate_id
        await client.query(`
          INSERT INTO order_items (
            order_id, certificate_id, title, quantity, price_at_purchase,
            image, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, NOW())
        `, [
          orderId,
          certificateId,
          item.title,
          item.quantity,
          item.price_at_purchase,
          item.image || null
        ]);
      } else {
        // Handle regular product item
        // Resolve variant image for оригинал products with numeric variation_num
        let itemImage = item.image || null;
        const productType = productTypeMap[item.product_id];
        const varNum = item.variation_num;
        if (productType === 'оригинал' && varNum && !String(varNum).startsWith('http') && item.product_id !== CUSTOM_PRODUCT_ID) {
          try {
            const varImgResult = await client.query(
              `SELECT url FROM product_images
               WHERE product_id = $1 AND extra = 'варианты' AND (hidden_product IS NULL OR hidden_product = false)
               ORDER BY sort_order ASC, id ASC`,
              [item.product_id]
            );
            const varIdx = parseInt(varNum, 10) - 1;
            if (varIdx >= 0 && varIdx < varImgResult.rows.length) {
              itemImage = varImgResult.rows[varIdx].url;
            }
          } catch (imgErr) {
            console.error('[order-create] Could not resolve variant image:', imgErr.message);
          }
        }

        await client.query(`
          INSERT INTO order_items (
            order_id, product_id, title, quantity, price_at_purchase,
            property, variation_num, image, custom_url, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        `, [
          orderId,
          item.product_id,
          item.title,
          item.quantity,
          item.price_at_purchase,
          item.property,
          item.variation_num || null,
          itemImage,
          item.custom_url || null
        ]);
      }
    }

    // 3. Create order address
    await client.query(`
      INSERT INTO order_addresses (
        order_id, surname, name, phone, postal_index, address, comment,
        pvz_code, pvz_address, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
    `, [
      orderId,
      address.surname || '',
      address.name || '',
      address.phone || '',
      address.postal_index || '',
      address.address,
      address.comment || null,
      pvz_code || null,
      pvz_address || null
    ]);

    // 4. Increment promo code usage count
    if (promoCodeId) {
      await client.query('UPDATE promo_codes SET uses_count = uses_count + 1 WHERE id = $1', [promoCodeId]);
    }

    // 5. Clear user's cart
    await client.query('DELETE FROM user_cart WHERE user_id = $1', [userId]);

    // Commit transaction
    await client.query('COMMIT');

    // 5. Send notification to admin
    // Use unified notification system for consistent handling
    try {
      console.log(`[order-create] Sending admin notification for order ${orderId}`);

      // Calculate total for notification
      const totalItemsPrice = items.reduce((sum, item) =>
        sum + (item.price_at_purchase * item.quantity), 0
      );
      const totalWithDelivery = totalItemsPrice + (finalDeliveryCost || 0) + (packaging_cost || 0);

      // Adjust message based on whether shipping was pre-calculated
      const adminMessage = hasShippingData
        ? `Поступил заказ #${orderId} на сумму ${totalWithDelivery} руб. (доставка уже рассчитана). Проверьте заказ.`
        : `Поступил заказ #${orderId} на сумму ${totalItemsPrice} руб. Внесите информацию по доставке.`;

      await sendAdminNotification({
        title: 'Новый заказ',
        message: adminMessage,
        link: `${config.appUrl}/admin-miniapp/index.html`,
        linkText: 'Открыть админку'
      });

      console.log(`[order-create] Admin notification sent for order ${orderId}`);
    } catch (error) {
      console.error('[order-create] Failed to notify admin:', error.message);
      // Don't fail the order creation if notification fails
    }

    // 6. Send notification to user
    try {
      console.log(`[order-create] Sending user notification for order ${orderId}`);
      const hasCerts = items.some(i => i.is_certificate);
      await sendOrderNotificationToUser(userId, orderId, {
        isCertOnly: isPdfCertOnlyOrder,
        hasCerts,
        isAutoCalculated: hasShippingData || isPdfCertOnlyOrder
      });
      console.log(`[order-create] User notification sent for order ${orderId}`);
    } catch (error) {
      console.error('[order-create] Failed to notify user:', error.message);
      // Don't fail the order creation if notification fails
    }

    // Return success
    return success(res, {
      order_id: orderId,
      order: {
        id: orderId,
        total_price: totalPrice,
        discount_amount: discountAmount,
        delivery_cost: delivery_cost || 0,
        packaging_cost: packaging_cost || 0,
        status: initialStatus,
        created_at: order.created_at
      }
    }, 201);

  } catch (err) {
    // Rollback transaction on error
    await client.query('ROLLBACK');
    console.error('Error creating order:', err);

    return error(res, 'Failed to create order', 500);
  } finally {
    client.release();
  }
};
