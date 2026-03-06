/**
 * Toggle User Notifications Preference
 * PATCH /api/users/notifications-enabled
 *
 * REQUIRES AUTHENTICATION (via middleware)
 */

const { getPool } = require('../../lib/db');
const { success, error, badRequest, notFound, methodNotAllowed } = require('../../server/utils/response-helpers');

const pool = getPool();

module.exports = async function handler(req, res) {
  if (req.method !== 'PATCH') {
    return methodNotAllowed(res, ['PATCH']);
  }

  try {
    const userId = req.userId;
    const { notifications_enabled } = req.body;

    if (typeof notifications_enabled !== 'boolean') {
      return badRequest(res, 'notifications_enabled must be a boolean');
    }

    const result = await pool.query(
      'UPDATE users SET notifications_enabled = $1 WHERE id = $2 RETURNING id, notifications_enabled',
      [notifications_enabled, userId]
    );

    if (result.rows.length === 0) {
      return notFound(res, 'User');
    }

    return success(res, {
      notifications_enabled: result.rows[0].notifications_enabled
    });

  } catch (err) {
    console.error('Error updating notifications_enabled:', err);
    return error(res, 'Failed to update notification setting', 500);
  }
};
