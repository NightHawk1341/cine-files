/**
 * Product Type Links Endpoint
 * Manages 1:1 linking between фирменный and оригинальный products
 *
 * GET /api/products/type-links?product_id=123 - Get the type-linked counterpart
 * POST /api/products/type-links - Create or remove a type link
 *   body: { product_id, linked_product_id }  (linked_product_id: null to remove)
 */

const { getPool } = require('../../lib/db');
const { success, error, badRequest, methodNotAllowed } = require('../../server/utils/response-helpers');
const pool = getPool();

const LINKED_PRODUCT_SELECT = `
  SELECT
    p.id AS product_id,
    p.title,
    p.slug,
    p.type,
    (
      SELECT pi.url
      FROM product_images pi
      WHERE pi.product_id = p.id
        AND (pi.extra IS NULL OR pi.extra NOT IN ('сборка обложки', 'фон'))
      ORDER BY pi.sort_order ASC, pi.id ASC
      LIMIT 1
    ) AS image
  FROM products p
  WHERE p.id = $1
`;

async function getTypeLinkedProduct(productId) {
  const row = await pool.query(`
    SELECT
      CASE
        WHEN firm_product_id = $1 THEN orig_product_id
        ELSE firm_product_id
      END AS counterpart_id
    FROM product_type_links
    WHERE firm_product_id = $1 OR orig_product_id = $1
  `, [productId]);

  if (row.rows.length === 0) return null;

  const counterpartId = row.rows[0].counterpart_id;
  const productResult = await pool.query(LINKED_PRODUCT_SELECT, [counterpartId]);
  return productResult.rows[0] || null;
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    const productId = parseInt(req.query.product_id);
    if (!productId) return badRequest(res, 'product_id is required');

    try {
      const linked = await getTypeLinkedProduct(productId);
      return success(res, { linked_product: linked });
    } catch (err) {
      console.error('Error getting type-linked product:', err);
      return error(res, 'Failed to get type-linked product', 500);
    }
  }

  if (req.method === 'POST') {
    const { product_id, linked_product_id } = req.body;
    if (!product_id) return badRequest(res, 'product_id is required');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Remove any existing type link for this product
      await client.query(`
        DELETE FROM product_type_links
        WHERE firm_product_id = $1 OR orig_product_id = $1
      `, [product_id]);

      if (linked_product_id) {
        // Also remove any existing type link for the target product
        await client.query(`
          DELETE FROM product_type_links
          WHERE firm_product_id = $1 OR orig_product_id = $1
        `, [linked_product_id]);

        // Determine which is firm and which is orig
        const productsResult = await client.query(`
          SELECT id, type FROM products WHERE id = ANY($1)
        `, [[product_id, linked_product_id]]);

        const productMap = {};
        for (const row of productsResult.rows) {
          productMap[row.id] = row.type;
        }

        const typeA = productMap[product_id];
        const typeB = productMap[linked_product_id];

        let firmId, origId;
        if (typeA === 'фирменный') {
          firmId = product_id;
          origId = linked_product_id;
        } else if (typeB === 'фирменный') {
          firmId = linked_product_id;
          origId = product_id;
        } else {
          // Fallback: treat product_id as firm
          firmId = product_id;
          origId = linked_product_id;
        }

        await client.query(`
          INSERT INTO product_type_links (firm_product_id, orig_product_id)
          VALUES ($1, $2)
        `, [firmId, origId]);
      }

      await client.query('COMMIT');

      const linked = linked_product_id ? await getTypeLinkedProduct(product_id) : null;
      return success(res, {
        message: linked_product_id ? 'Type link created' : 'Type link removed',
        linked_product: linked
      });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error updating type link:', err);
      return error(res, 'Failed to update type link', 500);
    } finally {
      client.release();
    }
  }

  return methodNotAllowed(res, ['GET', 'POST']);
};
