// ============================================================
// UI UTILITIES
// Haptic feedback, navigation, modals, and page loading
// ============================================================

// -------- FOUC PREVENTION --------

/**
 * Initialize page loading state and prevent FOUC
 * Add loading class immediately to hide content
 * Automatically called via IIFE
 */
(function initPageLoading() {
  // Add loading class immediately
  document.documentElement.classList.add('page-loading');
  document.documentElement.classList.remove('page-ready');

  // Function to mark page as ready
  const markPageReady = () => {
    document.documentElement.classList.remove('page-loading');
    document.documentElement.classList.add('page-ready');
  };

  // Wait for fonts and DOM to be ready
  const checkReady = async () => {
    // Wait for fonts if supported
    if (document.fonts && document.fonts.ready) {
      try {
        await document.fonts.ready;
      } catch (e) {
        console.warn('Font loading error:', e);
      }
    }

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
    }

    // Small delay to ensure modules have initialized
    await new Promise(resolve => setTimeout(resolve, 50));

    // Mark as ready
    markPageReady();
  };

  // Start check
  checkReady().catch(err => {
    console.error('Page ready check failed:', err);
    // Fallback: show page anyway after timeout
    setTimeout(markPageReady, 200);
  });
})();

// -------- HAPTIC FEEDBACK --------

/**
 * Triggers haptic feedback on touch devices.
 *
 * Accepts either a semantic type string or a legacy numeric duration:
 *   Impact types:       'soft' | 'light' | 'medium' | 'heavy' | 'rigid'
 *   Notification types: 'success' | 'error' | 'warning'
 *   Selection:          'selection'
 *   Legacy (number):    maps duration ms → nearest impact style
 *
 * Platform priority: Telegram → MAX → VK Bridge → Vibration API
 */
export const triggerHaptic = (typeOrDuration = 'soft') => {
  let impactStyle = null; // for impactOccurred
  let notifType   = null; // for notificationOccurred
  let isSelection = false;
  let vibDuration = 10;

  if (typeof typeOrDuration === 'number') {
    // Legacy duration-to-style mapping
    if (typeOrDuration <= 5)       { impactStyle = 'soft';   vibDuration = 5; }
    else if (typeOrDuration <= 15) { impactStyle = 'light';  vibDuration = typeOrDuration; }
    else if (typeOrDuration <= 25) { impactStyle = 'medium'; vibDuration = typeOrDuration; }
    else                           { impactStyle = 'heavy';  vibDuration = typeOrDuration; }
  } else {
    switch (typeOrDuration) {
      case 'soft':      impactStyle = 'soft';    vibDuration = 5;  break;
      case 'light':     impactStyle = 'light';   vibDuration = 8;  break;
      case 'medium':    impactStyle = 'medium';  vibDuration = 12; break;
      case 'heavy':     impactStyle = 'heavy';   vibDuration = 20; break;
      case 'rigid':     impactStyle = 'rigid';   vibDuration = 10; break;
      case 'success':   notifType   = 'success'; vibDuration = 10; break;
      case 'error':     notifType   = 'error';   vibDuration = 20; break;
      case 'warning':   notifType   = 'warning'; vibDuration = 15; break;
      case 'selection': isSelection = true;      vibDuration = 5;  break;
      default:          impactStyle = 'soft';    vibDuration = 5;
    }
  }

  // 1. Telegram WebApp — full API: impact + notification + selection
  if (window.Telegram?.WebApp?.HapticFeedback) {
    try {
      const hf = window.Telegram.WebApp.HapticFeedback;
      if (notifType)   { hf.notificationOccurred(notifType); return; }
      if (isSelection) { hf.selectionChanged(); return; }
      hf.impactOccurred(impactStyle);
      return;
    } catch (e) { /* fall through */ }
  }

  // 2. MAX WebApp — follows the same HapticFeedback API as Telegram
  if (window.WebApp?.HapticFeedback) {
    try {
      const hf = window.WebApp.HapticFeedback;
      if (notifType)   { hf.notificationOccurred(notifType); return; }
      if (isSelection) { hf.selectionChanged?.(); return; }
      hf.impactOccurred(impactStyle);
      return;
    } catch (e) { /* fall through */ }
  }

  // 3. VK Bridge — supports light/medium/heavy impact, notification types, and selection
  //    VK has no 'soft' or 'rigid'; map those to nearest equivalent
  if (window.vkBridge) {
    try {
      if (notifType) {
        window.vkBridge.send('VKWebAppTapticNotificationOccurred', { type: notifType });
        return;
      }
      if (isSelection) {
        window.vkBridge.send('VKWebAppTapticSelectionChanged');
        return;
      }
      const vkStyle = (impactStyle === 'soft' || impactStyle === 'light') ? 'light'
                    : impactStyle === 'medium' ? 'medium'
                    : 'heavy'; // covers 'heavy' and 'rigid'
      window.vkBridge.send('VKWebAppTapticImpactOccurred', { style: vkStyle });
      return;
    } catch (e) { /* fall through */ }
  }

  // 4. Vibration API — Android Chrome; no-op on iOS Safari outside mini-app contexts
  try { navigator.vibrate?.(vibDuration); } catch (e) { /* not supported */ }
};

// -------- SMOOTH PAGE TRANSITIONS --------

/**
 * Navigate to a URL with smooth transition
 * Uses View Transitions API if supported, falls back to CSS animation
 * @param {string} url - URL to navigate to
 * @param {boolean} useViewTransition - Force use of View Transitions API (default: true)
 * @example
 * smoothNavigate('/products/123')
 */
export const smoothNavigate = async (url, useViewTransition = true) => {
  // Check if View Transitions API is supported and enabled
  const supportsViewTransitions = 'startViewTransition' in document && useViewTransition;

  if (supportsViewTransitions) {
    // Use View Transitions API for smooth cross-document transition
    document.startViewTransition(() => {
      window.location.href = url;
    });
  } else {
    // Fallback: CSS-based fade out before navigation
    document.body.classList.add('page-transition-out');

    // Wait for fade out animation to complete
    await new Promise(resolve => setTimeout(resolve, 120));

    // Navigate
    window.location.href = url;
  }
};

/**
 * Setup smooth navigation for links
 * Intercepts clicks on internal links and adds smooth transitions
 * Automatically excludes external links, downloads, and anchor links
 * @example
 * initSmoothNavigation() // Call once on page load
 */
export const initSmoothNavigation = () => {
  document.addEventListener('click', (e) => {
    // Find the link element (might be nested inside clicked element)
    const link = e.target.closest('a');

    // Skip if not a link or if it's an external link or has special attributes
    if (!link ||
        link.target === '_blank' ||
        link.hasAttribute('download') ||
        link.getAttribute('href')?.startsWith('#') ||
        link.getAttribute('href')?.startsWith('mailto:') ||
        link.getAttribute('href')?.startsWith('tel:')) {
      return;
    }

    const href = link.getAttribute('href');

    // Skip if it's an absolute URL to a different origin
    if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
      try {
        const linkUrl = new URL(href);
        if (linkUrl.origin !== window.location.origin) {
          return;
        }
      } catch (err) {
        return;
      }
    }

    // Skip if explicitly marked to not use smooth navigation
    if (link.hasAttribute('data-no-smooth-nav')) {
      return;
    }

    // Intercept the click and use smooth navigation
    if (href && href !== window.location.pathname + window.location.search) {
      e.preventDefault();
      smoothNavigate(href);
    }
  });
};

/**
 * Prefetch common navigation targets
 * Adds link prefetching for likely next pages to improve perceived performance
 * Prefetches on hover (desktop) and common pages
 * @example
 * initLinkPrefetching() // Call once on page load
 */
export const initLinkPrefetching = () => {
  // Common pages that users are likely to navigate to
  const commonPages = [
    '/catalog',
    '/favorites',
    '/cart',
    '/picker',
    '/profile',
    '/customers'
  ];

  // Get current page
  const currentPath = window.location.pathname;

  // Prefetch pages that are not the current page
  commonPages.forEach(page => {
    if (page !== currentPath) {
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = page;
      link.as = 'document';
      document.head.appendChild(link);
    }
  });

  // Prefetch visible links on hover (for desktop)
  if (window.matchMedia('(hover: hover)').matches) {
    document.addEventListener('mouseover', (e) => {
      const link = e.target.closest('a');
      if (!link) return;

      const href = link.getAttribute('href');
      if (href &&
          !href.startsWith('#') &&
          !href.startsWith('http') &&
          !link.hasAttribute('data-prefetched')) {

        const prefetchLink = document.createElement('link');
        prefetchLink.rel = 'prefetch';
        prefetchLink.href = href;
        prefetchLink.as = 'document';
        document.head.appendChild(prefetchLink);

        // Mark as prefetched to avoid duplicate prefetches
        link.setAttribute('data-prefetched', 'true');
      }
    });
  }
};

// -------- MODALS --------

/**
 * Show a confirmation modal with a message
 * Auto-removes after specified duration
 * @param {string} message - Message to display
 * @param {string} type - Modal type ('info', 'success', 'error')
 * @param {number} duration - Auto-close duration in ms (0 = no auto-close)
 * @example
 * showConfirmationModal('Saved successfully!', 'success', 3000)
 */
export const showConfirmationModal = (message, type = 'info', duration = 3000) => {
  // Remove any existing modal
  const existingModal = document.querySelector('.confirmation-modal');
  if (existingModal) {
    existingModal.remove();
  }

  // Determine icon based on type
  let icon = 'ℹ';
  if (type === 'success') icon = '✓';
  else if (type === 'error') icon = '✕';

  // Create modal
  const modal = document.createElement('div');
  modal.className = `confirmation-modal ${type}`;
  modal.innerHTML = `
    <div class="confirmation-modal-content">
      <div class="confirmation-modal-icon">${icon}</div>
      <div class="confirmation-modal-message">${message}</div>
      <button class="confirmation-modal-button">OK</button>
    </div>
  `;

  // Add to page
  document.body.appendChild(modal);

  // Close on button click
  const button = modal.querySelector('.confirmation-modal-button');
  button.addEventListener('click', () => {
    modal.remove();
  });

  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });

  // Auto-remove after duration if specified
  if (duration > 0) {
    setTimeout(() => {
      if (document.body.contains(modal)) {
        modal.remove();
      }
    }, duration);
  }
};
