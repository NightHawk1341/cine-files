/**
 * Update Order Endpoint
 * Updates order fields such as status, custom_product_approved, tracking_number, etc.
 * POST /api/orders/update
 */

const { getPool } = require('../../lib/db');
const { success, error, badRequest, methodNotAllowed } = require('../../server/utils/response-helpers');
const { requireOrder } = require('../../server/utils/order-queries');
const { parseTrackingInput } = require('../../server/utils/tracking-parser');

const pool = getPool();

/**
 * Main handler
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  try {
    const { order_id, status, custom_product_approved, tracking_number } = req.body;

    // Validate input
    if (!order_id) {
      return badRequest(res, 'order_id is required');
    }

    // Verify order exists
    const order = await requireOrder(pool, order_id, res);
    if (!order) return; // Response already sent

    // Build update query dynamically based on what's being updated
    let updateFields = [];
    let updateValues = [];
    let paramCounter = 1;

    if (status !== undefined) {
      updateFields.push(`status = $${paramCounter++}`);
      updateValues.push(status);
    }

    if (custom_product_approved !== undefined) {
      updateFields.push(`custom_product_approved = $${paramCounter++}`);
      updateValues.push(custom_product_approved);
    }

    if (tracking_number !== undefined) {
      // Parse tracking input - handles both URL and raw tracking number
      const parsedTracking = parseTrackingInput(tracking_number);
      const cleanTrackingNumber = parsedTracking.trackingNumber || tracking_number;

      updateFields.push(`tracking_number = $${paramCounter++}`);
      updateValues.push(cleanTrackingNumber);
    }

    // Always update updated_at
    updateFields.push(`updated_at = NOW()`);

    // Add WHERE clause parameter
    updateValues.push(order_id);
    const whereIdParam = paramCounter++;

    if (updateFields.length === 1) {
      // Only updated_at would be updated, which means no actual changes
      return badRequest(res, 'At least one field (status, custom_product_approved, tracking_number) must be provided');
    }

    const updateQuery = `
      UPDATE orders
      SET ${updateFields.join(', ')}
      WHERE id = $${whereIdParam}
      RETURNING *
    `;

    const updateResult = await pool.query(updateQuery, updateValues);
    const updatedOrder = updateResult.rows[0];

    return success(res, {
      message: 'Order updated successfully',
      order: updatedOrder
    });

  } catch (err) {
    console.error('Error updating order:', err);
    return error(res, 'Failed to update order', 500);
  }
};
