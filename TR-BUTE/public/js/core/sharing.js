/**
 * Sharing Utilities
 * Platform-aware sharing functionality that adapts to deployment mode
 */

/**
 * @typedef {Object} SharingConfig
 * @property {string} mode - Deployment mode ('telegram' or 'yandex')
 * @property {boolean} isTelegram - True if in Telegram mode
 * @property {boolean} isYandex - True if in Yandex mode
 * @property {string} appUrl - Application URL
 * @property {boolean} supportsNativeShare - True if native Web Share API is supported
 */

/**
 * Cached sharing configuration
 * @type {SharingConfig|null}
 */
let cachedConfig = null;

/**
 * Get sharing configuration from server
 * @returns {Promise<SharingConfig>}
 */
async function getSharingConfig() {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    const response = await fetch('/api/sharing-config');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    if (data.success && data.config) {
      cachedConfig = data.config;
      return cachedConfig;
    } else {
      throw new Error('Invalid sharing config response');
    }
  } catch (error) {
    console.error('Failed to get sharing config:', error);
    // Fallback to browser mode
    return {
      mode: 'yandex',
      isTelegram: false,
      isYandex: true,
      appUrl: window.location.origin,
      supportsNativeShare: true
    };
  }
}

/**
 * Share product using platform-appropriate method
 * @param {Object} options - Sharing options
 * @param {string} options.productId - Product ID or slug
 * @param {string} options.title - Product title
 * @param {string} [options.text] - Optional description text
 * @param {string} [options.url] - Full URL (auto-generated if not provided)
 * @returns {Promise<boolean>} Success status
 */
async function shareProduct({ productId, title, text = '', url = '' }) {
  const config = await getSharingConfig();

  // Generate URL if not provided
  const shareUrl = url || `${config.appUrl}/product/${productId}`;

  if (config.isTelegram) {
    // Use Telegram Web App share API
    return shareTelegram({ url: shareUrl, title, text });
  } else {
    // Use browser native share or fallback
    return shareBrowser({ url: shareUrl, title, text });
  }
}

/**
 * Share via Telegram (Mini-App context)
 * @param {Object} options - Share options
 * @param {string} options.url - URL to share
 * @param {string} options.title - Title
 * @param {string} [options.text] - Optional text
 * @returns {Promise<boolean>} Success status
 */
async function shareTelegram({ url, title, text = '' }) {
  try {
    // Check if Telegram WebApp is available
    if (window.Telegram?.WebApp) {
      const message = text ? `${title}\n\n${text}` : title;

      // Use switchInlineQuery for sharing
      window.Telegram.WebApp.switchInlineQuery(url, ['users', 'groups', 'channels']);

      return true;
    } else {
      console.warn('Telegram WebApp not available, falling back to clipboard');
      return copyToClipboard(url);
    }
  } catch (error) {
    console.error('Telegram share failed:', error);
    return copyToClipboard(url);
  }
}

/**
 * Share via browser (Web Share API or clipboard)
 * @param {Object} options - Share options
 * @param {string} options.url - URL to share
 * @param {string} options.title - Title
 * @param {string} [options.text] - Optional text
 * @returns {Promise<boolean>} Success status
 */
async function shareBrowser({ url, title, text = '' }) {
  try {
    // Try native Web Share API first (works on mobile browsers)
    if (navigator.share) {
      await navigator.share({
        title,
        text: text || title,
        url
      });
      return true;
    } else {
      // Fallback to clipboard
      return copyToClipboard(url);
    }
  } catch (error) {
    // User cancelled or share failed
    if (error.name !== 'AbortError') {
      console.error('Browser share failed:', error);
      return copyToClipboard(url);
    }
    return false;
  }
}

/**
 * Copy text to clipboard
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>} Success status
 */
async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      showToast('Ссылка скопирована в буфер обмена');
      return true;
    } else {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);

      if (success) {
        showToast('Ссылка скопирована в буфер обмена');
      }
      return success;
    }
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    showToast('Не удалось скопировать ссылку', 'error');
    return false;
  }
}

/**
 * Show toast notification
 * @param {string} message - Message to show
 * @param {string} [type='success'] - Toast type
 */
function showToast(message, type = 'success') {
  // Use existing toast system if available
  if (window.toast && typeof window.toast.show === 'function') {
    window.toast.show(message, type);
  } else if (window.showToast) {
    window.showToast(message);
  } else {
    // Simple fallback
    alert(message);
  }
}

/**
 * Get share button HTML based on deployment mode
 * @param {Object} options - Options
 * @param {string} options.productId - Product ID
 * @param {string} options.title - Product title
 * @param {string} [options.className] - Additional CSS classes
 * @returns {Promise<string>} HTML string for share button
 */
async function getShareButtonHTML({ productId, title, className = '' }) {
  const config = await getSharingConfig();

  const baseClass = 'share-button';
  const classes = `${baseClass} ${className}`.trim();
  const icon = config.isTelegram ? '📤' : '🔗';

  // Escape to prevent XSS via product titles containing quotes
  const safeId = escapeAttr(String(productId));
  const safeTitle = escapeAttr(String(title));

  return `
    <button class="${classes}" onclick="window.sharing.shareProduct({ productId: '${safeId}', title: '${safeTitle}' })">
      <span class="icon">${icon}</span>
      <span class="text">Поделиться</span>
    </button>
  `;
}

/**
 * Escape a string for safe use inside an HTML attribute
 */
function escapeAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Export as global object for easy access
window.sharing = {
  getSharingConfig,
  shareProduct,
  shareTelegram,
  shareBrowser,
  copyToClipboard,
  getShareButtonHTML
};

// Also export as module for ES6 imports
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getSharingConfig,
    shareProduct,
    shareTelegram,
    shareBrowser,
    copyToClipboard,
    getShareButtonHTML
  };
}
