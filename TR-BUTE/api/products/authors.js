/**
 * Get Unique Product Authors Endpoint
 * Returns list of unique authors from products
 * GET /api/products/authors
 */

const { getPool } = require('../../lib/db');
const { success, error, methodNotAllowed } = require('../../server/utils/response-helpers');
const pool = getPool();

/**
 * Main handler
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET']);
  }

  try {
    // Get all unique authors from products (excluding null/empty)
    const result = await pool.query(`
      SELECT DISTINCT author
      FROM products
      WHERE author IS NOT NULL AND author != ''
      ORDER BY author ASC
    `);

    // Each row may be a comma-separated list — split and deduplicate
    const seen = new Set();
    for (const row of result.rows) {
      for (const a of row.author.split(',')) {
        const trimmed = a.trim();
        if (trimmed) seen.add(trimmed);
      }
    }
    const authors = [...seen].sort((a, b) => a.localeCompare(b, 'ru'));

    return success(res, {
      authors: authors
    });

  } catch (err) {
    console.error('Error fetching authors:', err);
    return error(res, 'Failed to fetch authors', 500);
  }
};
