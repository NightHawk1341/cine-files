// ============================================================
// UTILITIES MODULE - ES6 REFACTORED
// Backward-compatible wrapper for modular utilities
// ============================================================
//
// This file re-exports from ES6 modules for backward compatibility.
// Old code continues to work via global exports below.
// ============================================================

// Import all modules
import {
  CUSTOM_PRODUCT_ID,
  MOBILE_BREAKPOINT,
  SMALL_MOBILE_BREAKPOINT,
  TOUCH_DEVICE_QUERY,
  HOVER_DEVICE_QUERY,
  propertyToPriceId,
  formatOptions,
  triptychFormatOptions,
  propertyDimensions
} from './core/constants.js';

import {
  favorites,
  cart,
  cartVariations,
  activeCarousels,
  isAdmin,
  allImagesByProduct,
  productPrices
} from './core/state.js';

import {
  escapeHtml,
  formatNumberRussian,
  addImageSize,
  filterImagesByExtra,
  getBaseProperty,
  isVkCdnUrl,
  proxyVkCdnUrl,
  createImageReloadOverlay
} from './core/formatters.js';

import {
  getProductPrice,
  getProductOldPrice,
  sortProductsWithCustomFirst
} from './core/product-helpers.js';

import {
  triggerHaptic,
  smoothNavigate as uiSmoothNavigate,
  initSmoothNavigation,
  initLinkPrefetching,
  showConfirmationModal
} from './core/ui-helpers.js';

import {
  initRouter,
  navigate as routerNavigate,
  smoothNavigate as routerSmoothNavigate,
  registerPage
} from './core/router.js';

import {
  isVKMiniApp,
  getVKLaunchParams,
  getVKUserId,
  getVKPlatform,
  loadVKBridge,
  vkBridgeSend,
  initVKMiniApp,
  initVKAppLifecycle,
  requestVKNotifications,
  vkOpenLink
} from './core/vk-miniapp.js';

import {
  isMAXMiniApp,
  getMAXInitData,
  getMAXUserId,
  initMAXMiniApp,
  initMAXAppLifecycle,
  maxOpenLink
} from './core/max-miniapp.js';

import { isInsideTelegram } from './core/telegram-miniapp.js';

import {
  loadFavorites,
  saveFavorites,
  toggleFavorite,
  toggleFavoriteSynced
} from './core/favorites.js';

import {
  loadProductPrices,
  loadProductImages,
  ensureDataLoaded,
  isPricesLoaded,
  isImagesLoaded
} from './core/data-loaders.js';

import {
  syncFavoritesToServer,
  loadFavoritesFromServer,
  syncCartToServer,
  loadCartFromServer,
  syncPickerToServer,
  loadPickerFromServer
} from './core/data-sync.js';

// ============================================================
// BACKWARD COMPATIBILITY
// Export everything globally for existing code
// ============================================================

// Constants
window.CUSTOM_PRODUCT_ID = CUSTOM_PRODUCT_ID;
window.MOBILE_BREAKPOINT = MOBILE_BREAKPOINT;
window.SMALL_MOBILE_BREAKPOINT = SMALL_MOBILE_BREAKPOINT;
window.TOUCH_DEVICE_QUERY = TOUCH_DEVICE_QUERY;
window.HOVER_DEVICE_QUERY = HOVER_DEVICE_QUERY;
window.propertyToPriceId = propertyToPriceId;
window.formatOptions = formatOptions;
window.triptychFormatOptions = triptychFormatOptions;
window.propertyDimensions = propertyDimensions;

// State (already exported by state.js, but ensure consistency)
window.favorites = favorites;
window.cart = cart;
window.cartVariations = cartVariations;
window.activeCarousels = activeCarousels;
window.isAdmin = isAdmin;
window.allImagesByProduct = allImagesByProduct;
window.productPrices = productPrices;

// Formatters
window.escapeHtml = escapeHtml;
window.formatNumberRussian = formatNumberRussian;
window.addImageSize = addImageSize;
window.filterImagesByExtra = filterImagesByExtra;
window.getBaseProperty = getBaseProperty;
window.isVkCdnUrl = isVkCdnUrl;
window.proxyVkCdnUrl = proxyVkCdnUrl;
window.createImageReloadOverlay = createImageReloadOverlay;

// Product helpers
window.getProductPrice = getProductPrice;
window.getProductOldPrice = getProductOldPrice;
window.sortProductsWithCustomFirst = sortProductsWithCustomFirst;

// UI helpers
window.triggerHaptic = triggerHaptic;
window.smoothNavigate = routerSmoothNavigate; // Use router's version
window.initSmoothNavigation = initSmoothNavigation;
window.initLinkPrefetching = initLinkPrefetching;
window.showConfirmationModal = showConfirmationModal;

// Router
window.spaNavigate = routerNavigate;
window.registerPage = registerPage;
window.initRouter = initRouter;

// VK Mini App
window.isVKMiniApp = isVKMiniApp;
window.getVKLaunchParams = getVKLaunchParams;
window.getVKUserId = getVKUserId;
window.vkOpenLink = vkOpenLink;
window.requestVKNotifications = requestVKNotifications;

// Telegram Mini App
window.isInsideTelegram = isInsideTelegram;

// MAX Mini App
window.isMAXMiniApp = isMAXMiniApp;
window.getMAXInitData = getMAXInitData;
window.getMAXUserId = getMAXUserId;
window.maxOpenLink = maxOpenLink;

// Favorites
window.loadFavorites = loadFavorites;
window.saveFavorites = saveFavorites;
window.toggleFavorite = toggleFavorite;
window.toggleFavoriteSynced = toggleFavoriteSynced;

// Data loaders
window.loadProductPrices = loadProductPrices;
window.loadProductImages = loadProductImages;
window.ensureDataLoaded = ensureDataLoaded;
window.isPricesLoaded = isPricesLoaded;
window.isImagesLoaded = isImagesLoaded;

// Data sync
window.syncFavoritesToServer = syncFavoritesToServer;
window.loadFavoritesFromServer = loadFavoritesFromServer;
window.syncCartToServer = syncCartToServer;
window.loadCartFromServer = loadCartFromServer;
window.syncPickerToServer = syncPickerToServer;
window.loadPickerFromServer = loadPickerFromServer;

// ============================================================
// INITIALIZATION
// ============================================================

// Track if utils has been initialized
let utilsInitialized = false;

/**
 * Initialize Telegram WebApp viewport handling
 * Fixes touch/scroll issues when switching back to the miniapp
 */
function initTelegramWebApp() {
  const tg = window.Telegram?.WebApp;
  if (!tg) return;

  if (!isInsideTelegram()) return;

  // Expand to full height
  tg.expand();

  // Disable vertical swipes that can interfere with scrolling
  if (tg.disableVerticalSwipes) {
    tg.disableVerticalSwipes();
  }

  // Never call BackButton.show() — that would replace the X close button with a
  // back arrow. Back-gesture support comes from the WebView's own history stack:
  // the SPA router calls history.pushState() on every navigation, so the system
  // back gesture triggers history.back() natively and fires the router's popstate
  // handler. The onClick below is a silent safety net for SDK versions that might
  // route the gesture through this callback even when the button is not visible.
  if (tg.BackButton) {
    tg.BackButton.onClick(() => {
      window.history.back();
    });
  }

  // Saved scroll position from when the app was hidden; restored when shown again
  let _scrollToRestore = 0;

  // Handle viewport changes (when keyboard opens/closes, app switch, etc.)
  tg.onEvent('viewportChanged', ({ isStateStable }) => {
    if (isStateStable) {
      // Use the position saved on hide; fall back to current if not set
      const scrollY = _scrollToRestore > 0 ? _scrollToRestore : window.scrollY;
      // Force layout recalculation when viewport stabilizes
      document.body.style.height = `${tg.viewportStableHeight}px`;
      // Trigger reflow
      void document.body.offsetHeight;
      // Reset to auto after reflow; restore scroll if height change clamped it
      requestAnimationFrame(() => {
        document.body.style.height = '';
        if (scrollY > 0 && window.scrollY < scrollY) {
          window.scrollTo(0, scrollY);
          _scrollToRestore = 0;
        }
      });
    }
  });

  // Fix for touch events after app switch
  // When coming back to the app, reset any stuck touch states
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // Save scroll position before platform can reset it
      _scrollToRestore = window.scrollY;
    } else {
      // Clear any lingering active states
      document.querySelectorAll(':active, :hover').forEach(el => {
        el.blur?.();
      });
      // Restore scroll if platform reset it while the app was hidden
      if (_scrollToRestore > 0 && window.scrollY < _scrollToRestore) {
        const savedY = _scrollToRestore;
        requestAnimationFrame(() => window.scrollTo(0, savedY));
      }
      _scrollToRestore = 0;
    }
  });

}

/**
 * Initialize utilities module
 * Loads prices, images, favorites, and initializes SPA router
 */
const initUtils = async () => {
  if (utilsInitialized) {
    // Already initialized, just ensure data is loaded
    await ensureDataLoaded();
    return;
  }

  // Initialize Telegram WebApp viewport handling
  initTelegramWebApp();

  // Initialize VK Mini App if running inside VK
  if (isVKMiniApp()) {
    initVKMiniApp().catch(() => {});
    initVKAppLifecycle().catch(() => {});
  }

  // Initialize MAX Mini App if running inside MAX
  if (isMAXMiniApp()) {
    initMAXMiniApp();
    initMAXAppLifecycle();
  }

  // Restrict context menu and middle-click in miniapp environments
  const _isInsideMiniApp = isVKMiniApp() || isMAXMiniApp() || isInsideTelegram();
  if (_isInsideMiniApp) {
    // Block context menu globally (right-click / mobile long-press) to prevent
    // the browser from revealing image or link URLs on long-press.
    // header.js registers the same handler at load time; this is a defence-in-depth
    // layer that also covers VK/MAX and runs once utils.js has confirmed mini-app context.
    document.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    }, { capture: true, passive: false });
    // mousedown fires before the browser opens a new tab, so this actually prevents it.
    // auxclick alone is too late on most engines.
    document.addEventListener('mousedown', (e) => {
      if (e.button === 1 && e.target.closest('a[href]')) e.preventDefault();
    }, true);
    // auxclick as a secondary guard for middle-click
    document.addEventListener('auxclick', (e) => {
      if (e.button === 1 && e.target.closest('a[href]')) e.preventDefault();
    }, true);
    // Drag link/image to address bar
    document.addEventListener('dragstart', (e) => {
      if (e.target.closest('a, img')) e.preventDefault();
    });
    // CSS: suppress native callout on mobile; disable selection on interactive elements
    // (inputs/textareas restored so typing still works)
    const _s = document.createElement('style');
    _s.textContent = [
      '*{-webkit-touch-callout:none!important}',
      'a,button,img,[role="button"]{-webkit-user-select:none!important;user-select:none!important}',
      'input,textarea,[contenteditable="true"]{-webkit-user-select:text!important;user-select:text!important}'
    ].join('');
    document.head.appendChild(_s);
  }


  loadFavorites();

  // Link prefetching for better performance
  initLinkPrefetching();

  // Initialize SPA router for client-side navigation
  initRouter();

  await Promise.all([
    loadProductPrices(),
    loadProductImages()
  ]);

  utilsInitialized = true;

  // Dispatch global event that data is ready
  window.dispatchEvent(new CustomEvent('utilsDataReady'));
};

// Create global promise for initialization
window.utilsReady = (async () => {
  if (document.readyState === 'loading') {
    await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
  }
  await initUtils();
})();

// Helper function for pages to wait for data
window.waitForData = async () => {
  // If data is already available, return immediately
  if (isPricesLoaded() && isImagesLoaded()) {
    return true;
  }

  // Otherwise wait for utilsReady
  if (window.utilsReady) {
    await window.utilsReady;
  }

  return isPricesLoaded() && isImagesLoaded();
};

// ============================================================
// ES6 EXPORTS
// For modern code that wants to import directly
// ============================================================

// Use router's smoothNavigate as the default
const smoothNavigate = routerSmoothNavigate;

export {
  // Constants
  CUSTOM_PRODUCT_ID,
  propertyToPriceId,
  formatOptions,
  triptychFormatOptions,
  propertyDimensions,

  // State
  favorites,
  cart,
  cartVariations,
  activeCarousels,
  isAdmin,
  allImagesByProduct,
  productPrices,

  // Formatters
  escapeHtml,
  formatNumberRussian,
  addImageSize,
  filterImagesByExtra,
  getBaseProperty,
  isVkCdnUrl,
  proxyVkCdnUrl,
  createImageReloadOverlay,

  // Product helpers
  getProductPrice,
  getProductOldPrice,
  sortProductsWithCustomFirst,

  // UI helpers
  triggerHaptic,
  smoothNavigate,
  initSmoothNavigation,
  initLinkPrefetching,
  showConfirmationModal,

  // Router
  initRouter,
  routerNavigate as navigate,
  registerPage,

  // Favorites
  loadFavorites,
  saveFavorites,
  toggleFavorite,
  toggleFavoriteSynced,

  // Data loaders
  loadProductPrices,
  loadProductImages,

  // Data sync
  syncFavoritesToServer,
  loadFavoritesFromServer,
  syncCartToServer,
  loadCartFromServer,
  syncPickerToServer,
  loadPickerFromServer,

  // Telegram Mini App
  isInsideTelegram,

  // VK Mini App
  isVKMiniApp,
  getVKLaunchParams,
  getVKUserId,
  getVKPlatform,
  loadVKBridge,
  vkBridgeSend,
  initVKMiniApp,
  requestVKNotifications,
  vkOpenLink,

  // MAX Mini App
  isMAXMiniApp,
  getMAXInitData,
  getMAXUserId,
  maxOpenLink
};
