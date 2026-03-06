/**
 * Update Order Item Endpoint
 * Updates quantity or property of an existing order item
 * POST /api/orders/items/update
 */

const { getPool } = require('../../../lib/db');
const { success, error, badRequest, notFound, methodNotAllowed } = require('../../../server/utils/response-helpers');

const pool = getPool();

/**
 * Main handler
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  try {
    const { order_id, item_id, quantity, property, custom_url, price_at_purchase } = req.body;

    // Validate input
    if (!order_id || !item_id) {
      return badRequest(res, 'order_id and item_id are required');
    }

    if (quantity === undefined && property === undefined && custom_url === undefined && price_at_purchase === undefined) {
      return badRequest(res, 'At least one field (quantity, property, custom_url, or price_at_purchase) must be provided');
    }

    // Verify item exists and belongs to the order
    const itemResult = await pool.query(
      'SELECT * FROM order_items WHERE id = $1 AND order_id = $2',
      [item_id, order_id]
    );

    if (itemResult.rows.length === 0) {
      return notFound(res, 'Order item');
    }

    const currentItem = itemResult.rows[0];

    // Build update query dynamically based on what's being updated
    let updateFields = [];
    let updateValues = [];
    let paramCounter = 1;

    if (quantity !== undefined) {
      if (quantity < 1) {
        return badRequest(res, 'Quantity must be at least 1');
      }
      updateFields.push(`quantity = $${paramCounter++}`);
      updateValues.push(quantity);
    }

    if (property !== undefined) {
      updateFields.push(`property = $${paramCounter++}`);
      updateValues.push(property);
    }

    if (custom_url !== undefined) {
      updateFields.push(`custom_url = $${paramCounter++}`);
      updateValues.push(custom_url);
    }

    if (price_at_purchase !== undefined) {
      if (price_at_purchase < 0) {
        return badRequest(res, 'Price must be at least 0');
      }
      updateFields.push(`price_at_purchase = $${paramCounter++}`);
      updateValues.push(price_at_purchase);
    }

    // Add WHERE clause parameters
    updateValues.push(item_id);
    const whereIdParam = paramCounter++;
    updateValues.push(order_id);
    const whereOrderIdParam = paramCounter++;

    const updateQuery = `
      UPDATE order_items
      SET ${updateFields.join(', ')}
      WHERE id = $${whereIdParam} AND order_id = $${whereOrderIdParam}
      RETURNING *
    `;

    const updateResult = await pool.query(updateQuery, updateValues);
    const updatedItem = updateResult.rows[0];

    // Recalculate order total
    const itemsResult = await pool.query(
      'SELECT SUM(price_at_purchase * quantity) as total FROM order_items WHERE order_id = $1',
      [order_id]
    );

    const newTotal = parseFloat(itemsResult.rows[0].total) || 0;

    await pool.query(
      'UPDATE orders SET total_price = $1, updated_at = NOW() WHERE id = $2',
      [newTotal, order_id]
    );

    return success(res, {
      message: 'Order item updated successfully',
      item: updatedItem,
      order_total: newTotal
    });

  } catch (err) {
    console.error('Error updating order item:', err);
    return error(res, 'Failed to update order item', 500);
  }
};
