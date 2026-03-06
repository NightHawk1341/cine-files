/**
 * Page Grain Effect
 * Adds animated grain layers to the whole page for texture effect
 * Elements are excluded from grain via CSS z-index
 */

(function() {
  'use strict';

  function isMobileFirefox() {
    const ua = navigator.userAgent;
    return /Firefox\//.test(ua) && (/Android/.test(ua) || /Mobile/.test(ua));
  }

  const _skipPageGrain = isMobileFirefox();

  // Grain image path and preload promise (cached for reuse)
  const GRAIN_IMAGE_PATH = '/images/TRIBUTE_GRAIN_WHITE.png';
  let grainImagePromise = null;

  // Preload grain image before showing grain layers
  function preloadGrainImage() {
    if (!grainImagePromise) {
      grainImagePromise = new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = () => resolve(); // Still resolve on error to prevent blocking
        img.src = GRAIN_IMAGE_PATH;
      });
    }
    return grainImagePromise;
  }

  // Start preloading immediately
  preloadGrainImage();

  if (!_skipPageGrain) {
    // Wait for DOM ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }

    // Re-initialize on SPA navigation events
    window.addEventListener('spa:pageenter', handleNavigation);
    window.addEventListener('popstate', handleNavigation);

    // Periodic check to ensure grain persists (fallback for edge cases)
    setInterval(ensureGrainExists, 1000);
  }

  function handleNavigation() {
    // Multiple attempts to ensure grain exists after navigation
    ensureGrainExists();
    requestAnimationFrame(() => {
      ensureGrainExists();
    });
    // Delayed check for slow renders
    setTimeout(() => {
      ensureGrainExists();
    }, 100);
  }

  function init() {
    ensureGrainExists();
  }

  function ensureGrainExists() {
    // Check if grain layers actually exist in DOM
    const existingGrain = document.querySelector('.page-grain-layer');
    if (!existingGrain) {
      addPageGrain(document.body);
    }
  }

  function addPageGrain(element) {
    // Create 2 dark grain layers and 2 light grain layers for noise effect
    const darkLayers = [
      { offset: 0, posOffset: 0 },
      { offset: -0.125, posOffset: 250 }
    ];

    const lightLayers = [
      { offset: -0.25, posOffset: 500 },
      { offset: -0.375, posOffset: 750 }
    ];

    const createdLayers = [];

    darkLayers.forEach((layer) => {
      const grain = document.createElement('div');
      grain.className = 'page-grain-layer page-grain-dark';
      const randomOffset = layer.offset - Math.random() * 0.125;
      grain.style.setProperty('--flip-delay', `${randomOffset}s`);
      grain.style.setProperty('--pos-offset', `${layer.posOffset}px`);
      element.appendChild(grain);
      createdLayers.push(grain);
    });

    lightLayers.forEach((layer) => {
      const grain = document.createElement('div');
      grain.className = 'page-grain-layer page-grain-light';
      const randomOffset = layer.offset - Math.random() * 0.125;
      grain.style.setProperty('--flip-delay', `${randomOffset}s`);
      grain.style.setProperty('--pos-offset', `${layer.posOffset}px`);
      element.appendChild(grain);
      createdLayers.push(grain);
    });

    // Fade in grain layers once image is loaded
    preloadGrainImage().then(() => {
      // Use requestAnimationFrame to ensure layers are rendered before fading in
      requestAnimationFrame(() => {
        createdLayers.forEach(layer => {
          layer.classList.add('grain-loaded');
        });
      });
    });
  }

  /**
   * Add grain to a modal/popup backdrop
   * Also adds modal-backdrop-active class to body to hide page grain
   * @param {HTMLElement} backdrop - The backdrop element to add grain to
   */
  function addBackdropGrain(backdrop) {
    if (!backdrop || backdrop.querySelector('.backdrop-grain-layer')) {
      return;
    }

    // Add class to body to hide page grain (backdrop has its own grain)
    document.body.classList.add('modal-backdrop-active');

    // Create grain layers (2 dark + 2 light, less intense than page grain)
    const layers = [
      { type: 'dark', offset: 0, posOffset: 0 },
      { type: 'dark', offset: -0.125, posOffset: 250 },
      { type: 'light', offset: -0.25, posOffset: 500 },
      { type: 'light', offset: -0.375, posOffset: 750 }
    ];

    layers.forEach((layer) => {
      const grain = document.createElement('div');
      grain.className = `backdrop-grain-layer backdrop-grain-${layer.type}`;
      const randomOffset = layer.offset - Math.random() * 0.125;
      grain.style.setProperty('--flip-delay', `${randomOffset}s`);
      grain.style.setProperty('--pos-offset', `${layer.posOffset}px`);
      backdrop.appendChild(grain);
    });
  }

  /**
   * Remove grain from a modal/popup backdrop
   * Also removes modal-backdrop-active class from body to show page grain
   * @param {HTMLElement} backdrop - The backdrop element to remove grain from
   */
  function removeBackdropGrain(backdrop) {
    if (!backdrop) {
      return;
    }

    // Remove grain layers
    backdrop.querySelectorAll('.backdrop-grain-layer').forEach(layer => layer.remove());

    // Only remove body class if no other backdrops with grain are active
    const otherBackdrops = document.querySelectorAll('.backdrop-grain-layer');
    if (otherBackdrops.length === 0) {
      document.body.classList.remove('modal-backdrop-active');
    }
  }

  // Restore scroll when returning from another tab
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      const catalogsCarousel = document.querySelector('.catalogs');

      // Ensure scroll is not locked when it shouldn't be
      if (!document.body.classList.contains('modal-open') &&
          !document.body.classList.contains('sheet-open') &&
          !document.body.classList.contains('popup-open')) {
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.top = '';
        document.documentElement.style.overflow = '';
      }

      // Re-enable touch scrolling on carousels
      if (catalogsCarousel) {
        catalogsCarousel.style.touchAction = 'pan-x';
        catalogsCarousel.style.overflowX = 'auto';
      }

      // Note: Removed scroll hack (scrollTo +1/-1) as it caused scroll jumps on mobile
    }
  });

  // Expose functions globally
  window.reinitPageGrain = ensureGrainExists;
  window.addBackdropGrain = addBackdropGrain;
  window.removeBackdropGrain = removeBackdropGrain;
})();
