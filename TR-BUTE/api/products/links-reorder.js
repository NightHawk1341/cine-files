/**
 * Reorder Products Within a Link Group
 * Updates product_link_items.sort_order for a given group
 * POST /api/products/links/reorder
 *
 * Body: { group_id, ordered_product_ids }
 */

const { getPool } = require('../../lib/db');
const { success, error, badRequest, methodNotAllowed } = require('../../server/utils/response-helpers');
const pool = getPool();

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  try {
    const { group_id, ordered_product_ids } = req.body;

    if (!group_id || !Array.isArray(ordered_product_ids) || ordered_product_ids.length === 0) {
      return badRequest(res, 'group_id and ordered_product_ids array are required');
    }

    const groupId = parseInt(group_id);

    // Verify the group exists and all product IDs belong to it
    const groupCheck = await pool.query(
      'SELECT product_id FROM product_link_items WHERE group_id = $1',
      [groupId]
    );

    if (groupCheck.rows.length === 0) {
      return badRequest(res, 'Group not found');
    }

    const groupProductIds = new Set(groupCheck.rows.map(r => r.product_id));
    for (const pid of ordered_product_ids) {
      if (!groupProductIds.has(parseInt(pid))) {
        return badRequest(res, `Product ${pid} does not belong to group ${groupId}`);
      }
    }

    // Update sort_order for each product in the specified order
    const updates = ordered_product_ids.map((pid, index) =>
      pool.query(
        'UPDATE product_link_items SET sort_order = $1 WHERE group_id = $2 AND product_id = $3',
        [index, groupId, parseInt(pid)]
      )
    );

    await Promise.all(updates);

    return success(res, {
      message: 'Link group reordered successfully',
      group_id: groupId,
      ordered_product_ids
    });

  } catch (err) {
    console.error('Error reordering link group:', err);
    return error(res, 'Failed to reorder link group', 500);
  }
};
