/**
 * Shipment Calendar Endpoint
 * Get orders grouped by shipment date for admin calendar view
 * GET /api/admin/shipments/calendar
 *
 * Query params:
 * - month: YYYY-MM format (default: current month)
 * - date: YYYY-MM-DD format (get orders for specific date)
 *
 * REQUIRES ADMIN AUTHENTICATION
 */

const { getPool } = require('../../../lib/db');
const { success, error, badRequest, unauthorized, methodNotAllowed } = require('../../../server/utils/response-helpers');
const { STATUS_DISPLAY_NAMES, STATUS_COLORS } = require('../../../server/utils/order-constants');
const pool = getPool();

/**
 * Main handler
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET']);
  }

  // Verify admin authentication
  if (!req.adminUser) {
    return unauthorized(res, 'Admin authentication required');
  }

  try {
    const { month, date } = req.query;

    // If specific date is requested, return orders for that date
    if (date) {
      return getOrdersForDate(res, date);
    }

    // Otherwise, return calendar data for the month
    return getCalendarData(res, month);

  } catch (err) {
    console.error('Error fetching calendar data:', err);
    return error(res, 'Failed to fetch calendar data', 500);
  }
};

/**
 * Get orders for a specific date
 */
async function getOrdersForDate(res, date) {
  // Validate date format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) {
    return badRequest(res, 'Invalid date format. Use YYYY-MM-DD');
  }

  const result = await pool.query(`
    SELECT
      o.id,
      o.status,
      o.batch_status,
      o.total_price,
      o.delivery_cost,
      o.delivery_type,
      o.tracking_number,
      o.shipment_date,
      o.created_at,
      u.first_name,
      u.last_name,
      u.username,
      oa.name as recipient_name,
      oa.surname as recipient_surname,
      oa.address,
      oa.postal_index
    FROM orders o
    LEFT JOIN users u ON o.user_id = u.id
    LEFT JOIN order_addresses oa ON o.id = oa.order_id
    WHERE o.shipment_date = $1
      AND o.is_deleted = false
      AND o.status IN ('paid', 'confirmed', 'shipped')
    ORDER BY o.batch_status DESC NULLS LAST, o.created_at ASC
  `, [date]);

  const orders = result.rows.map(order => ({
    id: order.id,
    status: order.status,
    status_display: STATUS_DISPLAY_NAMES[order.status] || order.status,
    status_color: STATUS_COLORS[order.status] || { bg: '#9E9E9E', text: '#fff' },
    batch_status: order.batch_status,
    batch_ready: order.batch_status === 'ready',
    total_price: order.total_price,
    delivery_cost: order.delivery_cost,
    delivery_type: order.delivery_type,
    tracking_number: order.tracking_number,
    created_at: order.created_at,
    customer_name: [order.first_name, order.last_name].filter(Boolean).join(' ') || order.username,
    recipient_name: [order.recipient_name, order.recipient_surname].filter(Boolean).join(' '),
    address: order.address,
    postal_index: order.postal_index
  }));

  // Count by batch status
  const readyCount = orders.filter(o => o.batch_ready).length;
  const notReadyCount = orders.filter(o => o.batch_status === 'not_ready').length;
  const pendingCount = orders.filter(o => !o.batch_status).length;

  return success(res, {
    date,
    orders,
    summary: {
      total: orders.length,
      ready: readyCount,
      not_ready: notReadyCount,
      pending: pendingCount
    }
  });
}

/**
 * Get calendar data for a month
 */
async function getCalendarData(res, month) {
  // Default to current month
  let startDate, endDate;

  if (month) {
    const monthRegex = /^\d{4}-\d{2}$/;
    if (!monthRegex.test(month)) {
      return badRequest(res, 'Invalid month format. Use YYYY-MM');
    }
    startDate = `${month}-01`;
    // Get last day of month
    const [year, mon] = month.split('-').map(Number);
    endDate = new Date(year, mon, 0).toISOString().split('T')[0];
  } else {
    const now = new Date();
    startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  }

  // Get order counts grouped by shipment_date
  const result = await pool.query(`
    SELECT
      shipment_date::text as date,
      COUNT(*) as total_orders,
      COUNT(*) FILTER (WHERE batch_status = 'ready') as ready_count,
      COUNT(*) FILTER (WHERE batch_status = 'not_ready') as not_ready_count,
      COUNT(*) FILTER (WHERE batch_status IS NULL) as pending_count
    FROM orders
    WHERE shipment_date BETWEEN $1 AND $2
      AND is_deleted = false
      AND status IN ('paid', 'confirmed', 'shipped')
    GROUP BY shipment_date
    ORDER BY shipment_date
  `, [startDate, endDate]);

  // Get current shipment settings (with optional end date for period)
  // Handle gracefully if next_shipment_date_end column doesn't exist yet
  let nextShipmentDate = null;
  let nextShipmentDateEnd = null;

  try {
    const settingsResult = await pool.query(`
      SELECT
        next_shipment_date::text as next_shipment_date,
        next_shipment_date_end::text as next_shipment_date_end
      FROM shipment_settings
      ORDER BY id DESC
      LIMIT 1
    `);
    nextShipmentDate = settingsResult.rows[0]?.next_shipment_date || null;
    nextShipmentDateEnd = settingsResult.rows[0]?.next_shipment_date_end || null;
  } catch (err) {
    if (err.message && err.message.includes('next_shipment_date_end')) {
      // Column doesn't exist, query without it
      const settingsResult = await pool.query(`
        SELECT next_shipment_date::text as next_shipment_date
        FROM shipment_settings
        ORDER BY id DESC
        LIMIT 1
      `);
      nextShipmentDate = settingsResult.rows[0]?.next_shipment_date || null;
    } else {
      throw err;
    }
  }

  // Build calendar data
  const calendarDays = {};
  for (const row of result.rows) {
    // Check if date is within shipment period
    const isInShipmentPeriod = nextShipmentDate && (
      row.date === nextShipmentDate ||
      (nextShipmentDateEnd && row.date >= nextShipmentDate && row.date <= nextShipmentDateEnd)
    );

    calendarDays[row.date] = {
      date: row.date,
      total: Number(row.total_orders),
      ready: Number(row.ready_count),
      not_ready: Number(row.not_ready_count),
      pending: Number(row.pending_count),
      is_next_shipment: isInShipmentPeriod
    };
  }

  return success(res, {
    start_date: startDate,
    end_date: endDate,
    next_shipment_date: nextShipmentDate,
    next_shipment_date_end: nextShipmentDateEnd,
    days: calendarDays,
    // Also return as array for easier iteration
    days_list: Object.values(calendarDays)
  });
}
