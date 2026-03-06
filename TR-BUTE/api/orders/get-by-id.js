/**
 * Get Order By ID Endpoint
 * Retrieves a single order by its ID with full details
 * GET /api/orders/:orderId
 */

const { getPool } = require('../../lib/db');
const { success, error, badRequest, methodNotAllowed } = require('../../server/utils/response-helpers');
const { requireOrder } = require('../../server/utils/order-queries');

const pool = getPool();

/**
 * Main handler
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET']);
  }

  try {
    const { orderId } = req.params;

    // Validate input
    if (!orderId) {
      return badRequest(res, 'orderId parameter is required');
    }

    // Fetch order details
    const order = await requireOrder(pool, orderId, res);
    if (!order) return; // Response already sent

    // Fetch order items
    const itemsResult = await pool.query(`
      SELECT
        id,
        product_id,
        title,
        quantity,
        price_at_purchase,
        property,
        variation_num,
        image,
        created_at
      FROM order_items
      WHERE order_id = $1
      ORDER BY id
    `, [orderId]);

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
        actual_delivery_info,
        created_at
      FROM order_addresses
      WHERE order_id = $1
    `, [orderId]);

    // Calculate totals
    const itemsTotal = itemsResult.rows.reduce(
      (sum, item) => sum + (item.price_at_purchase * item.quantity),
      0
    );
    const totalWithDelivery = order.total_price + (order.delivery_cost || 0);

    const orderWithDetails = {
      ...order,
      items: itemsResult.rows,
      address: addressResult.rows[0] || null,
      items_total: itemsTotal,
      total_with_delivery: totalWithDelivery
    };

    // Return order
    return success(res, {
      order: orderWithDetails
    });

  } catch (err) {
    console.error('Error fetching order:', err);
    return error(res, 'Failed to fetch order', 500);
  }
};
