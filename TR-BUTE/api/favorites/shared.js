/**
 * Shared Wishlist API
 * GET /api/favorites/shared/:token (public, no auth)
 * Returns the user's live favorites via their share token
 */

const { getPool } = require('../../lib/db');
const { success, error, notFound, methodNotAllowed } = require('../../server/utils/response-helpers');

const pool = getPool();

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET']);
  }

  try {
    const { token } = req.params;
    if (!token) return notFound(res, 'Wishlist');

    // Look up the share token to find the user
    const result = await pool.query(
      `SELECT user_id, created_at, expires_at
       FROM shared_wishlists
       WHERE share_token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return notFound(res, 'Wishlist');
    }

    const wishlist = result.rows[0];

    // Check expiration
    if (wishlist.expires_at && new Date(wishlist.expires_at) < new Date()) {
      return success(res, { expired: true, products: [] });
    }

    // Query the user's LIVE favorites
    const favsResult = await pool.query(
      'SELECT product_id, tag FROM user_favorites WHERE user_id = $1',
      [wishlist.user_id]
    );

    if (favsResult.rows.length === 0) {
      return success(res, { products: [], tags: {}, createdAt: wishlist.created_at, expired: false });
    }

    const productIds = favsResult.rows.map(r => r.product_id);
    const tags = {};
    favsResult.rows.forEach(r => {
      if (r.tag) tags[r.product_id] = r.tag;
    });

    // Fetch fresh product data
    const productsResult = await pool.query(`
      SELECT p.id, p.title, p.slug, p.price, p.old_price, p.discount,
             p.status, p.genre, p.type, p.triptych, p.alt,
             pi.url AS image
      FROM products p
      LEFT JOIN LATERAL (
        SELECT url FROM product_images
        WHERE product_id = p.id
        ORDER BY sort_order ASC NULLS LAST, id ASC
        LIMIT 1
      ) pi ON true
      WHERE p.id = ANY($1::int[])
    `, [productIds]);

    return success(res, {
      products: productsResult.rows,
      tags,
      createdAt: wishlist.created_at,
      expired: false
    });
  } catch (err) {
    console.error('Error fetching shared wishlist:', err);
    return error(res, 'Failed to fetch shared wishlist', 500);
  }
};
