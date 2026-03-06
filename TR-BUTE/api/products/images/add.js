/**
 * Add Product Image Endpoint
 * Adds a new image to a product
 * POST /api/products/images/add
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
    const { product_id, url, extra, deprecated, mix, hidden, hidden_product, table_name } = req.body;

    // Validate input
    if (!product_id || !url) {
      return badRequest(res, 'product_id and url are required');
    }

    // Validate table_name
    const tableValidation = validateImageTableName(table_name);
    if (!tableValidation.valid) {
      return badRequest(res, tableValidation.error);
    }

    // Check if product exists
    const productResult = await pool.query(
      'SELECT id FROM products WHERE id = $1',
      [product_id]
    );

    if (productResult.rows.length === 0) {
      return notFound(res, 'Product');
    }

    // Get the next sort_order for this product
    const sortOrderResult = await pool.query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order
       FROM ${table_name}
       WHERE product_id = $1`,
      [product_id]
    );

    const nextOrder = sortOrderResult.rows[0].next_order;

    // Insert the image
    const isImages2 = table_name === 'product_images_2';
    const insertQuery = isImages2
      ? `INSERT INTO ${table_name} (product_id, url, extra, sort_order, deprecated) VALUES ($1, $2, $3, $4, $5) RETURNING *`
      : `INSERT INTO ${table_name} (product_id, url, extra, sort_order, mix, hidden, hidden_product) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`;

    const insertParams = isImages2
      ? [product_id, url, extra || null, nextOrder, Boolean(deprecated)]
      : [product_id, url, extra || null, nextOrder, Boolean(mix), Boolean(hidden), Boolean(hidden_product)];

    const insertResult = await pool.query(insertQuery, insertParams);

    const image = insertResult.rows[0];

    return success(res, {
      message: 'Image added successfully',
      image: image
    });

  } catch (err) {
    console.error('Error adding image:', err);
    return error(res, 'Failed to add image', 500, { message: err.message });
  }
};
