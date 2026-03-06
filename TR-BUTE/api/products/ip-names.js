/**
 * Get Unique Product IP Names Endpoint
 * Returns list of unique IP names from products
 * GET /api/products/ip-names
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
      SELECT ip_names
      FROM products
      WHERE ip_names IS NOT NULL AND ip_names != ''
      ORDER BY ip_names ASC
    `);

    const seen = new Set();
    for (const row of result.rows) {
      for (const name of row.ip_names.split(',')) {
        const trimmed = name.trim();
        if (trimmed) seen.add(trimmed);
      }
    }
    const ipNames = [...seen].sort((a, b) => a.localeCompare(b, 'ru'));

    return success(res, { ip_names: ipNames });
  } catch (err) {
    console.error('Error fetching ip_names:', err);
    return error(res, 'Failed to fetch ip_names', 500);
  }
};
