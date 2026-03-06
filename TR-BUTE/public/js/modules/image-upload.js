/**
 * Shared Image Upload Module
 * Handles image compression, localStorage persistence, and upload coordination
 * Used by both review images and product id1 custom images
 */

// ============================================================
// CONSTANTS
// ============================================================

const STORAGE_KEY = 'tributePendingImages';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB before compression
const MAX_PRODUCT_FILE_SIZE = 5 * 1024 * 1024; // 5MB for product uploads (no compression)
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

// Compression settings (only used for reviews)
const COMPRESSION_SETTINGS = {
  // For reviews - moderate compression
  review: {
    maxWidth: 800,
    maxHeight: 600,
    quality: 0.75,
    format: 'image/jpeg'
  }
};

// ============================================================
// IMAGE COMPRESSION
// ============================================================

/**
 * Compress an image file
 * @param {File|Blob} file - The image file to compress
 * @param {string} type - Compression preset: 'review' or 'product'
 * @returns {Promise<{blob: Blob, dataUrl: string, width: number, height: number}>}
 */
export async function compressImage(file, type = 'review') {
  const settings = COMPRESSION_SETTINGS[type] || COMPRESSION_SETTINGS.review;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.onload = () => {
        // Calculate new dimensions while maintaining aspect ratio
        let { width, height } = img;
        const isVertical = height > width;

        if (isVertical) {
          // Vertical image - constrain by width
          if (width > settings.maxWidth) {
            height = Math.round(height * (settings.maxWidth / width));
            width = settings.maxWidth;
          }
        } else {
          // Horizontal image - constrain by height
          if (height > settings.maxHeight) {
            width = Math.round(width * (settings.maxHeight / height));
            height = settings.maxHeight;
          }
        }

        // Create canvas and draw resized image
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF'; // White background for transparency
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to blob
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to compress image'));
              return;
            }

            const dataUrl = canvas.toDataURL(settings.format, settings.quality);
            resolve({ blob, dataUrl, width, height });
          },
          settings.format,
          settings.quality
        );
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target.result;
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Read an image file without compression (for product uploads)
 * @param {File|Blob} file - The image file to read as-is
 * @returns {Promise<{blob: Blob, dataUrl: string, width: number, height: number}>}
 */
export function readImageRaw(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        resolve({ blob: file, dataUrl: e.target.result, width: img.width, height: img.height });
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target.result;
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Validate image file
 * @param {File} file - The file to validate
 * @returns {{valid: boolean, error?: string}}
 */
export function validateImageFile(file) {
  if (!file) {
    return { valid: false, error: 'Файл не выбран' };
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return { valid: false, error: 'Неподдерживаемый формат. Используйте JPEG, PNG или WebP' };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `Файл слишком большой. Максимум ${MAX_FILE_SIZE / 1024 / 1024}МБ` };
  }

  return { valid: true };
}

/**
 * Validate image URL
 * @param {string} url - The URL to validate
 * @returns {{valid: boolean, error?: string}}
 */
export function validateImageUrl(url) {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'URL не указан' };
  }

  url = url.trim();

  // Check for valid URL format
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, error: 'URL должен начинаться с http:// или https://' };
    }
  } catch {
    return { valid: false, error: 'Некорректный URL' };
  }

  // Check for common image extensions or known image hosts
  const imageExtensions = /\.(jpg|jpeg|png|gif|webp|bmp)(\?.*)?$/i;
  const imageHosts = [
    'imgur.com', 'i.imgur.com',
    'images.unsplash.com', 'unsplash.com',
    'i.pinimg.com', 'pinterest.com',
    'pbs.twimg.com', 'twitter.com', 'x.com',
    'instagram.com',
    'vk.com', 'sun', // VK CDN starts with sun
    'yandex.net', 'avatars.mds.yandex.net',
    'googleusercontent.com',
    'discord.com', 'cdn.discordapp.com',
    'media.tenor.com', 'tenor.com',
    'giphy.com',
    'raw.githubusercontent.com',
    'cloudinary.com',
    'imgbb.com', 'i.ibb.co'
  ];

  const hasImageExtension = imageExtensions.test(url);
  const isKnownHost = imageHosts.some(host => url.includes(host));

  if (!hasImageExtension && !isKnownHost) {
    // Return valid but with warning - let user proceed
    return { valid: true, warning: 'Убедитесь, что это прямая ссылка на изображение' };
  }

  return { valid: true };
}

// ============================================================
// LOCALSTORAGE MANAGEMENT
// ============================================================

/**
 * @typedef {Object} PendingImage
 * @property {string} id - Unique identifier
 * @property {string} type - 'review' or 'product'
 * @property {string} contextId - Product ID or order item key
 * @property {string} source - 'file', 'camera', or 'url'
 * @property {string} dataUrl - Base64 data URL for file/camera, or external URL
 * @property {string} [originalUrl] - Original URL if source is 'url'
 * @property {number} width - Image width
 * @property {number} height - Image height
 * @property {number} createdAt - Timestamp
 * @property {boolean} uploaded - Whether uploaded to server
 * @property {string} [uploadedUrl] - URL after upload
 */

/**
 * Get all pending images from localStorage
 * @returns {Object<string, PendingImage>}
 */
export function getPendingImages() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (e) {
    console.error('Error loading pending images:', e);
    return {};
  }
}

/**
 * Save pending images to localStorage
 * @param {Object<string, PendingImage>} images
 */
function savePendingImages(images) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(images));
  } catch (e) {
    console.error('Error saving pending images:', e);
    // If storage is full, try to clear old entries
    if (e.name === 'QuotaExceededError') {
      clearOldPendingImages();
    }
  }
}

/**
 * Add a pending image
 * @param {string} type - 'review' or 'product'
 * @param {string} contextId - Product ID or cart item key
 * @param {string} source - 'file', 'camera', or 'url'
 * @param {string} dataUrl - Image data URL or external URL
 * @param {number} [width] - Image width
 * @param {number} [height] - Image height
 * @returns {PendingImage}
 */
export function addPendingImage(type, contextId, source, dataUrl, width = 0, height = 0) {
  const images = getPendingImages();

  const id = `${type}_${contextId}_${Date.now()}`;
  const pendingImage = {
    id,
    type,
    contextId,
    source,
    dataUrl,
    originalUrl: source === 'url' ? dataUrl : null,
    width,
    height,
    createdAt: Date.now(),
    uploaded: false,
    uploadedUrl: null
  };

  images[id] = pendingImage;
  savePendingImages(images);

  return pendingImage;
}

/**
 * Get pending image for a specific context
 * @param {string} type - 'review' or 'product'
 * @param {string} contextId - Product ID or cart item key
 * @returns {PendingImage|null}
 */
export function getPendingImageForContext(type, contextId) {
  const images = getPendingImages();

  // Find the most recent image for this context
  let found = null;
  let latestTime = 0;

  for (const img of Object.values(images)) {
    if (img.type === type && img.contextId === contextId && img.createdAt > latestTime) {
      found = img;
      latestTime = img.createdAt;
    }
  }

  return found;
}

/**
 * Remove a pending image
 * @param {string} id - Image ID
 */
export function removePendingImage(id) {
  const images = getPendingImages();
  delete images[id];
  savePendingImages(images);
}

/**
 * Remove all pending images for a context
 * @param {string} type - 'review' or 'product'
 * @param {string} contextId - Product ID or cart item key
 */
export function removePendingImagesForContext(type, contextId) {
  const images = getPendingImages();

  for (const [id, img] of Object.entries(images)) {
    if (img.type === type && img.contextId === contextId) {
      delete images[id];
    }
  }

  savePendingImages(images);
}

/**
 * Mark pending image as uploaded
 * @param {string} id - Image ID
 * @param {string} uploadedUrl - URL after upload
 */
export function markImageUploaded(id, uploadedUrl) {
  const images = getPendingImages();

  if (images[id]) {
    images[id].uploaded = true;
    images[id].uploadedUrl = uploadedUrl;
    savePendingImages(images);
  }
}

/**
 * Clear old pending images (older than 7 days)
 */
export function clearOldPendingImages() {
  const images = getPendingImages();
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  let changed = false;
  for (const [id, img] of Object.entries(images)) {
    if (img.createdAt < sevenDaysAgo) {
      delete images[id];
      changed = true;
    }
  }

  if (changed) {
    savePendingImages(images);
  }
}

/**
 * Get all pending images that need upload (for a specific order)
 * @param {string} type - 'review' or 'product'
 * @param {string[]} contextIds - Array of context IDs
 * @returns {PendingImage[]}
 */
export function getPendingImagesForUpload(type, contextIds) {
  const images = getPendingImages();
  const result = [];

  for (const img of Object.values(images)) {
    if (img.type === type && contextIds.includes(img.contextId) && !img.uploaded) {
      result.push(img);
    }
  }

  return result;
}

// ============================================================
// FILE INPUT HELPERS
// ============================================================

/**
 * Create and trigger a file input for image selection
 * @param {boolean} capture - If true, opens camera directly (mobile)
 * @returns {Promise<File|null>}
 */
export function selectImageFile(capture = false) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    if (capture) {
      // Use 'user' for front camera or 'environment' for rear camera
      // 'user' is more commonly used for selfies/reviews
      input.setAttribute('capture', 'user');
    }

    input.onchange = (e) => {
      const file = e.target.files?.[0] || null;
      resolve(file);
    };

    // Handle cancel
    input.oncancel = () => resolve(null);

    // Some browsers don't fire oncancel, so use focus trick
    const handleFocus = () => {
      setTimeout(() => {
        if (!input.files?.length) {
          resolve(null);
        }
        window.removeEventListener('focus', handleFocus);
      }, 300);
    };
    window.addEventListener('focus', handleFocus);

    input.click();
  });
}

/**
 * Process a selected file (validate and compress/read)
 * @param {File} file - The file to process
 * @param {string} type - 'review' (compressed) or 'product' (raw, no compression)
 * @returns {Promise<{success: boolean, dataUrl?: string, width?: number, height?: number, error?: string, suggestUrl?: boolean}>}
 */
export async function processImageFile(file, type = 'review') {
  // Validate
  const validation = validateImageFile(file);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  // For product uploads: no compression, but enforce 5MB limit
  if (type === 'product') {
    if (file.size > MAX_PRODUCT_FILE_SIZE) {
      return {
        success: false,
        error: `Файл слишком большой (${(file.size / 1024 / 1024).toFixed(1)}МБ). Максимум ${MAX_PRODUCT_FILE_SIZE / 1024 / 1024}МБ. Используйте вставку по ссылке.`,
        suggestUrl: true
      };
    }

    try {
      const { dataUrl, width, height } = await readImageRaw(file);
      return { success: true, dataUrl, width, height };
    } catch (error) {
      console.error('Error reading product image:', error);
      return { success: false, error: 'Не удалось обработать изображение' };
    }
  }

  // For reviews: compress
  try {
    const { dataUrl, width, height } = await compressImage(file, type);
    return { success: true, dataUrl, width, height };
  } catch (error) {
    console.error('Error processing image:', error);
    return { success: false, error: 'Не удалось обработать изображение' };
  }
}

// ============================================================
// UPLOAD TO SERVER
// ============================================================

/**
 * Upload image to server
 * @param {PendingImage} pendingImage - The pending image to upload
 * @param {string} [authToken] - Authorization token
 * @returns {Promise<{success: boolean, url?: string, error?: string}>}
 */
export async function uploadImageToServer(pendingImage, authToken) {
  // For URL sources, no upload needed - just return the URL
  if (pendingImage.source === 'url') {
    return { success: true, url: pendingImage.originalUrl };
  }

  try {
    // Convert data URL to blob
    const response = await fetch(pendingImage.dataUrl);
    const blob = await response.blob();

    // Create form data
    const formData = new FormData();
    formData.append('image', blob, `image_${Date.now()}.jpg`);
    formData.append('type', pendingImage.type);
    formData.append('context_id', pendingImage.contextId);

    // Upload
    const headers = {};
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const uploadResponse = await fetch('/api/uploads/image', {
      method: 'POST',
      headers,
      body: formData
    });

    if (!uploadResponse.ok) {
      const errorData = await uploadResponse.json().catch(() => ({}));
      throw new Error(errorData.error || 'Upload failed');
    }

    const data = await uploadResponse.json();

    // Mark as uploaded in localStorage
    markImageUploaded(pendingImage.id, data.url);

    return { success: true, url: data.url };
  } catch (error) {
    console.error('Error uploading image:', error);
    return { success: false, error: error.message || 'Не удалось загрузить изображение' };
  }
}

/**
 * Upload all pending images for given contexts
 * @param {string} type - 'review' or 'product'
 * @param {string[]} contextIds - Context IDs to upload
 * @param {string} [authToken] - Auth token
 * @returns {Promise<{success: boolean, results: Object<string, string>, errors: string[]}>}
 */
export async function uploadAllPendingImages(type, contextIds, authToken) {
  const pending = getPendingImagesForUpload(type, contextIds);
  const results = {};
  const errors = [];

  for (const img of pending) {
    const result = await uploadImageToServer(img, authToken);
    if (result.success) {
      results[img.contextId] = result.url;
    } else {
      errors.push(`${img.contextId}: ${result.error}`);
    }
  }

  return {
    success: errors.length === 0,
    results,
    errors
  };
}

// ============================================================
// CLEANUP
// ============================================================

// Clean up old images on module load
clearOldPendingImages();

// Export for window access
window.imageUpload = {
  compressImage,
  readImageRaw,
  validateImageFile,
  validateImageUrl,
  getPendingImages,
  addPendingImage,
  getPendingImageForContext,
  removePendingImage,
  removePendingImagesForContext,
  selectImageFile,
  processImageFile,
  uploadImageToServer,
  uploadAllPendingImages
};
