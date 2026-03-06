/**
 * Add Order Item Endpoint
 * Adds a new item to an existing order
 * POST /api/orders/items/add
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
    const {
      order_id,
      product_id,
      title,
      quantity,
      price_at_purchase,
      property,
      variation_num,
      image
    } = req.body;

    // Validate input
    if (!order_id) {
      return badRequest(res, 'order_id is required');
    }

    if (!product_id || !title || !quantity || quantity < 1 || !property ||
        (price_at_purchase === undefined || price_at_purchase === null)) {
      return badRequest(res, 'Missing required fields: product_id, title, quantity, price_at_purchase, property');
    }

    // Verify order exists
    const order = await requireOrder(pool, order_id, res);
    if (!order) return; // Response already sent

    // Verify product exists
    const productResult = await pool.query(
      'SELECT id FROM products WHERE id = $1',
      [product_id]
    );

    if (productResult.rows.length === 0) {
      return notFound(res, 'Product');
    }

    // Calculate item total price
    const itemTotalPrice = price_at_purchase * quantity;

    // Insert new order item
    const itemResult = await pool.query(`
      INSERT INTO order_items (
        order_id,
        product_id,
        title,
        quantity,
        price_at_purchase,
        property,
        variation_num,
        image,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING *
    `, [order_id, product_id, title, quantity, price_at_purchase, property, variation_num, image]);

    const newItem = itemResult.rows[0];

    // Recalculate order total price
    const newTotalPrice = order.total_price + itemTotalPrice;

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
      message: 'Item added to order',
      item: {
        id: newItem.id,
        product_id: newItem.product_id,
        title: newItem.title,
        quantity: newItem.quantity,
        price_at_purchase: newItem.price_at_purchase,
        property: newItem.property,
        variation_num: newItem.variation_num,
        image: newItem.image
      },
      order: {
        id: updatedOrder.id,
        total_price: updatedOrder.total_price,
        updated_at: updatedOrder.updated_at
      }
    });

  } catch (err) {
    console.error('Error adding order item:', err);
    return error(res, 'Failed to add order item', 500);
  }
};
