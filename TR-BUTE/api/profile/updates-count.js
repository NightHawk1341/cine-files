/**
 * Profile Updates Count Endpoint
 * Returns the number of unseen updates for the authenticated user
 * GET /api/profile/updates-count?since=<ISO_timestamp>
 *
 * Counts:
 *   - Orders whose status was changed after the given timestamp
 *   - New admin responses to user's feedback after the given timestamp
 *
 * REQUIRES AUTHENTICATION
 */

const { getPool } = require('../../lib/db');
const { success, error, unauthorized, methodNotAllowed } = require('../../server/utils/response-helpers');
const pool = getPool();

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET']);
  }

  if (!req.userId) {
    return unauthorized(res, 'Authentication required');
  }

  const userId = req.userId;
  const sinceRaw = req.query.since;
  const since = sinceRaw ? new Date(sinceRaw) : new Date(0);

  // Treat invalid dates as epoch so all updates are counted
  const sinceTs = isNaN(since.getTime()) ? new Date(0) : since;

  try {
    // Count orders where status was changed (updated_at differs from created_at) since last seen
    const ordersResult = await pool.query(`
      SELECT COUNT(*)::int AS cnt
      FROM orders
      WHERE user_id = $1
        AND updated_at > created_at
        AND updated_at > $2
    `, [userId, sinceTs]);

    // Count admin responses posted to this user's feedback since last seen
    const responsesResult = await pool.query(`
      SELECT COUNT(ufr.id)::int AS cnt
      FROM user_feedback_responses ufr
      JOIN user_feedback uf ON ufr.feedback_id = uf.id
      WHERE uf.user_id = $1
        AND ufr.created_at > $2
    `, [userId, sinceTs]);

    const count =
      (ordersResult.rows[0]?.cnt || 0) +
      (responsesResult.rows[0]?.cnt || 0);

    return success(res, { count });
  } catch (err) {
    console.error('Error fetching profile updates count:', err);
    return error(res, 'Failed to fetch updates count', 500);
  }
};
