// ============================================================
// TOOLTIP MODULE
// Smart hover tooltips for icon-only buttons.
// Desktop (hover):  shows after 200ms hover, hides on mouseleave.
// Mobile  (touch):  Miniapp only (Telegram / VK). Shows after a 500ms
//                   hold, hides on touchend + 1.5s linger, or on scroll.
//                   Context menus are already suppressed in miniapps so
//                   long-press is safe to use here.
//                   Scrub containers (.product-carousel-thumbnails,
//                   .product-variants-list) are excluded — they have
//                   their own touch tooltip handling via carousel.js.
// Positions above/below and shifts left/right based on viewport space.
// ============================================================

(() => {
  // Firefox on touch-capable laptops can report hover:none even with a mouse connected.
  // Also check pointer:fine (mouse/trackpad) to catch that case.
  const supportsHover = window.matchMedia('(hover: hover)').matches
                     || window.matchMedia('(pointer: fine)').matches;
  const supportsTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  // Touch tooltips are miniapp-only (context menu is suppressed there, making long-press safe)
  const isMiniApp = (window.isVKMiniApp?.() || window.isMAXMiniApp?.() || window.isInsideTelegram?.());

  // Nothing to do if the device has neither hover nor (touch + miniapp)
  if (!supportsHover && !(supportsTouch && isMiniApp)) return;

  const TOOLTIP_GAP    = 8;    // px gap between tooltip and anchor
  const ARROW_SIZE     = 6;    // matches --tooltip-arrow-size in CSS
  const SCREEN_PADDING = 8;    // min px from viewport edge
  const HOVER_DELAY        = 200;   // ms before tooltip appears on hover
  const TOUCH_HOLD_DELAY   = 500;   // ms hold before tooltip appears on mobile
  const TOUCH_LINGER       = 1500;  // ms tooltip stays visible after finger lifts
  const TOUCH_MOVE_THRESH  = 10;    // px of movement that cancels hold / dismisses tooltip

  // Scrub containers manage their own touch tooltips — skip children inside them
  const SCRUB_CONTAINERS = '.product-carousel-thumbnails, .product-variants-list';

  // Selectors for elements that should get tooltips.
  // [data-tooltip] covers thumbnails (data-tooltip set by carousel.js) and
  // any explicit markup. Named selectors cover icon-only buttons with title.
  const TOOLTIP_SELECTORS = [
    '[data-tooltip]',
    // Generic icon button classes
    '.btn-icon[title]',
    '.btn-filter[title]',
    // Header
    '.header-logo-button[title]',
    '.header-back-button[title]',
    '.header-burger-button[title]',
    '.header-gear-button[title]',
    '.header-search-button[title]',
    '.header-search-clear[title]',
    '.header-profile-button[title]',
    '.mobile-search-sheet-clear[title]',
    // Footer
    '.footer-socials-button[title]',
    '.footer-social[title]',
    // Product cards (home + catalog pages)
    '.price-row-add-btn[title]',
    '.zoom-button[title]',
    '.variant-dropdown-toggle[title]',
    '.card-format-minus[title]',
    '.card-format-plus[title]',
    // Product page
    '.product-format-counter-minus[title]',
    '.product-format-counter-plus[title]',
    '.favorite-button[title]',
    '.share-button[title]',
    '.product-variant-item[title]',
    // Cart page
    '.cart-item-format-minus[title]',
    '.cart-item-format-plus[title]',
    '.cart-item-bar-counter-minus[title]',
    '.cart-item-bar-counter-plus[title]',
    '.cart-item-delete-btn[title]',
    '.cart-item-bar-delete[title]',
    '.cart-item-check[title]',
    '.cart-item-favorite[title]',
    // Favorites page
    '.product-card-tag-btn[title]',
    // Picker page
    '.picker-faq-button[title]',
    '.picker-control-button[title]',
    '.picker-product-title a[title]',
    // Page FAQ button
    '.page-faq-button[title]',
    // AR page
    '.ar-back-btn[title]',
    '.ar-collapsed-btn[title]',
    // Floating controls
    '.scroll-to-top-btn[title]',
    '.scrubber-trigger-button[title]',
    // Home page inline search
    '.search-clear-inline[title]',
    // Stories
    '.stories-preview-circle[title]',
    // Image error overlay
    '.img-reload-btn[title]',
    // Carousel arrow buttons
    '.btn-carousel[title]',
    '.carousel-nav[title]',
    // Zoom product link
    '.zoom-product-link[title]',
    // Profile carousel arrows
    '.profile-viewed-arrow[title]',
    // Cart order icon buttons
    '.cart-order-icon-btn[title]',
    // Orders filter toggle
    '.orders-filter-toggle[title]',
    // Order card number copy
    '.order-card-number[title]',
    // Profile username login icon
    '.profile-login-icon[title]',
  ].join(', ');

  const initialized = new WeakSet();
  let activeTooltip  = null;
  let activeAnchor   = null;
  let hoverTimer     = null;
  let lingerTimer    = null;
  let holdTimer      = null;
  let touchStartX    = 0;
  let touchStartY    = 0;

  // ---- Tooltip lifecycle ----

  function createTooltip(text) {
    const el = document.createElement('div');
    el.className = 'tooltip';
    el.textContent = text;
    document.body.appendChild(el);
    return el;
  }

  function positionTooltip(tooltip, anchor) {
    const anchorRect  = anchor.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const needed = tooltipRect.height + TOOLTIP_GAP + ARROW_SIZE;

    // Prefer above, fall back to below
    const spaceAbove = anchorRect.top;
    const spaceBelow = vh - anchorRect.bottom;
    let placement;
    if (spaceAbove >= needed) {
      placement = 'top';
    } else if (spaceBelow >= needed) {
      placement = 'bottom';
    } else {
      placement = spaceAbove >= spaceBelow ? 'top' : 'bottom';
    }

    tooltip.dataset.placement = placement;

    const top = placement === 'top'
      ? anchorRect.top - tooltipRect.height - TOOLTIP_GAP - ARROW_SIZE
      : anchorRect.bottom + TOOLTIP_GAP + ARROW_SIZE;

    // Center over anchor, clamp to viewport
    const anchorCenterX = anchorRect.left + anchorRect.width / 2;
    let left = anchorCenterX - tooltipRect.width / 2;
    left = Math.max(SCREEN_PADDING, Math.min(left, vw - tooltipRect.width - SCREEN_PADDING));

    // Arrow points at anchor center regardless of horizontal shift
    const arrowOffset = Math.max(10, Math.min(anchorCenterX - left, tooltipRect.width - 10));

    tooltip.style.left = `${left}px`;
    tooltip.style.top  = `${top}px`;
    tooltip.style.setProperty('--arrow-offset', `${arrowOffset}px`);
  }

  function showTooltip(anchor) {
    // Anchor may have been removed from DOM during SPA navigation
    if (!document.contains(anchor)) return;

    const text = anchor.dataset.tooltip;
    if (!text) return;

    hideTooltip();

    const tooltip = createTooltip(text);
    activeTooltip = tooltip;
    activeAnchor  = anchor;

    // Two rAFs: first positions (forces layout), second triggers CSS transition
    requestAnimationFrame(() => {
      positionTooltip(tooltip, anchor);
      requestAnimationFrame(() => tooltip.classList.add('visible'));
    });
  }

  function hideTooltip() {
    clearTimeout(hoverTimer);
    clearTimeout(lingerTimer);
    clearTimeout(holdTimer);
    holdTimer    = null;
    activeAnchor = null;
    if (activeTooltip) {
      activeTooltip.remove();
      activeTooltip = null;
    }
  }

  // ---- Hover handlers (desktop) ----

  function onMouseEnter(e) {
    clearTimeout(hoverTimer);
    const anchor = e.currentTarget; // currentTarget is null after event dispatch — capture now
    hoverTimer = setTimeout(() => showTooltip(anchor), HOVER_DELAY);
  }

  function onMouseLeave() {
    hideTooltip();
  }

  // ---- Touch handlers (mobile, miniapp only) ----
  // Show after a 500ms hold. Any movement cancels the hold.
  // Context menus are suppressed in miniapps so long-press is safe.

  function onTouchStart(e) {
    clearTimeout(holdTimer);
    clearTimeout(lingerTimer);
    const t = e.touches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
    const anchor = e.currentTarget;
    holdTimer = setTimeout(() => {
      holdTimer = null;
      showTooltip(anchor);
    }, TOUCH_HOLD_DELAY);
  }

  function onTouchEnd() {
    if (holdTimer) {
      // Hold wasn't long enough — cancel, no tooltip to linger
      clearTimeout(holdTimer);
      holdTimer = null;
      return;
    }
    // Tooltip is visible — keep it briefly so the user can read it
    lingerTimer = setTimeout(hideTooltip, TOUCH_LINGER);
  }

  function onTouchMove(e) {
    const t = e.touches[0];
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    if (Math.abs(dx) > TOUCH_MOVE_THRESH || Math.abs(dy) > TOUCH_MOVE_THRESH) {
      hideTooltip(); // clears holdTimer too
    }
  }

  // ---- Initialization ----

  function attachTooltip(el) {
    if (initialized.has(el)) return;

    // Promote title → data-tooltip, strip native browser tooltip
    if (!el.dataset.tooltip && el.title) {
      el.dataset.tooltip = el.title;
      el.removeAttribute('title');
    }

    if (!el.dataset.tooltip) return;

    if (supportsHover) {
      el.addEventListener('mouseenter', onMouseEnter);
      el.addEventListener('mouseleave', onMouseLeave);
    }

    // Touch: miniapp only, and only for elements NOT inside a scrub container
    if (supportsTouch && isMiniApp && !el.closest(SCRUB_CONTAINERS)) {
      el.addEventListener('touchstart',  onTouchStart, { passive: true });
      el.addEventListener('touchend',    onTouchEnd,   { passive: true });
      el.addEventListener('touchcancel', hideTooltip,  { passive: true });
      el.addEventListener('touchmove',   onTouchMove,  { passive: true });
    }

    // Hide immediately on click (clears any lingering tooltip)
    el.addEventListener('click', hideTooltip);

    initialized.add(el);

    // If the pointer is already over this element when it appears (e.g. a button
    // was swapped in-place after a click), mouseenter won't fire — trigger manually.
    if (supportsHover && el.matches(':hover')) {
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => showTooltip(el), HOVER_DELAY);
    }
  }

  function initTooltips() {
    document.querySelectorAll(TOOLTIP_SELECTORS).forEach(attachTooltip);
  }

  // Re-run when DOM changes (header/footer inject after load, dynamic pages)
  let debounceTimer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(initTooltips, 100);
  });

  function start() {
    initTooltips();
    observer.observe(document.body, { childList: true, subtree: true });
    // SPA navigation: hide tooltip immediately on page leave to avoid stale anchors
    window.addEventListener('spa:pageleave', hideTooltip);
    // Scrolling: reposition the tooltip to follow the anchor. Hide only if anchor
    // scrolls completely out of the viewport.
    window.addEventListener('scroll', () => {
      if (!activeTooltip || !activeAnchor) return;
      if (!document.contains(activeAnchor)) { hideTooltip(); return; }
      const rect = activeAnchor.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) { hideTooltip(); return; }
      positionTooltip(activeTooltip, activeAnchor);
    }, { passive: true, capture: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
