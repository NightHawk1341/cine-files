/**
 * Admin Review Images API
 * POST /api/admin/reviews/images - Manage review images (delete, replace with URL)
 *
 * Actions:
 * - delete: Delete a review image (from storage and database)
 * - replace: Replace an uploaded image with an external URL
 */

const { getPool } = require('../../../lib/db');
const { recordDeletion } = require('../../../lib/storage-manager');
const config = require('../../../lib/config');
const pool = getPool();

// Known storage provider domains for detection
const STORAGE_DOMAINS = {
  'vercel-blob': ['blob.vercel-storage.com', 'public.blob.vercel-storage.com'],
  'yandex-s3': ['storage.yandexcloud.net', 's3.yandexcloud.net'],
  'supabase': ['supabase.co', 'supabase.com']
};

/**
 * Detect storage provider from URL
 */
function detectStorageProvider(imageUrl) {
  if (!imageUrl) return null;

  const urlLower = imageUrl.toLowerCase();

  for (const [provider, domains] of Object.entries(STORAGE_DOMAINS)) {
    for (const domain of domains) {
      if (urlLower.includes(domain)) {
        return provider;
      }
    }
  }

  return null; // External URL
}

/**
 * Extract file key from storage URL
 */
function extractFileKey(imageUrl, provider) {
  if (!imageUrl || !provider) return null;

  try {
    const url = new URL(imageUrl);

    switch (provider) {
      case 'vercel-blob':
        // Vercel Blob URLs: https://xxx.public.blob.vercel-storage.com/path/file.jpg
        return url.pathname.slice(1); // Remove leading slash

      case 'yandex-s3':
        // Yandex S3 URLs: https://storage.yandexcloud.net/bucket/path/file.jpg
        const pathParts = url.pathname.split('/').filter(Boolean);
        if (pathParts.length > 1) {
          return pathParts.slice(1).join('/'); // Remove bucket name
        }
        return url.pathname.slice(1);

      case 'supabase':
        // Supabase URLs: https://xxx.supabase.co/storage/v1/object/public/bucket/path/file.jpg
        const supabasePath = url.pathname.replace('/storage/v1/object/public/', '');
        const supabaseParts = supabasePath.split('/').filter(Boolean);
        if (supabaseParts.length > 1) {
          return supabaseParts.slice(1).join('/'); // Remove bucket name
        }
        return supabasePath;

      default:
        return null;
    }
  } catch (err) {
    console.error('Error extracting file key:', err);
    return null;
  }
}

/**
 * Delete file from storage provider
 */
async function deleteFromStorage(imageUrl, provider) {
  const fileKey = extractFileKey(imageUrl, provider);
  if (!fileKey) {
    console.log('[Storage] Could not extract file key, skipping storage deletion');
    return false;
  }

  try {
    switch (provider) {
      case 'vercel-blob':
        const { del } = await import('@vercel/blob');
        await del(imageUrl, { token: config.vercelBlob.token });
        break;

      case 'yandex-s3':
        const { S3Client, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
        const s3Client = new S3Client({
          endpoint: config.yandexS3.endpoint,
          region: config.yandexS3.region,
          forcePathStyle: true,
          credentials: {
            accessKeyId: config.yandexS3.accessKeyId,
            secretAccessKey: config.yandexS3.secretAccessKey
          }
        });
        await s3Client.send(new DeleteObjectCommand({
          Bucket: config.yandexS3.bucket,
          Key: fileKey
        }));
        break;

      case 'supabase':
        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);
        // Extract bucket and path
        const supabasePath = imageUrl.split('/storage/v1/object/public/')[1];
        if (supabasePath) {
          const [bucket, ...pathParts] = supabasePath.split('/');
          await supabase.storage.from(bucket).remove([pathParts.join('/')]);
        }
        break;

      default:
        console.log(`[Storage] Unknown provider: ${provider}`);
        return false;
    }

    // Update storage tracking
    await recordDeletion(provider, fileKey);
    console.log(`[Storage] Deleted from ${provider}: ${fileKey}`);
    return true;
  } catch (err) {
    console.error(`[Storage] Error deleting from ${provider}:`, err);
    return false;
  }
}

/**
 * Main handler
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, imageId, reviewId, newUrl } = req.body;

  if (!action) {
    return res.status(400).json({ error: 'Action required' });
  }

  try {
    switch (action) {
      case 'delete': {
        if (!imageId) {
          return res.status(400).json({ error: 'Image ID required' });
        }

        // Get image info before deletion
        const imageResult = await pool.query(
          'SELECT id, review_id, image_url FROM review_images WHERE id = $1',
          [imageId]
        );

        if (imageResult.rows.length === 0) {
          return res.status(404).json({ error: 'Image not found' });
        }

        const image = imageResult.rows[0];
        const provider = detectStorageProvider(image.image_url);

        // Delete from storage if it's a hosted image
        if (provider) {
          await deleteFromStorage(image.image_url, provider);
        }

        // Delete from database
        await pool.query('DELETE FROM review_images WHERE id = $1', [imageId]);

        return res.status(200).json({
          success: true,
          deleted: {
            id: image.id,
            reviewId: image.review_id,
            wasHosted: !!provider,
            provider
          }
        });
      }

      case 'replace': {
        if (!imageId || !newUrl) {
          return res.status(400).json({ error: 'Image ID and new URL required' });
        }

        // Validate new URL
        try {
          new URL(newUrl);
        } catch (e) {
          return res.status(400).json({ error: 'Invalid URL format' });
        }

        // Get current image info
        const imageResult = await pool.query(
          'SELECT id, review_id, image_url FROM review_images WHERE id = $1',
          [imageId]
        );

        if (imageResult.rows.length === 0) {
          return res.status(404).json({ error: 'Image not found' });
        }

        const oldImage = imageResult.rows[0];
        const oldProvider = detectStorageProvider(oldImage.image_url);

        // Delete old image from storage if it was hosted
        if (oldProvider) {
          await deleteFromStorage(oldImage.image_url, oldProvider);
        }

        // Update with new URL
        await pool.query(
          'UPDATE review_images SET image_url = $1 WHERE id = $2',
          [newUrl, imageId]
        );

        return res.status(200).json({
          success: true,
          replaced: {
            id: oldImage.id,
            reviewId: oldImage.review_id,
            oldUrl: oldImage.image_url,
            newUrl,
            oldWasHosted: !!oldProvider,
            oldProvider,
            newIsHosted: !!detectStorageProvider(newUrl)
          }
        });
      }

      case 'get-info': {
        // Get image info including whether it's hosted or external
        if (!imageId) {
          return res.status(400).json({ error: 'Image ID required' });
        }

        const imageResult = await pool.query(
          `SELECT ri.id, ri.review_id, ri.image_url, ri.sort_order, ri.created_at,
                  uf.created_at as review_date,
                  COALESCE(u.first_name || ' ' || u.last_name, u.username, 'user') as user_name
           FROM review_images ri
           JOIN user_feedback uf ON ri.review_id = uf.id
           LEFT JOIN users u ON uf.user_id = u.id
           WHERE ri.id = $1`,
          [imageId]
        );

        if (imageResult.rows.length === 0) {
          return res.status(404).json({ error: 'Image not found' });
        }

        const image = imageResult.rows[0];
        const provider = detectStorageProvider(image.image_url);

        return res.status(200).json({
          id: image.id,
          reviewId: image.review_id,
          imageUrl: image.image_url,
          sortOrder: image.sort_order,
          createdAt: image.created_at,
          reviewDate: image.review_date,
          userName: image.user_name,
          isHosted: !!provider,
          provider
        });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }

  } catch (error) {
    console.error('Error managing review image:', error);
    return res.status(500).json({
      error: 'Failed to manage review image',
      message: error.message
    });
  }
};
