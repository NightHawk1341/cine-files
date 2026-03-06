/**
 * Unified Mobile Feedback System
 * Provides consistent haptic feedback and visual effects for mobile interactions
 *
 * Now uses centralized configuration from module-config.js for:
 * - Page-specific selectors
 * - CSS variable management
 * - Haptic duration settings
 */

import { getSelectors, getModuleConfig, isModuleEnabled, applyCSSVariables } from '../core/module-config.js';
import { MOBILE_BREAKPOINT, TOUCH_DEVICE_QUERY } from '../core/constants.js';
import { triggerHaptic } from '../core/ui-helpers.js';

const isTouchDevice = () => window.matchMedia(TOUCH_DEVICE_QUERY).matches;

function isMobileFirefox() {
  const ua = navigator.userAgent;
  return /Firefox\//.test(ua) && (/Android/.test(ua) || /Mobile/.test(ua));
}

const _skipGrain = isMobileFirefox();

/**
 * Element-Contained Ripple System
 * Creates Android-style ripples inside elements, clipped by their containers
 * Ripple size is dynamic based on element dimensions
 */

let activeRipple = null;
let activeGrain = null;
let activeGrainMid = null;
let activeGrainCenter = null;
let activeGrainCore = null;
let activeClipper = null;
let activeTarget = null;
let activeContainer = null;
let rippleTimeout = null;
let touchStartPos = null;
let isTouchCancelled = false;
let rippleListenersInitialized = false;
let isProcessingTouch = false;
let processingTouchTimeout = null; // Failsafe timeout for processing guard
let navigationClickListenerInitialized = false; // Track if click listener is set up
let grainPositionTrackerId = null; // RAF ID for tracking element position

// Selectors for elements that should receive ripple feedback
const RIPPLE_SELECTORS = [
  '.card-format-minus',
  '.card-format-plus',
  '.price-row-add-btn',
  '.card-in-cart-text',
  'button:not([disabled])',
  'a[href]',
  '[role="button"]',
  '.mobile-feedback',
  '.bottom-nav-button',
  '.header-back-button',
  '.header-burger-button',
  '.header-gear-button',
  '.header-profile-button',
  '.header-icon-button',
  '.btn',
  '.button',
  '.product-card',
  '.catalog-card',
  '.cart-item',
  '.favorite-item',
  '.faq-item-header',
  '.faq-category-header',
  '.picker-control-button',
  '.gallery-image',
  '.footer-social-link',
  '.footer-logo',
  '.toast-dismiss',
  '.order-filter-btn',
  '.favorites-filter-btn',
  '.catalog-filter-btn'
].join(',');

// Selectors for known parent containers (in priority order)
const CONTAINER_SELECTORS = [
  '.card-format-counter',
  '.price-row',
  '.bottom-nav',
  '.header',
  '.cart-item',
  '.cart-item-controls',
  '.picker-controls',
  '.footer',
  '.products-header',
  '.popup-header',
  '.popup-content',
  '.faq-item',
  '.favorites-filter-buttons',
  '.order-filters'
];

// Selectors for floating buttons that spread ripple over page content
// Ripple uses body as container but stays below bottom nav (z-index: 999)
const FLOATING_RIPPLE_SELECTORS = [
  '.scroll-to-top-btn',
  '.scrubber-trigger-button'
];

// Scroll threshold - if touch moves more than this, cancel ripple
const SCROLL_THRESHOLD = 10;

// Minimum ripple size to ensure visibility on small elements
const MIN_RIPPLE_SIZE = 120;

/**
 * Find the appropriate container for the ripple
 * Returns { container, isFloating } where isFloating means ripple should be under bottom nav
 */
function findRippleContainer(element) {
  // Check if element is a floating button (ripple spreads over content, under bottom nav)
  for (const selector of FLOATING_RIPPLE_SELECTORS) {
    if (element.matches(selector) || element.closest(selector)) {
      return { container: document.body, isFloating: true };
    }
  }

  // Try to find a known parent container
  for (const containerSelector of CONTAINER_SELECTORS) {
    const container = element.closest(containerSelector);
    if (container) {
      return { container, isFloating: false };
    }
  }

  // Fallback: use the immediate parent element
  const parent = element.parentElement;
  if (parent && parent !== document.body) {
    return { container: parent, isFloating: false };
  }

  // Last resort: use body
  return { container: document.body, isFloating: false };
}

/**
 * Calculate ripple size based on ELEMENT dimensions
 * Ripple should cover the interactive element, not the whole container
 */
function calculateRippleSize(container, element) {
  const elementRect = element.getBoundingClientRect();

  // Size based on element's diagonal - ripple should just cover the element
  const diagonal = Math.sqrt(elementRect.width * elementRect.width + elementRect.height * elementRect.height);

  // Use 1.5x diagonal to ensure full coverage from center
  const size = Math.max(diagonal * 1.5, MIN_RIPPLE_SIZE);

  return Math.ceil(size);
}

/**
 * Track element position and update grain/ripple if element moves (e.g., scale on press)
 */
function startGrainPositionTracking(target, grain, ripple, container, isFloating) {
  // Cancel any existing tracking
  stopGrainPositionTracking();

  // Store initial position for comparison
  let lastRect = target.getBoundingClientRect();

  function updatePosition() {
    // Stop if grain is removed
    if (!grain.parentNode) {
      stopGrainPositionTracking();
      return;
    }

    const currentRect = target.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    // Only update if position/size has changed
    if (currentRect.left !== lastRect.left ||
        currentRect.top !== lastRect.top ||
        currentRect.width !== lastRect.width ||
        currentRect.height !== lastRect.height) {

      // Update grain position
      if (isFloating) {
        grain.style.setProperty('--grain-left', `${currentRect.left}px`);
        grain.style.setProperty('--grain-top', `${currentRect.top}px`);
      } else {
        grain.style.setProperty('--grain-left', `${currentRect.left - containerRect.left}px`);
        grain.style.setProperty('--grain-top', `${currentRect.top - containerRect.top}px`);
      }
      grain.style.setProperty('--grain-width', `${currentRect.width}px`);
      grain.style.setProperty('--grain-height', `${currentRect.height}px`);

      // Update ripple center position
      const centerX = isFloating
        ? currentRect.left + currentRect.width / 2
        : (currentRect.left + currentRect.width / 2) - containerRect.left;
      const centerY = isFloating
        ? currentRect.top + currentRect.height / 2
        : (currentRect.top + currentRect.height / 2) - containerRect.top;

      ripple.style.left = `${centerX}px`;
      ripple.style.top = `${centerY}px`;

      lastRect = currentRect;
    }

    // Continue tracking
    grainPositionTrackerId = requestAnimationFrame(updatePosition);
  }

  // Start tracking
  grainPositionTrackerId = requestAnimationFrame(updatePosition);
}

/**
 * Stop tracking element position
 */
function stopGrainPositionTracking() {
  if (grainPositionTrackerId) {
    cancelAnimationFrame(grainPositionTrackerId);
    grainPositionTrackerId = null;
  }
}

/**
 * Pre-apply position: relative to all potential ripple containers.
 * Doing this at init time avoids synchronous layout mutations during touchstart,
 * which cause flicker and element jumps in Firefox.
 */
function preApplyRipplePositioning() {
  if (!isTouchDevice()) return;

  // Known containers listed explicitly
  CONTAINER_SELECTORS.forEach(selector => {
    document.querySelectorAll(selector).forEach(el => {
      if (window.getComputedStyle(el).position === 'static') {
        el.style.position = 'relative';
      }
    });
  });

  // Fallback containers: parents of ripple targets that don't match any known container
  document.querySelectorAll(RIPPLE_SELECTORS).forEach(el => {
    const hasKnownContainer = CONTAINER_SELECTORS.some(sel => el.closest(sel));
    if (!hasKnownContainer) {
      const parent = el.parentElement;
      if (parent && parent !== document.body && window.getComputedStyle(parent).position === 'static') {
        parent.style.position = 'relative';
      }
    }
  });
}

/**
 * Initialize the ripple system with document-level touch listeners
 */
function initRippleOverlay() {
  // Only on touch devices
  if (!isTouchDevice()) return;

  // Don't double-init listeners
  if (rippleListenersInitialized) return;
  rippleListenersInitialized = true;

  // Handle touch events at document level
  document.addEventListener('touchstart', handleTouchStart, { passive: true });
  document.addEventListener('touchmove', handleTouchMove, { passive: true });
  document.addEventListener('touchend', handleTouchEnd, { passive: true });
  document.addEventListener('touchcancel', handleTouchCancel, { passive: true });

  // Watch for elements being removed to clean up their ripples and grain
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.removedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // If the removed node contains our active ripple target, clear the ripple
          if (activeTarget && (node === activeTarget || node.contains(activeTarget))) {
            clearActiveRipple();
          }
          if (activeContainer && (node === activeContainer || node.contains(activeContainer))) {
            clearActiveRipple();
          }
          // Also clean up any orphaned ripples and grain inside removed elements
          if (node.querySelectorAll) {
            node.querySelectorAll('.ripple-effect, .ripple-grain').forEach(r => r.remove());
          }
        }
      });
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

/**
 * Handle touch start - create ripple at element CENTER
 */
function handleTouchStart(e) {
  // Guard against multiple simultaneous touches (with failsafe)
  if (isProcessingTouch) {
    // Failsafe: if guard has been set for too long, reset it
    return;
  }

  const touch = e.touches[0];
  if (!touch) return;

  // Store touch start position for scroll detection
  touchStartPos = { x: touch.clientX, y: touch.clientY };
  isTouchCancelled = false;

  // Find the interactive element at touch point
  const target = document.elementFromPoint(touch.clientX, touch.clientY);
  if (!target) return;

  // Find the closest matching interactive element
  const interactiveTarget = target.closest(RIPPLE_SELECTORS);
  if (!interactiveTarget) return;

  // Don't ripple on disabled elements
  if (interactiveTarget.disabled || interactiveTarget.classList.contains('disabled') || interactiveTarget.getAttribute('aria-disabled') === 'true') return;

  // Set processing guard with failsafe timeout
  isProcessingTouch = true;
  if (processingTouchTimeout) clearTimeout(processingTouchTimeout);
  processingTouchTimeout = setTimeout(() => {
    isProcessingTouch = false;
  }, 1000); // Failsafe: reset after 1 second max

  // Clear any existing ripple immediately
  clearActiveRipple();

  // Store reference to target element
  activeTarget = interactiveTarget;

  // Find the appropriate container for the ripple
  const { container, isFloating } = findRippleContainer(interactiveTarget);
  activeContainer = container;

  // Ensure container can contain the ripple
  // Track if we modified the position so we can restore it later
  const computedStyle = window.getComputedStyle(container);
  let originalPosition = null;
  if (computedStyle.position === 'static') {
    originalPosition = container.style.position || '';
    container.style.position = 'relative';
    container.dataset.ripplePositionModified = 'true';
  }

  // Get element CENTER position relative to container
  const containerRect = container.getBoundingClientRect();

  // Create soft-edge clipper wrapper - fades ripple at container boundaries
  let clipper = null;
  if (!isFloating) {
    clipper = document.createElement('div');
    clipper.className = 'ripple-clipper';
    container.insertBefore(clipper, container.firstChild);
    activeClipper = clipper;
  }
  const targetRect = interactiveTarget.getBoundingClientRect();
  const centerX = (targetRect.left + targetRect.width / 2) - containerRect.left;
  const centerY = (targetRect.top + targetRect.height / 2) - containerRect.top;

  // Calculate dynamic ripple size
  const rippleSize = calculateRippleSize(container, interactiveTarget);

  // Create ripple element inside the container
  const ripple = document.createElement('div');
  ripple.className = 'ripple-effect';
  ripple.style.width = `${rippleSize}px`;
  ripple.style.height = `${rippleSize}px`;
  ripple.style.left = `${centerX}px`;
  ripple.style.top = `${centerY}px`;

  // For floating buttons, use fixed positioning and z-index below bottom nav
  if (isFloating) {
    ripple.style.position = 'fixed';
    ripple.style.zIndex = '999'; // Below bottom nav (1000)
    ripple.style.left = `${targetRect.left + targetRect.width / 2}px`;
    ripple.style.top = `${targetRect.top + targetRect.height / 2}px`;
  }

  let grain = null;
  let grainMid = null;
  let grainCenter = null;
  let grainCore = null;

  if (!_skipGrain) {
    // Create grain overlay element (masked by SVG with grainy edges)
    // Grain is positioned to cover the target element with mask expanding from center
    grain = document.createElement('div');
    grain.className = 'ripple-grain';

    // Calculate mask size as percentage of the 800px grain texture
    // Small elements get boosted so ripple is visible, large elements capped
    const grainTextureSize = 800;
    const maskSizePercent = Math.ceil((rippleSize / grainTextureSize) * 100);
    // Min 25% for small elements, max 75% for large ones
    grain.style.setProperty('--mask-size-target', `${Math.min(Math.max(maskSizePercent, 25), 75)}%`);

    // Random initial flip - set negative animation-delay to start at random point in flip cycle
    // Flip animation is 0.5s with 4 states, so random delay from 0 to -0.5s
    // Main layer: no offset, just random
    const randomFlipDelay = -Math.random() * 0.125;
    grain.style.setProperty('--flip-delay', `${randomFlipDelay}s`);

    // Position grain to match target element within container
    grain.style.setProperty('--grain-width', `${targetRect.width}px`);
    grain.style.setProperty('--grain-height', `${targetRect.height}px`);
    grain.style.setProperty('--grain-left', `${targetRect.left - containerRect.left}px`);
    grain.style.setProperty('--grain-top', `${targetRect.top - containerRect.top}px`);

    // For floating buttons, grain uses fixed positioning below bottom nav
    if (isFloating) {
      grain.style.position = 'fixed';
      grain.style.zIndex = '999';
      grain.style.setProperty('--grain-left', `${targetRect.left}px`);
      grain.style.setProperty('--grain-top', `${targetRect.top}px`);
    }

    // Create mid grain layer - smaller mask than main
    grainMid = document.createElement('div');
    grainMid.className = 'ripple-grain ripple-grain-mid';
    // Mid mask - about 60% of the main grain size
    const midMaskSize = Math.min(Math.max(maskSizePercent * 0.6, 15), 45);
    grainMid.style.setProperty('--mask-size-target', `${midMaskSize}%`);
    // Offset by 0.125s (25% into flip cycle) + random variation
    const randomFlipDelayMid = -0.125 - Math.random() * 0.125;
    grainMid.style.setProperty('--flip-delay', `${randomFlipDelayMid}s`);
    grainMid.style.setProperty('--grain-width', `${targetRect.width}px`);
    grainMid.style.setProperty('--grain-height', `${targetRect.height}px`);
    grainMid.style.setProperty('--grain-left', `${targetRect.left - containerRect.left}px`);
    grainMid.style.setProperty('--grain-top', `${targetRect.top - containerRect.top}px`);

    if (isFloating) {
      grainMid.style.position = 'fixed';
      grainMid.style.zIndex = '999';
      grainMid.style.setProperty('--grain-left', `${targetRect.left}px`);
      grainMid.style.setProperty('--grain-top', `${targetRect.top}px`);
    }

    // Create center grain layer - smaller mask than mid
    grainCenter = document.createElement('div');
    grainCenter.className = 'ripple-grain ripple-grain-center';
    const centerMaskSize = Math.min(Math.max(maskSizePercent * 0.4, 10), 30);
    grainCenter.style.setProperty('--mask-size-target', `${centerMaskSize}%`);
    // Offset by 0.25s (50% into flip cycle) + random variation
    const randomFlipDelayCenter = -0.25 - Math.random() * 0.125;
    grainCenter.style.setProperty('--flip-delay', `${randomFlipDelayCenter}s`);
    grainCenter.style.setProperty('--grain-width', `${targetRect.width}px`);
    grainCenter.style.setProperty('--grain-height', `${targetRect.height}px`);
    grainCenter.style.setProperty('--grain-left', `${targetRect.left - containerRect.left}px`);
    grainCenter.style.setProperty('--grain-top', `${targetRect.top - containerRect.top}px`);

    if (isFloating) {
      grainCenter.style.position = 'fixed';
      grainCenter.style.zIndex = '999';
      grainCenter.style.setProperty('--grain-left', `${targetRect.left}px`);
      grainCenter.style.setProperty('--grain-top', `${targetRect.top}px`);
    }

    // Create core grain layer - smallest mask, tightest to finger
    grainCore = document.createElement('div');
    grainCore.className = 'ripple-grain ripple-grain-core';
    const coreMaskSize = Math.min(Math.max(maskSizePercent * 0.25, 6), 18);
    grainCore.style.setProperty('--mask-size-target', `${coreMaskSize}%`);
    // Offset by 0.375s (75% into flip cycle) + random variation
    const randomFlipDelayCore = -0.375 - Math.random() * 0.125;
    grainCore.style.setProperty('--flip-delay', `${randomFlipDelayCore}s`);
    grainCore.style.setProperty('--grain-width', `${targetRect.width}px`);
    grainCore.style.setProperty('--grain-height', `${targetRect.height}px`);
    grainCore.style.setProperty('--grain-left', `${targetRect.left - containerRect.left}px`);
    grainCore.style.setProperty('--grain-top', `${targetRect.top - containerRect.top}px`);

    if (isFloating) {
      grainCore.style.position = 'fixed';
      grainCore.style.zIndex = '999';
      grainCore.style.setProperty('--grain-left', `${targetRect.left}px`);
      grainCore.style.setProperty('--grain-top', `${targetRect.top}px`);
    }
  }

  // Insert ripple and grains into clipper (or container for floating)
  const insertTarget = clipper || container;
  insertTarget.appendChild(ripple);
  if (grain) insertTarget.appendChild(grain);
  if (grainMid) insertTarget.appendChild(grainMid);
  if (grainCenter) insertTarget.appendChild(grainCenter);
  if (grainCore) insertTarget.appendChild(grainCore);
  activeRipple = ripple;
  activeGrain = grain;
  activeGrainMid = grainMid;
  activeGrainCenter = grainCenter;
  activeGrainCore = grainCore;

  // Start expansion animation
  requestAnimationFrame(() => {
    if (ripple.parentNode && !isTouchCancelled) {
      ripple.classList.add('ripple-expanding');
    }
    if (grain && grain.parentNode && !isTouchCancelled) {
      grain.classList.add('grain-expanding');
    }
    if (grainMid && grainMid.parentNode && !isTouchCancelled) {
      grainMid.classList.add('grain-expanding');
    }
    if (grainCenter && grainCenter.parentNode && !isTouchCancelled) {
      grainCenter.classList.add('grain-expanding');
    }
    if (grainCore && grainCore.parentNode && !isTouchCancelled) {
      grainCore.classList.add('grain-expanding');
    }
  });

  // Start position tracking to follow element if it moves (e.g., scale animation on press)
  if (grain) startGrainPositionTracking(interactiveTarget, grain, ripple, container, isFloating);

  // Note: Pressed state for navigation is now handled by click event listener
  // (see initNavigationPressedState) to avoid false triggers during swipes/scrolls
}

/**
 * Handle touch move - cancel ripple if scrolling
 */
function handleTouchMove(e) {
  if (!touchStartPos || isTouchCancelled) return;

  const touch = e.touches[0];
  if (!touch) return;

  // Check if touch has moved beyond threshold (user is scrolling)
  const deltaX = Math.abs(touch.clientX - touchStartPos.x);
  const deltaY = Math.abs(touch.clientY - touchStartPos.y);

  if (deltaX > SCROLL_THRESHOLD || deltaY > SCROLL_THRESHOLD) {
    // User is scrolling, cancel the ripple
    isTouchCancelled = true;
    clearActiveRipple();
  }
}

/**
 * Handle touch end - fade out the ripple and grain
 */
function handleTouchEnd() {
  touchStartPos = null;
  isProcessingTouch = false;
  if (processingTouchTimeout) {
    clearTimeout(processingTouchTimeout);
    processingTouchTimeout = null;
  }

  // Stop tracking element position
  stopGrainPositionTracking();

  if (!activeRipple || isTouchCancelled) {
    clearActiveRipple();
    return;
  }

  const ripple = activeRipple;
  const grain = activeGrain;
  const grainMid = activeGrainMid;
  const grainCenter = activeGrainCenter;
  const grainCore = activeGrainCore;
  const clipper = activeClipper;
  activeRipple = null;
  activeGrain = null;
  activeGrainMid = null;
  activeGrainCenter = null;
  activeGrainCore = null;
  activeClipper = null;
  activeTarget = null;
  activeContainer = null;

  // Switch to fade animation
  ripple.classList.remove('ripple-expanding');
  ripple.classList.add('ripple-fading');

  if (grain) {
    grain.classList.remove('grain-expanding');
    grain.classList.add('grain-fading');
  }

  if (grainMid) {
    grainMid.classList.remove('grain-expanding');
    grainMid.classList.add('grain-fading');
  }

  if (grainCenter) {
    grainCenter.classList.remove('grain-expanding');
    grainCenter.classList.add('grain-fading');
  }

  if (grainCore) {
    grainCore.classList.remove('grain-expanding');
    grainCore.classList.add('grain-fading');
  }

  // Remove after fade completes (matches CSS animation duration)
  rippleTimeout = setTimeout(() => {
    if (ripple.parentNode) {
      ripple.remove();
    }
    if (grain && grain.parentNode) {
      grain.remove();
    }
    if (grainMid && grainMid.parentNode) {
      grainMid.remove();
    }
    if (grainCenter && grainCenter.parentNode) {
      grainCenter.remove();
    }
    if (grainCore && grainCore.parentNode) {
      grainCore.remove();
    }
    if (clipper && clipper.parentNode) {
      clipper.remove();
    }
  }, 300); // Match CSS fade duration (0.3s)
}

/**
 * Handle touch cancel
 */
function handleTouchCancel() {
  isTouchCancelled = true;
  touchStartPos = null;
  isProcessingTouch = false;
  if (processingTouchTimeout) {
    clearTimeout(processingTouchTimeout);
    processingTouchTimeout = null;
  }
  stopGrainPositionTracking();
  clearActiveRipple();
}

/**
 * Clear any active ripple and grain immediately
 */
function clearActiveRipple() {
  if (rippleTimeout) {
    clearTimeout(rippleTimeout);
    rippleTimeout = null;
  }
  stopGrainPositionTracking();
  if (activeRipple && activeRipple.parentNode) {
    activeRipple.remove();
  }
  if (activeGrain && activeGrain.parentNode) {
    activeGrain.remove();
  }
  if (activeGrainMid && activeGrainMid.parentNode) {
    activeGrainMid.remove();
  }
  if (activeGrainCenter && activeGrainCenter.parentNode) {
    activeGrainCenter.remove();
  }
  if (activeGrainCore && activeGrainCore.parentNode) {
    activeGrainCore.remove();
  }
  if (activeClipper && activeClipper.parentNode) {
    activeClipper.remove();
  }
  // Restore container position if we modified it
  if (activeContainer && activeContainer.dataset.ripplePositionModified) {
    activeContainer.style.position = '';
    delete activeContainer.dataset.ripplePositionModified;
  }
  activeRipple = null;
  activeGrain = null;
  activeGrainMid = null;
  activeGrainCenter = null;
  activeGrainCore = null;
  activeClipper = null;
  activeTarget = null;
  activeContainer = null;
}

/**
 * Clean up all ripples and grain (useful when closing popups/modals)
 */
export function clearAllRipples() {
  stopGrainPositionTracking();
  clearActiveRipple();
  isProcessingTouch = false;
  if (processingTouchTimeout) {
    clearTimeout(processingTouchTimeout);
    processingTouchTimeout = null;
  }
  // Remove any orphaned ripples, grain and clippers
  document.querySelectorAll('.ripple-effect, .ripple-grain, .ripple-clipper').forEach(r => r.remove());
  // Restore container positions that were modified for ripples
  document.querySelectorAll('[data-ripple-position-modified]').forEach(el => {
    el.style.position = '';
    delete el.dataset.ripplePositionModified;
  });
  // Remove any stuck pressed states
  document.querySelectorAll('.mobile-pressed, .mobile-pressed-to-active').forEach(el => {
    el.classList.remove('mobile-pressed', 'mobile-pressed-to-active');
  });
}

/**
 * Initialize navigation pressed state handler
 * Applies pressed state only on actual click (not on touch), preventing false triggers during swipes
 */
function initNavigationPressedState() {
  // Only on touch devices
  if (!isTouchDevice()) return;

  // Don't double-init
  if (navigationClickListenerInitialized) return;
  navigationClickListenerInitialized = true;

  // Listen for clicks on navigation links
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href]');
    if (!link) return;

    // Skip non-navigation links
    if (link.href.startsWith('javascript:') || link.href.startsWith('#')) return;
    if (link.target === '_blank' || link.hasAttribute('download')) return;

    // Find the interactive element (might be the link itself or a parent button)
    const interactiveTarget = link.closest('.bottom-nav-button, .header-icon-button, .header-profile-button') || link;

    // Determine which pressed class to use based on element type
    const isBottomNavButton = interactiveTarget.closest('.bottom-nav-button');
    const isHeaderNavButton = interactiveTarget.closest('.header-icon-button, .header-profile-button');
    const shouldUseActivePressed = isBottomNavButton || isHeaderNavButton;
    const pressedClass = shouldUseActivePressed ? 'mobile-pressed-to-active' : 'mobile-pressed';

    // Apply pressed state immediately on click
    interactiveTarget.classList.add(pressedClass);

    // Fallback cleanup for SPA navigation (page doesn't actually unload)
    const fallbackTimeout = setTimeout(() => {
      interactiveTarget.classList.remove(pressedClass);
    }, 3000);

    // Clear on beforeunload (actual page navigation)
    window.addEventListener('beforeunload', () => {
      clearTimeout(fallbackTimeout);
    }, { once: true });
  }, { passive: true });
}

/**
 * Apply mobile feedback to an element or selector
 * Ripple is now handled globally - this adds haptic and spring effects
 * @param {HTMLElement|string} elementOrSelector - Element or CSS selector
 * @param {Object} options - Configuration options
 * @param {boolean} options.haptic - Enable haptic feedback (default: false)
 * @param {number} options.hapticDuration - Haptic duration in ms (default: 15)
 * @param {string} options.feedbackClass - Additional feedback class (default: '')
 * @param {boolean} options.spring - Enable spring-back animation (default: false)
 */
export function applyMobileFeedback(elementOrSelector, options = {}) {
  const isMobile = isTouchDevice();

  const {
    haptic = false,
    hapticDuration = 15,
    feedbackClass = '',
    spring = false
  } = options;

  const elements = typeof elementOrSelector === 'string'
    ? document.querySelectorAll(elementOrSelector)
    : [elementOrSelector];

  elements.forEach(element => {
    if (!element) return;

    // Skip if already initialized
    if (element.dataset.mobileFeedbackInit) return;
    element.dataset.mobileFeedbackInit = 'true';

    // Add base mobile-feedback class (enables scale effect + global ripple targeting)
    element.classList.add('mobile-feedback');

    // Add additional feedback class if provided
    if (feedbackClass) {
      element.classList.add(feedbackClass);
    }

    // Enable spring animation
    if (spring) {
      element.classList.add('mobile-feedback-spring');
    }

    // Add haptic feedback on touchstart if enabled
    if (haptic && isMobile) {
      element.addEventListener('touchstart', () => {
        triggerHaptic(hapticDuration);
      }, { passive: true });
    }

    // Add spring-back animation on touch end
    if (spring && isMobile) {
      element.addEventListener('touchend', () => {
        element.classList.add('spring-back');
        element.addEventListener('animationend', () => {
          element.classList.remove('spring-back');
        }, { once: true });
      }, { passive: true });
    }
  });
}

/**
 * Initialize mobile feedback for all specified elements
 * Uses configuration from module-config.js for selectors
 */
export function initMobileFeedback() {
  // Check if module is enabled
  if (!isModuleEnabled('mobileFeedback')) {
    return;
  }

  if (!isTouchDevice()) {
    return;
  }

  // Apply CSS variables for this module
  applyCSSVariables();

  // Get module configuration
  const config = getModuleConfig('mobileFeedback');
  const hapticEnabled = config.hapticEnabled !== false;
  const hapticDuration = config.hapticDuration || 15; // 15ms for better perceptibility on Firefox

  // Get all selectors (global + page-specific)
  const selectors = getSelectors('mobileFeedback');

  // Apply feedback to each selector
  selectors.forEach(selector => {
    // Determine if this selector should have haptic feedback
    // Bottom nav buttons always get haptic
    const shouldHaptic = hapticEnabled && (
      selector.includes('bottom-nav') ||
      selector.includes('picker-control')
    );

    applyMobileFeedback(selector, {
      haptic: shouldHaptic,
      hapticDuration: hapticDuration
    });
  });

}

/**
 * Re-initialize mobile feedback (useful after dynamic content load)
 */
export function reinitMobileFeedback() {
  // Clear initialization flags
  document.querySelectorAll('[data-mobile-feedback-init]').forEach(el => {
    delete el.dataset.mobileFeedbackInit;
  });

  // Re-initialize
  initMobileFeedback();

  // Ensure ripple overlay exists (may have been removed by SPA navigation)
  initRippleOverlay();
  initNavigationPressedState();

  // Re-apply positioning to any new containers added by SPA navigation
  preApplyRipplePositioning();
}

// Auto-initialize on mobile devices when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initMobileFeedback();
    initRippleOverlay();
    initNavigationPressedState();
    preApplyRipplePositioning();
  });
} else {
  initMobileFeedback();
  initRippleOverlay();
  initNavigationPressedState();
  preApplyRipplePositioning();
}

// Re-initialize on window resize (for responsive design)
let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    reinitMobileFeedback();
  }, 250);
});

// SPA navigation protection - clean up orphaned ripples, grain and clippers periodically
if (isTouchDevice()) {
  setInterval(() => {
    // Clean up any orphaned ripples that might be left after SPA navigation
    document.querySelectorAll('.ripple-effect').forEach(ripple => {
      // If ripple has been in the DOM for too long, remove it
      if (!ripple.classList.contains('ripple-expanding') && !ripple.classList.contains('ripple-fading')) {
        ripple.remove();
      }
    });
    // Clean up orphaned grain elements
    document.querySelectorAll('.ripple-grain').forEach(grain => {
      if (!grain.classList.contains('grain-expanding') && !grain.classList.contains('grain-fading')) {
        grain.remove();
      }
    });
    // Clean up orphaned clipper elements (if they have no children)
    document.querySelectorAll('.ripple-clipper').forEach(clipper => {
      if (clipper.children.length === 0) {
        // Restore parent container position before removing clipper
        const container = clipper.parentElement;
        if (container && container.dataset.ripplePositionModified) {
          container.style.position = '';
          delete container.dataset.ripplePositionModified;
        }
        clipper.remove();
      }
    });
    // Clean up any elements with position modified flag but no active clipper
    document.querySelectorAll('[data-ripple-position-modified]').forEach(el => {
      if (!el.querySelector('.ripple-clipper')) {
        el.style.position = '';
        delete el.dataset.ripplePositionModified;
      }
    });
    // Reset processing guard if stuck
    if (isProcessingTouch && !activeRipple) {
      isProcessingTouch = false;
    }
  }, 2000);
}

/**
 * Trigger success feedback animation on an element
 * @param {HTMLElement} element - The element to animate
 * @param {boolean} withHaptic - Also trigger haptic feedback (default: true)
 */
export function triggerSuccessFeedback(element, withHaptic = true) {
  if (!element) return;

  element.classList.add('feedback-success');
  element.addEventListener('animationend', () => {
    element.classList.remove('feedback-success');
  }, { once: true });

  if (withHaptic) {
    triggerHaptic('success');
  }
}

/**
 * Trigger error feedback animation on an element
 * @param {HTMLElement} element - The element to animate
 * @param {boolean} withHaptic - Also trigger haptic feedback (default: true)
 */
export function triggerErrorFeedback(element, withHaptic = true) {
  if (!element) return;

  element.classList.add('feedback-error');
  element.addEventListener('animationend', () => {
    element.classList.remove('feedback-error');
  }, { once: true });

  if (withHaptic) {
    triggerHaptic('error');
  }
}

/**
 * Trigger action feedback (generic action like add to cart)
 * @param {HTMLElement} element - The element to animate
 * @param {boolean} withHaptic - Also trigger haptic feedback (default: true)
 */
export function triggerActionFeedback(element, withHaptic = true) {
  if (!element) return;

  element.classList.add('feedback-action');
  element.addEventListener('animationend', () => {
    element.classList.remove('feedback-action');
  }, { once: true });

  if (withHaptic) {
    triggerHaptic('light');
  }
}

/**
 * Trigger heart beat animation (for favorites)
 * @param {HTMLElement} element - The element to animate
 * @param {boolean} withHaptic - Also trigger haptic feedback (default: true)
 */
export function triggerHeartBeat(element, withHaptic = true) {
  if (!element) return;

  element.classList.add('feedback-heart-beat');
  element.addEventListener('animationend', () => {
    element.classList.remove('feedback-heart-beat');
  }, { once: true });

  if (withHaptic) {
    triggerHaptic('medium');
  }
}

/**
 * Set loading state on an element
 * @param {HTMLElement} element - The element to set loading on
 * @param {boolean} loading - Whether to enable or disable loading
 */
export function setLoading(element, loading = true) {
  if (!element) return;

  if (loading) {
    element.classList.add('mobile-feedback-loading');
    element.setAttribute('aria-busy', 'true');
  } else {
    element.classList.remove('mobile-feedback-loading');
    element.setAttribute('aria-busy', 'false');
  }
}

// Expose functions globally for use in other modules
window.triggerHaptic = triggerHaptic;
window.applyMobileFeedback = applyMobileFeedback;
window.initMobileFeedback = initMobileFeedback;
window.reinitMobileFeedback = reinitMobileFeedback;
window.initRippleOverlay = initRippleOverlay;
window.clearAllRipples = clearAllRipples;
window.triggerSuccessFeedback = triggerSuccessFeedback;
window.triggerErrorFeedback = triggerErrorFeedback;
window.triggerActionFeedback = triggerActionFeedback;
window.triggerHeartBeat = triggerHeartBeat;
window.setLoading = setLoading;
