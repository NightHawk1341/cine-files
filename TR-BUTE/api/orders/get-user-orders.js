/**
 * Get User Orders Endpoint
 * Retrieves all orders for a specific user with full details
 * GET /api/orders/get-user-orders?user_id=123
 *
 * REQUIRES AUTHENTICATION
 * Users can only access their own orders
 */

const { getPool } = require('../../lib/db');
const { success, error, unauthorized, notFound, methodNotAllowed } = require('../../server/utils/response-helpers');

const pool = getPool();

/**
 * Helper function to execute query with retry logic
 */
async function queryWithRetry(queryFn, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await queryFn();
    } catch (err) {
      if (attempt < maxRetries && (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.message.includes('timeout'))) {
        console.log(`Query failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); // Exponential backoff
        continue;
      }
      throw err;
    }
  }
}

/**
 * Main handler
 * Requires authentication - user can only access their own orders
 * Authentication handled by middleware - req.userId is available
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET']);
  }

  try {
    // Security: Use authenticated user's ID from token
    if (!req.userId) {
      return unauthorized(res, 'Authentication required');
    }

    const userId = req.userId;

    // Verify user exists with retry
    const userCheck = await queryWithRetry(() =>
      pool.query('SELECT id FROM users WHERE id = $1', [userId])
    );

    if (userCheck.rows.length === 0) {
      return notFound(res, 'User');
    }

    // Fetch orders with all details with retry - Limit to recent orders first
    console.log(`[get-user-orders] Fetching orders for user ${userId}`);
    const startTime = Date.now();

    const ordersResult = await queryWithRetry(() => pool.query(`
      SELECT
        o.id,
        o.user_id,
        o.total_price,
        o.delivery_cost,
        o.delivery_type,
        o.shipment_date,
        o.delivery_timeframe,
        o.delivery_notes,
        o.status,
        o.payment_id,
        o.tracking_number,
        o.created_at,
        o.updated_at
      FROM orders o
      WHERE o.user_id = $1
      ORDER BY o.created_at DESC
      LIMIT 100
    `, [userId]));

    console.log(`[get-user-orders] Found ${ordersResult.rows.length} orders in ${Date.now() - startTime}ms`);

    const orders = ordersResult.rows;

    if (orders.length === 0) {
      return success(res, { count: 0, orders: [] });
    }

    // Get all order IDs for batch fetching
    const orderIds = orders.map(o => o.id);

    // Batch fetch all items for all orders in ONE query (fixes N+1)
    console.log(`[get-user-orders] Batch fetching items for ${orderIds.length} orders`);
    const itemsResult = await queryWithRetry(() => pool.query(`
      SELECT
        oi.id,
        oi.order_id,
        oi.product_id,
        oi.title,
        oi.quantity,
        oi.price_at_purchase,
        oi.property,
        oi.variation_num,
        oi.image,
        oi.created_at,
        p.slug as product_slug
      FROM order_items oi
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = ANY($1)
      ORDER BY oi.order_id, oi.id
    `, [orderIds]));

    console.log(`[get-user-orders] Found ${itemsResult.rows.length} total items`);

    // Batch fetch all addresses for all orders in ONE query (fixes N+1)
    console.log(`[get-user-orders] Batch fetching addresses for ${orderIds.length} orders`);
    const addressResult = await queryWithRetry(() => pool.query(`
      SELECT
        order_id,
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
      WHERE order_id = ANY($1)
    `, [orderIds]));

    console.log(`[get-user-orders] Found ${addressResult.rows.length} addresses`);

    // Group items by order_id for O(1) lookup
    const itemsByOrderId = new Map();
    for (const item of itemsResult.rows) {
      if (!itemsByOrderId.has(item.order_id)) {
        itemsByOrderId.set(item.order_id, []);
      }
      itemsByOrderId.get(item.order_id).push(item);
    }

    // Group addresses by order_id for O(1) lookup
    const addressByOrderId = new Map();
    for (const addr of addressResult.rows) {
      addressByOrderId.set(addr.order_id, addr);
    }

    // Combine orders with their items and addresses
    const ordersWithDetails = orders.map(order => {
      const items = itemsByOrderId.get(order.id) || [];

      if (items.length === 0) {
        console.warn(`[get-user-orders] Order ${order.id} has no items - this may indicate data corruption`);
      }

      const address = addressByOrderId.get(order.id) || null;

      // Calculate totals
      const itemsTotal = items.reduce(
        (sum, item) => sum + (item.price_at_purchase * item.quantity),
        0
      );
      const totalPrice = Number(order.total_price) || 0;
      const deliveryCost = Number(order.delivery_cost) || 0;
      const totalWithDelivery = totalPrice + deliveryCost;

      return {
        ...order,
        items: items,
        address: address,
        items_total: itemsTotal,
        total_with_delivery: totalWithDelivery
      };
    });

    // Return orders
    return success(res, {
      count: ordersWithDetails.length,
      orders: ordersWithDetails
    });

  } catch (err) {
    console.error('Error fetching user orders:', {
      error: err.message,
      stack: err.stack,
      user_id: req.userId
    });
    return error(res, `Failed to fetch orders: ${err.message}`, 500);
  }
};
