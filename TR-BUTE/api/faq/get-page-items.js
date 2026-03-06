/**
 * Get FAQ Items for a specific page
 * Returns FAQ items tagged to appear on a given page (via show_on_pages column)
 * GET /api/faq/get-page-items?page=cart
 */

const { getPool } = require('../../lib/db');
const { success, error, badRequest, methodNotAllowed } = require('../../server/utils/response-helpers');

const pool = getPool();

const VALID_PAGES = ['cart', 'picker', 'profile', 'order', 'checkout'];

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET']);
  }

  try {
    const { page } = req.query;

    if (!page || !VALID_PAGES.includes(page)) {
      return badRequest(res, `page must be one of: ${VALID_PAGES.join(', ')}`);
    }

    const result = await pool.query(`
      SELECT i.id, i.question, i.answer, i.image_url,
             c.title as category_title, c.icon as category_icon
      FROM faq_items i
      JOIN faq_categories c ON i.category_id = c.id
      WHERE i.show_on_pages IS NOT NULL
        AND $1 = ANY(i.show_on_pages)
      ORDER BY i.sort_order ASC
    `, [page]);

    return success(res, { items: result.rows });

  } catch (err) {
    console.error('Error fetching page FAQ items:', err);
    return error(res, 'Failed to fetch FAQ items', 500);
  }
};
