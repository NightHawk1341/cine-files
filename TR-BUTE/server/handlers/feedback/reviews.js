/**
 * Reviews Handlers
 * Handles /api/reviews endpoints
 */

/**
 * Creates reviews handlers
 * @param {Object} deps - Dependencies
 * @param {Object} deps.pool - PostgreSQL connection pool
 * @param {Object} deps.config - Application configuration
 * @param {Object} deps.axios - HTTP client for notifications
 * @returns {Object} Handler functions
 */
const { checkText } = require('../../../lib/moderation');
const { REVIEW_ALLOWED_STATUSES } = require('../../utils/order-constants');

function createReviewsHandlers({ pool, config, axios }) {

  /**
   * Helper: fetch order product titles for order-level reviews
   */
  async function attachOrderProducts(reviews) {
    const orderIds = reviews.filter(r => r.order_id).map(r => r.order_id);
    if (orderIds.length === 0) return;

    const result = await pool.query(
      `SELECT DISTINCT oi.order_id, p.id as product_id, p.slug as product_slug, oi.title
       FROM order_items oi
       LEFT JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = ANY($1) AND oi.deleted_by_admin = FALSE AND oi.product_id IS NOT NULL
       ORDER BY oi.order_id, oi.id`,
      [orderIds]
    );

    const productsByOrder = {};
    result.rows.forEach(row => {
      if (!productsByOrder[row.order_id]) productsByOrder[row.order_id] = [];
      productsByOrder[row.order_id].push({ id: row.product_id, slug: row.product_slug, title: row.title });
    });

    reviews.forEach(review => {
      if (review.order_id) {
        review.order_products = productsByOrder[review.order_id] || [];
      }
    });
  }

  /**
   * GET /reviews - Get all reviews with pagination
   */
  async function getAllReviews(req, res) {
    const { product_id, page = '1', limit = '20' } = req.query;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const offset = (pageNum - 1) * limitNum;

    try {
      let whereClause = "WHERE uf.is_deleted = FALSE AND uf.is_hidden = FALSE AND uf.type = 'review'";
      const params = [];

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
          uf.product_id,
          uf.order_id,
          uf.user_id,
          uf.rating,
          uf.text as review_text,
          uf.created_at,
          u.username,
          u.first_name,
          u.last_name,
          u.photo_url,
          u.hide_photo,
          u.login_method,
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
        GROUP BY uf.id, u.id, u.username, u.first_name, u.last_name, u.photo_url, u.hide_photo, u.login_method, p.id, p.title
        ORDER BY uf.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}
      `;

      const result = await pool.query(query, params);
      await attachOrderProducts(result.rows);
      res.json({
        data: result.rows,
        pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum), hasMore: pageNum * limitNum < total }
      });
    } catch (err) {
      console.error('Error fetching reviews:', err);
      res.status(500).json({ error: 'Failed to fetch reviews' });
    }
  }

  /**
   * GET /reviews/product/:productId - Get reviews for specific product
   */
  async function getProductReviews(req, res) {
    const { productId } = req.params;
    const { page = '1', limit = '20' } = req.query;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const offset = (pageNum - 1) * limitNum;

    try {
      const countResult = await pool.query(
        `SELECT COUNT(*) as total FROM user_feedback uf
         WHERE uf.is_deleted = FALSE AND uf.is_hidden = FALSE AND uf.type = 'review'
           AND (
             uf.product_id = $1
             OR (uf.order_id IS NOT NULL AND EXISTS (
               SELECT 1 FROM order_items oi WHERE oi.order_id = uf.order_id AND oi.product_id = $1 AND oi.deleted_by_admin = FALSE
             ))
           )`,
        [productId]
      );
      const total = parseInt(countResult.rows[0].total);

      const query = `
        SELECT
          uf.id,
          uf.product_id,
          uf.order_id,
          uf.user_id,
          uf.rating,
          uf.text as review_text,
          uf.created_at,
          CASE WHEN u.is_deleted THEN 'deleted_user' ELSE u.username END as username,
          CASE WHEN u.is_deleted THEN 'Пользователь' ELSE u.first_name END as first_name,
          CASE WHEN u.is_deleted THEN 'удалён' ELSE u.last_name END as last_name,
          CASE WHEN u.is_deleted THEN NULL ELSE u.photo_url END as photo_url,
          u.login_method,
          u.is_deleted as user_is_deleted,
          u.hide_photo,
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
        LEFT JOIN user_feedback_responses ufr ON uf.id = ufr.feedback_id
        LEFT JOIN user_feedback_likes ufl ON uf.id = ufl.feedback_id
        WHERE uf.is_deleted = FALSE AND uf.is_hidden = FALSE AND uf.type = 'review'
          AND (
            uf.product_id = $1
            OR (uf.order_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM order_items oi WHERE oi.order_id = uf.order_id AND oi.product_id = $1 AND oi.deleted_by_admin = FALSE
            ))
          )
        GROUP BY uf.id, u.id, u.username, u.first_name, u.last_name, u.photo_url, u.login_method, u.is_deleted, u.hide_photo
        ORDER BY uf.created_at DESC
        LIMIT $2 OFFSET $3
      `;
      const result = await pool.query(query, [productId, limitNum, offset]);

      // Fetch images for each review (if review_images table exists)
      const reviews = result.rows;
      await attachOrderProducts(reviews);
      try {
        // Check if table exists first
        const tableCheck = await pool.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_name = 'review_images'
          )
        `);

        if (tableCheck.rows[0].exists) {
          const reviewIds = reviews.map(r => r.id);
          if (reviewIds.length > 0) {
            const imagesResult = await pool.query(
              `SELECT review_id, id, image_url, sort_order
               FROM review_images
               WHERE review_id = ANY($1)
               ORDER BY review_id, sort_order`,
              [reviewIds]
            );

            // Group images by review_id
            const imagesByReview = {};
            imagesResult.rows.forEach(img => {
              if (!imagesByReview[img.review_id]) {
                imagesByReview[img.review_id] = [];
              }
              imagesByReview[img.review_id].push(img);
            });

            // Attach images to reviews
            reviews.forEach(review => {
              review.images = imagesByReview[review.id] || [];
            });
          }
        }
      } catch (imgErr) {
        // Table might not exist yet, that's fine
        console.log('Review images table not ready:', imgErr.message);
      }

      res.json({
        data: reviews,
        pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum), hasMore: pageNum * limitNum < total }
      });
    } catch (err) {
      console.error('Error fetching product reviews:', err);
      res.status(500).json({ error: 'Failed to fetch reviews' });
    }
  }

  /**
   * Check if user is an admin by their user ID
   * Used to bypass purchase verification for testing
   */
  async function isUserAdmin(userId) {
    if (!userId) return false;
    try {
      const result = await pool.query(
        `SELECT 1 FROM admins a
         JOIN users u ON u.telegram_id = a.telegram_id
         WHERE u.id = $1
         LIMIT 1`,
        [userId]
      );
      return result.rows.length > 0;
    } catch (error) {
      console.error('[reviews] Error checking admin status:', error);
      return false;
    }
  }

  /**
   * POST /reviews - Submit a review
   */
  async function submitReview(req, res) {
    const { productId, orderId, rating, reviewText } = req.body;
    const userId = req.userId || req.user?.id;

    try {
      if (!rating || !reviewText) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      if (rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Rating must be between 1 and 5' });
      }

      // Order-level review: verify user owns the order and status allows review
      if (orderId) {
        const orderCheck = await pool.query(
          `SELECT id FROM orders WHERE id = $1 AND user_id = $2 AND status = ANY($3)`,
          [orderId, userId, REVIEW_ALLOWED_STATUSES]
        );
        if (orderCheck.rows.length === 0) {
          return res.status(403).json({ error: 'Order not found or review not allowed for this order status' });
        }

        const modResult = await checkText(reviewText, 'review');
        const isAutoHidden = !modResult.passed;
        if (isAutoHidden) {
          console.log(`[moderation] Auto-hidden review by user ${userId}: matched "${modResult.matchedWords.join(', ')}"`);
        }

        const existing = await pool.query(
          "SELECT id FROM user_feedback WHERE order_id = $1 AND user_id = $2 AND type = 'review' AND is_deleted = FALSE",
          [orderId, userId]
        );

        if (existing.rows.length > 0) {
          const result = await pool.query(
            `UPDATE user_feedback SET rating = $1, text = $2, is_hidden = $3, updated_at = NOW() WHERE id = $4 RETURNING *`,
            [rating, reviewText, isAutoHidden, existing.rows[0].id]
          );
          return res.json(result.rows[0]);
        }

        const result = await pool.query(
          `INSERT INTO user_feedback (user_id, type, order_id, product_id, rating, text, verified_purchase, is_hidden)
           VALUES ($1, 'review', $2, NULL, $3, $4, TRUE, $5)
           RETURNING *`,
          [userId, orderId, rating, reviewText, isAutoHidden]
        );
        return res.json(result.rows[0]);
      }

      // Product-level review (legacy path, used from product page)
      const userIsAdmin = await isUserAdmin(userId);

      if (productId && !userIsAdmin) {
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
      } else if (userIsAdmin) {
        console.log(`[reviews] Admin bypass: user ${userId} submitting review without purchase verification`);
      }

      const modResult = await checkText(reviewText, 'review');
      const isAutoHidden = !modResult.passed;
      if (isAutoHidden) {
        console.log(`[moderation] Auto-hidden review by user ${userId}: matched "${modResult.matchedWords.join(', ')}"`);
      }

      const existing = await pool.query(
        "SELECT id FROM user_feedback WHERE product_id = $1 AND user_id = $2 AND type = 'review'",
        [productId, userId]
      );

      if (existing.rows.length > 0) {
        const result = await pool.query(
          `UPDATE user_feedback SET rating = $1, text = $2, is_hidden = $3, updated_at = NOW() WHERE id = $4 RETURNING *`,
          [rating, reviewText, isAutoHidden, existing.rows[0].id]
        );
        return res.json(result.rows[0]);
      }

      const result = await pool.query(
        `INSERT INTO user_feedback (user_id, type, product_id, rating, text, verified_purchase, is_hidden)
         VALUES ($1, 'review', $2, $3, $4, $5, $6)
         RETURNING *`,
        [userId, productId, rating, reviewText, !!productId, isAutoHidden]
      );

      res.json(result.rows[0]);
    } catch (err) {
      console.error('Error submitting review:', err);
      res.status(500).json({ error: 'Failed to submit review' });
    }
  }

  /**
   * GET /reviews/order/:orderId - Get user's review for a specific order
   */
  async function getOrderReview(req, res) {
    const { orderId } = req.params;
    const userId = req.userId || req.user?.id;

    try {
      const result = await pool.query(
        `SELECT uf.id, uf.order_id, uf.rating, uf.text as review_text, uf.created_at
         FROM user_feedback uf
         WHERE uf.order_id = $1 AND uf.user_id = $2 AND uf.type = 'review' AND uf.is_deleted = FALSE
         LIMIT 1`,
        [orderId, userId]
      );
      res.json({ review: result.rows[0] || null });
    } catch (err) {
      console.error('Error fetching order review:', err);
      res.status(500).json({ error: 'Failed to fetch review' });
    }
  }

  /**
   * DELETE /reviews/:reviewId - Delete review
   */
  async function deleteReview(req, res) {
    try {
      const feedbackId = req.params.reviewId;
      const userId = req.userId || req.user?.id;

      if (!feedbackId || isNaN(feedbackId)) {
        return res.status(400).json({ error: 'Invalid review ID' });
      }

      const feedbackResult = await pool.query(
        'SELECT user_id FROM user_feedback WHERE id = $1 AND type = $2',
        [parseInt(feedbackId), 'review']
      );

      if (feedbackResult.rows.length === 0) {
        return res.status(404).json({ error: 'Review not found' });
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
      console.error('Error deleting review:', err);
      res.status(500).json({ error: 'Failed to delete review' });
    }
  }

  /**
   * POST /reviews/:reviewId/like - Toggle like on review
   */
  async function toggleLike(req, res) {
    try {
      const feedbackId = req.params.reviewId;
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
      console.error('Error toggling review like:', err);
      res.status(500).json({ error: 'Failed to toggle like' });
    }
  }

  /**
   * GET /reviews/likes - Get user's review likes
   */
  async function getUserLikes(req, res) {
    try {
      const userId = req.userId || req.user?.id;
      const result = await pool.query(
        `SELECT ufl.feedback_id FROM user_feedback_likes ufl
         JOIN user_feedback uf ON ufl.feedback_id = uf.id
         WHERE ufl.user_id = $1 AND uf.type = 'review'`,
        [userId]
      );
      res.json(result.rows.map(row => row.feedback_id));
    } catch (err) {
      console.error('Error fetching review likes:', err);
      res.status(500).json({ error: 'Failed to fetch likes' });
    }
  }

  /**
   * POST /reviews/:reviewId/response - Add response to review
   */
  async function addResponse(req, res) {
    try {
      const feedbackId = req.params.reviewId;
      const { responseText, response_text, send_notification } = req.body;
      const text = responseText || response_text;

      if (!text || text.trim().length === 0) {
        return res.status(400).json({ error: 'Response text is required' });
      }

      const feedbackResult = await pool.query(
        `SELECT uf.user_id, uf.product_id, uf.type, p.title as product_title
         FROM user_feedback uf
         LEFT JOIN products p ON uf.product_id = p.id
         WHERE uf.id = $1 AND uf.type = 'review'`,
        [feedbackId]
      );

      if (feedbackResult.rows.length === 0) {
        return res.status(404).json({ error: 'Review not found' });
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
      console.error('Error adding review response:', err);
      res.status(500).json({ error: 'Failed to add response' });
    }
  }

  /**
   * DELETE /reviews/response/:responseId - Delete review response
   */
  async function deleteResponse(req, res) {
    try {
      await pool.query('DELETE FROM user_feedback_responses WHERE id = $1', [req.params.responseId]);
      res.json({ success: true });
    } catch (err) {
      console.error('Error deleting review response:', err);
      res.status(500).json({ error: 'Failed to delete response' });
    }
  }

  /**
   * POST /reviews/visibility - Update review visibility (admin)
   */
  async function updateVisibility(req, res) {
    try {
      const { id, is_hidden } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'Missing ID' });
      }

      const result = await pool.query(
        'UPDATE user_feedback SET is_hidden = $1, updated_at = NOW() WHERE id = $2 AND type = $3 AND is_deleted = FALSE RETURNING *',
        [is_hidden, id, 'review']
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Review not found' });
      }

      res.json({ success: true, feedback: result.rows[0] });
    } catch (err) {
      console.error('Error updating review visibility:', err);
      res.status(500).json({ error: 'Failed to update visibility' });
    }
  }

  /**
   * POST /reviews/respond - Admin respond to review
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
         WHERE uf.id = $1 AND uf.type = 'review'`,
        [id]
      );

      if (feedbackResult.rows.length === 0) {
        return res.status(404).json({ error: 'Review not found' });
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
      console.error('Error responding to review:', err);
      res.status(500).json({ error: 'Failed to add response' });
    }
  }

  /**
   * POST /reviews/response-delete - Admin delete review response
   */
  async function adminDeleteResponse(req, res) {
    try {
      const { feedback_id } = req.body;
      await pool.query('DELETE FROM user_feedback_responses WHERE id = $1', [feedback_id]);
      res.json({ success: true });
    } catch (err) {
      console.error('Error deleting review response:', err);
      res.status(500).json({ error: 'Failed to delete response' });
    }
  }

  return {
    getAllReviews,
    getProductReviews,
    submitReview,
    getOrderReview,
    deleteReview,
    toggleLike,
    getUserLikes,
    addResponse,
    deleteResponse,
    updateVisibility,
    adminRespond,
    adminDeleteResponse
  };
}

module.exports = createReviewsHandlers;
