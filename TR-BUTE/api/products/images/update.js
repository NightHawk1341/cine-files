/**
 * Update Product Image Endpoint
 * Updates an existing product image
 * POST /api/products/images/update
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
    const { id, url, extra, deprecated, mix, hidden, hidden_product, table_name } = req.body;

    // Validate input
    if (!id) {
      return badRequest(res, 'id is required');
    }

    // Validate table_name
    const tableValidation = validateImageTableName(table_name);
    if (!tableValidation.valid) {
      return badRequest(res, tableValidation.error);
    }

    // Check if image exists
    const checkResult = await pool.query(
      `SELECT id FROM ${table_name} WHERE id = $1`,
      [id]
    );

    if (checkResult.rows.length === 0) {
      return notFound(res, 'Image');
    }

    // Build dynamic update query
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (url !== undefined) {
      updates.push(`url = $${paramCount++}`);
      values.push(url);
    }

    if (extra !== undefined) {
      updates.push(`extra = $${paramCount++}`);
      values.push(extra);
    }

    if (deprecated !== undefined && table_name === 'product_images_2') {
      updates.push(`deprecated = $${paramCount++}`);
      values.push(Boolean(deprecated));
    }

    if (mix !== undefined && table_name === 'product_images') {
      updates.push(`mix = $${paramCount++}`);
      values.push(Boolean(mix));
    }

    if (hidden !== undefined && table_name === 'product_images') {
      updates.push(`hidden = $${paramCount++}`);
      values.push(Boolean(hidden));
    }

    if (hidden_product !== undefined && table_name === 'product_images') {
      updates.push(`hidden_product = $${paramCount++}`);
      values.push(Boolean(hidden_product));
    }

    if (updates.length === 0) {
      return badRequest(res, 'No fields to update');
    }

    // Add ID as last parameter
    values.push(id);

    // Execute update
    const updateQuery = `
      UPDATE ${table_name}
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const updateResult = await pool.query(updateQuery, values);
    const image = updateResult.rows[0];

    return success(res, {
      message: 'Image updated successfully',
      image: image
    });

  } catch (err) {
    console.error('Error updating image:', err);
    return error(res, 'Failed to update image', 500, { message: err.message });
  }
};
