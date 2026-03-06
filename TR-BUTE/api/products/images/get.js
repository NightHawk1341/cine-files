/**
 * Get Product Images Endpoint
 * Fetches all images for a product from both tables
 * GET /api/products/images/get?product_id=123
 */

const { getPool } = require('../../../lib/db');
const { success, error, badRequest, methodNotAllowed } = require('../../../server/utils/response-helpers');

const pool = getPool();

/**
 * Main handler
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET']);
  }

  try {
    const { product_id } = req.query;

    // Validate input
    if (!product_id) {
      return badRequest(res, 'product_id is required');
    }

    // Fetch images from both tables
    const images1Result = await pool.query(
      `SELECT id, url, extra, sort_order, mix, hidden, hidden_product, 'product_images' as table_name
       FROM product_images
       WHERE product_id = $1
       ORDER BY sort_order NULLS LAST, id`,
      [product_id]
    );

    const images2Result = await pool.query(
      `SELECT id, url, extra, sort_order, deprecated, 'product_images_2' as table_name
       FROM product_images_2
       WHERE product_id = $1
       ORDER BY sort_order NULLS LAST, id`,
      [product_id]
    );

    // Also fetch images linked via product_image_refs
    const refsResult = await pool.query(
      `SELECT r.id AS ref_id, r.image_id, r.sort_order,
              pi.url, pi.extra, pi.deprecated, pi.product_id AS source_product_id
       FROM product_image_refs r
       JOIN product_images_2 pi ON pi.id = r.image_id
       WHERE r.product_id = $1
       ORDER BY r.sort_order NULLS LAST, r.id`,
      [product_id]
    );

    // Merge owned and linked images; linked rows have linked=true and ref_id instead of id
    const linkedImages = refsResult.rows.map(r => ({
      ref_id: r.ref_id,
      image_id: r.image_id,
      url: r.url,
      extra: r.extra,
      sort_order: r.sort_order,
      deprecated: r.deprecated,
      linked: true,
      source_product_id: r.source_product_id
    }));

    return success(res, {
      images: {
        product_images: images1Result.rows,
        product_images_2: [...images2Result.rows, ...linkedImages]
      }
    });

  } catch (err) {
    console.error('Error fetching product images:', err);
    return error(res, 'Failed to fetch product images', 500);
  }
};
