/**
 * Mark Feedback as Unread Endpoint (Admin)
 * Marks one or multiple feedback items as unread
 * POST /api/feedback/mark-unread
 * Body: { feedbackIds: [1, 2, 3] }
 */

const { getPool } = require('../../lib/db');
const { success, error, badRequest, unauthorized, forbidden, methodNotAllowed } = require('../../server/utils/response-helpers');
const pool = getPool();

/**
 * Verify admin access
 * Supports both Telegram-based and browser-based admin authentication
 */
async function isAdmin(adminId) {
  try {
    // Browser-based admin authentication (already verified by JWT)
    if (adminId === 'browser-admin') {
      return true;
    }

    // Telegram-based admin authentication (check database)
    const result = await pool.query(
      'SELECT id FROM admins WHERE telegram_id = $1',
      [adminId]
    );
    return result.rows.length > 0;
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}

/**
 * Main handler
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  try {
    const { feedbackIds, admin_id } = req.body;

    // Verify admin access
    if (!admin_id) {
      return unauthorized(res, 'admin_id is required for authentication');
    }

    const adminCheck = await isAdmin(admin_id);
    if (!adminCheck) {
      return forbidden(res, 'Access denied. Admin privileges required.');
    }

    if (!feedbackIds || !Array.isArray(feedbackIds) || feedbackIds.length === 0) {
      return badRequest(res, 'feedbackIds array is required');
    }

    // Mark specific feedback items as unread
    const placeholders = feedbackIds.map((_, i) => `$${i + 1}`).join(',');
    const query = `
      UPDATE user_feedback
      SET is_read = FALSE
      WHERE id IN (${placeholders}) AND is_deleted = FALSE
      RETURNING id
    `;

    const result = await pool.query(query, feedbackIds);

    return success(res, {
      count: result.rows.length,
      message: `${result.rows.length} feedback item(s) marked as unread`
    });

  } catch (err) {
    console.error('Error marking feedback as unread:', err);
    return error(res, 'Failed to mark feedback as unread', 500);
  }
};
