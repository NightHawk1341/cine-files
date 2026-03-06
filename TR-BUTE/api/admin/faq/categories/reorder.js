/**
 * FAQ Categories Reorder API (Admin)
 * POST /api/admin/faq/categories/reorder
 * Body: { category_ids: [1, 2, 3, ...] }
 */

const { getPool } = require('../../../../lib/db');
const { success, error, badRequest, methodNotAllowed } = require('../../../../server/utils/response-helpers');

const pool = getPool();

/**
 * Main handler
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  try {
    const { category_ids } = req.body;

    if (!category_ids || !Array.isArray(category_ids) || category_ids.length === 0) {
      return badRequest(res, 'category_ids array is required');
    }

    // Update sort_order for each category
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (let i = 0; i < category_ids.length; i++) {
        await client.query(
          'UPDATE faq_categories SET sort_order = $1 WHERE id = $2',
          [i, category_ids[i]]
        );
      }

      await client.query('COMMIT');

      console.log(`[FAQ] Reordered ${category_ids.length} categories`);

      return success(res, {
        reordered: true,
        count: category_ids.length
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error reordering FAQ categories:', err);
    return error(res, 'Failed to reorder categories', 500);
  }
};
