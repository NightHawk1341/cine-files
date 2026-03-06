/**
 * Get All Suggestions Endpoint (Admin)
 * Fetches all suggestions from user_feedback table
 * GET /api/suggestions/all
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
    const query = `
      SELECT
        uf.id,
        uf.type,
        uf.product_id,
        uf.user_id,
        uf.text as suggestion_text,
        uf.verified_purchase,
        uf.is_read,
        COALESCE(uf.is_hidden, FALSE) as is_hidden,
        uf.created_at,
        uf.updated_at,
        CASE WHEN u.is_deleted THEN 'deleted_user' ELSE u.username END as username,
        CASE WHEN u.is_deleted THEN 'Пользователь' ELSE u.first_name END as first_name,
        CASE WHEN u.is_deleted THEN 'удалён' ELSE u.last_name END as last_name,
        CASE WHEN u.is_deleted THEN NULL ELSE u.photo_url END as photo_url,
        u.login_method,
        u.is_deleted as user_is_deleted,
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
      LEFT JOIN users u ON uf.user_id = u.id
      LEFT JOIN products p ON uf.product_id = p.id
      LEFT JOIN user_feedback_responses ufr ON uf.id = ufr.feedback_id
      LEFT JOIN user_feedback_likes ufl ON uf.id = ufl.feedback_id
      WHERE uf.is_deleted = FALSE AND uf.type = 'suggestion'
      GROUP BY uf.id, u.id, u.is_deleted, p.id
      ORDER BY uf.created_at DESC
    `;

    const result = await pool.query(query);

    // Transform responses to match the expected format
    const suggestions = result.rows.map(row => {
      const adminResponse = row.responses && row.responses.length > 0 && row.responses[0].id
        ? row.responses[0].response_text
        : null;

      return {
        id: row.id,
        product_id: row.product_id,
        user_id: row.user_id,
        suggestion_text: row.suggestion_text,
        verified_purchase: row.verified_purchase,
        is_read: row.is_read,
        is_hidden: row.is_hidden,
        created_at: row.created_at,
        updated_at: row.updated_at,
        user: {
          username: row.username,
          first_name: row.first_name,
          last_name: row.last_name,
          photo_url: row.photo_url,
          login_method: row.login_method,
          is_deleted: row.user_is_deleted
        },
        product_title: row.product_title,
        like_count: parseInt(row.like_count),
        admin_response: adminResponse
      };
    });

    return success(res, { suggestions });

  } catch (err) {
    console.error('Error fetching all suggestions:', err);
    return error(res, 'Failed to fetch suggestions', 500);
  }
};
