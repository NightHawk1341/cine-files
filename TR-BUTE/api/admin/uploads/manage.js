/**
 * Admin Uploads Management API
 * POST /api/admin/uploads/manage
 *
 * Manage uploaded images (both review and custom product uploads)
 * Actions: delete, replace (with external URL like VK CDN)
 *
 * When replacing: old file is deleted from storage, DB updated with new URL
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

function detectStorageProvider(imageUrl) {
  if (!imageUrl) return null;
  const urlLower = imageUrl.toLowerCase();
  for (const [provider, domains] of Object.entries(STORAGE_DOMAINS)) {
    for (const domain of domains) {
      if (urlLower.includes(domain)) return provider;
    }
  }
  return null;
}

function extractFileKey(imageUrl, provider) {
  if (!imageUrl || !provider) return null;
  try {
    const url = new URL(imageUrl);
    switch (provider) {
      case 'vercel-blob':
        return url.pathname.slice(1);
      case 'yandex-s3': {
        const parts = url.pathname.split('/').filter(Boolean);
        return parts.length > 1 ? parts.slice(1).join('/') : url.pathname.slice(1);
      }
      case 'supabase': {
        const supabasePath = url.pathname.replace('/storage/v1/object/public/', '');
        const parts = supabasePath.split('/').filter(Boolean);
        return parts.length > 1 ? parts.slice(1).join('/') : supabasePath;
      }
      default:
        return null;
    }
  } catch (err) {
    return null;
  }
}

async function deleteFromStorage(imageUrl, provider) {
  const fileKey = extractFileKey(imageUrl, provider);
  if (!fileKey) return false;

  try {
    switch (provider) {
      case 'vercel-blob': {
        const { del } = await import('@vercel/blob');
        await del(imageUrl, { token: config.vercelBlob.token });
        break;
      }
      case 'yandex-s3': {
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
      }
      case 'supabase': {
        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);
        const supabasePath = imageUrl.split('/storage/v1/object/public/')[1];
        if (supabasePath) {
          const [bucket, ...pathParts] = supabasePath.split('/');
          await supabase.storage.from(bucket).remove([pathParts.join('/')]);
        }
        break;
      }
      default:
        return false;
    }

    await recordDeletion(provider, fileKey);
    console.log(`[Storage] Deleted from ${provider}: ${fileKey}`);
    return true;
  } catch (err) {
    console.error(`[Storage] Error deleting from ${provider}:`, err);
    return false;
  }
}

/**
 * Get table name and column for upload type
 */
function getTableInfo(uploadType) {
  if (uploadType === 'review') {
    return { table: 'review_images', urlColumn: 'image_url' };
  }
  if (uploadType === 'custom') {
    return { table: 'custom_uploads', urlColumn: 'image_url' };
  }
  return null;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, uploadId, uploadType, newUrl } = req.body;

  if (!action) {
    return res.status(400).json({ error: 'Action required' });
  }

  if (!uploadId || !uploadType) {
    return res.status(400).json({ error: 'Upload ID and type required' });
  }

  const tableInfo = getTableInfo(uploadType);
  if (!tableInfo) {
    return res.status(400).json({ error: `Unknown upload type: ${uploadType}` });
  }

  try {
    switch (action) {
      case 'delete': {
        // Get image info before deletion
        const result = await pool.query(
          `SELECT id, ${tableInfo.urlColumn} as image_url FROM ${tableInfo.table} WHERE id = $1`,
          [uploadId]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Upload not found' });
        }

        const image = result.rows[0];
        const provider = detectStorageProvider(image.image_url);

        // Delete from storage if hosted
        if (provider) {
          await deleteFromStorage(image.image_url, provider);
        }

        // Delete from database
        await pool.query(`DELETE FROM ${tableInfo.table} WHERE id = $1`, [uploadId]);

        return res.status(200).json({
          success: true,
          deleted: {
            id: image.id,
            uploadType,
            wasHosted: !!provider,
            provider
          }
        });
      }

      case 'replace': {
        if (!newUrl) {
          return res.status(400).json({ error: 'New URL required' });
        }

        try {
          new URL(newUrl);
        } catch (e) {
          return res.status(400).json({ error: 'Invalid URL format' });
        }

        // Get current image info
        const result = await pool.query(
          `SELECT id, ${tableInfo.urlColumn} as image_url FROM ${tableInfo.table} WHERE id = $1`,
          [uploadId]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Upload not found' });
        }

        const oldImage = result.rows[0];
        const oldProvider = detectStorageProvider(oldImage.image_url);

        // Delete old image from storage if hosted
        if (oldProvider) {
          await deleteFromStorage(oldImage.image_url, oldProvider);
        }

        // Update with new URL
        await pool.query(
          `UPDATE ${tableInfo.table} SET ${tableInfo.urlColumn} = $1 WHERE id = $2`,
          [newUrl, uploadId]
        );

        return res.status(200).json({
          success: true,
          replaced: {
            id: oldImage.id,
            uploadType,
            oldUrl: oldImage.image_url,
            newUrl,
            oldWasHosted: !!oldProvider,
            oldProvider
          }
        });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }

  } catch (error) {
    console.error('Error managing upload:', error);
    return res.status(500).json({
      error: 'Failed to manage upload',
      message: error.message
    });
  }
};
