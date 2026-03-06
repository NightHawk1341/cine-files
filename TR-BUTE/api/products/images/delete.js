/**
 * Delete Product Image Endpoint
 * Deletes a product image and reorders remaining images
 * POST /api/products/images/delete
 */

const { getPool } = require('../../../lib/db');
const pool = getPool();
const { validateImageTableName } = require('../../../server/utils/validation');
const { success, error, badRequest, notFound, methodNotAllowed } = require('../../../server/utils/response-helpers');

/**
 * Main handler
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  try {
    const { id, table_name } = req.body;

    // Validate input
    if (!id) {
      return badRequest(res, 'id is required');
    }

    // Validate table_name
    const tableValidation = validateImageTableName(table_name);
    if (!tableValidation.valid) {
      return badRequest(res, tableValidation.error);
    }

    // Get image details before deletion
    const imageResult = await pool.query(
      `SELECT product_id, sort_order FROM ${table_name} WHERE id = $1`,
      [id]
    );

    if (imageResult.rows.length === 0) {
      return notFound(res, 'Image');
    }

    const { product_id, sort_order } = imageResult.rows[0];

    // Delete the image
    await pool.query(
      `DELETE FROM ${table_name} WHERE id = $1`,
      [id]
    );

    // Reorder remaining images for this product
    // Decrement sort_order for all images that came after the deleted one
    await pool.query(
      `UPDATE ${table_name}
       SET sort_order = sort_order - 1
       WHERE product_id = $1 AND sort_order > $2`,
      [product_id, sort_order]
    );

    return success(res, {
      message: 'Image deleted successfully'
    });

  } catch (err) {
    console.error('Error deleting image:', err);
    return error(res, 'Failed to delete image', 500, { message: err.message });
  }
};
