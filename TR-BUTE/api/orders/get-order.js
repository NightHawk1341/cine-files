/**
 * Get Single Order Endpoint
 * Retrieves a specific order by ID with full details
 * GET /api/orders/get-order?id=123
 *
 * REQUIRES AUTHENTICATION (via middleware)
 * Users can only access their own orders
 */

const { getPool } = require('../../lib/db');
const { success, error, badRequest, notFound, forbidden, unauthorized, methodNotAllowed } = require('../../server/utils/response-helpers');

const pool = getPool();

/**
 * Main handler
 * Authentication handled by middleware - req.userId is available
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET']);
  }

  try {
    const userId = req.userId;
    const { id } = req.query;

    // DEBUG: Log the incoming request
    console.log('[get-order] Request:', {
      userId,
      userId_type: typeof userId,
      orderId: id,
      orderId_type: typeof id
    });

    // Validate input
    if (!id) {
      return badRequest(res, 'id query parameter is required');
    }

    // Validate userId from auth
    if (!userId) {
      console.error('[get-order] userId is missing from auth token');
      return unauthorized(res, 'Authentication required');
    }

    // Fetch order
    const orderResult = await pool.query(`
      SELECT
        o.id,
        o.user_id,
        o.total_price,
        o.delivery_cost,
        o.packaging_cost,
        o.delivery_type,
        o.shipment_date,
        o.delivery_timeframe,
        o.delivery_notes,
        o.status,
        o.payment_id,
        o.tracking_number,
        o.last_tracking_status,
        o.last_tracking_update,
        o.tracking_history,
        o.arrived_at_point_at,
        o.storage_deadline,
        o.returned_to_sender_at,
        o.return_action,
        o.address_edited,
        o.discount_amount,
        o.refund_reason,
        o.created_at,
        o.updated_at,
        pc.code as promo_code
      FROM orders o
      LEFT JOIN promo_codes pc ON o.promo_code_id = pc.id
      WHERE o.id = $1
    `, [id]);

    if (orderResult.rows.length === 0) {
      console.log('[get-order] Order not found:', id);
      return notFound(res, 'Order');
    }

    const order = orderResult.rows[0];

    // DEBUG: Log order ownership check
    console.log('[get-order] Ownership check:', {
      userId,
      userId_type: typeof userId,
      order_user_id: order.user_id,
      order_user_id_type: typeof order.user_id,
      userId_string: String(userId),
      order_user_id_string: String(order.user_id),
      matches: String(userId) === String(order.user_id)
    });

    // Security: Verify authenticated user can only access their own orders
    // Convert both to strings for comparison to avoid type mismatch issues
    if (String(userId) !== String(order.user_id)) {
      console.error('[get-order] Access denied - user does not own order');
      return forbidden(res, 'You can only access your own orders');
    }

    // Fetch order items with product slugs and certificate info
    const itemsResult = await pool.query(`
      SELECT
        oi.id,
        oi.product_id,
        oi.certificate_id,
        oi.title,
        oi.quantity,
        oi.price_at_purchase,
        oi.property,
        oi.variation_num,
        oi.image,
        oi.custom_url,
        oi.admin_added,
        oi.admin_modified,
        oi.deleted_by_admin,
        oi.created_at,
        p.slug as product_slug,
        p.triptych as triptych,
        (oi.certificate_id IS NOT NULL) as is_certificate,
        (oi.certificate_id IS NOT NULL AND oi.price_at_purchase < 0) as is_redemption,
        CASE
          WHEN c.certificate_code LIKE 'PENDING-%' THEN NULL
          ELSE c.certificate_code
        END as certificate_code,
        c.recipient_name as cert_recipient_name,
        c.cert_image_url
      FROM order_items oi
      LEFT JOIN products p ON oi.product_id = p.id
      LEFT JOIN certificates c ON oi.certificate_id = c.id
      WHERE oi.order_id = $1
      ORDER BY oi.id
    `, [order.id]);

    // Fetch order address
    const addressResult = await pool.query(`
      SELECT
        id,
        surname,
        name,
        phone,
        postal_index,
        address,
        comment,
        pvz_code,
        pvz_address,
        created_at
      FROM order_addresses
      WHERE order_id = $1
    `, [order.id]);

    const address = addressResult.rows[0] || null;

    // Calculate totals
    const itemsTotal = itemsResult.rows.reduce(
      (sum, item) => sum + (item.price_at_purchase * item.quantity),
      0
    );
    const totalPrice = Number(order.total_price) || 0;
    const deliveryCost = Number(order.delivery_cost) || 0;
    const packagingCost = Number(order.packaging_cost) || 0;
    const totalWithDelivery = totalPrice + deliveryCost + packagingCost;

    // Return order with full details
    return success(res, {
      order: {
        ...order,
        items: itemsResult.rows,
        address: address,
        items_total: itemsTotal,
        total_with_delivery: totalWithDelivery
      }
    });

  } catch (err) {
    console.error('Error fetching order:', err);
    console.error('Error stack:', err.stack);
    console.error('Error details:', {
      message: err.message,
      code: err.code,
      detail: err.detail,
      hint: err.hint,
      position: err.position
    });
    return error(res, 'Failed to fetch order', 500);
  }
};
