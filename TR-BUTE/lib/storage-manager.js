/**
 * Storage Manager
 * Tracks storage usage across providers and handles automatic fallback
 *
 * Free tier limits:
 * - Yandex Cloud Object Storage: 10GB storage, 10GB egress/month
 * - Vercel Blob: 1GB storage on hobby (free)
 *
 * Strategy:
 * - Track upload sizes in database
 * - When nearing limit (80%), warn in logs
 * - When at limit (95%), automatically switch to fallback provider
 */

const { getPool } = require('./db');
const config = require('./config');

// Free tier limits in bytes
const STORAGE_LIMITS = {
  'yandex-s3': {
    storage: 10 * 1024 * 1024 * 1024, // 10GB
    egress: 10 * 1024 * 1024 * 1024,  // 10GB/month
    warnThreshold: 0.8,
    switchThreshold: 0.95
  },
  'vercel-blob': {
    storage: 1 * 1024 * 1024 * 1024, // 1GB (Hobby)
    egress: null, // No egress limit
    warnThreshold: 0.8,
    switchThreshold: 0.95
  },
  'supabase': {
    storage: 1 * 1024 * 1024 * 1024, // 1GB (Free tier)
    egress: 2 * 1024 * 1024 * 1024,  // 2GB/month
    warnThreshold: 0.8,
    switchThreshold: 0.95
  }
};

// In-memory cache of usage (refreshed periodically)
let usageCache = {
  'yandex-s3': { storage: 0, egress: 0, lastUpdated: 0 },
  'vercel-blob': { storage: 0, egress: 0, lastUpdated: 0 },
  'supabase': { storage: 0, egress: 0, lastUpdated: 0 }
};

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const PROVIDER_ENABLED = {
  'yandex-s3': () => config.yandexS3.enabled,
  'vercel-blob': () => config.vercelBlob.enabled,
  'supabase': () => config.supabase.enabled
};

function isProviderEnabled(provider) {
  return PROVIDER_ENABLED[provider]?.() || false;
}

/**
 * Ensure storage_usage table exists
 */
async function ensureStorageTable() {
  const pool = getPool();
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS storage_usage (
        id SERIAL PRIMARY KEY,
        provider VARCHAR(50) NOT NULL,
        file_key VARCHAR(500) NOT NULL,
        file_size BIGINT NOT NULL,
        file_type VARCHAR(50),
        context_type VARCHAR(50),
        context_id VARCHAR(100),
        user_id BIGINT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add index for faster lookups
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_storage_usage_provider
      ON storage_usage (provider)
    `);
  } catch (err) {
    console.error('Error ensuring storage table:', err);
  }
}

/**
 * Record a file deletion (to update storage tracking)
 */
async function recordDeletion(provider, fileKey) {
  const pool = getPool();
  try {
    await ensureStorageTable();

    // Get the file size before deleting
    const result = await pool.query(`
      DELETE FROM storage_usage
      WHERE provider = $1 AND file_key = $2
      RETURNING file_size
    `, [provider, fileKey]);

    const deletedSize = parseInt(result.rows[0]?.file_size) || 0;

    // Update cache
    if (usageCache[provider] && deletedSize > 0) {
      usageCache[provider].storage = Math.max(0, usageCache[provider].storage - deletedSize);
    }

    return deletedSize;
  } catch (err) {
    console.error('Error recording deletion:', err);
    return 0;
  }
}

/**
 * Record a file upload
 */
async function recordUpload(provider, fileKey, fileSize, options = {}) {
  const pool = getPool();
  try {
    await ensureStorageTable();

    await pool.query(`
      INSERT INTO storage_usage (provider, file_key, file_size, file_type, context_type, context_id, user_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      provider,
      fileKey,
      fileSize,
      options.fileType || 'image',
      options.contextType || 'unknown',
      options.contextId || null,
      options.userId || null
    ]);

    // Update cache
    if (usageCache[provider]) {
      usageCache[provider].storage += fileSize;
    }

    // Check thresholds
    checkThresholds(provider);
  } catch (err) {
    console.error('Error recording upload:', err);
  }
}

/**
 * Get current storage usage for a provider
 */
async function getUsage(provider) {
  // Check cache first
  const cached = usageCache[provider];
  if (cached && Date.now() - cached.lastUpdated < CACHE_TTL) {
    return cached;
  }

  const pool = getPool();
  try {
    await ensureStorageTable();

    const result = await pool.query(`
      SELECT SUM(file_size) as total_storage
      FROM storage_usage
      WHERE provider = $1
    `, [provider]);

    const storage = parseInt(result.rows[0]?.total_storage) || 0;

    // Update cache
    usageCache[provider] = {
      storage,
      egress: 0, // Would need separate tracking for egress
      lastUpdated: Date.now()
    };

    return usageCache[provider];
  } catch (err) {
    console.error('Error getting usage:', err);
    return { storage: 0, egress: 0, lastUpdated: 0 };
  }
}

/**
 * Check if thresholds are exceeded and log warnings
 */
function checkThresholds(provider) {
  const limits = STORAGE_LIMITS[provider];
  const usage = usageCache[provider];

  if (!limits || !usage) return;

  const usagePercent = usage.storage / limits.storage;

  if (usagePercent >= limits.switchThreshold) {
    console.warn(`[Storage] ${provider} at ${(usagePercent * 100).toFixed(1)}% capacity - switching to fallback!`);
  } else if (usagePercent >= limits.warnThreshold) {
    console.warn(`[Storage] ${provider} at ${(usagePercent * 100).toFixed(1)}% capacity - approaching limit`);
  }
}

/**
 * Get the best available storage provider with fallback
 */
async function getBestStorageProvider() {
  const preferred = config.getStorageProvider();

  if (!preferred) {
    return null;
  }

  // Check if preferred provider is near capacity
  const usage = await getUsage(preferred);
  const limits = STORAGE_LIMITS[preferred];

  if (limits && usage.storage / limits.storage >= limits.switchThreshold) {
    console.log(`[Storage] ${preferred} at capacity, finding fallback...`);

    // Find fallback provider
    const fallbacks = ['yandex-s3', 'vercel-blob', 'supabase'].filter(p => p !== preferred);

    for (const fallback of fallbacks) {
      if (!isProviderEnabled(fallback)) continue;
      const fbUsage = await getUsage(fallback);
      const fbLimits = STORAGE_LIMITS[fallback];
      if (fbUsage.storage / fbLimits.storage < fbLimits.switchThreshold) {
        console.log(`[Storage] Using fallback: ${fallback}`);
        return fallback;
      }
    }

    // All providers at capacity!
    console.error('[Storage] All storage providers at capacity!');
    return preferred; // Return preferred anyway, let upload fail
  }

  return preferred;
}

/**
 * Get storage stats for admin dashboard
 */
async function getStorageStats() {
  const stats = {};

  for (const provider of ['yandex-s3', 'vercel-blob', 'supabase']) {
    const usage = await getUsage(provider);
    const limits = STORAGE_LIMITS[provider];

    const enabled = isProviderEnabled(provider);

    stats[provider] = {
      enabled,
      used: usage.storage,
      limit: limits.storage,
      usedPercent: limits.storage ? (usage.storage / limits.storage * 100).toFixed(1) : 0,
      usedFormatted: formatBytes(usage.storage),
      limitFormatted: formatBytes(limits.storage)
    };
  }

  return stats;
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = {
  recordUpload,
  recordDeletion,
  getUsage,
  getBestStorageProvider,
  getStorageStats,
  STORAGE_LIMITS,
  formatBytes
};
