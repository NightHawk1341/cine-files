/**
 * Reorder Products Endpoint
 * Updates the sort_order of products for display ordering
 * POST /api/products/reorder
 *
 * Supports two modes:
 * 1. Legacy: { product_id, new_position } - moves a product within the full list
 * 2. Section-aware: { manual_ids, alphabetical_ids } - full reorder with section support
 *    Both arrays preserve the given order (no auto-sorting).
 */

const { getPool } = require('../../lib/db');
const { success, error, badRequest, notFound, methodNotAllowed } = require('../../server/utils/response-helpers');
const pool = getPool();

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  try {
    const { product_id, new_position, manual_ids, alphabetical_ids } = req.body;

    // Section-aware reorder mode
    if (manual_ids && alphabetical_ids) {
      return await handleSectionReorder(res, manual_ids, alphabetical_ids);
    }

    // Legacy mode: single product move
    if (!product_id || new_position === undefined) {
      return badRequest(res, 'product_id and new_position are required (or use manual_ids + alphabetical_ids)');
    }

    // Get all products sorted by current order
    const allProductsResult = await pool.query(
      'SELECT id, sort_order FROM products ORDER BY sort_order NULLS LAST, id'
    );

    const products = allProductsResult.rows;
    const productIndex = products.findIndex(p => p.id === parseInt(product_id));

    if (productIndex === -1) {
      return notFound(res, 'Product not found');
    }

    // Reorder the array
    const [movedProduct] = products.splice(productIndex, 1);
    products.splice(new_position, 0, movedProduct);

    // Update sort_order for all products
    const updatePromises = products.map((product, index) =>
      pool.query(
        'UPDATE products SET sort_order = $1 WHERE id = $2',
        [index, product.id]
      )
    );

    await Promise.all(updatePromises);

    return success(res, { message: 'Products reordered successfully' });

  } catch (err) {
    console.error('Error reordering products:', err);
    return error(res, 'Failed to reorder products', 500);
  }
};

/**
 * Handle section-aware reorder.
 * Both manual_ids and alphabetical_ids preserve their given order.
 * Manual products get is_manual_sort=true, alphabetical get is_manual_sort=false.
 * sort_order is assigned sequentially: manual first, then alphabetical.
 */
async function handleSectionReorder(res, manualIds, alphabeticalIds) {
  if (!Array.isArray(manualIds) || !Array.isArray(alphabeticalIds)) {
    return badRequest(res, 'manual_ids and alphabetical_ids must be arrays');
  }

  const updates = [];

  // Manual products: is_manual_sort=true, sort_order = 0..N
  manualIds.forEach((id, index) => {
    updates.push(
      pool.query(
        'UPDATE products SET sort_order = $1, is_manual_sort = true WHERE id = $2',
        [index, parseInt(id)]
      )
    );
  });

  // Alphabetical products: is_manual_sort=false, sort_order = N..M
  const offset = manualIds.length;
  alphabeticalIds.forEach((id, index) => {
    updates.push(
      pool.query(
        'UPDATE products SET sort_order = $1, is_manual_sort = false WHERE id = $2',
        [offset + index, parseInt(id)]
      )
    );
  });

  await Promise.all(updates);

  return success(res, {
    message: 'Products reordered with sections',
    manual_count: manualIds.length,
    alphabetical_count: alphabeticalIds.length
  });
}
