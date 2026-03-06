/**
 * Get User Profile Endpoint
 * Returns authenticated user's profile information
 * GET /api/user/profile
 *
 * REQUIRES AUTHENTICATION
 */

const { getPool } = require('../../lib/db');
const { success, error, unauthorized } = require('../../server/utils/response-helpers');

const pool = getPool();

/**
 * Main handler
 * Authentication handled by middleware - req.userId is available
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Check authentication
    if (!req.userId) {
      return unauthorized(res, 'Authentication required');
    }

    const userId = req.userId;

    // Fetch user profile
    const userResult = await pool.query(
      `SELECT id, username, email, payment_email, first_name, last_name, telegram_id, login_method, created_at
       FROM users
       WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return error(res, 'User not found', 404);
    }

    const user = userResult.rows[0];

    return success(res, {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        payment_email: user.payment_email,
        first_name: user.first_name,
        last_name: user.last_name,
        telegram_id: user.telegram_id,
        login_method: user.login_method,
        created_at: user.created_at
      }
    });

  } catch (err) {
    console.error('Error fetching user profile:', {
      error: err.message,
      stack: err.stack,
      user_id: req.userId
    });
    return error(res, `Failed to fetch profile: ${err.message}`, 500);
  }
};
