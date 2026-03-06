/**
 * Get Active Stories
 * Returns currently active stories sorted by sort_order
 * GET /api/stories/active
 *
 * Stories are considered active if:
 * - is_active = true
 * - starts_at <= now (or null)
 * - ends_at > now (or null)
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
    const result = await pool.query(`
      SELECT
        id,
        title,
        image_url,
        link_url,
        link_text,
        duration,
        sort_order,
        created_at
      FROM stories
      WHERE is_active = true
        AND (starts_at IS NULL OR starts_at <= CURRENT_TIMESTAMP)
        AND (ends_at IS NULL OR ends_at > CURRENT_TIMESTAMP)
      ORDER BY sort_order ASC, created_at DESC
    `);

    return success(res, { stories: result.rows });

  } catch (err) {
    console.error('Error fetching active stories:', err);
    return error(res, 'Failed to fetch stories', 500);
  }
};
