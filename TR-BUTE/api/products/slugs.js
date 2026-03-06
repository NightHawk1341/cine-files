/**
 * Get Unique Product Slugs Endpoint
 * Returns list of unique slugs from products
 * GET /api/products/slugs
 */

const { getPool } = require('../../lib/db');
const { success, error, methodNotAllowed } = require('../../server/utils/response-helpers');
const pool = getPool();

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET']);
  }

  try {
    const result = await pool.query(`
      SELECT slug
      FROM products
      WHERE slug IS NOT NULL AND slug != ''
      ORDER BY slug ASC
    `);

    const slugs = result.rows.map(r => r.slug);
    return success(res, { slugs });
  } catch (err) {
    console.error('Error fetching slugs:', err);
    return error(res, 'Failed to fetch slugs', 500);
  }
};
