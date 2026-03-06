/**
 * Get FAQ Items
 * Returns FAQ items for a specific category
 * GET /api/faq/get-items?category_id=1
 */

const { getPool } = require('../../lib/db');
const { success, error, badRequest, methodNotAllowed } = require('../../server/utils/response-helpers');

const pool = getPool();

/**
 * Main handler
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET']);
  }

  try {
    const { category_id } = req.query;

    // Validate input
    if (!category_id) {
      return badRequest(res, 'category_id is required');
    }

    const result = await pool.query(`
      SELECT id, category_id, question, answer, image_url, sort_order, show_on_pages
      FROM faq_items
      WHERE category_id = $1
      ORDER BY sort_order ASC
    `, [category_id]);

    return success(res, { items: result.rows });

  } catch (err) {
    console.error('Error fetching FAQ items:', err);
    return error(res, 'Failed to fetch FAQ items', 500);
  }
};
