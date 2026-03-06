/**
 * Order Query Helper Functions
 * Provides reusable patterns for common order database queries
 *
 * Standardizes order fetching and validation across the application
 */

const { notFound } = require('./response-helpers');

/**
 * Fetch an order by ID
 *
 * @param {Object} pool - PostgreSQL connection pool
 * @param {number} orderId - Order ID to fetch
 * @returns {Promise<Object|null>} Order object or null if not found
 *
 * @example
 * const order = await fetchOrder(pool, 12345);
 * if (!order) {
 *   return notFound(res, 'Order');
 * }
 */
async function fetchOrder(pool, orderId) {
  const result = await pool.query(
    'SELECT * FROM orders WHERE id = $1',
    [orderId]
  );
  return result.rows[0] || null;
}

/**
 * Require an order to exist (returns 404 if not found)
 * Sends error response automatically if order doesn't exist
 *
 * @param {Object} pool - PostgreSQL connection pool
 * @param {number} orderId - Order ID to fetch
 * @param {Object} res - Express response object
 * @returns {Promise<Object|null>} Order object or null (with response sent)
 *
 * @example
 * const order = await requireOrder(pool, order_id, res);
 * if (!order) return; // Response already sent
 *
 * // Continue with order...
 */
async function requireOrder(pool, orderId, res) {
  const order = await fetchOrder(pool, orderId);
  if (!order) {
    notFound(res, 'Order');
    return null;
  }
  return order;
}

/**
 * Require an order to exist and belong to a specific user
 * Sends 404 response if order not found or doesn't belong to user
 *
 * @param {Object} pool - PostgreSQL connection pool
 * @param {number} orderId - Order ID to fetch
 * @param {number} userId - User ID that must own the order
 * @param {Object} res - Express response object
 * @returns {Promise<Object|null>} Order object or null (with response sent)
 *
 * @example
 * const order = await requireUserOrder(pool, order_id, userId, res);
 * if (!order) return; // Response already sent (404)
 *
 * // Continue with order (guaranteed to belong to user)...
 */
async function requireUserOrder(pool, orderId, userId, res) {
  const result = await pool.query(
    'SELECT * FROM orders WHERE id = $1 AND user_id = $2',
    [orderId, userId]
  );

  if (result.rows.length === 0) {
    notFound(res, 'Order');
    return null;
  }

  return result.rows[0];
}

/**
 * Check if an order exists (boolean check)
 *
 * @param {Object} pool - PostgreSQL connection pool
 * @param {number} orderId - Order ID to check
 * @returns {Promise<boolean>} True if order exists, false otherwise
 *
 * @example
 * const exists = await orderExists(pool, order_id);
 * if (!exists) {
 *   return notFound(res, 'Order');
 * }
 */
async function orderExists(pool, orderId) {
  const result = await pool.query(
    'SELECT id FROM orders WHERE id = $1',
    [orderId]
  );
  return result.rows.length > 0;
}

module.exports = {
  fetchOrder,
  requireOrder,
  requireUserOrder,
  orderExists
};
