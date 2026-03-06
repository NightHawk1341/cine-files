/**
 * imageHealthChecker.js
 * Conservative image health checking with rate limiting and caching
 */

const IMAGE_HEALTH_CACHE_KEY = 'tr-bute-image-health-cache';
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds

// Rate limiting config (very conservative)
const CONCURRENT_CHECKS = 5;
const BATCH_DELAY = 800; // milliseconds between batches

/**
 * Get cached image health data
 */
function getImageHealthCache() {
  try {
    const cached = localStorage.getItem(IMAGE_HEALTH_CACHE_KEY);
    if (!cached) return {};

    const data = JSON.parse(cached);
    const now = Date.now();

    // Filter out expired entries
    const validEntries = {};
    for (const [url, entry] of Object.entries(data)) {
      if (now - entry.timestamp < CACHE_DURATION) {
        validEntries[url] = entry;
      }
    }

    return validEntries;
  } catch (error) {
    console.error('Error reading image health cache:', error);
    return {};
  }
}

/**
 * Save image health cache
 */
function saveImageHealthCache(cache) {
  try {
    localStorage.setItem(IMAGE_HEALTH_CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error('Error saving image health cache:', error);
  }
}

/**
 * Update cache for a single URL
 */
export function updateCachedImageHealth(url, isHealthy) {
  const cache = getImageHealthCache();
  cache[url] = {
    healthy: isHealthy,
    timestamp: Date.now()
  };
  saveImageHealthCache(cache);
}

/**
 * Check if a single image URL is accessible
 * Returns promise that resolves to true (healthy) or false (broken)
 * Uses DOM-based loading to avoid CORS issues with VK CDN
 */
function checkSingleImage(url) {
  return new Promise((resolve) => {
    // Check cache first
    const cache = getImageHealthCache();
    const cached = cache[url];
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      resolve(cached.healthy);
      return;
    }

    // Create actual DOM img element (more reliable than new Image())
    const img = document.createElement('img');
    img.style.cssText = 'position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; pointer-events: none;';

    // Timeout after 15 seconds (VK CDN can be slow)
    const timeout = setTimeout(() => {
      cleanup();
      updateCachedImageHealth(url, false);
      resolve(false);
    }, 15000);

    function cleanup() {
      clearTimeout(timeout);
      if (img.parentNode) {
        img.parentNode.removeChild(img);
      }
    }

    img.onload = () => {
      cleanup();
      // Additional check: ensure image has actual dimensions
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        updateCachedImageHealth(url, true);
        resolve(true);
      } else {
        updateCachedImageHealth(url, false);
        resolve(false);
      }
    };

    img.onerror = () => {
      cleanup();
      updateCachedImageHealth(url, false);
      resolve(false);
    };

    // Append to DOM and start loading
    document.body.appendChild(img);
    img.src = url;
  });
}

/**
 * Process images in batches with delays
 */
async function processBatch(urls, startIndex, onProgress) {
  const batch = urls.slice(startIndex, startIndex + CONCURRENT_CHECKS);

  if (batch.length === 0) return [];

  // Check all images in this batch concurrently
  const results = await Promise.all(
    batch.map(async (url, batchIndex) => {
      const globalIndex = startIndex + batchIndex;
      const isHealthy = await checkSingleImage(url);

      // Report progress
      if (onProgress) {
        onProgress(globalIndex + 1, urls.length, url, isHealthy);
      }

      return { url, healthy: isHealthy };
    })
  );

  // Delay before next batch (unless this is the last batch)
  if (startIndex + CONCURRENT_CHECKS < urls.length) {
    await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
  }

  return results;
}

/**
 * Check health of multiple image URLs with rate limiting
 * @param {string[]} urls - Array of image URLs to check
 * @param {Function} onProgress - Callback(current, total, url, isHealthy)
 * @returns {Promise<Object>} Map of url -> {healthy: boolean, timestamp: number}
 */
export async function checkImageHealth(urls, onProgress = null) {
  const uniqueUrls = [...new Set(urls)].filter(url => url && url.trim());

  if (uniqueUrls.length === 0) {
    return {};
  }

  const results = {};

  // Process all batches sequentially
  for (let i = 0; i < uniqueUrls.length; i += CONCURRENT_CHECKS) {
    const batchResults = await processBatch(uniqueUrls, i, onProgress);

    // Merge batch results
    batchResults.forEach(({ url, healthy }) => {
      results[url] = {
        healthy,
        timestamp: Date.now()
      };
    });
  }

  // Update cache with new results
  const cache = getImageHealthCache();
  Object.assign(cache, results);
  saveImageHealthCache(cache);

  return results;
}

/**
 * Get health status for a specific URL from cache
 * Returns null if not cached or expired
 */
export function getCachedImageHealth(url) {
  const cache = getImageHealthCache();
  const entry = cache[url];

  if (!entry) return null;
  if (Date.now() - entry.timestamp >= CACHE_DURATION) return null;

  return entry.healthy;
}

/**
 * Clear the entire image health cache
 */
export function clearImageHealthCache() {
  localStorage.removeItem(IMAGE_HEALTH_CACHE_KEY);
}

/**
 * Get cache statistics
 */
export function getImageHealthCacheStats() {
  const cache = getImageHealthCache();
  const entries = Object.entries(cache);

  return {
    total: entries.length,
    healthy: entries.filter(([_, v]) => v.healthy).length,
    broken: entries.filter(([_, v]) => !v.healthy).length,
    oldestTimestamp: entries.length > 0
      ? Math.min(...entries.map(([_, v]) => v.timestamp))
      : null
  };
}
