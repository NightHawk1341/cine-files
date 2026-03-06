/**
 * Add Image to Review
 * POST /api/reviews/:reviewId/image
 *
 * Adds an image URL to an existing review
 * Requires authentication and review ownership
 */

const { getPool } = require('../../../lib/db');
const pool = getPool();

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get review ID from URL params (Express uses req.params for :reviewId)
  const reviewId = req.params.reviewId;
  if (!reviewId) {
    return res.status(400).json({ error: 'Review ID required' });
  }

  // User is already authenticated via authenticateToken middleware
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'User not found' });
  }

  try {
    const { imageUrl } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ error: 'Image URL required' });
    }

    // Verify review ownership
    const reviewCheck = await pool.query(
      'SELECT id, user_id FROM user_feedback WHERE id = $1 AND type = $2',
      [reviewId, 'review']
    );

    if (reviewCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Review not found' });
    }

    if (reviewCheck.rows[0].user_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to modify this review' });
    }

    // Check if review_images table exists, if not create it
    await pool.query(`
      CREATE TABLE IF NOT EXISTS review_images (
        id SERIAL PRIMARY KEY,
        review_id BIGINT NOT NULL REFERENCES user_feedback(id) ON DELETE CASCADE,
        image_url TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Check current image count (limit to 3 per review)
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM review_images WHERE review_id = $1',
      [reviewId]
    );

    if (parseInt(countResult.rows[0].count) >= 3) {
      return res.status(400).json({ error: 'Maximum 3 images per review' });
    }

    // Add image to review
    const result = await pool.query(
      `INSERT INTO review_images (review_id, image_url, sort_order)
       VALUES ($1, $2, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM review_images WHERE review_id = $1))
       RETURNING id, image_url, sort_order`,
      [reviewId, imageUrl]
    );

    return res.status(200).json({
      success: true,
      image: result.rows[0]
    });

  } catch (error) {
    console.error('Error adding image to review:', error);
    return res.status(500).json({
      error: 'Failed to add image',
      message: error.message
    });
  }
};
