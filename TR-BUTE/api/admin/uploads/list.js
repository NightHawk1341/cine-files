/**
 * Admin Uploads List API
 * GET /api/admin/uploads/list
 *
 * Returns all user-uploaded images (both review and custom product uploads)
 * for admin management in the feed uploads tab.
 */

const { getPool } = require('../../../lib/db');
const pool = getPool();

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Ensure custom_uploads table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS custom_uploads (
        id SERIAL PRIMARY KEY,
        user_id BIGINT,
        image_url TEXT NOT NULL,
        product_id INTEGER,
        storage_provider VARCHAR(50),
        file_key VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Fetch review images with user info (handle missing tables gracefully)
    let reviewImages = { rows: [] };
    try {
      reviewImages = await pool.query(`
        SELECT
          ri.id,
          'review' as upload_type,
          ri.image_url,
          ri.review_id as context_id,
          ri.created_at,
          uf.user_id,
          COALESCE(u.first_name, u.username, 'Пользователь') as user_name,
          u.photo_url as user_photo,
          SUBSTRING(uf.review_text FROM 1 FOR 60) as context_text,
          uf.product_id,
          p.title as product_title
        FROM review_images ri
        JOIN user_feedback uf ON ri.review_id = uf.id
        LEFT JOIN users u ON uf.user_id = u.id
        LEFT JOIN products p ON uf.product_id = p.id
        ORDER BY ri.created_at DESC
      `);
    } catch (error) {
      console.warn('Could not fetch review images (table may not exist yet):', error.message);
    }

    // Fetch custom product uploads with user info (handle missing tables gracefully)
    let customUploads = { rows: [] };
    try {
      customUploads = await pool.query(`
        SELECT
          cu.id,
          'custom' as upload_type,
          cu.image_url,
          cu.product_id as context_id,
          cu.created_at,
          cu.user_id,
          COALESCE(u.first_name, u.username, 'Пользователь') as user_name,
          u.photo_url as user_photo,
          cu.storage_provider,
          cu.file_key,
          p.title as product_title
        FROM custom_uploads cu
        LEFT JOIN users u ON cu.user_id = u.id
        LEFT JOIN products p ON cu.product_id = p.id
        ORDER BY cu.created_at DESC
      `);
    } catch (error) {
      console.warn('Could not fetch custom uploads:', error.message);
    }

    // Combine and sort by date
    const allUploads = [
      ...reviewImages.rows.map(row => ({
        ...row,
        context_text: row.context_text || null,
        product_title: row.product_title || null
      })),
      ...customUploads.rows.map(row => ({
        ...row,
        context_text: null,
        product_title: row.product_title || `Товар #${row.context_id}`
      }))
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return res.status(200).json({
      success: true,
      uploads: allUploads,
      counts: {
        total: allUploads.length,
        review: reviewImages.rows.length,
        custom: customUploads.rows.length
      }
    });

  } catch (error) {
    console.error('Error fetching uploads list:', error);
    return res.status(500).json({
      error: 'Failed to fetch uploads',
      message: error.message
    });
  }
};
