/**
 * Search Orders Endpoint (Admin)
 * Search orders by various criteria (admin only)
 * GET /api/orders/search?query=123&status=pending_review
 *
 * Auth is handled by requireAdminAuth middleware on the route.
 */

const { getPool } = require('../../lib/db');
const { success, error, methodNotAllowed } = require('../../server/utils/response-helpers');
const pool = getPool();

/**
 * Build WHERE conditions and values for order search
 * Shared between the search query and count query to avoid duplication.
 */
function buildSearchConditions(status, query) {
  const conditions = [];
  const values = [];
  let paramCount = 1;

  if (status) {
    conditions.push(`o.status = $${paramCount++}`);
    values.push(status);
  }

  if (query) {
    conditions.push(`(
      o.id::text LIKE $${paramCount}
      OR LOWER(u.username) LIKE LOWER($${paramCount})
      OR LOWER(u.first_name) LIKE LOWER($${paramCount})
      OR LOWER(u.last_name) LIKE LOWER($${paramCount})
      OR LOWER(oa.surname) LIKE LOWER($${paramCount})
      OR LOWER(oa.name) LIKE LOWER($${paramCount})
      OR oa.phone LIKE $${paramCount}
      OR LOWER(oa.address) LIKE LOWER($${paramCount})
    )`);
    values.push(`%${query}%`);
    paramCount++;
  }

  return { conditions, values, paramCount };
}

/**
 * Main handler
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET']);
  }

  try {
    const { query, status, limit = 50, offset = 0 } = req.query;
    const parsedLimit = parseInt(limit);
    const parsedOffset = parseInt(offset);

    const { conditions, values, paramCount } = buildSearchConditions(status, query);
    const whereClause = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';

    // Build search query
    const searchQuery = `
      SELECT
        o.id,
        o.user_id,
        o.total_price,
        o.delivery_cost,
        o.delivery_type,
        o.delivery_type_note,
        o.status,
        o.payment_id,
        o.tracking_number,
        o.shipment_date,
        o.delivery_timeframe,
        o.delivery_notes,
        o.processed,
        o.processed_at,
        o.urgent,
        o.address_edited,
        o.custom_product_approved,
        o.packaging_cost,
        o.refund_reason,
        o.cancellation_reason,
        o.last_tracking_status,
        o.last_tracking_update,
        o.tracking_history,
        o.arrived_at_point_at,
        o.storage_deadline,
        o.returned_to_sender_at,
        o.return_action,
        o.created_at,
        o.updated_at,
        o.discount_amount,
        o.promo_code_id,
        pc.code as promo_code,
        u.username,
        u.first_name,
        u.last_name,
        u.login_method,
        CASE WHEN u.is_deleted THEN NULL ELSE u.photo_url END as photo_url,
        oa.surname,
        oa.name as address_name,
        oa.phone,
        oa.postal_index,
        oa.address,
        oa.comment,
        oa.pvz_code,
        oa.pvz_address,
        oa.actual_delivery_info,
        COUNT(oi.id) as item_count
      FROM orders o
      JOIN users u ON o.user_id = u.id
      LEFT JOIN order_addresses oa ON o.id = oa.order_id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN promo_codes pc ON o.promo_code_id = pc.id
      ${whereClause}
      GROUP BY o.id, u.id, oa.id, pc.id
      ORDER BY o.created_at DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;

    const searchValues = [...values, parsedLimit, parsedOffset];

    // Execute search query and count query in parallel
    const countQuery = `
      SELECT COUNT(DISTINCT o.id) as total
      FROM orders o
      JOIN users u ON o.user_id = u.id
      LEFT JOIN order_addresses oa ON o.id = oa.order_id
      ${whereClause}
    `;

    const [searchResult, countResult] = await Promise.all([
      pool.query(searchQuery, searchValues),
      pool.query(countQuery, values)
    ]);

    const orderIds = searchResult.rows.map(o => o.id);

    // Batch-fetch all order items in a single query instead of N+1
    let itemsByOrderId = {};
    if (orderIds.length > 0) {
      const itemsResult = await pool.query(`
        SELECT
          order_id,
          id,
          product_id,
          title,
          quantity,
          price_at_purchase,
          property,
          variation_num,
          image,
          custom_url,
          certificate_id,
          admin_added,
          admin_modified,
          deleted_by_admin
        FROM order_items
        WHERE order_id = ANY($1::int[])
        ORDER BY order_id, id
      `, [orderIds]);

      for (const item of itemsResult.rows) {
        if (!itemsByOrderId[item.order_id]) {
          itemsByOrderId[item.order_id] = [];
        }
        itemsByOrderId[item.order_id].push(item);
      }
    }

    // Map results
    const ordersWithDetails = searchResult.rows.map(order => {
      const totalPrice = Number(order.total_price) || 0;
      const deliveryCost = Number(order.delivery_cost) || 0;

      return {
        id: order.id,
        user_id: order.user_id,
        user: {
          username: order.username,
          first_name: order.first_name,
          last_name: order.last_name,
          photo_url: order.photo_url,
          login_method: order.login_method
        },
        total_price: order.total_price,
        delivery_cost: order.delivery_cost,
        delivery_type: order.delivery_type,
        delivery_type_note: order.delivery_type_note,
        shipment_date: order.shipment_date,
        delivery_timeframe: order.delivery_timeframe,
        delivery_notes: order.delivery_notes,
        processed: order.processed,
        processed_at: order.processed_at,
        urgent: order.urgent,
        address_edited: order.address_edited,
        custom_product_approved: order.custom_product_approved,
        packaging_cost: order.packaging_cost,
        refund_reason: order.refund_reason,
        cancellation_reason: order.cancellation_reason,
        last_tracking_status: order.last_tracking_status,
        last_tracking_update: order.last_tracking_update,
        tracking_history: order.tracking_history,
        arrived_at_point_at: order.arrived_at_point_at,
        storage_deadline: order.storage_deadline,
        returned_to_sender_at: order.returned_to_sender_at,
        return_action: order.return_action,
        total_with_delivery: totalPrice + deliveryCost,
        status: order.status,
        payment_id: order.payment_id,
        tracking_number: order.tracking_number,
        created_at: order.created_at,
        updated_at: order.updated_at,
        address: {
          surname: order.surname,
          name: order.address_name,
          phone: order.phone,
          postal_index: order.postal_index,
          address: order.address,
          comment: order.comment,
          pvz_code: order.pvz_code,
          pvz_address: order.pvz_address,
          actual_delivery_info: order.actual_delivery_info
        },
        items: itemsByOrderId[order.id] || [],
        item_count: parseInt(order.item_count),
        edited: order.address_edited || (itemsByOrderId[order.id] || []).some(
          i => i.admin_added || i.admin_modified || i.deleted_by_admin
        )
      };
    });

    const totalCount = parseInt(countResult.rows[0].total);

    return success(res, {
      count: ordersWithDetails.length,
      total: totalCount,
      limit: parsedLimit,
      offset: parsedOffset,
      orders: ordersWithDetails
    });

  } catch (err) {
    console.error('Error searching orders:', err);
    return error(res, `Failed to search orders: ${err.message}`, 500);
  }
};
