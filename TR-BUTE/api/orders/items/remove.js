/**
 * Delete Order Item Endpoint
 * Removes an item from an existing order
 * POST /api/orders/items/remove
 */

const { getPool } = require('../../../lib/db');
const { success, error, badRequest, notFound, methodNotAllowed } = require('../../../server/utils/response-helpers');
const { requireOrder } = require('../../../server/utils/order-queries');

const pool = getPool();

/**
 * Main handler
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  try {
    const { order_id, item_id } = req.body;

    // Validate input
    if (!order_id || !item_id) {
      return badRequest(res, 'order_id and item_id are required');
    }

    // Verify order exists
    const order = await requireOrder(pool, order_id, res);
    if (!order) return; // Response already sent

    // Get the item to be deleted
    const itemResult = await pool.query(
      'SELECT id, price_at_purchase, quantity FROM order_items WHERE id = $1 AND order_id = $2',
      [item_id, order_id]
    );

    if (itemResult.rows.length === 0) {
      return notFound(res, 'Item');
    }

    const item = itemResult.rows[0];
    const itemTotalPrice = item.price_at_purchase * item.quantity;

    // Mark the item as deleted by admin instead of deleting it
    // This keeps it visible in the order history but greyed out
    await pool.query(
      'UPDATE order_items SET deleted_by_admin = true WHERE id = $1',
      [item_id]
    );

    // Recalculate order total price (exclude deleted items)
    const newTotalPrice = order.total_price - itemTotalPrice;

    // Update order total price and updated_at
    const updatedOrderResult = await pool.query(`
      UPDATE orders
      SET total_price = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [newTotalPrice, order_id]);

    const updatedOrder = updatedOrderResult.rows[0];

    // Return success
    return success(res, {
      message: 'Item removed from order',
      order: {
        id: updatedOrder.id,
        total_price: updatedOrder.total_price,
        updated_at: updatedOrder.updated_at
      }
    });

  } catch (err) {
    console.error('Error deleting order item:', err);
    return error(res, 'Failed to delete order item', 500);
  }
};
