// ============================================================
// APP SETTINGS MODULE
// Fetches and applies app-wide settings like emergency mode
// ============================================================

/**
 * AppSettings - Centralized settings manager for public site
 */
export class AppSettings {
  static cache = {
    settings: null,
    lastFetch: null
  };

  static listeners = new Set();

  /**
   * Load app settings with caching
   * @param {boolean} forceRefresh - Force reload even if cached
   * @returns {Promise<Object>} Settings object
   */
  static async loadSettings(forceRefresh = false) {
    const now = Date.now();
    const cacheAge = now - (this.cache.lastFetch || 0);
    const maxAge = 60 * 1000; // 1 minute cache

    // Return cached data if still fresh
    if (!forceRefresh && this.cache.settings && cacheAge < maxAge) {
      return this.cache.settings;
    }

    try {
      const response = await fetch('/api/settings/get?keys=emergency_mode,order_submission,delivery_methods,cart_limits');

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      const settings = {};

      // Extract values from response
      if (result.settings) {
        Object.keys(result.settings).forEach(key => {
          settings[key] = result.settings[key]?.value || result.settings[key];
        });
      }

      // Update cache
      this.cache.settings = settings;
      this.cache.lastFetch = now;

      // Apply emergency mode if active
      this.applyEmergencyMode(settings.emergency_mode);

      // Notify listeners
      this.notifyListeners('settings', settings);

      return settings;

    } catch (error) {
      console.warn('[AppSettings] Failed to load settings:', error);

      // Return cached if available
      if (this.cache.settings) {
        return this.cache.settings;
      }

      // Return defaults
      return {
        emergency_mode: { enabled: false },
        order_submission: { enabled: true },
        delivery_methods: {},
        cart_limits: { max_cart_total: 45000 }
      };
    }
  }

  /**
   * Get specific setting
   */
  static getSetting(key) {
    return this.cache.settings?.[key];
  }

  /**
   * Check if emergency mode is active
   */
  static isEmergencyMode() {
    return this.cache.settings?.emergency_mode?.enabled === true;
  }

  /**
   * Check if order submission is enabled
   */
  static isOrderSubmissionEnabled() {
    return this.cache.settings?.order_submission?.enabled !== false;
  }

  /**
   * Get order disabled message
   */
  static getOrderDisabledMessage() {
    return this.cache.settings?.order_submission?.disabled_message || 'Оформление заказов временно недоступно';
  }

  /**
   * Check if delivery method is enabled
   */
  static isDeliveryMethodEnabled(methodKey) {
    return this.cache.settings?.delivery_methods?.[methodKey]?.enabled !== false;
  }

  /**
   * Get cart limits configuration
   */
  static getCartLimits() {
    return this.cache.settings?.cart_limits || { max_cart_total: 45000 };
  }

  /**
   * Apply emergency mode styles and transformations
   */
  static applyEmergencyMode(emergencySettings) {
    if (!emergencySettings?.enabled) {
      // Remove emergency mode class if it exists
      document.documentElement.classList.remove('emergency-mode');
      return;
    }

    console.log('[AppSettings] Emergency mode is ACTIVE');

    // Add emergency mode class to document
    document.documentElement.classList.add('emergency-mode');

    // Inject emergency mode CSS if not already present
    if (!document.getElementById('emergency-mode-styles')) {
      const style = document.createElement('style');
      style.id = 'emergency-mode-styles';
      style.textContent = `
        /* Emergency Mode - Hide product images */
        .emergency-mode .product-card img,
        .emergency-mode .product-carousel-track img,
        .emergency-mode .product-additional-carousel-track img,
        .emergency-mode .product-variant-image,
        .emergency-mode .gallery-item img,
        .emergency-mode .picker-image img {
          visibility: hidden !important;
        }

        /* Show placeholder for hidden images */
        .emergency-mode .product-card .product-image-wrapper,
        .emergency-mode .product-carousel-item {
          background: var(--bg-tertiary) !important;
        }

        /* Emergency indicator */
        .emergency-mode::after {
          content: '';
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: linear-gradient(90deg, #ef4444, #f97316, #ef4444);
          z-index: 9999;
          animation: emergency-pulse 2s ease-in-out infinite;
        }

        @keyframes emergency-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `;
      document.head.appendChild(style);
    }
  }

  /**
   * Transform product title for emergency mode
   * @param {Object} product - Product object
   * @returns {string} Transformed title
   */
  static getProductTitle(product) {
    if (this.isEmergencyMode()) {
      return `Товар №${product.id}`;
    }
    return product.title || `Товар №${product.id}`;
  }

  /**
   * Subscribe to settings changes
   */
  static subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Notify all listeners of changes
   */
  static notifyListeners(type, data) {
    this.listeners.forEach(callback => {
      try {
        callback(type, data);
      } catch (error) {
        console.error('[AppSettings] Listener error:', error);
      }
    });
  }
}

// Auto-load settings when module is imported
if (typeof window !== 'undefined') {
  // Load settings after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      AppSettings.loadSettings();
    });
  } else {
    AppSettings.loadSettings();
  }
}
