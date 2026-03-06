/**
 * Get User Comments Endpoint
 * Fetches comments for the authenticated user
 * GET /api/comments/user
 *
 * REQUIRES AUTHENTICATION
 */

const { getPool } = require('../../lib/db');
const { success, error, unauthorized, methodNotAllowed } = require('../../server/utils/response-helpers');
const pool = getPool();

/**
 * Main handler
 * Authentication handled by middleware - req.userId is available
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET']);
  }

  // Require authentication
  if (!req.userId) {
    return unauthorized(res, 'Authentication required');
  }

  const userId = req.userId;

  try {
    const query = `
      SELECT
        uf.id,
        uf.type,
        uf.product_id,
        uf.user_id,
        uf.text as comment_text,
        uf.verified_purchase,
        uf.is_read,
        uf.created_at,
        uf.updated_at,
        p.title as product_title,
        COUNT(DISTINCT ufl.user_id) as like_count,
        COALESCE(json_agg(
          json_build_object(
            'id', ufr.id,
            'response_text', ufr.response_text,
            'created_at', ufr.created_at
          ) ORDER BY ufr.created_at
        ) FILTER (WHERE ufr.id IS NOT NULL), '[]'::json) as responses
      FROM user_feedback uf
      LEFT JOIN products p ON uf.product_id = p.id
      LEFT JOIN user_feedback_responses ufr ON uf.id = ufr.feedback_id
      LEFT JOIN user_feedback_likes ufl ON uf.id = ufl.feedback_id
      WHERE uf.is_deleted = FALSE
        AND uf.type = 'comment'
        AND uf.user_id = $1
      GROUP BY uf.id, p.id
      ORDER BY uf.created_at DESC
    `;

    const result = await pool.query(query, [userId]);

    // Transform responses to match the expected format
    const comments = result.rows.map(row => {
      const adminResponse = row.responses && row.responses.length > 0 && row.responses[0].id
        ? row.responses[0].response_text
        : null;

      return {
        id: row.id,
        product_id: row.product_id,
        user_id: row.user_id,
        comment_text: row.comment_text,
        verified_purchase: row.verified_purchase,
        is_read: row.is_read,
        created_at: row.created_at,
        updated_at: row.updated_at,
        product_title: row.product_title,
        like_count: parseInt(row.like_count),
        admin_response: adminResponse,
        upvote_count: parseInt(row.like_count) // Alias for compatibility
      };
    });

    return success(res, { comments });

  } catch (err) {
    console.error('Error fetching user comments:', err);
    return error(res, 'Failed to fetch comments', 500);
  }
};
