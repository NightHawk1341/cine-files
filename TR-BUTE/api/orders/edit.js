/**
 * Edit Order Endpoint
 * User edits their order (only allowed in 'created' status)
 * PUT /api/orders/edit
 *
 * REQUIRES AUTHENTICATION
 * Only the order owner can edit their order
 *
 * Editable fields:
 * - items: modify quantities, remove items
 * - address: update delivery address
 * - delivery_type: change delivery method
 *
 * After editing, delivery cost is recalculated if needed
 */

const { getPool } = require('../../lib/db');
const { success, error, badRequest, unauthorized, methodNotAllowed } = require('../../server/utils/response-helpers');
const { requireUserOrder } = require('../../server/utils/order-queries');
const { USER_EDITABLE_STATUSES, getMigratedStatus, VALID_DELIVERY_TYPES } = require('../../server/utils/order-constants');
const pool = getPool();

/**
 * Record order edit in history
 */
async function recordEditHistory(client, orderId, userId, editType, details) {
  try {
    await client.query(`
      INSERT INTO order_edit_history (order_id, edited_by, editor_user_id, edit_type, edit_details, created_at)
      VALUES ($1, 'user', $2, $3, $4, NOW())
    `, [orderId, userId, editType, JSON.stringify(details)]);
  } catch (err) {
    console.error('Failed to record edit history:', err.message);
  }
}

/**
 * Recalculate order total from items
 */
async function recalculateTotal(client, orderId) {
  const result = await client.query(`
    SELECT COALESCE(SUM(price_at_purchase * quantity), 0) as total
    FROM order_items
    WHERE order_id = $1 AND deleted_by_admin = false
  `, [orderId]);

  return Number(result.rows[0].total);
}

/**
 * Main handler
 */
module.exports = async function handler(req, res) {
  // Support both PUT and POST for compatibility
  if (req.method !== 'PUT' && req.method !== 'POST') {
    return methodNotAllowed(res, ['PUT', 'POST']);
  }

  const client = await pool.connect();

  try {
    // Verify authentication
    if (!req.userId) {
      return unauthorized(res, 'Authentication required');
    }

    const {
      order_id,
      items,           // Array of { item_id, quantity } or { item_id, delete: true }
      address,         // { surname, name, phone, postal_index, address, comment }
      delivery_type,   // New delivery type
      reset_delivery   // If true, reset delivery cost (requires recalculation)
    } = req.body;

    if (!order_id) {
      return badRequest(res, 'order_id is required');
    }

    // Get the order and verify ownership
    const order = await requireUserOrder(pool, order_id, req.userId, res);
    if (!order) return;

    // Check if order can be edited
    const migratedStatus = getMigratedStatus(order.status);
    if (!USER_EDITABLE_STATUSES.includes(migratedStatus)) {
      return badRequest(res, 'Order cannot be edited in current status', {
        current_status: order.status,
        editable_statuses: USER_EDITABLE_STATUSES,
        message: 'Редактирование заказа доступно только в статусе "Оформлен"'
      });
    }

    // Validate delivery_type if provided
    if (delivery_type && !VALID_DELIVERY_TYPES.includes(delivery_type)) {
      return badRequest(res, 'Invalid delivery_type', { valid_types: VALID_DELIVERY_TYPES });
    }

    // Start transaction
    await client.query('BEGIN');

    const changes = [];

    // 1. Update items if provided
    if (items && Array.isArray(items) && items.length > 0) {
      for (const item of items) {
        if (!item.item_id) continue;

        // Verify item belongs to this order
        const itemCheck = await client.query(
          'SELECT id, quantity, title FROM order_items WHERE id = $1 AND order_id = $2',
          [item.item_id, order_id]
        );

        if (itemCheck.rows.length === 0) {
          await client.query('ROLLBACK');
          return badRequest(res, `Item ${item.item_id} not found in order`);
        }

        const existingItem = itemCheck.rows[0];

        if (item.delete) {
          // Mark item as deleted
          await client.query(
            'UPDATE order_items SET deleted_by_admin = true WHERE id = $1',
            [item.item_id]
          );
          changes.push({ type: 'item_removed', item_id: item.item_id, title: existingItem.title });
          await recordEditHistory(client, order_id, req.userId, 'item_removed', {
            item_id: item.item_id,
            title: existingItem.title
          });
        } else if (item.quantity && item.quantity !== existingItem.quantity) {
          // Update quantity
          if (item.quantity < 1) {
            await client.query('ROLLBACK');
            return badRequest(res, 'Quantity must be at least 1');
          }

          await client.query(
            'UPDATE order_items SET quantity = $1 WHERE id = $2',
            [item.quantity, item.item_id]
          );
          changes.push({
            type: 'quantity_changed',
            item_id: item.item_id,
            title: existingItem.title,
            from: existingItem.quantity,
            to: item.quantity
          });
          await recordEditHistory(client, order_id, req.userId, 'quantity_changed', {
            item_id: item.item_id,
            title: existingItem.title,
            from: existingItem.quantity,
            to: item.quantity
          });
        }
      }

      // Verify at least one item remains
      const remainingItems = await client.query(
        'SELECT COUNT(*) as count FROM order_items WHERE order_id = $1 AND deleted_by_admin = false',
        [order_id]
      );

      if (Number(remainingItems.rows[0].count) === 0) {
        await client.query('ROLLBACK');
        return badRequest(res, 'Order must have at least one item');
      }
    }

    // 2. Update address if provided
    if (address) {
      const addressFields = [];
      const addressValues = [];
      let paramCount = 1;

      const allowedFields = ['surname', 'name', 'phone', 'postal_index', 'address', 'comment'];

      for (const field of allowedFields) {
        if (address[field] !== undefined) {
          addressFields.push(`${field} = $${paramCount++}`);
          addressValues.push(address[field]);
        }
      }

      if (addressFields.length > 0) {
        addressValues.push(order_id);
        await client.query(`
          UPDATE order_addresses
          SET ${addressFields.join(', ')}
          WHERE order_id = $${paramCount}
        `, addressValues);

        changes.push({ type: 'address_changed', fields: Object.keys(address) });
        await recordEditHistory(client, order_id, req.userId, 'address_changed', {
          fields: Object.keys(address)
        });
      }
    }

    // 3. Update delivery type if provided
    if (delivery_type && delivery_type !== order.delivery_type) {
      await client.query(
        'UPDATE orders SET delivery_type = $1, updated_at = NOW() WHERE id = $2',
        [delivery_type, order_id]
      );
      changes.push({
        type: 'delivery_changed',
        from: order.delivery_type,
        to: delivery_type
      });
      await recordEditHistory(client, order_id, req.userId, 'delivery_changed', {
        from: order.delivery_type,
        to: delivery_type
      });
    }

    // 4. Recalculate total price
    const newTotal = await recalculateTotal(client, order_id);

    // 5. Reset delivery cost if items/address/delivery changed and reset_delivery is true
    const needsRecalculation = reset_delivery || items || address?.postal_index || delivery_type;

    const updateFields = ['total_price = $1', 'updated_at = NOW()'];
    const updateValues = [newTotal];
    let updateParamCount = 2;

    if (needsRecalculation && reset_delivery) {
      updateFields.push(`delivery_cost = $${updateParamCount++}`);
      updateValues.push(0);
      updateFields.push(`packaging_cost = $${updateParamCount++}`);
      updateValues.push(0);
    }

    updateValues.push(order_id);

    const updateResult = await client.query(`
      UPDATE orders
      SET ${updateFields.join(', ')}
      WHERE id = $${updateParamCount}
      RETURNING *
    `, updateValues);

    const updatedOrder = updateResult.rows[0];

    await client.query('COMMIT');

    // Get updated items
    const itemsResult = await client.query(`
      SELECT oi.*, p.image as product_image
      FROM order_items oi
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = $1 AND oi.deleted_by_admin = false
      ORDER BY oi.id
    `, [order_id]);

    // Get updated address
    const addressResult = await client.query(
      'SELECT * FROM order_addresses WHERE order_id = $1',
      [order_id]
    );

    // Return success
    return success(res, {
      message: 'Order updated successfully',
      changes,
      needs_delivery_recalculation: needsRecalculation && reset_delivery,
      order: {
        id: updatedOrder.id,
        status: updatedOrder.status,
        total_price: updatedOrder.total_price,
        delivery_cost: updatedOrder.delivery_cost,
        packaging_cost: updatedOrder.packaging_cost,
        delivery_type: updatedOrder.delivery_type,
        updated_at: updatedOrder.updated_at
      },
      items: itemsResult.rows.map(item => ({
        id: item.id,
        product_id: item.product_id,
        title: item.title,
        quantity: item.quantity,
        price_at_purchase: item.price_at_purchase,
        property: item.property,
        image: item.image || item.product_image
      })),
      address: addressResult.rows[0] || null
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error editing order:', err);
    return error(res, 'Failed to edit order', 500);
  } finally {
    client.release();
  }
};
