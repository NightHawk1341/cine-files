/**
 * Add Product Image Ref Endpoint
 * Links an existing product_images_2 image to another product (no duplication)
 * POST /api/products/image-refs/add
 */

const { getPool } = require('../../../lib/db');
const pool = getPool();
const { success, error, badRequest, notFound, methodNotAllowed } = require('../../../server/utils/response-helpers');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  try {
    const { product_id, image_id } = req.body;

    if (!product_id || !image_id) {
      return badRequest(res, 'product_id and image_id are required');
    }

    // Verify product exists
    const productResult = await pool.query('SELECT id FROM products WHERE id = $1', [product_id]);
    if (productResult.rows.length === 0) {
      return notFound(res, 'Product');
    }

    // Verify image exists in product_images_2
    const imageResult = await pool.query('SELECT id, product_id FROM product_images_2 WHERE id = $1', [image_id]);
    if (imageResult.rows.length === 0) {
      return notFound(res, 'Image');
    }

    // Prevent linking an image to the product that already owns it
    if (imageResult.rows[0].product_id === parseInt(product_id)) {
      return badRequest(res, 'Cannot link an image to its own product');
    }

    // Get next sort_order for this product's refs
    const sortResult = await pool.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM product_image_refs WHERE product_id = $1',
      [product_id]
    );
    const nextOrder = sortResult.rows[0].next_order;

    const insertResult = await pool.query(
      `INSERT INTO product_image_refs (product_id, image_id, sort_order)
       VALUES ($1, $2, $3)
       ON CONFLICT (product_id, image_id) DO NOTHING
       RETURNING *`,
      [product_id, image_id, nextOrder]
    );

    return success(res, { ref: insertResult.rows[0] || null });
  } catch (err) {
    console.error('Error adding image ref:', err);
    return error(res, 'Failed to add image ref', 500, { message: err.message });
  }
};
