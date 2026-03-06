// ============================================================
// PRODUCT CAROUSEL MODULE (Unified)
// One module for both main and additional carousels.
// Images sit side-by-side at full track height with natural
// aspect-ratio widths.  Navigation scrolls so the target image
// is centred in the viewport.
// ============================================================

import { addImageSize } from './data.js';
import { createImageLoadingOverlay, createImageReloadOverlay, isVkCdnUrl, proxyVkCdnUrl } from '../../core/formatters.js';

// ============ STATE ============

export let currentCarouselIndex = 0;
export let currentAdditionalCarouselIndex = 0;

// ============ SCRUB TOOLTIP ============
// Shared singleton tooltip shown while finger scrubs thumbnails or variants.
// Exported so main.js can reuse it for the variants strip.

let scrubTooltipEl = null;

const SCRUB_GAP = 8;
const SCRUB_ARROW = 6;
const SCRUB_PADDING = 8;

export const showScrubTooltip = (text, anchorEl) => {
  if (!text || !anchorEl) { hideScrubTooltip(); return; }

  if (!scrubTooltipEl) {
    scrubTooltipEl = document.createElement('div');
    scrubTooltipEl.className = 'tooltip';
    document.body.appendChild(scrubTooltipEl);
  }

  if (scrubTooltipEl.textContent !== text) {
    scrubTooltipEl.textContent = text;
  }

  // getBoundingClientRect forces layout — returns real dimensions
  const rect = anchorEl.getBoundingClientRect();
  const ttRect = scrubTooltipEl.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const needed = ttRect.height + SCRUB_GAP + SCRUB_ARROW;
  const placement = rect.top >= needed || rect.top >= (vh - rect.bottom) ? 'top' : 'bottom';
  scrubTooltipEl.dataset.placement = placement;

  const top = placement === 'top'
    ? rect.top - ttRect.height - SCRUB_GAP - SCRUB_ARROW
    : rect.bottom + SCRUB_GAP + SCRUB_ARROW;

  const anchorCenterX = rect.left + rect.width / 2;
  let left = anchorCenterX - ttRect.width / 2;
  left = Math.max(SCRUB_PADDING, Math.min(left, vw - ttRect.width - SCRUB_PADDING));

  const arrowOffset = Math.max(10, Math.min(anchorCenterX - left, ttRect.width - 10));

  scrubTooltipEl.style.left = `${left}px`;
  scrubTooltipEl.style.top = `${top}px`;
  scrubTooltipEl.style.setProperty('--arrow-offset', `${arrowOffset}px`);
  scrubTooltipEl.classList.add('visible');
};

export const hideScrubTooltip = () => {
  if (scrubTooltipEl) {
    scrubTooltipEl.remove();
    scrubTooltipEl = null;
  }
};
let additionalCarouselAutoPlayInterval = null;

// Stored handlers for cleanup
let mainHandlers = null;   // { scroll, prev, next }
let additionalHandlers = null;

// Optional slide-change callback for main carousel (set via renderProductCarousel)
let mainOnSlideChange = null;

// ============ HELPERS ============

/**
 * Return the scrollLeft value that centres slide[index] inside the track.
 * Because images have different widths we measure each slide element.
 */
const scrollLeftToCenter = (track, index) => {
  const slide = track.children[index];
  if (!slide) return 0;
  const slideLeft = slide.offsetLeft;
  const slideWidth = slide.offsetWidth;
  const trackWidth = track.clientWidth;
  // Centre the slide in the viewport
  return slideLeft - (trackWidth - slideWidth) / 2;
};

/**
 * Clamp scrollLeft to valid range.
 */
const clampScroll = (track, value) => {
  const max = track.scrollWidth - track.clientWidth;
  return Math.max(0, Math.min(value, max));
};

/**
 * Determine which slide index is currently closest to the viewport centre.
 */
const indexFromScroll = (track) => {
  const center = track.scrollLeft + track.clientWidth / 2;
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < track.children.length; i++) {
    const child = track.children[i];
    const childCenter = child.offsetLeft + child.offsetWidth / 2;
    const dist = Math.abs(center - childCenter);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
};

// ============ RENDERING ============

const isLandscapeVkUrl = (url) => {
  if (!url) return false;
  const m = url.match(/[?&]as=(\d+)x(\d+)/);
  return m ? parseInt(m[1], 10) > parseInt(m[2], 10) : false;
};

export const renderProductCarousel = (images, track, indicators, product = null, isAdditional = false, imageExtras = [], onSlideChange = null) => {
  if (!isAdditional) mainOnSlideChange = onSlideChange;
  track.innerHTML = '';
  if (indicators) indicators.innerHTML = '';
  track.scrollLeft = 0;

  // Render thumbnails (main carousel only)
  if (!isAdditional) {
    renderThumbnails(images, product, imageExtras);
  }

  // Adjust wrapper aspect ratio: square by default, 6/5 if any image is landscape
  if (!isAdditional && images.length > 0) {
    const wrapper = track.closest('.product-carousel-wrapper');
    if (wrapper) {
      const hasLandscape = images.some(isLandscapeVkUrl);
      wrapper.classList.toggle('landscape', hasLandscape);
      wrapper.style.aspectRatio = '';
    }
  }

  const slideClass = isAdditional
    ? 'product-additional-carousel-slide'
    : 'product-carousel-slide';

  images.forEach((img, index) => {
    const slide = document.createElement('div');
    slide.className = slideClass;

    const imgEl = document.createElement('img');
    imgEl.alt = '';

    // First image eager, rest deferred until first loads
    if (index === 0) {
      imgEl.src = img;
      imgEl.loading = 'eager';
      imgEl.fetchPriority = 'high';
    } else {
      imgEl.dataset.deferredSrc = img;
    }

    if (index === 0) {
      imgEl.onload = function () {
        // Kick deferred loading
        const deferred = track.querySelectorAll('img[data-deferred-src]');
        deferred.forEach((d, i) => {
          setTimeout(() => {
            d.src = d.dataset.deferredSrc;
            delete d.dataset.deferredSrc;
          }, i * 50);
        });
        // Refresh arrows after layout settles
        if (!isAdditional && window.updateProductCarouselArrows) {
          setTimeout(window.updateProductCarouselArrows, 50);
        }
      };
    }

    // Show loading spinner while image loads (only for first image that loads eagerly)
    if (index === 0) {
      createImageLoadingOverlay(slide);
    }

    imgEl.addEventListener('load', () => {
      // Remove loading spinner overlay
      const overlay = slide.querySelector('.img-reload-overlay');
      if (overlay) overlay.remove();
    });

    imgEl.onerror = function () {
      const failedSrc = this.src;
      const kickDeferred = () => {
        if (index === 0) {
          const deferred = track.querySelectorAll('img[data-deferred-src]');
          deferred.forEach((d, i) => {
            setTimeout(() => { d.src = d.dataset.deferredSrc; delete d.dataset.deferredSrc; }, i * 50);
          });
        }
      };
      if (isVkCdnUrl(failedSrc) && !failedSrc.includes('/api/img')) {
        this.src = proxyVkCdnUrl(failedSrc);
        this.addEventListener('error', () => {
          createImageReloadOverlay(this, img, slide);
          kickDeferred();
        }, { once: true });
        kickDeferred();
      } else {
        createImageReloadOverlay(this, img, slide);
        kickDeferred();
      }
    };

    slide.appendChild(imgEl);
    slide.addEventListener('click', () => openCarouselZoom(images, index));
    track.appendChild(slide);
  });

  track.scrollLeft = 0;

  if (isAdditional) {
    setupCarouselInteraction(true);
  } else if (onSlideChange) {
    // Fire callback for initial slide (index 0) after DOM settles
    requestAnimationFrame(() => onSlideChange(0));
  }
};

// ============ SCROLLING DOTS (no-op stubs kept for backward compat) ============

export const centerScrollingDots = () => {};

export const updateIndicatorLabel = () => {};

// ============ NAVIGATION ============

export const updateCarousel = (index, isAdditional) => {
  const trackId = isAdditional
    ? 'product-additional-carousel-track'
    : 'product-carousel-track';
  const track = document.getElementById(trackId);
  if (!track) return;

  // Scroll so the target image is centred
  track.scrollLeft = clampScroll(track, scrollLeftToCenter(track, index));

  if (isAdditional) {
    currentAdditionalCarouselIndex = index;
  } else {
    currentCarouselIndex = index;
    updateThumbnailActive(index);
  }
};

// ============ INTERACTION (arrows, scroll tracking, touch) ============

/**
 * Set up arrows, scroll-based index tracking, and touch class toggling
 * for either the main or additional carousel.
 */
const setupCarouselInteraction = (isAdditional) => {
  const trackId = isAdditional
    ? 'product-additional-carousel-track'
    : 'product-carousel-track';
  const prevSel = isAdditional
    ? '.product-additional-carousel-prev'
    : '.product-carousel-prev';
  const nextSel = isAdditional
    ? '.product-additional-carousel-next'
    : '.product-carousel-next';
  const slideClass = isAdditional
    ? 'product-additional-carousel-slide'
    : 'product-carousel-slide';

  const track = document.getElementById(trackId);
  const prevBtn = document.querySelector(prevSel);
  const nextBtn = document.querySelector(nextSel);

  if (!track || !prevBtn || !nextBtn) return;

  // Remove previous handlers
  const stored = isAdditional ? additionalHandlers : mainHandlers;
  if (stored) {
    track.removeEventListener('scroll', stored.scroll);
    prevBtn.removeEventListener('click', stored.prev);
    nextBtn.removeEventListener('click', stored.next);
  }

  // --- scroll handler: update arrows + active slide ---
  const onScroll = () => {
    const maxScroll = track.scrollWidth - track.clientWidth;
    const cur = track.scrollLeft;

    const slideCount = track.children.length;
    prevBtn.classList.toggle('hidden', cur <= 1);
    nextBtn.classList.toggle('hidden', slideCount <= 1 || (maxScroll > 0 && cur >= maxScroll - 1));

    const idx = indexFromScroll(track);
    if (isAdditional) {
      currentAdditionalCarouselIndex = idx;
    } else {
      const prevIdx = currentCarouselIndex;
      currentCarouselIndex = idx;
      if (idx !== prevIdx && mainOnSlideChange) mainOnSlideChange(idx);
    }

    // Update active slide class for darkening effect
    track.querySelectorAll('.' + slideClass).forEach((slide, i) => {
      slide.classList.toggle('active', i === idx);
    });

    if (!isAdditional) {
      updateThumbnailActive(idx);
    }
  };

  if (!isAdditional) {
    window.updateProductCarouselArrows = onScroll;
  }

  // Initial state
  track.scrollLeft = 0;
  if (isAdditional) currentAdditionalCarouselIndex = 0;
  else currentCarouselIndex = 0;

  prevBtn.classList.add('hidden');
  nextBtn.classList.toggle('hidden', track.children.length <= 1);

  // Deferred layout updates
  requestAnimationFrame(() => {
    track.scrollLeft = 0;
    requestAnimationFrame(onScroll);
  });

  // Wait for all images to settle
  const allImgs = track.querySelectorAll('img');
  let loaded = 0;
  const check = () => { if (++loaded === allImgs.length) requestAnimationFrame(onScroll); };
  allImgs.forEach(im => {
    if (im.complete) check();
    else { im.addEventListener('load', check); im.addEventListener('error', check); }
  });

  [50, 150, 300, 600].forEach(t => setTimeout(onScroll, t));

  track.addEventListener('scroll', onScroll, { passive: true });

  // --- arrow handlers ---
  const onPrev = () => {
    const total = track.children.length;
    if (total <= 1) return;
    const idx = isAdditional ? currentAdditionalCarouselIndex : currentCarouselIndex;
    updateCarousel(Math.max(0, idx - 1), isAdditional);
  };

  const onNext = () => {
    const total = track.children.length;
    if (total <= 1) return;
    const idx = isAdditional ? currentAdditionalCarouselIndex : currentCarouselIndex;
    updateCarousel(Math.min(total - 1, idx + 1), isAdditional);
  };

  prevBtn.addEventListener('click', onPrev);
  nextBtn.addEventListener('click', onNext);

  // --- touch class toggling (main) + swipe-to-navigate (additional) ---
  if (isAdditional) {
    let swipeStartX = 0;
    let swipeStartY = 0;
    let swipeDirectionLocked = null;

    const onTouchStartSwipe = (e) => {
      swipeStartX = e.touches[0].clientX;
      swipeStartY = e.touches[0].clientY;
      swipeDirectionLocked = null;
      stopAdditionalCarouselAutoPlay();
    };

    const onTouchMoveSwipe = (e) => {
      if (!swipeDirectionLocked) {
        const dx = Math.abs(e.touches[0].clientX - swipeStartX);
        const dy = Math.abs(e.touches[0].clientY - swipeStartY);
        if (dx > 6 || dy > 6) {
          swipeDirectionLocked = dx >= dy ? 'horizontal' : 'vertical';
        }
      }
      if (swipeDirectionLocked === 'horizontal') {
        e.preventDefault();
      }
    };

    const onTouchEndSwipe = (e) => {
      if (swipeDirectionLocked === 'horizontal') {
        const dx = e.changedTouches[0].clientX - swipeStartX;
        if (Math.abs(dx) > 30) {
          const total = track.children.length;
          const idx = currentAdditionalCarouselIndex;
          updateCarousel(dx < 0 ? Math.min(total - 1, idx + 1) : Math.max(0, idx - 1), true);
        }
      }
      swipeDirectionLocked = null;
    };

    track.addEventListener('touchstart', onTouchStartSwipe, { passive: true });
    track.addEventListener('touchmove', onTouchMoveSwipe, { passive: false });
    track.addEventListener('touchend', onTouchEndSwipe, { passive: true });
    track.addEventListener('touchcancel', onTouchEndSwipe, { passive: true });
  } else {
    const onTouchStart = () => track.classList.add('touching');
    const onTouchEnd   = () => track.classList.remove('touching');
    track.addEventListener('touchstart', onTouchStart, { passive: true });
    track.addEventListener('touchend',   onTouchEnd,   { passive: true });
    track.addEventListener('touchcancel', onTouchEnd,   { passive: true });
  }

  // Store for cleanup
  const handlers = { scroll: onScroll, prev: onPrev, next: onNext };
  if (isAdditional) additionalHandlers = handlers;
  else mainHandlers = handlers;
};

export const setupProductCarouselArrows = () => {
  setupCarouselInteraction(false);
};

// ============ AUTO-PLAY ============

export const startAdditionalCarouselAutoPlay = () => {
  if (additionalCarouselAutoPlayInterval) clearInterval(additionalCarouselAutoPlayInterval);

  const track = document.getElementById('product-additional-carousel-track');
  if (!track) return;
  const wrapper = track.parentElement;
  const slides = track.children;
  if (slides.length <= 1) return;

  let idx = 0;
  let active = true;

  const tick = () => {
    if (!active) return;
    idx = (idx + 1) % slides.length;
    updateCarousel(idx, true);
  };

  const start = () => {
    if (!active) return;
    additionalCarouselAutoPlayInterval = setInterval(tick, 4000);
  };

  wrapper.addEventListener('mouseenter', () => {
    active = false;
    if (additionalCarouselAutoPlayInterval) clearInterval(additionalCarouselAutoPlayInterval);
  });
  wrapper.addEventListener('mouseleave', () => {
    active = true;
    start();
  });

  start();
};

export const stopAdditionalCarouselAutoPlay = () => {
  if (additionalCarouselAutoPlayInterval) {
    clearInterval(additionalCarouselAutoPlayInterval);
    additionalCarouselAutoPlayInterval = null;
  }
};

// ============ THUMBNAILS ============

// Map image extra type → tooltip label text.
// Counts Варианты images to decide whether to number them.
const buildThumbTooltips = (extras) => {
  const variantCount = extras.filter(e => e === 'варианты').length;
  let variantCounter = 0;
  return extras.map(extra => {
    if (extra === 'обложка') return 'Интерьер';
    if (extra === 'приближение') return 'Вблизи';
    if (extra === 'варианты') {
      variantCounter++;
      return variantCount > 1 ? `Постер #${variantCounter}` : 'Постер';
    }
    return null;
  });
};

const renderThumbnails = (images, product = null, imageExtras = []) => {
  const container = document.getElementById('product-carousel-thumbnails');
  if (!container) return;
  container.innerHTML = '';

  // Clean up previous interaction listeners
  if (container._scrubCleanup) {
    container._scrubCleanup();
    container._scrubCleanup = null;
  }

  if (images.length <= 1) {
    container.style.display = 'none';
    return;
  }

  // Determine special labels for фирменный products
  const isSpecial = product && product.type === 'фирменный' && !product.triptych;
  const specialLabels = ['Интерьер', 'Постер', 'Приближение'];

  // Build tooltip labels from image extras (Обложка→Интерьер, Варианты→Постер, Приближение→Вблизи)
  const thumbTooltips = (imageExtras.length === images.length)
    ? buildThumbTooltips(imageExtras)
    : images.map(() => null);

  images.forEach((img, index) => {
    const thumbWrapper = document.createElement('div');
    thumbWrapper.className = 'product-carousel-thumbnail' + (index === 0 ? ' active' : '');

    const imgEl = document.createElement('img');
    imgEl.src = addImageSize(img, '160x0');
    imgEl.alt = '';
    imgEl.loading = 'lazy';

    thumbWrapper.appendChild(imgEl);

    // Store tooltip text as data attribute (picked up by hover tooltip.js on desktop
    // and by the scrub handler on mobile)
    const tooltipText = thumbTooltips[index] || (isSpecial ? specialLabels[index] : null);
    if (tooltipText) thumbWrapper.dataset.tooltip = tooltipText;

    // Click always works
    thumbWrapper.addEventListener('click', () => updateCarousel(index, false));

    // Desktop: hover to preview — skip if the currently active slide has a
    // retry button, so the failed image stays reachable without the carousel
    // shifting under the cursor.
    thumbWrapper.addEventListener('mouseenter', () => {
      if (window.matchMedia('(hover: hover)').matches) {
        const mainTrack = document.getElementById('product-carousel-track');
        if (mainTrack) {
          const activeSlide = mainTrack.querySelector('.product-carousel-slide.active');
          if (activeSlide && activeSlide.querySelector('.img-reload-btn')) return;
        }
        updateCarousel(index, false);
      }
    });

    container.appendChild(thumbWrapper);
  });

  // Check if thumbnails overflow and need left-align for scrolling
  requestAnimationFrame(() => {
    if (container.scrollWidth > container.clientWidth) {
      container.classList.add('overflowing');
    } else {
      container.classList.remove('overflowing');
    }
  });

  // Mobile: scrub through thumbnails to change main carousel image
  setupThumbnailScrub(container);
};

/**
 * Mobile scrub: touching and dragging across thumbnails changes the carousel.
 */
const setupThumbnailScrub = (container) => {
  let scrubbing = false;
  let scrubStartX = 0;
  let scrubStartY = 0;
  let scrubDirectionLocked = null;

  const getThumbIndexAtPoint = (x, y) => {
    const thumbs = container.querySelectorAll('.product-carousel-thumbnail');
    for (let i = 0; i < thumbs.length; i++) {
      const rect = thumbs[i].getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return i;
      }
    }
    return -1;
  };

  const onTouchStart = (e) => {
    scrubbing = true;
    scrubDirectionLocked = null;
    const touch = e.touches[0];
    scrubStartX = touch.clientX;
    scrubStartY = touch.clientY;
    const idx = getThumbIndexAtPoint(touch.clientX, touch.clientY);
    if (idx >= 0) {
      updateCarousel(idx, false);
      const thumb = container.querySelectorAll('.product-carousel-thumbnail')[idx];
      if (thumb && thumb.dataset.tooltip) showScrubTooltip(thumb.dataset.tooltip, thumb);
    }
  };

  const onTouchMove = (e) => {
    if (!scrubbing) return;
    const touch = e.touches[0];
    // Lock direction once to determine horizontal vs vertical swipe
    if (!scrubDirectionLocked) {
      const dx = Math.abs(touch.clientX - scrubStartX);
      const dy = Math.abs(touch.clientY - scrubStartY);
      if (dx > 5 || dy > 5) {
        scrubDirectionLocked = dx >= dy ? 'horizontal' : 'vertical';
      }
    }
    // Prevent vertical scroll during horizontal thumbnail scrub (Safari fix)
    if (scrubDirectionLocked === 'horizontal') {
      e.preventDefault();
    }
    const idx = getThumbIndexAtPoint(touch.clientX, touch.clientY);
    if (idx >= 0) {
      updateCarousel(idx, false);
      const thumb = container.querySelectorAll('.product-carousel-thumbnail')[idx];
      if (thumb && thumb.dataset.tooltip) showScrubTooltip(thumb.dataset.tooltip, thumb);
    }
  };

  const onTouchEnd = () => {
    scrubbing = false;
    scrubDirectionLocked = null;
    hideScrubTooltip();
  };

  container.addEventListener('touchstart', onTouchStart, { passive: true });
  container.addEventListener('touchmove', onTouchMove, { passive: false });
  container.addEventListener('touchend', onTouchEnd, { passive: true });
  container.addEventListener('touchcancel', onTouchEnd, { passive: true });

  // Store cleanup function
  container._scrubCleanup = () => {
    container.removeEventListener('touchstart', onTouchStart);
    container.removeEventListener('touchmove', onTouchMove);
    container.removeEventListener('touchend', onTouchEnd);
    container.removeEventListener('touchcancel', onTouchEnd);
  };
};

const updateThumbnailActive = (index) => {
  document.querySelectorAll('.product-carousel-thumbnail').forEach((t, i) => {
    t.classList.toggle('active', i === index);
  });
  // Don't auto-scroll thumbnails - let user stay at top of page
};

// ============ ZOOM ============

const openCarouselZoom = (images, startIndex) => {
  if (window.openZoom) window.openZoom(images, startIndex);
  else console.error('Zoom module not loaded');
};

// ============ PUBLIC INIT ============

export const initCarouselTouch = () => {
  // Touch is now set up inside setupCarouselInteraction,
  // but we call it here for backward compat (main carousel).
  // Additional carousel touch is set up in renderProductCarousel.
};
