/**
 * Update User Payment Email Endpoint
 * Updates the payment email for T-Bank receipts
 * POST /api/user/update-email
 *
 * REQUIRES AUTHENTICATION
 *
 * For Telegram users, this email is used for:
 * - Payment receipts (fiscal compliance)
 * - Email notifications (if they opt in)
 */

const { getPool } = require('../../lib/db');
const { success, error, badRequest, unauthorized, methodNotAllowed } = require('../../server/utils/response-helpers');

const pool = getPool();

/**
 * Validate email format
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Main handler
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  try {
    // Check authentication
    if (!req.userId) {
      return unauthorized(res, 'Authentication required');
    }

    const { email } = req.body;

    if (!email) {
      return badRequest(res, 'email is required');
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return badRequest(res, 'Invalid email format');
    }

    // Update user's payment_email
    const result = await pool.query(
      `UPDATE users
       SET payment_email = $1
       WHERE id = $2
       RETURNING id, payment_email`,
      [email, req.userId]
    );

    if (result.rows.length === 0) {
      return error(res, 'User not found', 404);
    }

    return success(res, {
      message: 'Payment email updated successfully',
      payment_email: result.rows[0].payment_email
    });

  } catch (err) {
    console.error('Error updating payment email:', err);
    return error(res, 'Failed to update payment email', 500);
  }
};
