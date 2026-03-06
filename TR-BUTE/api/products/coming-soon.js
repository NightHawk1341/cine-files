const { getPool } = require('../../lib/db');
const { success, error, methodNotAllowed } = require('../../server/utils/response-helpers');
const { withCache } = require('../../lib/cache');
const pool = getPool();

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET']);
  }

  try {
    const { limit = 6 } = req.query;
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 6, 1), 20);
    const products = await withCache('products:coming-soon', 600, async () => {
      const result = await pool.query(`
        SELECT
          p.id, p.title, p.slug, p.price, p.old_price, p.discount,
          p.status, p.genre, p.type, p.triptych, p.alt, p.release_date,
          pi.url AS image_url
        FROM products p
        LEFT JOIN LATERAL (
          SELECT url FROM product_images
          WHERE product_id = p.id
          ORDER BY sort_order ASC NULLS LAST, id ASC
          LIMIT 1
        ) pi ON true
        WHERE p.status = 'coming_soon'
        ORDER BY p.release_date ASC NULLS LAST, p.created_at DESC
        LIMIT $1
      `, [parsedLimit]);
      return result.rows.map(r => ({
        id: r.id,
        title: r.title,
        slug: r.slug,
        alt: r.alt,
        release_date: r.release_date,
        image: r.image_url
      }));
    });
    return success(res, { products });
  } catch (err) {
    console.error('Error fetching coming soon products:', err);
    return error(res, 'Failed to fetch coming soon products', 500);
  }
};
