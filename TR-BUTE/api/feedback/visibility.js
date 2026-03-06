/**
 * Feedback Visibility Endpoint
 * POST /api/feedback/visibility
 *
 * Updates visibility (is_hidden) for feedback items
 * Used by admin to hide/show reviews, comments, suggestions
 */

const { getPool } = require('../../lib/db');
const { success, error, badRequest, notFound, methodNotAllowed } = require('../../server/utils/response-helpers');

const pool = getPool();

/**
 * Main handler
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  try {
    const { id, type, is_hidden } = req.body;

    if (!id) {
      return badRequest(res, 'Missing ID');
    }

    // Build query based on whether type is specified
    let query;
    let params;

    if (type) {
      query = 'UPDATE user_feedback SET is_hidden = $1, updated_at = NOW() WHERE id = $2 AND type = $3 AND is_deleted = FALSE RETURNING *';
      params = [is_hidden, id, type];
    } else {
      query = 'UPDATE user_feedback SET is_hidden = $1, updated_at = NOW() WHERE id = $2 AND is_deleted = FALSE RETURNING *';
      params = [is_hidden, id];
    }

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return notFound(res, 'Feedback not found');
    }

    return success(res, { feedback: result.rows[0] });
  } catch (err) {
    console.error('Error updating visibility:', err);
    return error(res, 'Failed to update visibility', 500);
  }
};
