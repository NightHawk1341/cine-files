/**
 * Suggestions Handlers
 * Handles /api/suggestions endpoints
 */

/**
 * Creates suggestions handlers
 * @param {Object} deps - Dependencies
 * @param {Object} deps.pool - PostgreSQL connection pool
 * @param {Object} deps.config - Application configuration
 * @param {Object} deps.axios - HTTP client for notifications
 * @returns {Object} Handler functions
 */
const { checkText } = require('../../../lib/moderation');

function createSuggestionsHandlers({ pool, config, axios }) {

  /**
   * GET /suggestions - Get all suggestions
   */
  async function getAllSuggestions(req, res) {
    try {
      const result = await pool.query(
        `SELECT
          uf.id, uf.user_id, uf.text as suggestion_text,
          uf.created_at, uf.updated_at,
          u.username, u.first_name, u.last_name, u.photo_url, u.hide_photo, u.login_method,
          COUNT(DISTINCT ufl.user_id) as upvote_count,
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
        WHERE uf.type = 'suggestion' AND uf.is_deleted = FALSE AND uf.is_hidden = FALSE
        GROUP BY uf.id, u.id, u.username, u.first_name, u.last_name, u.photo_url, u.hide_photo, u.login_method
        ORDER BY upvote_count DESC, uf.created_at DESC`
      );
      res.json(result.rows);
    } catch (err) {
      console.error('Error fetching suggestions:', err);
      res.status(500).json({ error: 'Failed to fetch suggestions' });
    }
  }

  /**
   * POST /suggestions - Post a suggestion
   */
  async function postSuggestion(req, res) {
    try {
      const { suggestion_text } = req.body;
      const userId = req.userId || req.user?.id;

      if (!suggestion_text || suggestion_text.trim().length === 0) {
        return res.status(400).json({ error: 'Suggestion text is required' });
      }

      // Moderation check
      const modResult = await checkText(suggestion_text, 'suggestion');
      const isAutoHidden = !modResult.passed;
      if (isAutoHidden) {
        console.log(`[moderation] Auto-hidden suggestion by user ${userId}: matched "${modResult.matchedWords.join(', ')}"`);
      }

      const result = await pool.query(
        `INSERT INTO user_feedback (user_id, type, text, is_hidden, created_at, updated_at)
         VALUES ($1, 'suggestion', $2, $3, NOW(), NOW())
         RETURNING id, user_id, text as suggestion_text, created_at, updated_at`,
        [userId, suggestion_text, isAutoHidden]
      );

      res.json(result.rows[0]);
    } catch (err) {
      console.error('Error posting suggestion:', err);
      res.status(500).json({ error: 'Failed to post suggestion' });
    }
  }

  /**
   * DELETE /suggestions/:suggestionId - Delete suggestion
   */
  async function deleteSuggestion(req, res) {
    try {
      const feedbackId = req.params.suggestionId;
      const userId = req.userId || req.user?.id;

      if (!feedbackId || isNaN(feedbackId)) {
        return res.status(400).json({ error: 'Invalid suggestion ID' });
      }

      const feedbackResult = await pool.query(
        'SELECT user_id FROM user_feedback WHERE id = $1 AND type = $2',
        [parseInt(feedbackId), 'suggestion']
      );

      if (feedbackResult.rows.length === 0) {
        return res.status(404).json({ error: 'Suggestion not found' });
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
      console.error('Error deleting suggestion:', err);
      res.status(500).json({ error: 'Failed to delete suggestion' });
    }
  }

  /**
   * POST /suggestions/:suggestionId/upvote - Toggle upvote on suggestion
   */
  async function toggleUpvote(req, res) {
    try {
      const feedbackId = req.params.suggestionId;
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
      console.error('Error toggling suggestion upvote:', err);
      res.status(500).json({ error: 'Failed to toggle upvote' });
    }
  }

  /**
   * GET /suggestions/upvotes - Get user's suggestion upvotes
   */
  async function getUserUpvotes(req, res) {
    try {
      const userId = req.userId || req.user?.id;
      const result = await pool.query(
        `SELECT ufl.feedback_id FROM user_feedback_likes ufl
         JOIN user_feedback uf ON ufl.feedback_id = uf.id
         WHERE ufl.user_id = $1 AND uf.type = 'suggestion'`,
        [userId]
      );
      res.json(result.rows.map(row => row.feedback_id));
    } catch (err) {
      console.error('Error fetching suggestion upvotes:', err);
      res.status(500).json({ error: 'Failed to fetch upvotes' });
    }
  }

  /**
   * POST /suggestions/:suggestionId/response - Add response to suggestion
   */
  async function addResponse(req, res) {
    try {
      const feedbackId = req.params.suggestionId;
      const { responseText, response_text, send_notification } = req.body;
      const text = responseText || response_text;

      if (!text || text.trim().length === 0) {
        return res.status(400).json({ error: 'Response text is required' });
      }

      const feedbackResult = await pool.query(
        `SELECT uf.user_id, uf.product_id, uf.type, p.title as product_title
         FROM user_feedback uf
         LEFT JOIN products p ON uf.product_id = p.id
         WHERE uf.id = $1 AND uf.type = 'suggestion'`,
        [feedbackId]
      );

      if (feedbackResult.rows.length === 0) {
        return res.status(404).json({ error: 'Suggestion not found' });
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
      console.error('Error adding suggestion response:', err);
      res.status(500).json({ error: 'Failed to add response' });
    }
  }

  /**
   * DELETE /suggestions/response/:responseId - Delete suggestion response
   */
  async function deleteResponse(req, res) {
    try {
      await pool.query('DELETE FROM user_feedback_responses WHERE id = $1', [req.params.responseId]);
      res.json({ success: true });
    } catch (err) {
      console.error('Error deleting suggestion response:', err);
      res.status(500).json({ error: 'Failed to delete response' });
    }
  }

  /**
   * POST /suggestions/visibility - Update suggestion visibility (admin)
   */
  async function updateVisibility(req, res) {
    try {
      const { id, is_hidden } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'Missing ID' });
      }

      const result = await pool.query(
        'UPDATE user_feedback SET is_hidden = $1, updated_at = NOW() WHERE id = $2 AND type = $3 AND is_deleted = FALSE RETURNING *',
        [is_hidden, id, 'suggestion']
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Suggestion not found' });
      }

      res.json({ success: true, feedback: result.rows[0] });
    } catch (err) {
      console.error('Error updating suggestion visibility:', err);
      res.status(500).json({ error: 'Failed to update visibility' });
    }
  }

  /**
   * POST /suggestions/respond - Admin respond to suggestion
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
         WHERE uf.id = $1 AND uf.type = 'suggestion'`,
        [id]
      );

      if (feedbackResult.rows.length === 0) {
        return res.status(404).json({ error: 'Suggestion not found' });
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
      console.error('Error responding to suggestion:', err);
      res.status(500).json({ error: 'Failed to add response' });
    }
  }

  /**
   * POST /suggestions/response-delete - Admin delete suggestion response
   */
  async function adminDeleteResponse(req, res) {
    try {
      const { feedback_id } = req.body;
      await pool.query('DELETE FROM user_feedback_responses WHERE id = $1', [feedback_id]);
      res.json({ success: true });
    } catch (err) {
      console.error('Error deleting suggestion response:', err);
      res.status(500).json({ error: 'Failed to delete response' });
    }
  }

  return {
    getAllSuggestions,
    postSuggestion,
    deleteSuggestion,
    toggleUpvote,
    getUserUpvotes,
    addResponse,
    deleteResponse,
    updateVisibility,
    adminRespond,
    adminDeleteResponse
  };
}

module.exports = createSuggestionsHandlers;
