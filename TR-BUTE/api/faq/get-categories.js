/**
 * Get FAQ Categories
 * Returns all FAQ categories sorted by sort_order
 * GET /api/faq/get-categories
 */

const { getPool } = require('../../lib/db');
const { success, error, methodNotAllowed } = require('../../server/utils/response-helpers');

const pool = getPool();

/**
 * Main handler
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET']);
  }

  try {
    const result = await pool.query(`
      SELECT id, title, icon, sort_order
      FROM faq_categories
      ORDER BY sort_order ASC
    `);

    return success(res, { categories: result.rows });

  } catch (err) {
    console.error('Error fetching FAQ categories:', err);
    return error(res, 'Failed to fetch FAQ categories', 500);
  }
};
