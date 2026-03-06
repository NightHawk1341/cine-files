/**
 * Product Links Endpoint
 * Manages product linking (variants) system
 *
 * GET /api/products/links?product_id=123 - Get all linked products for a product
 * POST /api/products/links - Update product links
 */

const { getPool } = require('../../lib/db');
const { success, error, badRequest, methodNotAllowed } = require('../../server/utils/response-helpers');
const pool = getPool();

/**
 * Get linked products for a given product
 */
async function getLinkedProducts(productId) {
  // First, find the link group for this product
  const groupResult = await pool.query(`
    SELECT group_id FROM product_link_items WHERE product_id = $1
  `, [productId]);

  if (groupResult.rows.length === 0) {
    return [];
  }

  const groupId = groupResult.rows[0].group_id;

  // Get all products in this group with their details (including variant_name)
  const linkedResult = await pool.query(`
    SELECT
      pli.product_id,
      pli.sort_order,
      pli.variant_name,
      pli.variant_excluded,
      p.title,
      p.slug,
      p.status,
      p.price,
      p.old_price,
      p.discount,
      p.type,
      p.genre,
      p.triptych,
      p.alt,
      p.key_word,
      (
        SELECT pi.url
        FROM product_images pi
        WHERE pi.product_id = p.id
          AND (pi.extra IS NULL OR pi.extra NOT IN ('сборка обложки', 'фон'))
        ORDER BY pi.sort_order ASC, pi.id ASC
        LIMIT 1
      ) as image
    FROM product_link_items pli
    JOIN products p ON p.id = pli.product_id
    WHERE pli.group_id = $1
    ORDER BY pli.sort_order ASC, pli.id ASC
  `, [groupId]);

  return linkedResult.rows;
}

/**
 * Get all product link groups with their products (for public variant dropdown feature)
 * Returns a map-friendly structure: { groups: [{ products: [...] }] }
 */
async function getAllLinkedProducts() {
  const result = await pool.query(`
    SELECT
      pli.group_id,
      pli.product_id,
      pli.sort_order,
      pli.variant_name,
      pli.variant_excluded,
      p.title,
      p.slug,
      p.status,
      p.price,
      p.old_price,
      p.discount,
      p.type,
      p.genre,
      p.triptych,
      p.alt,
      p.key_word,
      (
        SELECT pi.url
        FROM product_images pi
        WHERE pi.product_id = p.id
          AND (pi.extra IS NULL OR pi.extra NOT IN ('сборка обложки', 'фон'))
        ORDER BY pi.sort_order ASC, pi.id ASC
        LIMIT 1
      ) as image
    FROM product_link_items pli
    JOIN products p ON p.id = pli.product_id
    ORDER BY pli.group_id ASC, pli.sort_order ASC, pli.id ASC
  `);

  // Group by group_id
  const groupsMap = new Map();
  for (const row of result.rows) {
    if (!groupsMap.has(row.group_id)) {
      groupsMap.set(row.group_id, []);
    }
    groupsMap.get(row.group_id).push(row);
  }

  // Convert to array and filter groups with at least 2 products
  const groups = Array.from(groupsMap.values()).filter(g => g.length > 1);

  return groups;
}

/**
 * Main handler
 */
module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    // Check if requesting all links (for variant dropdown feature)
    if (req.query.all === 'true') {
      try {
        const groups = await getAllLinkedProducts();
        return success(res, { groups });
      } catch (err) {
        console.error('Error getting all linked products:', err);
        return error(res, 'Failed to get all linked products', 500);
      }
    }

    // Get linked products for a specific product
    const productId = parseInt(req.query.product_id);

    if (!productId) {
      return badRequest(res, 'Product ID is required');
    }

    try {
      const linkedProducts = await getLinkedProducts(productId);
      return success(res, {
        linked_products: linkedProducts,
        group_id: linkedProducts.length > 0 ? linkedProducts[0].group_id : null
      });
    } catch (err) {
      console.error('Error getting linked products:', err);
      return error(res, 'Failed to get linked products', 500);
    }
  }

  if (req.method === 'POST') {
    // Update product links (with optional variant_names)
    const { product_id, linked_product_ids, variant_names, variant_excluded_ids } = req.body;

    if (!product_id) {
      return badRequest(res, 'Product ID is required');
    }

    if (!Array.isArray(linked_product_ids)) {
      return badRequest(res, 'linked_product_ids must be an array');
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get current group for this product (if any)
      const currentGroupResult = await client.query(`
        SELECT group_id FROM product_link_items WHERE product_id = $1
      `, [product_id]);

      const currentGroupId = currentGroupResult.rows.length > 0
        ? currentGroupResult.rows[0].group_id
        : null;

      // If no linked products provided, remove product from its group
      if (linked_product_ids.length === 0) {
        if (currentGroupId) {
          // Remove this product from the group
          await client.query(`
            DELETE FROM product_link_items WHERE product_id = $1
          `, [product_id]);

          // Check if the group is now empty or has only one product
          const remainingResult = await client.query(`
            SELECT COUNT(*) as count FROM product_link_items WHERE group_id = $1
          `, [currentGroupId]);

          const remaining = parseInt(remainingResult.rows[0].count);

          if (remaining === 0) {
            // Delete empty group
            await client.query(`
              DELETE FROM product_link_groups WHERE id = $1
            `, [currentGroupId]);
          } else if (remaining === 1) {
            // If only one product remains, remove it too and delete the group
            await client.query(`
              DELETE FROM product_link_items WHERE group_id = $1
            `, [currentGroupId]);
            await client.query(`
              DELETE FROM product_link_groups WHERE id = $1
            `, [currentGroupId]);
          }
        }

        await client.query('COMMIT');
        return success(res, {
          message: 'Product links removed',
          linked_products: []
        });
      }

      // Use the order provided by the client (which includes the current product in position).
      // If the client omitted the current product for some reason, append it at the end.
      const base = [...new Set(linked_product_ids)];
      const allProductIds = base.includes(product_id) ? base : [...base, product_id];

      // Get existing groups for all involved products
      const existingGroupsResult = await client.query(`
        SELECT DISTINCT group_id FROM product_link_items
        WHERE product_id = ANY($1)
      `, [allProductIds]);

      const existingGroupIds = existingGroupsResult.rows.map(r => r.group_id);

      let targetGroupId;

      if (existingGroupIds.length === 0) {
        // No existing groups, create a new one
        const newGroupResult = await client.query(`
          INSERT INTO product_link_groups DEFAULT VALUES RETURNING id
        `);
        targetGroupId = newGroupResult.rows[0].id;
      } else {
        // Use the first existing group and merge others
        targetGroupId = existingGroupIds[0];

        // Move all items from other groups to this group
        if (existingGroupIds.length > 1) {
          await client.query(`
            UPDATE product_link_items
            SET group_id = $1
            WHERE group_id = ANY($2) AND group_id != $1
          `, [targetGroupId, existingGroupIds]);

          // Delete empty groups
          await client.query(`
            DELETE FROM product_link_groups
            WHERE id = ANY($1) AND id != $2
          `, [existingGroupIds, targetGroupId]);
        }
      }

      // Remove all products that should no longer be in this group
      await client.query(`
        DELETE FROM product_link_items
        WHERE group_id = $1 AND product_id != ALL($2)
      `, [targetGroupId, allProductIds]);

      // Upsert all products with their sort order and optional variant names
      const excludedSet = new Set(Array.isArray(variant_excluded_ids) ? variant_excluded_ids.map(Number) : []);
      for (let i = 0; i < allProductIds.length; i++) {
        const pid = allProductIds[i];
        // variant_names is an object { productId: name } or undefined
        const variantName = variant_names?.[pid] ?? null;
        const variantExcluded = excludedSet.has(pid);
        await client.query(`
          INSERT INTO product_link_items (group_id, product_id, sort_order, variant_name, variant_excluded)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (product_id)
          DO UPDATE SET group_id = $1, sort_order = $3, variant_name = $4, variant_excluded = $5
        `, [targetGroupId, pid, i, variantName, variantExcluded]);
      }

      await client.query('COMMIT');

      // Fetch updated linked products
      const linkedProducts = await getLinkedProducts(product_id);

      return success(res, {
        message: 'Product links updated',
        group_id: targetGroupId,
        linked_products: linkedProducts
      });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error updating product links:', err);
      return error(res, 'Failed to update product links', 500);
    } finally {
      client.release();
    }
  }

  return methodNotAllowed(res, ['GET', 'POST']);
};
