/**
 * Batch Reorder Product Images Endpoint
 * Sets sort_order for all provided images in a single DB round-trip
 * POST /api/products/images/batch-reorder
 * Body: { table_name, image_ids: [id1, id2, ...] }  (ordered array)
 */

const { getPool } = require('../../../lib/db');
const pool = getPool();
const { validateImageTableName } = require('../../../server/utils/validation');
const { success, error, badRequest, methodNotAllowed } = require('../../../server/utils/response-helpers');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  try {
    const { table_name, image_ids } = req.body;

    if (!Array.isArray(image_ids) || image_ids.length === 0) {
      return badRequest(res, 'image_ids must be a non-empty array');
    }

    const tableValidation = validateImageTableName(table_name);
    if (!tableValidation.valid) {
      return badRequest(res, tableValidation.error);
    }

    // Build a single UPDATE using CASE WHEN for all images at once
    const cases = image_ids.map((id, i) => `WHEN id = ${parseInt(id)} THEN ${i}`).join(' ');
    const ids = image_ids.map(id => parseInt(id));

    await pool.query(
      `UPDATE ${table_name} SET sort_order = CASE ${cases} END WHERE id = ANY($1)`,
      [ids]
    );

    return success(res, { updated: image_ids.length });
  } catch (err) {
    console.error('Error batch reordering images:', err);
    return error(res, 'Failed to batch reorder images', 500, { message: err.message });
  }
};
