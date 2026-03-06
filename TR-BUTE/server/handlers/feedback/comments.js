/**
 * Comments Handlers
 * Handles /api/comments endpoints
 */

/**
 * Creates comments handlers
 * @param {Object} deps - Dependencies
 * @param {Object} deps.pool - PostgreSQL connection pool
 * @param {Object} deps.config - Application configuration
 * @param {Object} deps.axios - HTTP client for notifications
 * @returns {Object} Handler functions
 */
const { checkText } = require('../../../lib/moderation');

function createCommentsHandlers({ pool, config, axios }) {

  /**
   * GET /comments - Get all comments
   */
  async function getAllComments(req, res) {
    try {
      const { product_id } = req.query;
      let whereClause = "WHERE uf.type = 'comment' AND uf.is_deleted = FALSE AND uf.is_hidden = FALSE";
      const params = [];

      if (product_id) {
        params.push(product_id);
        whereClause += ` AND uf.product_id = $${params.length}`;
      }

      const query = `
        SELECT
          uf.id, uf.user_id, uf.product_id, uf.text as comment_text,
          uf.created_at, uf.updated_at,
          CASE WHEN u.is_deleted THEN 'deleted_user' ELSE u.username END as username,
          CASE WHEN u.is_deleted THEN 'Пользователь' ELSE u.first_name END as first_name,
          CASE WHEN u.is_deleted THEN 'удалён' ELSE u.last_name END as last_name,
          CASE WHEN u.is_deleted THEN NULL ELSE u.photo_url END as photo_url,
          CASE WHEN u.is_deleted THEN FALSE ELSE u.hide_photo END as hide_photo,
          u.login_method,
          u.is_deleted as user_is_deleted,
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
        LEFT JOIN user_feedback_likes ufl ON uf.id = ufl.feedback_id
        LEFT JOIN user_feedback_responses ufr ON uf.id = ufr.feedback_id
        ${whereClause}
        GROUP BY uf.id, u.id, u.username, u.first_name, u.last_name, u.photo_url, u.hide_photo, u.login_method, u.is_deleted
        ORDER BY like_count DESC, uf.created_at DESC
      `;

      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (err) {
      console.error('Error fetching comments:', err);
      res.status(500).json({ error: 'Failed to fetch comments' });
    }
  }

  /**
   * POST /comments - Post a comment
   */
  async function postComment(req, res) {
    try {
      const { product_id, comment_text } = req.body;
      const userId = req.userId || req.user?.id;

      if (!comment_text || comment_text.trim().length === 0) {
        return res.status(400).json({ error: 'Comment text is required' });
      }

      // Moderation check
      const modResult = await checkText(comment_text, 'comment');
      const isAutoHidden = !modResult.passed;
      if (isAutoHidden) {
        console.log(`[moderation] Auto-hidden comment by user ${userId}: matched "${modResult.matchedWords.join(', ')}"`);
      }

      const result = await pool.query(
        `INSERT INTO user_feedback (user_id, type, product_id, text, is_hidden, created_at, updated_at)
         VALUES ($1, 'comment', $2, $3, $4, NOW(), NOW())
         RETURNING id, user_id, product_id, text as comment_text, created_at, updated_at`,
        [userId, product_id || null, comment_text, isAutoHidden]
      );

      res.json(result.rows[0]);
    } catch (err) {
      console.error('Error posting comment:', err);
      res.status(500).json({ error: 'Failed to post comment' });
    }
  }

  /**
   * DELETE /comments/:commentId - Delete comment
   */
  async function deleteComment(req, res) {
    try {
      const feedbackId = req.params.commentId;
      const userId = req.userId || req.user?.id;

      if (!feedbackId || isNaN(feedbackId)) {
        return res.status(400).json({ error: 'Invalid comment ID' });
      }

      const feedbackResult = await pool.query(
        'SELECT user_id FROM user_feedback WHERE id = $1 AND type = $2',
        [parseInt(feedbackId), 'comment']
      );

      if (feedbackResult.rows.length === 0) {
        return res.status(404).json({ error: 'Comment not found' });
      }

      if (String(feedbackResult.rows[0].user_id) !== String(userId)) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM user_feedback_responses WHERE feedback_id = $1', [parseInt(feedbackId)]);
        const deleteResult = await client.query('DELETE FROM user_feedback WHERE id = $1 RETURNING id', [parseInt(feedbackId)]);

        if (deleteResult.rowCount === 0) {
          await client.query('ROLLBACK');
          return res.status(500).json({ error: 'Failed to delete' });
        }

        await client.query('COMMIT');
        res.json({ success: true, feedbackId });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      console.error('Error deleting comment:', err);
      res.status(500).json({ error: 'Failed to delete comment' });
    }
  }

  /**
   * POST /comments/:commentId/like - Toggle like on comment
   */
  async function toggleLike(req, res) {
    try {
      const feedbackId = req.params.commentId;
      const userId = req.userId || req.user?.id;

      const checkResult = await pool.query(
        'SELECT * FROM user_feedback_likes WHERE user_id = $1 AND feedback_id = $2',
        [userId, feedbackId]
      );

      if (checkResult.rows.length > 0) {
        await pool.query(
          'DELETE FROM user_feedback_likes WHERE user_id = $1 AND feedback_id = $2',
          [userId, feedbackId]
        );
        res.json({ liked: false });
      } else {
        await pool.query(
          'INSERT INTO user_feedback_likes (user_id, feedback_id) VALUES ($1, $2)',
          [userId, feedbackId]
        );
        res.json({ liked: true });
      }
    } catch (err) {
      console.error('Error toggling comment like:', err);
      res.status(500).json({ error: 'Failed to toggle like' });
    }
  }

  /**
   * GET /comments/likes - Get user's comment likes
   */
  async function getUserLikes(req, res) {
    try {
      const userId = req.userId || req.user?.id;
      const result = await pool.query(
        `SELECT ufl.feedback_id FROM user_feedback_likes ufl
         JOIN user_feedback uf ON ufl.feedback_id = uf.id
         WHERE ufl.user_id = $1 AND uf.type = 'comment'`,
        [userId]
      );
      res.json(result.rows.map(row => row.feedback_id));
    } catch (err) {
      console.error('Error fetching comment likes:', err);
      res.status(500).json({ error: 'Failed to fetch likes' });
    }
  }

  /**
   * POST /comments/:commentId/response - Add response to comment
   */
  async function addResponse(req, res) {
    try {
      const feedbackId = req.params.commentId;
      const { responseText, response_text, send_notification } = req.body;
      const text = responseText || response_text;

      if (!text || text.trim().length === 0) {
        return res.status(400).json({ error: 'Response text is required' });
      }

      const feedbackResult = await pool.query(
        `SELECT uf.user_id, uf.product_id, uf.type, p.title as product_title
         FROM user_feedback uf
         LEFT JOIN products p ON uf.product_id = p.id
         WHERE uf.id = $1 AND uf.type = 'comment'`,
        [feedbackId]
      );

      if (feedbackResult.rows.length === 0) {
        return res.status(404).json({ error: 'Comment not found' });
      }

      const feedback = feedbackResult.rows[0];

      const result = await pool.query(
        `INSERT INTO user_feedback_responses (feedback_id, response_text)
         VALUES ($1, $2)
         RETURNING *`,
        [feedbackId, text]
      );

      if (send_notification && feedback.user_id && config?.appUrl) {
        try {
          await axios.post(`${config.appUrl}/api/notifications/send`, {
            user_id: feedback.user_id,
            type: 'admin_response',
            data: {
              productTitle: feedback.product_title,
              responseText: text,
              reviewType: feedback.type
            }
          });
        } catch (err) {
          console.error('Notification error:', err.message);
        }
      }

      res.json({ success: true, response: result.rows[0] });
    } catch (err) {
      console.error('Error adding comment response:', err);
      res.status(500).json({ error: 'Failed to add response' });
    }
  }

  /**
   * DELETE /comments/response/:responseId - Delete comment response
   */
  async function deleteResponse(req, res) {
    try {
      await pool.query('DELETE FROM user_feedback_responses WHERE id = $1', [req.params.responseId]);
      res.json({ success: true });
    } catch (err) {
      console.error('Error deleting comment response:', err);
      res.status(500).json({ error: 'Failed to delete response' });
    }
  }

  /**
   * POST /comments/visibility - Update comment visibility (admin)
   */
  async function updateVisibility(req, res) {
    try {
      const { id, is_hidden } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'Missing ID' });
      }

      const result = await pool.query(
        'UPDATE user_feedback SET is_hidden = $1, updated_at = NOW() WHERE id = $2 AND type = $3 AND is_deleted = FALSE RETURNING *',
        [is_hidden, id, 'comment']
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Comment not found' });
      }

      res.json({ success: true, feedback: result.rows[0] });
    } catch (err) {
      console.error('Error updating comment visibility:', err);
      res.status(500).json({ error: 'Failed to update visibility' });
    }
  }

  /**
   * POST /comments/respond - Admin respond to comment
   */
  async function adminRespond(req, res) {
    try {
      const { id, admin_response, send_notification } = req.body;
      const text = admin_response;

      if (!text || text.trim().length === 0) {
        return res.status(400).json({ error: 'Response text is required' });
      }

      const feedbackResult = await pool.query(
        `SELECT uf.user_id, uf.product_id, uf.type, p.title as product_title
         FROM user_feedback uf
         LEFT JOIN products p ON uf.product_id = p.id
         WHERE uf.id = $1 AND uf.type = 'comment'`,
        [id]
      );

      if (feedbackResult.rows.length === 0) {
        return res.status(404).json({ error: 'Comment not found' });
      }

      const feedback = feedbackResult.rows[0];

      const result = await pool.query(
        `INSERT INTO user_feedback_responses (feedback_id, response_text)
         VALUES ($1, $2)
         RETURNING *`,
        [id, text]
      );

      if (send_notification && feedback.user_id && config?.appUrl) {
        try {
          await axios.post(`${config.appUrl}/api/notifications/send`, {
            user_id: feedback.user_id,
            type: 'admin_response',
            data: {
              productTitle: feedback.product_title,
              responseText: text,
              reviewType: feedback.type
            }
          });
        } catch (err) {
          console.error('Notification error:', err.message);
        }
      }

      res.json({ success: true, response: result.rows[0] });
    } catch (err) {
      console.error('Error responding to comment:', err);
      res.status(500).json({ error: 'Failed to add response' });
    }
  }

  /**
   * POST /comments/response-delete - Admin delete comment response
   */
  async function adminDeleteResponse(req, res) {
    try {
      const { feedback_id } = req.body;
      await pool.query('DELETE FROM user_feedback_responses WHERE id = $1', [feedback_id]);
      res.json({ success: true });
    } catch (err) {
      console.error('Error deleting comment response:', err);
      res.status(500).json({ error: 'Failed to delete response' });
    }
  }

  return {
    getAllComments,
    postComment,
    deleteComment,
    toggleLike,
    getUserLikes,
    addResponse,
    deleteResponse,
    updateVisibility,
    adminRespond,
    adminDeleteResponse
  };
}

module.exports = createCommentsHandlers;
