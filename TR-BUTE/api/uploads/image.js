/**
 * Universal Image Upload API
 * POST /api/uploads/image
 *
 * Supports multiple storage backends:
 * - Vercel Blob (for Vercel deployments)
 * - Yandex Cloud S3 (for buy-tribute.com)
 * - Supabase (fallback)
 *
 * Auto-selects the appropriate backend based on deployment mode
 */

const formidable = require('formidable');
const fs = require('fs');
const path = require('path');
const config = require('../../lib/config');
const { verifyAccessToken } = require('../../auth');
const { getBestStorageProvider, recordUpload } = require('../../lib/storage-manager');
const { getPool } = require('../../lib/db');

// Allowed image types
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB (after compression)

/**
 * Generate unique filename
 */
function generateFileName(type, contextId, originalName) {
  const ext = path.extname(originalName || '.jpg').toLowerCase() || '.jpg';
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${type}/${contextId}/${timestamp}-${random}${ext}`;
}

/**
 * Upload to Vercel Blob
 */
async function uploadToVercelBlob(buffer, fileName, contentType) {
  // Dynamic import for ES module
  const { put } = await import('@vercel/blob');

  const blob = await put(fileName, buffer, {
    access: 'public',
    contentType,
    token: config.vercelBlob.token
  });

  return blob.url;
}

/**
 * Upload to Yandex Cloud S3
 */
async function uploadToYandexS3(buffer, fileName, contentType) {
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');

  const s3Client = new S3Client({
    endpoint: config.yandexS3.endpoint,
    region: config.yandexS3.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.yandexS3.accessKeyId,
      secretAccessKey: config.yandexS3.secretAccessKey
    }
  });

  const command = new PutObjectCommand({
    Bucket: config.yandexS3.bucket,
    Key: fileName,
    Body: buffer,
    ContentType: contentType,
    ACL: 'public-read'
  });

  await s3Client.send(command);

  // Return public URL
  return `${config.yandexS3.endpoint}/${config.yandexS3.bucket}/${fileName}`;
}

/**
 * Upload to Supabase Storage
 */
async function uploadToSupabase(buffer, fileName, contentType) {
  const { createClient } = require('@supabase/supabase-js');

  const supabase = createClient(
    config.supabase.url,
    config.supabase.serviceRoleKey
  );

  const { data, error } = await supabase.storage
    .from('user-uploads')
    .upload(fileName, buffer, {
      contentType,
      cacheControl: '3600',
      upsert: false
    });

  if (error) {
    throw new Error(`Supabase upload failed: ${error.message}`);
  }

  const { data: urlData } = supabase.storage
    .from('user-uploads')
    .getPublicUrl(fileName);

  return urlData.publicUrl;
}

/**
 * Main handler
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get best storage provider (with automatic fallback if at capacity)
  let storageProvider;
  try {
    storageProvider = await getBestStorageProvider();
  } catch (err) {
    console.error('Error getting storage provider:', err);
    storageProvider = config.getStorageProvider();
  }

  if (!storageProvider) {
    console.error('No storage provider configured');
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

    // Get type and context
    const type = fields.type ? (Array.isArray(fields.type) ? fields.type[0] : fields.type) : 'general';
    const contextId = fields.context_id ? (Array.isArray(fields.context_id) ? fields.context_id[0] : fields.context_id) : 'unknown';

    // Optional auth - get user ID if token provided
    let userId = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const user = verifyAccessToken(token);
        userId = user?.id;
      } catch (e) {
        // Auth is optional, continue without user ID
      }
    }

    // Validate file
    if (!files.image || (Array.isArray(files.image) ? files.image.length === 0 : !files.image)) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const imageFile = Array.isArray(files.image) ? files.image[0] : files.image;

    // Validate file type
    if (!ALLOWED_TYPES.includes(imageFile.mimetype)) {
      return res.status(400).json({
        error: 'Invalid file type. Allowed: JPEG, PNG, WebP'
      });
    }

    // Validate file size
    if (imageFile.size > MAX_FILE_SIZE) {
      return res.status(400).json({
        error: `File too large. Maximum: ${MAX_FILE_SIZE / 1024 / 1024}MB`
      });
    }

    // Read file buffer
    const buffer = fs.readFileSync(imageFile.filepath);

    // Generate filename
    const fileName = generateFileName(type, contextId, imageFile.originalFilename);

    // Upload to appropriate storage
    let publicUrl;

    console.log(`[Upload] Using storage provider: ${storageProvider}`);

    switch (storageProvider) {
      case 'vercel-blob':
        publicUrl = await uploadToVercelBlob(buffer, fileName, imageFile.mimetype);
        break;

      case 'yandex-s3':
        publicUrl = await uploadToYandexS3(buffer, fileName, imageFile.mimetype);
        break;

      case 'supabase':
        publicUrl = await uploadToSupabase(buffer, fileName, imageFile.mimetype);
        break;

      default:
        throw new Error(`Unknown storage provider: ${storageProvider}`);
    }

    // Clean up temp file
    try {
      fs.unlinkSync(imageFile.filepath);
    } catch (cleanupError) {
      console.error('Error cleaning up temp file:', cleanupError);
    }

    // Record upload for storage tracking
    try {
      await recordUpload(storageProvider, fileName, imageFile.size, {
        fileType: imageFile.mimetype,
        contextType: type,
        contextId,
        userId
      });
    } catch (trackErr) {
      console.error('Error recording upload:', trackErr);
      // Don't fail the request if tracking fails
    }

    // For product (custom) uploads, also save to custom_uploads table for admin management
    if (type === 'product') {
      try {
        const pool = getPool();
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
        await pool.query(`
          INSERT INTO custom_uploads (user_id, image_url, product_id, storage_provider, file_key)
          VALUES ($1, $2, $3, $4, $5)
        `, [userId, publicUrl, contextId ? parseInt(contextId) : null, storageProvider, fileName]);
      } catch (dbErr) {
        console.error('Error saving custom upload:', dbErr);
      }
    }

    console.log(`[Upload] Success: ${fileName} -> ${publicUrl}`);

    return res.status(200).json({
      success: true,
      url: publicUrl,
      fileName,
      type,
      contextId,
      userId,
      provider: storageProvider
    });

  } catch (error) {
    console.error('Error uploading image:', error);

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
    bodyParser: false
  }
};
