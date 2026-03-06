/**
 * Get Unique Product Keywords Endpoint
 * Returns list of unique individual keywords from products
 * GET /api/products/keywords
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
      SELECT key_word
      FROM products
      WHERE key_word IS NOT NULL AND key_word != ''
        AND status != 'deleted'
    `);

    // Each row may be a comma-separated list — split and deduplicate
    const seen = new Set();
    for (const row of result.rows) {
      for (const kw of row.key_word.split(',')) {
        const trimmed = kw.trim();
        if (trimmed) seen.add(trimmed);
      }
    }

    const keywords = [...seen].sort((a, b) => a.localeCompare(b, 'ru'));

    return success(res, { keywords });
  } catch (err) {
    console.error('Error fetching keywords:', err);
    return error(res, 'Failed to fetch keywords', 500);
  }
};
