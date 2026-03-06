/**
 * Admin Mini-App Main Entry Point
 * Initializes the application and sets up event listeners
 */

// Core modules
import { state, updateState, isAdmin, isEditor, hasPermission } from './state.js';
import { API_BASE, tg, isBrowserMode } from './config.js';
import { verifyAdminAccess, showAuthLoading, showAccessDenied, logout } from './auth.js';
import { formatDate, formatTime, formatPrice, showToast, showError, copyToClipboard, hideModal, addImageSize, SVGIcons, loadOrderConstants } from './utils.js';
import { toggleTheme, applyTheme } from './theme.js';

// View modules
import { renderDashboard } from './views/dashboard.js';
import { loadOrders, renderOrdersView, updateOrderStatus, addDeliveryCost, addTrackingNumber, cancelOrder, viewOrderDetails, toggleProcessed } from './views/orders.js';
import { loadFeedback, renderFeedbackView, filterFeedback, respondToFeedback, hideFeedback, showFeedback, deleteAdminResponse } from './views/feedback.js';
import { renderActivityFeed, loadActivityFeed, filterFeedType, handleFeedItemClick } from './views/feed.js';
import { loadProducts, renderProductsView, moveProduct } from './views/products.js';
import { renderStatisticsView } from './views/statistics.js';
import { renderProjectManagement } from './views/project-management.js';
import { renderShipmentsView } from './views/shipments.js';
// Promo/certificates now accessible via Orders tab subtabs
// Catalogs view merged into products - catalog management is accessible within products tab

// Component modules
import { showAddProductModal, editProduct, updateImageUrl, updateImageExtra, updateImageDeprecated, updateImageMix, updateImageHidden, updateImageHiddenProduct } from './components/imageManager.js';
import { updateCachedImageHealth } from './utils/imageHealthChecker.js';

/**
 * Initialize theme on page load
 */
function initTheme() {
  applyTheme();

  // Set up theme toggle button
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }
}

/**
 * Check if user has access to a specific view
 */
function canAccessView(viewName) {
  // Admin can access everything
  if (isAdmin()) return true;

  // Editor permissions mapping
  const viewPermissions = {
    'feed': 'feed',
    'products': 'products',
    'statistics': 'statistics',
    'project-management': 'projectManagement',
    // Views editor cannot access
    'orders': null,
    'dashboard': null,
    'feedback': null,
    'shipments': null
  };

  const permKey = viewPermissions[viewName];

  // Null means never accessible for editor
  if (permKey === null) return false;

  // Check permission
  return hasPermission(permKey);
}

/**
 * Update navigation visibility based on permissions
 */
function updateNavigationVisibility() {
  document.querySelectorAll('.nav-button, .header-nav-button').forEach(btn => {
    const viewName = btn.dataset.view;
    if (viewName) {
      const canAccess = canAccessView(viewName);
      btn.style.display = canAccess ? '' : 'none';
    }
  });
}

/**
 * Get default view for current role
 * Returns null if editor has no accessible views
 */
function getDefaultView() {
  // Editor's default view based on permissions
  if (isEditor()) {
    if (hasPermission('feed')) return 'feed';
    if (hasPermission('products')) return 'products';
    if (hasPermission('statistics')) return 'statistics';
    return null; // No accessible views configured
  }

  // Admin default
  return 'feed';
}

// View navigation history for Telegram BackButton support
const _viewHistory = [];

/**
 * Switch between views
 */
function switchView(viewName, addToHistory = true) {
  // Check if user can access this view
  if (!canAccessView(viewName)) {
    showToast('Доступ к этому разделу ограничен', 'error');
    return;
  }

  // Track view history for BackButton
  if (addToHistory && state.currentView && state.currentView !== viewName) {
    _viewHistory.push(state.currentView);
    tg?.BackButton?.show();
  }

  // Update navigation button states
  document.querySelectorAll('.nav-button, .header-nav-button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  // Update state
  updateState({ currentView: viewName });

  // Load view data (each view handles rendering its own content to #content)
  switch(viewName) {
    case 'dashboard':
      renderDashboard();
      break;
    case 'orders':
      renderOrdersView();
      break;
    case 'feedback':
      renderFeedbackView();
      break;
    case 'feed':
      loadActivityFeed();
      break;
    case 'products':
      renderProductsView();
      break;
    case 'statistics':
      renderStatisticsView();
      break;
    case 'project-management':
      renderProjectManagement();
      break;
    case 'shipments':
      renderShipmentsView();
      break;
  }
}

/**
 * Application initialization
 */
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize theme
  initTheme();

  // CRITICAL: Verify admin access before allowing any functionality
  const isAuthorized = await verifyAdminAccess();

  if (!isAuthorized) {
    // Access denied - authentication function already showed the error message
    return;
  }

  // Load order constants from server (feeds getStatusText/getAllStatusOptions)
  await loadOrderConstants(API_BASE);

  // Only proceed if authenticated
  // Modal close
  document.getElementById('modal-close')?.addEventListener('click', hideModal);
  document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') {
      // Ignore clicks arriving shortly after the modal opens (ghost clicks from touch swipe release)
      if (Date.now() - (window._modalShownAt || 0) < 350) return;
      hideModal();
    }
  });

  // Navigation - both bottom nav and header nav
  document.querySelectorAll('.nav-button, .header-nav-button').forEach(btn => {
    btn.addEventListener('click', () => {
      switchView(btn.dataset.view);
    });
  });

  // Telegram BackButton: navigate back through view history instead of closing the MiniApp
  if (tg?.BackButton) {
    tg.BackButton.onClick(() => {
      if (_viewHistory.length > 0) {
        const prev = _viewHistory.pop();
        switchView(prev, false);
        if (_viewHistory.length === 0) tg.BackButton.hide();
      }
    });
  }

  // Update navigation visibility based on role permissions
  updateNavigationVisibility();

  // Load initial view based on role
  const defaultView = getDefaultView();
  if (defaultView) {
    switchView(defaultView);
  } else {
    // Editor has no accessible views configured
    const content = document.getElementById('content');
    if (content) {
      content.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 60vh; padding: var(--spacing-xl); text-align: center;">
          <p style="color: var(--text-secondary); font-size: 1rem;">Доступ к разделам не настроен. Обратитесь к администратору.</p>
        </div>
      `;
    }
  }

  // Initialize tabs carousel scroll fade observer
  initTabsCarouselObserver();

  // Show ready notification
  if (tg) {
    tg.ready();
  }
});

/**
 * Observe DOM for tabs-carousel elements and set up scroll fade
 */
function initTabsCarouselObserver() {
  function setupCarousel(carousel) {
    const container = carousel.querySelector('.tabs-container');
    if (!container || carousel.dataset.carouselInit) return;
    carousel.dataset.carouselInit = 'true';

    function updateFade() {
      const { scrollLeft, scrollWidth, clientWidth } = container;
      const atEnd = scrollLeft + clientWidth >= scrollWidth - 2;
      carousel.classList.toggle('scrolled-end', atEnd);
    }

    container.addEventListener('scroll', updateFade, { passive: true });
    // Initial check
    requestAnimationFrame(updateFade);
  }

  // Set up existing carousels
  document.querySelectorAll('.tabs-carousel').forEach(setupCarousel);

  // Watch for dynamically added carousels
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.classList?.contains('tabs-carousel')) {
          setupCarousel(node);
        }
        node.querySelectorAll?.('.tabs-carousel')?.forEach(setupCarousel);
      }
    }
  });

  observer.observe(document.getElementById('content') || document.body, {
    childList: true,
    subtree: true
  });
}

// ============================================================================
// EXPOSE FUNCTIONS TO WINDOW (for inline onclick/onchange handlers in HTML)
// ============================================================================

// Authentication (used in index.html)
window.logout = logout;

// Image Manager (used in inline onchange handlers for image inputs)
window.updateImageUrl = updateImageUrl;
window.updateImageExtra = updateImageExtra;
window.updateImageDeprecated = updateImageDeprecated;
window.updateImageMix = updateImageMix;
window.updateImageHidden = updateImageHidden;
window.updateImageHiddenProduct = updateImageHiddenProduct;
window.addImageSize = addImageSize;
window.updateCachedImageHealth = updateCachedImageHealth;
