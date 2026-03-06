// ============================================================
// FORMATTING UTILITIES
// Text and image formatting helpers
// ============================================================

/**
 * Escape HTML special characters to prevent XSS attacks
 * @param {string} text - Text to escape
 * @returns {string} Escaped text safe for innerHTML
 * @example
 * escapeHtml('<script>alert("xss")</script>') // "&lt;script&gt;alert("xss")&lt;/script&gt;"
 */
export const escapeHtml = (text) => {
  if (text === null || text === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
};

/**
 * Format number with Russian thousand separators (spaces)
 * @param {number|string} num - Number to format (handles null, undefined, strings)
 * @returns {string} Formatted number (e.g., 1000 -> "1 000")
 * @example
 * formatNumberRussian(1234567) // "1 234 567"
 */
export const formatNumberRussian = (num) => {
  if (num === null || num === undefined || num === '') return '0';
  const n = typeof num === 'number' ? num : parseFloat(num);
  if (isNaN(n)) return '0';
  const numStr = String(Math.floor(n));
  return numStr.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};

/**
 * Sanitize URL for safe use in CSS url() and HTML attributes.
 * Prevents XSS via CSS injection or attribute breakout.
 * @param {string} url - URL to sanitize
 * @returns {string} Sanitized URL
 */
export const sanitizeUrl = (url) => {
  if (!url || typeof url !== 'string') return '';
  return url
    .replace(/['"\\()]/g, (char) => encodeURIComponent(char))
    .replace(/javascript:/gi, '')
    .replace(/data:/gi, match => url.startsWith('data:image/') ? match : '');
};

/**
 * Check if URL is from VK CDN (userapi.com domain)
 * @param {string} url - URL to check
 * @returns {boolean}
 */
export const isVkCdnUrl = (url) => {
  if (!url) return false;
  const urlStr = String(url).toLowerCase();
  return urlStr.includes('userapi.com') || urlStr.includes('vk.me') || urlStr.includes('vk.com');
};

/**
 * Proxy VK CDN URL through our server to bypass browser tracking protection
 * This helps in Firefox/Safari private mode where VK CDN may be blocked
 * @param {string} url - Original VK CDN URL
 * @returns {string} Proxied URL or original URL if not VK CDN
 */
export const proxyVkCdnUrl = (url) => {
  if (!url || !isVkCdnUrl(url)) return url;
  return `/api/img?url=${encodeURIComponent(url)}`;
};

/**
 * Add image size parameter to Supabase URL
 * Appends or replaces the cs= parameter for image resizing
 * @param {string} url - Image URL
 * @param {string} size - Size parameter (e.g., '480x0', '1920x0')
 * @returns {string} URL with size parameter
 * @example
 * addImageSize('https://example.com/image.jpg', '480x0')
 * // "https://example.com/image.jpg?cs=480x0"
 */
export const addImageSize = (url, size = '480x0') => {
  if (!url) return url;

  const urlStr = String(url);

  // Replace existing cs= parameter if present
  if (urlStr.includes('cs=')) {
    return urlStr.replace(/cs=\d+x\d+/, `cs=${size}`);
  }

  // Add new cs= parameter
  const separator = urlStr.includes('?') ? '&' : '?';
  return `${urlStr}${separator}cs=${size}`;
};

/**
 * Filter images by extra type
 * Used to filter product images by categories like "варианты", "превью", etc.
 * @param {Array} images - Array of image objects or URLs
 * @param {Array<string>} extraTypes - Array of extra types to filter by
 * @returns {Array} Filtered images, or original if no matches
 * @example
 * filterImagesByExtra(images, ['варианты', 'превью'])
 */
export const filterImagesByExtra = (images, extraTypes) => {
  if (!images || images.length === 0) return [];

  // Filter for images matching the extra types
  const filtered = images.filter(img => {
    if (!img || typeof img === 'string') return false;
    return extraTypes.includes(img.extra);
  });

  // If filtered has results, return them
  if (filtered.length > 0) {
    return filtered;
  }

  // Otherwise return original images but filter out nulls
  return images.filter(img => img != null);
};

/**
 * Get base property name for triptych products
 * Converts triptych property names back to their base equivalents
 * @param {string} property - Property name
 * @returns {string} Base property name
 * @example
 * getBaseProperty('3 A3 без рамок') // "A3 без рамки"
 */
export const getBaseProperty = (property) => {
  const reverseMapping = {
    '3 A3 без рамок': 'A3 без рамки',
    '3 A2 без рамок': 'A2 без рамки',
    '3 A1 без рамок': 'A1 без рамки',
    '3 A3 в рамках': 'A3 в рамке',
    '3 A2 в рамках': 'A2 в рамке'
  };
  return reverseMapping[property] || property;
};

/**
 * Create a loading spinner overlay while image is loading.
 * Shows a spinner that will be replaced with reload button on error.
 * @param {HTMLElement} container - Container element (must have position: relative)
 * @returns {HTMLElement} The overlay element
 */
export const createImageLoadingOverlay = (container) => {
  // Don't create duplicate overlays
  const existing = container.querySelector('.img-reload-overlay');
  if (existing) return existing;

  const overlay = document.createElement('div');
  overlay.className = 'img-reload-overlay';

  const spinner = document.createElement('div');
  spinner.className = 'img-loading-spinner';

  overlay.appendChild(spinner);
  container.appendChild(overlay);
  return overlay;
};

/**
 * Create an image reload overlay for failed images.
 * Shows an arrow button that retries loading the image.
 * @param {HTMLImageElement} imgEl - The image element that failed to load
 * @param {string} originalSrc - Original source URL to retry
 * @param {HTMLElement} container - Container element (must have position: relative)
 * @returns {HTMLElement} The overlay element
 */
export const createImageReloadOverlay = (imgEl, originalSrc, container) => {
  // Don't create duplicate overlays
  const existing = container.querySelector('.img-reload-overlay');
  if (existing) {
    // If spinner exists, replace it with reload button
    const spinner = existing.querySelector('.img-loading-spinner');
    if (spinner) {
      spinner.remove();
    }
    // If button already exists, return
    if (existing.querySelector('.img-reload-btn')) {
      return existing;
    }
  }

  const overlay = existing || document.createElement('div');
  if (!existing) {
    overlay.className = 'img-reload-overlay';
  }

  const btn = document.createElement('button');
  btn.className = 'img-reload-btn';
  btn.title = 'Повторить загрузку';
  btn.innerHTML = '<svg width="20" height="20"><use href="#arrow-forward-heavy"></use></svg>';

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Replace button with spinner while retrying
    btn.remove();
    const spinner = document.createElement('div');
    spinner.className = 'img-loading-spinner';
    overlay.appendChild(spinner);

    // Cache-bust the URL to force a fresh request
    const separator = originalSrc.includes('?') ? '&' : '?';
    const retryUrl = `${originalSrc}${separator}_retry=${Date.now()}`;

    imgEl.src = retryUrl;
    imgEl.addEventListener('load', () => {
      imgEl.classList.add('loaded');
      overlay.remove();
    }, { once: true });
    imgEl.addEventListener('error', () => {
      createImageReloadOverlay(imgEl, originalSrc, container);
    }, { once: true });
  });

  overlay.appendChild(btn);
  if (!existing) {
    container.appendChild(overlay);
  }
  return overlay;
};
