/**
 * FAQ Items Reorder API (Admin)
 * POST /api/admin/faq/items/reorder
 * Body: { category_id: number, item_ids: [1, 2, 3, ...] }
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
    const { category_id, item_ids } = req.body;

    if (!category_id) {
      return badRequest(res, 'category_id is required');
    }

    if (!item_ids || !Array.isArray(item_ids) || item_ids.length === 0) {
      return badRequest(res, 'item_ids array is required');
    }

    // Update sort_order for each item
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (let i = 0; i < item_ids.length; i++) {
        await client.query(
          'UPDATE faq_items SET sort_order = $1 WHERE id = $2 AND category_id = $3',
          [i, item_ids[i], category_id]
        );
      }

      await client.query('COMMIT');

      console.log(`[FAQ] Reordered ${item_ids.length} items in category #${category_id}`);

      return success(res, {
        reordered: true,
        count: item_ids.length
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error reordering FAQ items:', err);
    return error(res, 'Failed to reorder items', 500);
  }
};
