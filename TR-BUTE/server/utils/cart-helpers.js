/**
 * Cart Utility Functions
 *
 * Helper functions for formatting and retrieving cart data
 */

/**
 * Formats raw database cart rows into client-friendly object
 *
 * Converts array of cart items into keyed object by product_id_property
 *
 * @param {Array} rows - Database rows from cart query
 * @returns {Object} Cart object keyed by "productId_property"
 */
function formatCartForClient(rows) {
  const cart = {};
  rows.forEach(row => {
    const key = `${row.product_id}_${row.property}`;
    cart[key] = {
      productId: row.product_id,
      property: row.property,
      quantity: row.quantity,
      addedAt: row.created_at,
      checked: row.checked,
      // Product data from JOIN (always current)
      title: row.title,
      image: row.image,
      triptych: row.triptych,
      type: row.type
    };

    // Include variation_num only if it exists
    if (row.variation_num) {
      cart[key].variation_num = row.variation_num;
    }
  });
  return cart;
}

/**
 * Get user cart with current product data using database function
 * Falls back to JOIN query if function doesn't exist
 *
 * @param {number} userId - The user's ID
 * @param {Object} pool - PostgreSQL connection pool
 * @returns {Promise<Array>} Array of cart items with product data
 */
async function getUserCartWithProducts(userId, pool) {
  // Always use JOIN query - the database function may not exist or have issues
  // This is more reliable than trying the function first
  try {
    const result = await pool.query(`
      SELECT
        uc.product_id,
        uc.property,
        uc.quantity,
        uc.variation_num,
        uc.checked,
        uc.created_at,
        p.title,
        p.triptych,
        p.type,
        (
          SELECT url FROM product_images
          WHERE product_images.product_id = p.id
          ORDER BY id LIMIT 1
        ) as image
      FROM user_cart uc
      JOIN products p ON uc.product_id = p.id
      WHERE uc.user_id = $1
      ORDER BY uc.created_at DESC
    `, [userId]);
    return result.rows;
  } catch (err) {
    console.error('Error fetching user cart with products:', err);
    throw err;
  }
}

module.exports = {
  formatCartForClient,
  getUserCartWithProducts
};
