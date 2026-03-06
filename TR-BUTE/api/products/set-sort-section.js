/**
 * Set Product Sort Section Endpoint
 * Moves a product between manual and alphabetical sort sections
 * POST /api/products/set-sort-section
 *
 * Manual section: products manually ordered at the top of the list
 * Alphabetical section: below the manual section divider
 *
 * When moving TO alphabetical: the product is inserted at the correct
 * alphabetical position (0-9, А-Я, A-Z) among existing alphabetical products.
 * After placement, the admin can still reorder within the section freely.
 *
 * When moving TO manual: the product is placed at the end of the manual section
 * (or at a specified position via manual_position).
 */

const { getPool } = require('../../lib/db');
const { success, error, badRequest, methodNotAllowed } = require('../../server/utils/response-helpers');
const pool = getPool();

/**
 * Custom alphabetical comparator for product titles.
 * Order: 0-9, А-Я, A-Z with special rule:
 * фирменный products (title ends with " [/]") sort before оригинальный
 * when their base titles are the same.
 */
function alphabeticalCompare(titleA, titleB) {
  const rawA = (titleA || '').toLowerCase();
  const rawB = (titleB || '').toLowerCase();

  // Strip [/] suffix to get base title for comparison
  const a = rawA.replace(/ \[\/\]$/, '');
  const b = rawB.replace(/ \[\/\]$/, '');

  const aIsFirm = rawA.endsWith(' [/]');
  const bIsFirm = rawB.endsWith(' [/]');

  // Same base title: фирменный ([/]) comes before оригинальный
  if (a === b) {
    if (aIsFirm && !bIsFirm) return -1;
    if (!aIsFirm && bIsFirm) return 1;
  }

  return a.localeCompare(b, 'ru');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  try {
    const { product_id, group_id, section, manual_position } = req.body;

    if (!section) {
      return badRequest(res, 'section is required');
    }

    if (section !== 'manual' && section !== 'alphabetical') {
      return badRequest(res, 'section must be "manual" or "alphabetical"');
    }

    // Resolve the set of product IDs to move
    let movingProducts;

    if (group_id) {
      // Move all products in the link group together
      const groupResult = await pool.query(
        `SELECT p.id, p.title, p.is_manual_sort
         FROM product_link_items pli
         JOIN products p ON p.id = pli.product_id
         WHERE pli.group_id = $1
         ORDER BY pli.sort_order ASC, pli.id ASC`,
        [parseInt(group_id)]
      );

      if (groupResult.rows.length === 0) {
        return badRequest(res, 'Group not found or empty');
      }

      movingProducts = groupResult.rows;
    } else if (product_id) {
      const productResult = await pool.query(
        'SELECT id, title, is_manual_sort FROM products WHERE id = $1',
        [parseInt(product_id)]
      );

      if (productResult.rows.length === 0) {
        return badRequest(res, 'Product not found');
      }

      movingProducts = productResult.rows;
    } else {
      return badRequest(res, 'product_id or group_id is required');
    }

    const movingIds = new Set(movingProducts.map(p => p.id));
    const isManual = section === 'manual';

    // Get all products grouped by section, ordered by sort_order, excluding moving products
    const allResult = await pool.query(
      'SELECT id, title, sort_order, is_manual_sort FROM products ORDER BY sort_order ASC NULLS LAST, id ASC'
    );

    const manualProducts = allResult.rows.filter(p => p.is_manual_sort !== false && !movingIds.has(p.id));
    const alphaProducts = allResult.rows.filter(p => p.is_manual_sort === false && !movingIds.has(p.id));

    if (isManual) {
      // Moving to manual section - insert group at end (or specified position)
      const pos = (manual_position !== undefined)
        ? Math.max(0, Math.min(parseInt(manual_position), manualProducts.length))
        : manualProducts.length;

      manualProducts.splice(pos, 0, ...movingProducts);
    } else {
      // Moving to alphabetical section - use title of first product for placement
      const representativeTitle = movingProducts[0].title;
      const insertIndex = alphaProducts.findIndex(p => alphabeticalCompare(representativeTitle, p.title) <= 0);
      if (insertIndex === -1) {
        alphaProducts.push(...movingProducts);
      } else {
        alphaProducts.splice(insertIndex, 0, ...movingProducts);
      }
    }

    // Recompute sort_orders: manual first, then alphabetical
    const ordered = [...manualProducts, ...alphaProducts];
    const manualSet = new Set(manualProducts.map(p => p.id));
    const updatePromises = ordered.map((p, index) =>
      pool.query(
        'UPDATE products SET sort_order = $1, is_manual_sort = $2 WHERE id = $3',
        [index, manualSet.has(p.id), p.id]
      )
    );

    await Promise.all(updatePromises);

    return success(res, {
      message: `Product(s) moved to ${section} section`,
      manual_count: manualProducts.length,
      alphabetical_count: alphaProducts.length
    });

  } catch (err) {
    console.error('Error setting sort section:', err);
    return error(res, 'Failed to set sort section', 500);
  }
};
