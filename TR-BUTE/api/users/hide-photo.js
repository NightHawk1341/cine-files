/**
 * Hide/Show User Photo Preference
 * Updates user's hide_photo setting
 * PATCH /api/users/hide-photo
 *
 * REQUIRES AUTHENTICATION (via middleware)
 */

const { getPool } = require('../../lib/db');
const { success, error, badRequest, notFound, methodNotAllowed } = require('../../server/utils/response-helpers');

const pool = getPool();

/**
 * Main handler
 * Authentication handled by middleware - req.userId is available
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'PATCH') {
    return methodNotAllowed(res, ['PATCH']);
  }

  try {
    const userId = req.userId;
    const { hide_photo } = req.body;

    // Validate input
    if (typeof hide_photo !== 'boolean') {
      return badRequest(res, 'hide_photo must be a boolean');
    }

    // Update user's hide_photo preference
    const result = await pool.query(
      'UPDATE users SET hide_photo = $1 WHERE id = $2 RETURNING id, hide_photo',
      [hide_photo, userId]
    );

    if (result.rows.length === 0) {
      return notFound(res, 'User');
    }

    return success(res, {
      hide_photo: result.rows[0].hide_photo
    });

  } catch (err) {
    console.error('Error updating hide_photo:', err);
    return error(res, 'Failed to update hide_photo setting', 500);
  }
}
