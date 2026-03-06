/**
 * Module Configuration System
 * Centralized configuration for all public-facing modules
 *
 * Features:
 * - Global rules that apply to all pages
 * - Page-specific overrides
 * - CSS variable management
 * - Easy maintenance and testing
 *
 * Usage:
 *   import { getModuleConfig, getSelectors, applyCSSVariables } from './module-config.js';
 *
 *   // Get merged config for a module (global + page override)
 *   const config = getModuleConfig('mobileFeedback');
 *
 *   // Get selectors for current page
 *   const selectors = getSelectors('mobileFeedback');
 *
 *   // Apply CSS variables for current page
 *   applyCSSVariables();
 */

// ============================================================================
// MODULE CONFIGURATION
// ============================================================================

const MODULE_CONFIG = {
  // -------------------------------------------------------------------------
  // MOBILE FEEDBACK MODULE
  // Provides haptic and visual feedback for touch interactions
  // -------------------------------------------------------------------------
  mobileFeedback: {
    global: {
      enabled: true,
      hapticEnabled: true,
      hapticDuration: 10, // milliseconds
      // Selectors that get mobile feedback on ALL pages
      selectors: [
        // Bottom navigation (persistent)
        '.bottom-nav-button',
        // Header buttons (persistent)
        '.header-back-button',
        '.header-burger-button',
        '.header-gear-button',
        '.header-icon-button',
        '.header-profile-button',
        // Footer elements (persistent)
        '.footer-logo',
        '.footer-social-toggle',
        '.footer-social-link',
        // Cart module
        '.cart-widget-button',
        // Generic interactive elements
        '.btn',
        '.button',
        'button:not([disabled])',
        // Toast dismiss
        '.toast-dismiss'
      ]
    },
    pageOverrides: {
      '/': {
        // Main/catalog page specific selectors
        additionalSelectors: [
          '.catalog-card',
          '.catalog-carousel-nav',
          '.products-header-button',
          '.products-header-search-button',
          '.products-header-sort-button',
          '.products-header-filter-button',
          '.product-card',
          '.product-card-favorite',
          '.product-card-image',
          '.carousel-nav-button'
        ]
      },
      '/product': {
        additionalSelectors: [
          '.product-favorite-button',
          '.product-zoom-button',
          '.product-carousel-nav',
          '.product-thumbnail',
          '.product-add-to-cart',
          '.product-variant-item',
          '.product-tab-button',
          '.review-like-button',
          '.comment-like-button',
          '.quality-info-button'
        ]
      },
      '/cart': {
        additionalSelectors: [
          '.cart-item',
          '.cart-item-checkbox',
          '.cart-item-delete',
          '.cart-quantity-btn',
          '.cart-checkout-btn',
          '.cart-clear-btn',
          '.delivery-option',
          '.payment-method'
        ]
      },
      '/favorites': {
        additionalSelectors: [
          '.favorites-filter-btn',
          '.favorites-sort-btn',
          '.favorite-item',
          '.favorite-remove-btn',
          '.favorite-add-to-cart'
        ]
      },
      '/picker': {
        additionalSelectors: [
          '.picker-start-button',
          '.picker-control-button',
          '.picker-card'
        ],
        // Override haptic for stronger feedback on picker
        hapticDuration: 20
      },
      '/profile': {
        additionalSelectors: [
          '.profile-tab-button',
          '.order-card',
          '.order-action-btn',
          '.profile-logout-btn'
        ]
      },
      '/order': {
        additionalSelectors: [
          '.order-status-btn',
          '.order-product-item',
          '.order-action-button',
          '.review-submit-btn',
          '.confirm-delivery-btn'
        ]
      },
      '/faq': {
        additionalSelectors: [
          '.faq-category-header',
          '.faq-item-header',
          '.faq-search-input'
        ]
      },
      '/customers': {
        additionalSelectors: [
          '.customers-tab-button',
          '.gallery-image',
          '.review-item',
          '.gallery-nav-button'
        ]
      },
      '/info': {
        additionalSelectors: [
          '.info-tab-button',
          '.info-link'
        ]
      }
    }
  },

  // -------------------------------------------------------------------------
  // SKELETON LOADERS MODULE
  // Manages loading state placeholders
  // -------------------------------------------------------------------------
  skeletonLoaders: {
    global: {
      enabled: true,
      fadeInDuration: 300, // milliseconds
      defaultCount: 3
    },
    pageOverrides: {
      '/': {
        // Main page shows more skeletons for product grid
        defaultCount: 8
      },
      '/picker': {
        defaultCount: 1
      }
    }
  },

  // -------------------------------------------------------------------------
  // FAQ POPUP MODULE
  // Page-specific FAQ/help content
  // -------------------------------------------------------------------------
  faqPopup: {
    global: {
      enabled: true,
      swipeToDismiss: true,
      showOnFirstVisit: false
    },
    pageOverrides: {
      '/': { type: 'catalog' },
      '/product': { type: 'product' },
      '/cart': { type: 'cart' },
      '/favorites': { type: 'favorites' },
      '/picker': { type: 'picker' },
      '/profile': { type: 'profile' },
      '/order': { type: 'order' },
      '/customers': { type: 'customers' },
      '/certificate': { type: 'certificate' }
    }
  },

  // -------------------------------------------------------------------------
  // TOAST NOTIFICATIONS MODULE
  // Toast positioning and behavior
  // -------------------------------------------------------------------------
  toast: {
    global: {
      enabled: true,
      duration: 3000, // milliseconds
      position: 'bottom', // 'top' or 'bottom'
      maxVisible: 3
    },
    pageOverrides: {
      '/cart': {
        // Cart shows toasts at top to not overlap checkout button
        position: 'top'
      }
    }
  },

  // -------------------------------------------------------------------------
  // ZOOM MODULE
  // Image zoom/lightbox behavior
  // -------------------------------------------------------------------------
  zoom: {
    global: {
      enabled: true,
      showProductInfo: true,
      keyboardNavigation: true,
      swipeNavigation: true
    },
    pageOverrides: {
      '/customers': {
        // Show product info in customer gallery zoom
        showProductInfo: true
      }
    }
  },

  // -------------------------------------------------------------------------
  // PRODUCT GRID MODULE
  // Product card rendering options
  // -------------------------------------------------------------------------
  productGrid: {
    global: {
      enabled: true,
      defaultProperty: 'A3 без рамки',
      showFavoriteButton: true,
      showPrice: true,
      lazyLoadImages: true
    },
    pageOverrides: {
      '/favorites': {
        // Favorites page specific rendering
        gridExtras: ['варианты', 'приближение']
      },
      '/': {
        gridExtras: ['сборка обложки', 'варианты', 'приближение']
      }
    }
  }
};

// ============================================================================
// CSS VARIABLES CONFIGURATION
// ============================================================================

const CSS_VARIABLES = {
  global: {
    // Mobile feedback
    '--mobile-feedback-scale': '0.95',
    '--mobile-feedback-duration': '0.15s',
    '--mobile-feedback-timing': 'ease-out',
    '--mobile-haptic-light': '10',
    '--mobile-haptic-medium': '20',
    '--mobile-haptic-heavy': '30',
    // Skeleton loaders
    '--skeleton-animation-duration': '1.2s',
    '--skeleton-fade-duration': '0.3s'
  },
  pageOverrides: {
    '/picker': {
      // Picker has stronger feedback
      '--mobile-feedback-scale': '0.92',
      '--mobile-feedback-duration': '0.2s'
    },
    '/product': {
      // Product page buttons slightly different
      '--mobile-feedback-scale': '0.96'
    }
  }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get the current page path (normalized)
 * @returns {string} Page path like '/', '/product', '/cart'
 */
export function getCurrentPagePath() {
  const path = window.location.pathname;

  // Normalize paths
  if (path === '/' || path === '/index.html' || path === '') return '/';
  if (path.startsWith('/product/') || path.includes('product.html')) return '/product';
  if (path.startsWith('/order/') || path.includes('order.html')) return '/order';

  // Remove .html extension and trailing slashes
  return path.replace(/\.html$/, '').replace(/\/$/, '') || '/';
}

/**
 * Get merged configuration for a module (global + page overrides)
 * @param {string} moduleName - Name of the module
 * @param {string} [pageOverride] - Optional page path override
 * @returns {Object} Merged configuration
 */
export function getModuleConfig(moduleName, pageOverride = null) {
  const moduleConfig = MODULE_CONFIG[moduleName];
  if (!moduleConfig) {
    console.warn(`[ModuleConfig] Unknown module: ${moduleName}`);
    return {};
  }

  const currentPage = pageOverride || getCurrentPagePath();
  const globalConfig = moduleConfig.global || {};
  const pageConfig = moduleConfig.pageOverrides?.[currentPage] || {};

  // Deep merge global and page config
  return deepMerge(globalConfig, pageConfig);
}

/**
 * Get selectors for a module (global + page-specific)
 * @param {string} moduleName - Name of the module
 * @param {string} [pageOverride] - Optional page path override
 * @returns {string[]} Array of CSS selectors
 */
export function getSelectors(moduleName, pageOverride = null) {
  const moduleConfig = MODULE_CONFIG[moduleName];
  if (!moduleConfig) return [];

  const currentPage = pageOverride || getCurrentPagePath();
  const globalSelectors = moduleConfig.global?.selectors || [];
  const pageOverrideConfig = moduleConfig.pageOverrides?.[currentPage] || {};

  // Combine global selectors with page-specific additional selectors
  const additionalSelectors = pageOverrideConfig.additionalSelectors || [];
  const pageSelectors = pageOverrideConfig.selectors; // Full override if provided

  // If page has full selector override, use that; otherwise combine
  if (pageSelectors) {
    return pageSelectors;
  }

  return [...new Set([...globalSelectors, ...additionalSelectors])];
}

/**
 * Apply CSS variables for current page
 * @param {string} [pageOverride] - Optional page path override
 */
export function applyCSSVariables(pageOverride = null) {
  const currentPage = pageOverride || getCurrentPagePath();

  const globalVars = CSS_VARIABLES.global || {};
  const pageVars = CSS_VARIABLES.pageOverrides?.[currentPage] || {};

  const mergedVars = { ...globalVars, ...pageVars };

  Object.entries(mergedVars).forEach(([key, value]) => {
    document.documentElement.style.setProperty(key, value);
  });
}

/**
 * Check if a module is enabled for current page
 * @param {string} moduleName - Name of the module
 * @param {string} [pageOverride] - Optional page path override
 * @returns {boolean}
 */
export function isModuleEnabled(moduleName, pageOverride = null) {
  const config = getModuleConfig(moduleName, pageOverride);
  return config.enabled !== false;
}

/**
 * Get all configured modules
 * @returns {string[]} Array of module names
 */
export function getConfiguredModules() {
  return Object.keys(MODULE_CONFIG);
}

/**
 * Deep merge two objects
 * @param {Object} target - Target object
 * @param {Object} source - Source object (overrides target)
 * @returns {Object} Merged object
 */
function deepMerge(target, source) {
  const result = { ...target };

  for (const key in source) {
    if (source[key] instanceof Object && key in target && target[key] instanceof Object) {
      // Don't merge arrays, just override
      if (Array.isArray(source[key])) {
        result[key] = source[key];
      } else {
        result[key] = deepMerge(target[key], source[key]);
      }
    } else {
      result[key] = source[key];
    }
  }

  return result;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize module configuration system
 * Call this early in page load to apply CSS variables
 */
export function initModuleConfig() {
  applyCSSVariables();
}

// Auto-initialize if DOM is ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initModuleConfig);
  } else {
    initModuleConfig();
  }
}

// Export for non-module usage
if (typeof window !== 'undefined') {
  window.ModuleConfig = {
    getModuleConfig,
    getSelectors,
    applyCSSVariables,
    isModuleEnabled,
    getConfiguredModules,
    getCurrentPagePath,
    initModuleConfig
  };
}
