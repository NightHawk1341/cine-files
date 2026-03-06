/**
 * Reorder Product Images Endpoint
 * Updates the sort_order of images within a product
 * POST /api/products/images/reorder
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
    const { image_id, new_position, table_name } = req.body;

    // Validate input
    if (!image_id || new_position === undefined) {
      return badRequest(res, 'image_id and new_position are required');
    }

    // Validate table_name
    const tableValidation = validateImageTableName(table_name);
    if (!tableValidation.valid) {
      return badRequest(res, tableValidation.error);
    }

    // Get the image to be moved
    const imageResult = await pool.query(
      `SELECT id, product_id, sort_order FROM ${table_name} WHERE id = $1`,
      [image_id]
    );

    if (imageResult.rows.length === 0) {
      return notFound(res, 'Image');
    }

    const image = imageResult.rows[0];

    // Get all images for this product sorted by current order
    const allImagesResult = await pool.query(
      `SELECT id, sort_order FROM ${table_name}
       WHERE product_id = $1
       ORDER BY sort_order NULLS LAST, id`,
      [image.product_id]
    );

    const images = allImagesResult.rows;
    const imageIndex = images.findIndex(img => img.id === parseInt(image_id));

    if (imageIndex === -1) {
      return notFound(res, 'Image in product');
    }

    // Validate new_position
    if (new_position < 0 || new_position >= images.length) {
      return badRequest(res, `new_position must be between 0 and ${images.length - 1}`);
    }

    // Reorder the array
    const [movedImage] = images.splice(imageIndex, 1);
    images.splice(new_position, 0, movedImage);

    // Update sort_order for all images in this product
    const updatePromises = images.map((img, index) =>
      pool.query(
        `UPDATE ${table_name} SET sort_order = $1 WHERE id = $2`,
        [index, img.id]
      )
    );

    await Promise.all(updatePromises);

    return success(res, {
      message: 'Images reordered successfully'
    });

  } catch (err) {
    console.error('Error reordering images:', err);
    return error(res, 'Failed to reorder images', 500, { message: err.message });
  }
};
