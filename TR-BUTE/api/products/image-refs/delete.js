/**
 * Delete Product Image Ref Endpoint
 * Removes a link between a product and an image in product_images_2
 * POST /api/products/image-refs/delete
 */

const { getPool } = require('../../../lib/db');
const pool = getPool();
const { success, error, badRequest, notFound, methodNotAllowed } = require('../../../server/utils/response-helpers');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  try {
    const { ref_id } = req.body;

    if (!ref_id) {
      return badRequest(res, 'ref_id is required');
    }

    const result = await pool.query(
      'DELETE FROM product_image_refs WHERE id = $1 RETURNING id',
      [ref_id]
    );

    if (result.rows.length === 0) {
      return notFound(res, 'Image ref');
    }

    return success(res, { deleted: true });
  } catch (err) {
    console.error('Error deleting image ref:', err);
    return error(res, 'Failed to delete image ref', 500, { message: err.message });
  }
};
