/**
 * Mark Feedback as Read Endpoint (Admin)
 * Marks one or multiple feedback items as read
 * POST /api/feedback/mark-read
 * Body: { feedbackIds: [1, 2, 3] } or { markAll: true }
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
    const { feedbackIds, markAll, admin_id } = req.body;

    // Verify admin access
    if (!admin_id) {
      return unauthorized(res, 'admin_id is required for authentication');
    }

    const adminCheck = await isAdmin(admin_id);
    if (!adminCheck) {
      return forbidden(res, 'Access denied. Admin privileges required.');
    }

    let query;
    let values;

    if (markAll) {
      // Mark all unread feedback as read
      query = `
        UPDATE user_feedback
        SET is_read = TRUE
        WHERE is_read = FALSE AND is_deleted = FALSE
        RETURNING id
      `;
      values = [];
    } else if (feedbackIds && Array.isArray(feedbackIds) && feedbackIds.length > 0) {
      // Mark specific feedback items as read
      const placeholders = feedbackIds.map((_, i) => `$${i + 1}`).join(',');
      query = `
        UPDATE user_feedback
        SET is_read = TRUE
        WHERE id IN (${placeholders}) AND is_deleted = FALSE
        RETURNING id
      `;
      values = feedbackIds;
    } else {
      return badRequest(res, 'Either feedbackIds array or markAll:true is required');
    }

    const result = await pool.query(query, values);

    return success(res, {
      count: result.rows.length,
      message: `${result.rows.length} feedback item(s) marked as read`
    });

  } catch (err) {
    console.error('Error marking feedback as read:', err);
    return error(res, 'Failed to mark feedback as read', 500);
  }
};
