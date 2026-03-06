/**
 * Order Parcels Management
 * GET /api/orders/parcels?order_id=123 - Get parcels for an order
 * POST /api/orders/parcels - Calculate and save parcels for an order
 */

const { getPool } = require('../../lib/db');
const { success, error, badRequest, unauthorized, notFound, methodNotAllowed } = require('../../server/utils/response-helpers');
const parcelCalculator = require('../../server/services/shipping/parcel-calculator');

const pool = getPool();

module.exports = async function handler(req, res) {
  // Require authentication
  if (!req.userId) {
    return unauthorized(res, 'Authentication required');
  }

  // Check if admin (for now, just check userId exists)
  // In production, add proper admin role check

  if (req.method === 'GET') {
    return handleGetParcels(req, res);
  } else if (req.method === 'POST') {
    return handleCalculateParcels(req, res);
  } else {
    return methodNotAllowed(res, ['GET', 'POST']);
  }
};

/**
 * Get existing parcels for an order
 */
async function handleGetParcels(req, res) {
  const { order_id } = req.query;

  if (!order_id) {
    return badRequest(res, 'order_id is required');
  }

  try {
    // Get order with items
    const orderResult = await pool.query(`
      SELECT o.id, o.status, o.delivery_type, o.delivery_cost, o.packaging_cost,
             o.tracking_number, o.shipping_code
      FROM orders o
      WHERE o.id = $1 AND o.is_deleted = false
    `, [order_id]);

    if (orderResult.rows.length === 0) {
      return notFound(res, 'Order not found');
    }

    const order = orderResult.rows[0];

    // Get order parcels
    const parcelsResult = await pool.query(`
      SELECT op.*, ops.status as item_status
      FROM order_parcels op
      LEFT JOIN LATERAL (
        SELECT opi.order_parcel_id, COUNT(*) as item_count
        FROM order_parcel_items opi
        WHERE opi.order_parcel_id = op.id
        GROUP BY opi.order_parcel_id
      ) opi_agg ON true
      WHERE op.order_id = $1
      ORDER BY op.created_at ASC
    `, [order_id]);

    // Get items for each parcel
    const parcels = await Promise.all(parcelsResult.rows.map(async (parcel) => {
      const itemsResult = await pool.query(`
        SELECT opi.*, oi.title, oi.property, oi.quantity as order_quantity
        FROM order_parcel_items opi
        JOIN order_items oi ON opi.order_item_id = oi.id
        WHERE opi.order_parcel_id = $1
      `, [parcel.id]);

      return {
        ...parcel,
        items: itemsResult.rows
      };
    }));

    return success(res, {
      order_id,
      tracking_number: order.tracking_number,
      shipping_code: order.shipping_code,
      delivery_type: order.delivery_type,
      delivery_cost: order.delivery_cost,
      packaging_cost: order.packaging_cost,
      parcels
    });

  } catch (err) {
    console.error('Error getting parcels:', err);
    return error(res, 'Failed to get parcels', 500);
  }
}

/**
 * Calculate parcels for an order
 */
async function handleCalculateParcels(req, res) {
  const { order_id, save = false } = req.body;

  if (!order_id) {
    return badRequest(res, 'order_id is required');
  }

  const client = await pool.connect();

  try {
    // Get order items
    const itemsResult = await client.query(`
      SELECT oi.id, oi.product_id, oi.title, oi.property, oi.quantity,
             pp.weight_grams
      FROM order_items oi
      LEFT JOIN products p ON oi.product_id = p.id
      LEFT JOIN product_prices pp ON (
        CASE
          WHEN oi.property LIKE '%A3%' AND oi.property NOT LIKE '%рамк%' THEN pp.id = 1
          WHEN oi.property LIKE '%A2%' AND oi.property NOT LIKE '%рамк%' THEN pp.id = 2
          WHEN oi.property LIKE '%A1%' AND oi.property NOT LIKE '%рамк%' THEN pp.id = 3
          WHEN oi.property LIKE '%A3%' AND oi.property LIKE '%рамк%' THEN pp.id = 4
          WHEN oi.property LIKE '%A2%' AND oi.property LIKE '%рамк%' THEN pp.id = 5
          ELSE false
        END
      )
      WHERE oi.order_id = $1 AND oi.deleted_by_admin = false
    `, [order_id]);

    if (itemsResult.rows.length === 0) {
      return badRequest(res, 'Order has no items');
    }

    // Transform items for parcel calculator
    const orderItems = itemsResult.rows.map(item => {
      const property = item.property || '';
      const format = property.includes('A1') ? 'A1' :
                     property.includes('A2') ? 'A2' : 'A3';
      const hasFrame = property.toLowerCase().includes('рамк');
      const isTriptych = property.includes('3 A') || property.includes('триптих');

      return {
        id: item.id,
        product_id: item.product_id,
        title: item.title,
        quantity: item.quantity,
        format: format,
        has_frame: hasFrame,
        is_triptych: isTriptych,
        weight_grams: item.weight_grams
      };
    });

    // Calculate parcels
    const calculatedParcels = parcelCalculator.calculateParcels(orderItems);

    // If save=true, save parcels to database
    if (save) {
      await client.query('BEGIN');

      // Delete existing parcels
      await client.query('DELETE FROM order_parcels WHERE order_id = $1', [order_id]);

      // Insert new parcels
      for (const parcel of calculatedParcels) {
        const parcelResult = await client.query(`
          INSERT INTO order_parcels (
            order_id, packaging_type, packaging_cost, total_weight,
            length_cm, width_cm, height_cm, status
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
          RETURNING id
        `, [
          order_id,
          parcel.packaging_type,
          parcel.packaging_cost,
          parcel.total_weight,
          parcel.dimensions?.length || null,
          parcel.dimensions?.width || null,
          parcel.dimensions?.height || null
        ]);

        const parcelId = parcelResult.rows[0].id;

        // Insert parcel items
        for (const item of parcel.items) {
          await client.query(`
            INSERT INTO order_parcel_items (order_parcel_id, order_item_id, quantity)
            VALUES ($1, $2, $3)
          `, [parcelId, item.id, item.quantity]);
        }
      }

      // Update order packaging cost
      const totalPackagingCost = calculatedParcels.reduce((sum, p) => sum + Number(p.packaging_cost), 0);
      await client.query(`
        UPDATE orders
        SET packaging_cost = $1, updated_at = NOW()
        WHERE id = $2
      `, [totalPackagingCost, order_id]);

      await client.query('COMMIT');
    }

    // Return calculated parcels
    return success(res, {
      order_id,
      parcels: calculatedParcels,
      total_packaging_cost: calculatedParcels.reduce((sum, p) => sum + p.packaging_cost, 0),
      total_weight: calculatedParcels.reduce((sum, p) => sum + p.total_weight, 0),
      saved: save
    });

  } catch (err) {
    if (save) {
      await client.query('ROLLBACK');
    }
    console.error('Error calculating parcels:', err);
    return error(res, 'Failed to calculate parcels', 500);
  } finally {
    client.release();
  }
}
