/**
 * Review Image Upload
 * Uploads review images to Supabase Storage
 * POST /api/reviews/upload-image
 *
 * This endpoint handles multipart/form-data uploads
 */

const { createClient } = require('@supabase/supabase-js');
const formidable = require('formidable');
const fs = require('fs');
const path = require('path');
const { getPool } = require('../../lib/db');
const pool = getPool();
const config = require('../../lib/config');

// Initialize Supabase client
const supabase = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey
);

// Allowed image types
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Main handler
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check Supabase configuration
  if (!config.supabase.url || !config.supabase.serviceRoleKey) {
    console.error('Supabase configuration missing');
    return res.status(500).json({ error: 'Storage not configured' });
  }

  try {
    // Parse form data
    const form = formidable({
      maxFileSize: MAX_FILE_SIZE,
      maxFiles: 1,
      allowEmptyFiles: false
    });

    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve([fields, files]);
      });
    });

    // Validate required fields
    const reviewId = fields.review_id ? fields.review_id[0] : null;
    const userId = fields.user_id ? fields.user_id[0] : null;

    if (!reviewId || !userId) {
      return res.status(400).json({
        error: 'review_id and user_id are required'
      });
    }

    // Validate file
    if (!files.image || files.image.length === 0) {
      return res.status(400).json({
        error: 'No image file provided'
      });
    }

    const imageFile = files.image[0];

    // Validate file type
    if (!ALLOWED_TYPES.includes(imageFile.mimetype)) {
      return res.status(400).json({
        error: 'Invalid file type. Allowed: JPEG, PNG, WebP'
      });
    }

    // Validate file size
    if (imageFile.size > MAX_FILE_SIZE) {
      return res.status(400).json({
        error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`
      });
    }

    // Generate unique filename
    const fileExt = path.extname(imageFile.originalFilename || 'image.jpg');
    const fileName = `reviews/${reviewId}/${Date.now()}-${Math.random().toString(36).substring(7)}${fileExt}`;

    // Read file buffer
    const fileBuffer = fs.readFileSync(imageFile.filepath);

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('review-images')
      .upload(fileName, fileBuffer, {
        contentType: imageFile.mimetype,
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      console.error('Supabase upload error:', uploadError);
      return res.status(500).json({
        error: 'Failed to upload image',
        message: uploadError.message
      });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('review-images')
      .getPublicUrl(fileName);

    const publicUrl = urlData.publicUrl;

    // Save to review_images table
    await pool.query(`
      INSERT INTO review_images (review_id, image_url, created_at)
      VALUES ($1, $2, NOW())
    `, [reviewId, publicUrl]);

    // Clean up temporary file
    try {
      fs.unlinkSync(imageFile.filepath);
    } catch (cleanupError) {
      console.error('Error cleaning up temp file:', cleanupError);
    }

    return res.status(200).json({
      success: true,
      url: publicUrl,
      review_id: reviewId,
      file_name: fileName
    });

  } catch (error) {
    console.error('Error uploading review image:', error);

    // Handle specific errors
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File too large',
        message: `Maximum file size is ${MAX_FILE_SIZE / 1024 / 1024}MB`
      });
    }

    return res.status(500).json({
      error: 'Failed to upload image',
      message: error.message
    });
  }
};

// Export config for Next.js/Vercel
module.exports.config = {
  api: {
    bodyParser: false,
  },
};
