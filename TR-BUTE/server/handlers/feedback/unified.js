/**
 * Unified Feedback Handlers
 * Handles /api/feedback endpoints for all feedback types
 */

/**
 * Creates unified feedback handlers
 * @param {Object} deps - Dependencies
 * @param {Object} deps.pool - PostgreSQL connection pool
 * @param {Object} deps.config - Application configuration
 * @param {Object} deps.axios - HTTP client for notifications
 * @returns {Object} Handler functions
 */
const { checkText } = require('../../../lib/moderation');

function createUnifiedFeedbackHandlers({ pool, config, axios }) {

  /**
   * GET /feedback - Get all feedback with pagination
   */
  async function getAllFeedback(req, res) {
    try {
      const { type, product_id, page = '1', limit = '20' } = req.query;

      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
      const offset = (pageNum - 1) * limitNum;

      let whereClause = 'WHERE uf.is_deleted = FALSE AND uf.is_hidden = FALSE';
      const params = [];

      if (type) {
        params.push(type);
        whereClause += ` AND uf.type = $${params.length}`;
      }

      if (product_id) {
        params.push(product_id);
        whereClause += ` AND uf.product_id = $${params.length}`;
      }

      const countQuery = `SELECT COUNT(*) as total FROM user_feedback uf ${whereClause}`;
      const countResult = await pool.query(countQuery, params);
      const total = parseInt(countResult.rows[0].total);

      params.push(limitNum);
      params.push(offset);

      const query = `
        SELECT
          uf.id,
          uf.type,
          uf.product_id,
          uf.user_id,
          uf.rating,
          uf.text,
          uf.verified_purchase,
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
        ${whereClause}
        GROUP BY uf.id, u.id, u.username, u.first_name, u.last_name, u.photo_url, u.login_method, u.is_deleted, p.id, p.title
        ORDER BY
          CASE
            WHEN uf.type = 'comment' THEN COUNT(DISTINCT ufl.user_id)
            ELSE 0
          END DESC,
          uf.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}
      `;

      const result = await pool.query(query, params);

      res.json({
        data: result.rows,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
          hasMore: pageNum * limitNum < total
        }
      });
    } catch (err) {
      console.error('Error fetching feedback:', err);
      res.status(500).json({ error: 'Failed to fetch feedback' });
    }
  }

  /**
   * POST /feedback - Submit feedback (unified endpoint)
   */
  async function submitFeedback(req, res) {
    try {
      const { type, productId, rating, text } = req.body;
      const userId = req.userId || req.user?.id;

      if (!type || !text) {
        return res.status(400).json({ error: 'Missing required fields: type and text' });
      }

      if (!['review', 'comment', 'suggestion'].includes(type)) {
        return res.status(400).json({ error: 'Invalid type' });
      }

      if (type === 'review') {
        if (!rating) {
          return res.status(400).json({ error: 'Rating is required for reviews' });
        }
        if (rating < 1 || rating > 5) {
          return res.status(400).json({ error: 'Rating must be between 1 and 5' });
        }
      }

      if (type === 'review' && productId) {
        const purchaseCheck = await pool.query(
          `SELECT 1 FROM orders o
           JOIN order_items oi ON o.id = oi.order_id
           WHERE o.user_id = $1 AND oi.product_id = $2
             AND o.status IN ('paid', 'shipped', 'completed')
           LIMIT 1`,
          [userId, productId]
        );

        if (purchaseCheck.rows.length === 0) {
          return res.status(403).json({
            error: 'Verified purchase required',
            message: 'You can only review products you have purchased.'
          });
        }
      }

      // Moderation check
      const modResult = await checkText(text, type);
      const isAutoHidden = !modResult.passed;
      if (isAutoHidden) {
        console.log(`[moderation] Auto-hidden ${type} by user ${userId}: matched "${modResult.matchedWords.join(', ')}"`);
      }

      if (productId) {
        const existing = await pool.query(
          'SELECT id FROM user_feedback WHERE product_id = $1 AND user_id = $2 AND type = $3',
          [productId, userId, type]
        );

        if (existing.rows.length > 0) {
          const result = await pool.query(
            `UPDATE user_feedback
             SET rating = $1, text = $2, is_hidden = $3, updated_at = NOW()
             WHERE id = $4
             RETURNING *`,
            [rating || null, text, isAutoHidden, existing.rows[0].id]
          );
          return res.json(result.rows[0]);
        }
      }

      const result = await pool.query(
        `INSERT INTO user_feedback (user_id, type, product_id, rating, text, verified_purchase, is_hidden)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [userId, type, productId || null, rating || null, text, type === 'review' && !!productId, isAutoHidden]
      );

      res.json(result.rows[0]);
    } catch (err) {
      console.error('Error submitting feedback:', err);
      res.status(500).json({ error: 'Failed to submit feedback' });
    }
  }

  /**
   * DELETE /feedback/:feedbackId - Delete feedback
   */
  async function deleteFeedback(req, res) {
    try {
      const { feedbackId } = req.params;
      const userId = req.userId || req.user?.id;

      if (!feedbackId || isNaN(feedbackId)) {
        return res.status(400).json({ error: 'Invalid feedback ID' });
      }

      const feedbackResult = await pool.query(
        'SELECT user_id FROM user_feedback WHERE id = $1',
        [parseInt(feedbackId)]
      );

      if (feedbackResult.rows.length === 0) {
        return res.status(404).json({ error: 'Feedback not found' });
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
      console.error('Error deleting feedback:', err);
      res.status(500).json({ error: 'Failed to delete feedback' });
    }
  }

  /**
   * POST /feedback/:feedbackId/like - Toggle like on feedback
   */
  async function toggleLike(req, res) {
    try {
      const { feedbackId } = req.params;
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
      console.error('Error toggling like:', err);
      res.status(500).json({ error: 'Failed to toggle like' });
    }
  }

  /**
   * GET /feedback/likes - Get user's likes
   */
  async function getUserLikes(req, res) {
    try {
      const { type } = req.query;
      const userId = req.userId || req.user?.id;

      let query = 'SELECT ufl.feedback_id FROM user_feedback_likes ufl';
      const params = [userId];

      if (type) {
        query += ' JOIN user_feedback uf ON ufl.feedback_id = uf.id WHERE ufl.user_id = $1 AND uf.type = $2';
        params.push(type);
      } else {
        query += ' WHERE ufl.user_id = $1';
      }

      const result = await pool.query(query, params);
      res.json(result.rows.map(row => row.feedback_id));
    } catch (err) {
      console.error('Error fetching likes:', err);
      res.status(500).json({ error: 'Failed to fetch likes' });
    }
  }

  /**
   * GET /feedback/user - Get user's own feedback
   */
  async function getUserFeedback(req, res) {
    try {
      const { type } = req.query;
      const userId = req.userId || req.user?.id;

      let whereClause = 'WHERE uf.user_id = $1';
      const params = [userId];

      if (type) {
        params.push(type);
        whereClause += ` AND uf.type = $${params.length}`;
      }

      const result = await pool.query(
        `SELECT
          uf.id, uf.user_id, uf.type, uf.product_id, uf.rating, uf.text,
          uf.created_at, uf.updated_at,
          p.title as product_title,
          COUNT(DISTINCT ufl.user_id) as like_count
        FROM user_feedback uf
        LEFT JOIN products p ON uf.product_id = p.id
        LEFT JOIN user_feedback_likes ufl ON uf.id = ufl.feedback_id
        ${whereClause}
        GROUP BY uf.id, p.id
        ORDER BY uf.created_at DESC`,
        params
      );

      res.json(result.rows);
    } catch (err) {
      console.error('Error fetching user feedback:', err);
      res.status(500).json({ error: 'Failed to fetch feedback' });
    }
  }

  /**
   * POST /feedback/visibility - Update feedback visibility (admin)
   */
  async function updateVisibility(req, res) {
    try {
      const { id, is_hidden } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'Missing ID' });
      }

      const result = await pool.query(
        'UPDATE user_feedback SET is_hidden = $1, updated_at = NOW() WHERE id = $2 AND is_deleted = FALSE RETURNING *',
        [is_hidden, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Feedback not found' });
      }

      res.json({ success: true, feedback: result.rows[0] });
    } catch (err) {
      console.error('Error updating visibility:', err);
      res.status(500).json({ error: 'Failed to update visibility' });
    }
  }

  /**
   * POST /feedback/:feedbackId/response - Add response to feedback (admin)
   */
  async function addResponse(req, res) {
    try {
      const { feedbackId } = req.params;
      const { responseText, response_text, send_notification } = req.body;
      const text = responseText || response_text;

      if (!text || text.trim().length === 0) {
        return res.status(400).json({ error: 'Response text is required' });
      }

      const feedbackResult = await pool.query(
        `SELECT uf.user_id, uf.product_id, uf.type, p.title as product_title
         FROM user_feedback uf
         LEFT JOIN products p ON uf.product_id = p.id
         WHERE uf.id = $1`,
        [feedbackId]
      );

      if (feedbackResult.rows.length === 0) {
        return res.status(404).json({ error: 'Feedback not found' });
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
      console.error('Error adding response:', err);
      res.status(500).json({ error: 'Failed to add response' });
    }
  }

  /**
   * DELETE /feedback/response/:responseId - Delete response
   */
  async function deleteResponse(req, res) {
    try {
      await pool.query('DELETE FROM user_feedback_responses WHERE id = $1', [req.params.responseId]);
      res.json({ success: true });
    } catch (err) {
      console.error('Error deleting response:', err);
      res.status(500).json({ error: 'Failed to delete response' });
    }
  }

  return {
    getAllFeedback,
    submitFeedback,
    deleteFeedback,
    toggleLike,
    getUserLikes,
    getUserFeedback,
    updateVisibility,
    addResponse,
    deleteResponse
  };
}

module.exports = createUnifiedFeedbackHandlers;
