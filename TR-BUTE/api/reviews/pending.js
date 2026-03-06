/**
 * Get Pending Reviews Endpoint (Admin)
 * Fetches all reviews from user_feedback table
 * GET /api/reviews/pending
 */

const { getPool } = require('../../lib/db');
const pool = getPool();

/**
 * Main handler
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const query = `
      SELECT
        uf.id,
        uf.type,
        uf.product_id,
        uf.user_id,
        uf.rating,
        uf.text as review_text,
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
      WHERE uf.is_deleted = FALSE AND uf.type = 'review'
      GROUP BY uf.id, u.id, u.is_deleted, p.id
      ORDER BY uf.created_at DESC
    `;

    const result = await pool.query(query);

    // Fetch images for each review (if review_images table exists)
    let imagesByReview = {};
    try {
      const tableCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'review_images'
        )
      `);

      if (tableCheck.rows[0].exists && result.rows.length > 0) {
        const reviewIds = result.rows.map(r => r.id);
        const imagesResult = await pool.query(
          `SELECT review_id, id, image_url, sort_order, created_at
           FROM review_images
           WHERE review_id = ANY($1)
           ORDER BY review_id, sort_order`,
          [reviewIds]
        );

        imagesResult.rows.forEach(img => {
          if (!imagesByReview[img.review_id]) {
            imagesByReview[img.review_id] = [];
          }
          imagesByReview[img.review_id].push(img);
        });
      }
    } catch (imgErr) {
      console.log('Review images table not ready:', imgErr.message);
    }

    // Transform responses to match the expected format
    const reviews = result.rows.map(row => {
      const adminResponse = row.responses && row.responses.length > 0 && row.responses[0].id
        ? row.responses[0].response_text
        : null;

      // Build user display name for admin convenience
      const userName = [row.first_name, row.last_name].filter(Boolean).join(' ') || row.username || 'Аноним';

      return {
        id: row.id,
        product_id: row.product_id,
        user_id: row.user_id,
        rating: row.rating,
        review_text: row.review_text,
        verified_purchase: row.verified_purchase,
        is_read: row.is_read,
        is_hidden: row.is_hidden,
        created_at: row.created_at,
        updated_at: row.updated_at,
        user_name: userName,
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
        admin_response: adminResponse,
        images: imagesByReview[row.id] || []
      };
    });

    return res.status(200).json(reviews);

  } catch (error) {
    console.error('Error fetching pending reviews:', error);
    return res.status(500).json({
      error: 'Failed to fetch reviews',
      message: error.message
    });
  }
};
