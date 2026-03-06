/**
 * Cart Sync Endpoints
 * GET /api/sync/cart - Get user cart with product data
 * POST /api/sync/cart - Sync cart contents
 *
 * REQUIRES AUTHENTICATION
 */

const { getPool } = require('../../lib/db');
const { formatCartForClient, getUserCartWithProducts } = require('../../server/utils/cart-helpers');
const { success, error, badRequest, unauthorized, methodNotAllowed } = require('../../server/utils/response-helpers');

const pool = getPool();

/**
 * Main handler - routes to GET or POST based on method
 */
module.exports = async function handler(req, res) {
  if (!req.userId) {
    return unauthorized(res, 'Authentication required');
  }

  switch (req.method) {
    case 'GET':
      return handleGet(req, res);
    case 'POST':
      return handlePost(req, res);
    default:
      return methodNotAllowed(res, ['GET', 'POST']);
  }
};

/**
 * GET - Fetch user cart with current product data
 */
async function handleGet(req, res) {
  try {
    // Get cart with current product data from database
    const rows = await getUserCartWithProducts(req.userId, pool);

    // Format for client (converts to object keyed by product_id_property)
    const cart = formatCartForClient(rows);

    // Build variations map from stored variation_num values
    const variations = {};
    rows.forEach(row => {
      if (row.variation_num) {
        variations[`${row.product_id}_${row.property}`] = row.variation_num;
      }
    });

    return success(res, { cart, variations });
  } catch (err) {
    console.error('Error fetching cart:', err);
    return error(res, 'Failed to fetch cart', 500);
  }
}

/**
 * POST - Sync cart contents
 */
async function handlePost(req, res) {
  try {
    const { cart, variations } = req.body;

    if (typeof cart !== 'object' || cart === null) {
      return badRequest(res, 'Cart must be an object');
    }

    // Certificates live only in localStorage; skip them for DB sync
    const productEntries = Object.entries(cart).filter(
      ([, item]) => item.type !== 'certificate' && item.type !== 'certificate_redemption'
    );
    const productIds = productEntries.map(([, item]) => item.productId || item.product_id);

    if (productIds.length > 0) {
      // Validate that no coming_soon or test products are in cart
      const productCheck = await pool.query(
        `SELECT id, title, status FROM products WHERE id = ANY($1::int[])`,
        [productIds]
      );

      const unavailableProducts = productCheck.rows.filter(
        p => p.status === 'coming_soon' || p.status === 'test'
      );

      if (unavailableProducts.length > 0) {
        const titles = unavailableProducts.map(p => p.title).join(', ');
        return badRequest(res, 'Cannot add unavailable products to cart', {
          details: `The following products are not available for purchase: ${titles}`
        });
      }
    }

    // Clear existing cart
    await pool.query('DELETE FROM user_cart WHERE user_id = $1', [req.userId]);

    // Insert new items (ONLY cart-specific fields, no product data)
    const insertPromises = productEntries.map(([, item]) => {
      const productId = item.productId || item.product_id;
      const variationKey = `${productId}_${item.property}`;
      const variationNum = (variations && variations[variationKey]) || item.variation_num || item.variationNum || null;

      return pool.query(
        `INSERT INTO user_cart
         (user_id, product_id, property, quantity, variation_num, checked)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          req.userId,
          productId,
          item.property,
          item.quantity || 1,
          variationNum,
          item.checked !== false
        ]
      );
    });

    await Promise.all(insertPromises);

    // Fetch cart with current product data to return to client
    const rows = await getUserCartWithProducts(req.userId, pool);
    const updatedCart = formatCartForClient(rows);

    return success(res, {
      saved: true,
      cart: updatedCart
    });
  } catch (err) {
    console.error('Error syncing cart:', err);
    return error(res, 'Failed to sync cart', 500);
  }
}
