// ============================================================
// ZOOM MODULE
// Reusable image zoom popup functionality
// ============================================================

let zoomImages = [];
let zoomProducts = [];
let zoomDeprecated = [];
let zoomShowIndicators = true;
let currentZoomIndex = 0;
let zoomMaxDisplayWidth = 0; // desktop only: grows with widest image seen, never shrinks
let zoomSwipeAnimId = 0;     // incremented to cancel stale swipe callbacks

/**
 * Parse the aspect ratio (height/width) of a VK CDN image from its as= URL parameter.
 * Returns null if the URL does not contain as= size metadata.
 */
function getAspectRatioFromUrl(url) {
  if (!url) return null;
  const m = url.match(/[?&]as=([\dx,]+)/);
  if (!m) return null;
  const first = m[1].split(',')[0];
  const parts = first.split('x');
  if (parts.length !== 2) return null;
  const w = parseInt(parts[0], 10);
  const h = parseInt(parts[1], 10);
  if (!w || !h) return null;
  return h / w;
}

// Mobile carousel state
let mobileCarouselTrack = null;
let mobileCarouselObserver = null;

/**
 * Set image src with loading skeleton while the new image fetches.
 * Hides the stale image immediately, shows skeleton on the wrapper,
 * then fades in the new image once loaded.
 */
function setZoomImageSrc(image, src) {
  const wrapper = image.closest('.zoom-wrapper');

  // Disable transition so the old image disappears instantly (not fades)
  image.style.transition = 'none';
  image.style.transform = '';
  image.style.opacity = '0';
  if (wrapper) wrapper.classList.add('loading');

  // Remove any stale reload overlay
  const existingOverlay = wrapper?.querySelector('.img-reload-overlay');
  if (existingOverlay) existingOverlay.remove();

  image.onload = function () {
    // Set wrapper dimensions first so layout is stable before chrome becomes visible.
    // Removing zoom-loading-initial while the wrapper is still at full CSS width causes
    // a visible width jump (wide→narrow) that looks like a swipe animation.
    if (wrapper) updateZoomWrapperDimensions(wrapper, this);

    // Reveal popup chrome now that the first image is ready
    const overlayEl = document.querySelector('.zoom-overlay');
    if (overlayEl) overlayEl.classList.remove('zoom-loading-initial');

    image.style.opacity = '1';
    if (wrapper) wrapper.classList.remove('loading');
  };

  image.onerror = function () {
    const overlayEl = document.querySelector('.zoom-overlay');
    if (overlayEl) overlayEl.classList.remove('zoom-loading-initial');
    image.style.opacity = '1';
    if (wrapper) {
      wrapper.classList.remove('loading');
      // Give the wrapper a fallback height so the retry overlay is visible
      // when the first image fails before any dimensions have been set.
      if (!wrapper.style.height && !wrapper.style.aspectRatio) {
        wrapper.style.height = '50vh';
      }
      if (window.createImageReloadOverlay) {
        window.createImageReloadOverlay(this, src, wrapper);
      }
    }
  };

  image.src = src;
}

/**
 * Set wrapper dimensions from an already-loaded image.
 * Mobile: no-op — CSS flex layout gives the wrapper a stable fixed height,
 *   preventing scale changes when swiping between images of different sizes.
 * Desktop: only expands width, never shrinks (keeps arrows stable and fills
 *   the background area beside narrower images that come after wider ones).
 */
function updateZoomWrapperDimensions(wrapper, img) {
  const isMobile = window.matchMedia('(hover: none)').matches;
  if (isMobile) return;

  const maxH = window.innerHeight * 0.8;
  const maxW = Math.min(window.innerWidth * 0.95, 1600);
  const scale = Math.min(maxH / img.naturalHeight, maxW / img.naturalWidth, 1);
  const displayHeight = Math.ceil(img.naturalHeight * scale);
  const displayWidth = Math.ceil(img.naturalWidth * scale);

  if (displayWidth > zoomMaxDisplayWidth) {
    zoomMaxDisplayWidth = displayWidth;
    wrapper.style.width = `${zoomMaxDisplayWidth}px`;
  }
  wrapper.style.height = `${displayHeight}px`;
}

/**
 * Preload the images immediately before and after the given index so
 * navigation feels instant. Intentionally loads only 2 images to avoid
 * fetching the entire set upfront (important for large masonry grids).
 */
function preloadAdjacentImages(index) {
  [-1, 1].forEach(delta => {
    const i = index + delta;
    if (i >= 0 && i < zoomImages.length) {
      const img = new Image();
      img.src = zoomImages[i];
    }
  });
}

/**
 * Calculate the actual displayed pixel bounds of an image rendered with
 * object-fit: contain inside its element (letterbox/pillarbox aware).
 */
function getDisplayedImageRect(img) {
  const rect = img.getBoundingClientRect();
  if (!img.naturalWidth || !img.naturalHeight) return rect;

  const containerAspect = rect.width / rect.height;
  const imageAspect = img.naturalWidth / img.naturalHeight;
  let displayedWidth, displayedHeight, left, top;

  if (imageAspect > containerAspect) {
    // Wider than container: letterbox top/bottom
    displayedWidth = rect.width;
    displayedHeight = rect.width / imageAspect;
    left = rect.left;
    top = rect.top + (rect.height - displayedHeight) / 2;
  } else {
    // Taller than container: pillarbox left/right
    displayedHeight = rect.height;
    displayedWidth = rect.height * imageAspect;
    top = rect.top;
    left = rect.left + (rect.width - displayedWidth) / 2;
  }

  return { left, top, right: left + displayedWidth, bottom: top + displayedHeight };
}

/**
 * Initialize and inject zoom popup HTML into the page
 */
function initZoom() {
  // Prevent duplicate overlay if already initialized
  if (document.querySelector('.zoom-overlay')) return;

  const zoomHTML = `
  <div class="zoom-overlay">
    <div class="zoom-backdrop"></div>
    <div class="zoom-content">
      <div class="zoom-cluster">
        <div class="zoom-indicators" id="zoom-indicators"></div>
        <div class="zoom-wrapper">
          <img class="zoom-image" src="" alt=""/>
          <div class="zoom-deprecated-tag" id="zoom-deprecated-tag" style="display: none;">
            Устаревший вариант
            <div class="zoom-deprecated-tooltip">Устаревшие варианты так же доступны к заказу</div>
          </div>
          <button class="zoom-prev btn-carousel" title="Назад"><svg width="24" height="24" style="transform: rotate(90deg);"><use href="#chevron-down"></use></svg></button>
          <button class="zoom-next btn-carousel" title="Вперед"><svg width="24" height="24" style="transform: rotate(-90deg);"><use href="#chevron-down"></use></svg></button>
        </div>
        <div class="zoom-close-row">
          <a href="#" class="zoom-product-link" id="zoom-product-link" style="display: none;" title="Открыть товар" data-no-router>
            <span class="zoom-product-title" id="zoom-product-title"></span>
            <svg width="14" height="14" style="margin-left: 6px; flex-shrink: 0;"><use href="#arrow-right"></use></svg>
          </a>
          <button class="zoom-close-btn">Закрыть</button>
        </div>
      </div>
    </div>
  </div>
  `;

  // Insert zoom popup before SVG symbols
  const svgElement = document.querySelector('svg[style*="display:none"]');
  if (svgElement) {
    svgElement.insertAdjacentHTML('beforebegin', zoomHTML);
  } else {
    document.body.insertAdjacentHTML('beforeend', zoomHTML);
  }

  // Setup zoom functionality
  setupZoomFunctionality();
}

/**
 * Setup zoom popup event listeners
 */
function setupZoomFunctionality() {
  const overlay = document.querySelector('.zoom-overlay');
  const content = document.querySelector('.zoom-content');
  const closeBtn = document.querySelector('.zoom-close-btn');
  const prevBtn = document.querySelector('.zoom-prev');
  const nextBtn = document.querySelector('.zoom-next');

  // Close zoom
  if (closeBtn) {
    closeBtn.addEventListener('click', closeZoom);
  }

  // Close zoom and navigate to product via SPA router when product link is clicked
  const productLink = document.getElementById('zoom-product-link');
  if (productLink) {
    productLink.addEventListener('click', (e) => {
      e.preventDefault();
      const href = productLink.getAttribute('href');
      closeZoom();
      if (href && href !== '#') {
        if (typeof window.smoothNavigate === 'function') {
          window.smoothNavigate(href);
        } else {
          window.location.href = href;
        }
      }
    });
  }

  // Close on overlay or backdrop click (but not on content click)
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.classList.contains('zoom-backdrop')) {
        closeZoom();
      }
    });
    // Reliable tap detection on mobile (touchend fires even if finger moves slightly)
    const backdropEl = overlay.querySelector('.zoom-backdrop');
    if (backdropEl) {
      let bTapStartY = 0;
      backdropEl.addEventListener('touchstart', (e) => { bTapStartY = e.touches[0].clientY; }, { passive: true });
      // Non-passive so we can preventDefault(), which suppresses the 300 ms
      // ghost click that iOS fires after touchend — without it the synthesised
      // click reaches elements that are now visible behind the closed overlay.
      backdropEl.addEventListener('touchend', (e) => {
        if (Math.abs(e.changedTouches[0].clientY - bTapStartY) < 15) {
          e.preventDefault();
          closeZoom();
        }
      });
    }
  }

  // Close when tapping empty area of zoom-content (above indicators or below close-row)
  if (content) {
    content.addEventListener('click', (e) => {
      if (e.target === content) closeZoom();
    });
  }

  // Navigation
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      navigateZoom(-1);
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      navigateZoom(1);
    });
  }

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    const overlay = document.querySelector('.zoom-overlay');
    if (overlay && overlay.classList.contains('active')) {
      if (e.key === 'Escape') closeZoom();
      if (e.key === 'ArrowLeft') navigateZoom(-1);
      if (e.key === 'ArrowRight') navigateZoom(1);
    }
  });

  const isMobile = window.matchMedia('(hover: none)').matches;
  if (isMobile) {
    // Mobile: pinch-to-zoom with spring-back
    setupZoomPinch();
  } else {
    // Desktop: manual swipe-to-navigate
    setupZoomSwipe();
  }

  window.addEventListener('resize', () => {
    const ov = document.querySelector('.zoom-overlay');
    if (!ov || !ov.classList.contains('active')) return;
    if (window.matchMedia('(hover: none)').matches) return;
    const wr = document.querySelector('.zoom-wrapper');
    const im = document.querySelector('.zoom-image');
    if (!wr || !im || !im.naturalWidth) return;
    zoomMaxDisplayWidth = 0;
    updateZoomWrapperDimensions(wr, im);
  });
}

function setupZoomSwipe() {
  const wrapper = document.querySelector('.zoom-wrapper');
  if (!wrapper) return;

  let startX = 0;
  let startY = 0;
  let isDragging = false;
  let touchCount = 0;
  let previewEl = null;
  let previewDir = 0;

  // Returns true when a tap lands outside the image's visible (letterboxed) area.
  // Used on mobile to close zoom when the user taps the transparent region
  // above/below (or beside) a contained image.
  function tappedInLetterbox(touch) {
    const imgEl = wrapper.querySelector('.zoom-image');
    if (!imgEl) return true;
    const nW = imgEl.naturalWidth, nH = imgEl.naturalHeight;
    if (!nW || !nH) return false; // can't compute bounds — don't close
    const r = wrapper.getBoundingClientRect();
    const scale = Math.min(r.width / nW, r.height / nH);
    const vW = nW * scale, vH = nH * scale;
    const vLeft = r.left + (r.width - vW) / 2;
    const vTop  = r.top  + (r.height - vH) / 2;
    return touch.clientX < vLeft || touch.clientX > vLeft + vW
        || touch.clientY < vTop  || touch.clientY > vTop  + vH;
  }

  const abortDrag = () => {
    zoomSwipeAnimId++;
    const img = wrapper.querySelector('.zoom-image');
    if (img) {
      img.style.transition = '';
      img.style.transform = '';
      img.style.willChange = '';
    }
    if (previewEl) {
      previewEl.remove();
      previewEl = null;
    }
    // Remove any preview/outgoing element left over from a cancelled commit.
    // Without this, capturedPreview (already nulled from previewEl at commit time)
    // would remain in the DOM and cause visible ghost images.
    wrapper.querySelectorAll('img:not(.zoom-image)').forEach(el => el.remove());
    isDragging = false;
    previewDir = 0;
  };

  wrapper.addEventListener('touchstart', (e) => {
    touchCount = e.touches.length;
    if (touchCount === 1) {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      abortDrag();
    }
  }, { passive: true });

  wrapper.addEventListener('touchmove', (e) => {
    if (touchCount !== 1 || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;

    if (!isDragging) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        isDragging = true;
        // dx > 0: swiping right → prev image slides in from left (previewDir = -1)
        // dx < 0: swiping left  → next image slides in from right (previewDir = +1)
        previewDir = dx > 0 ? -1 : 1;
        if (zoomImages.length > 1) {
          const previewIdx = ((currentZoomIndex + previewDir) + zoomImages.length) % zoomImages.length;
          previewEl = document.createElement('img');
          previewEl.src = zoomImages[previewIdx];
          const offscreen = previewDir > 0 ? '100%' : '-100%';
          previewEl.style.cssText = `position:absolute;inset:0;width:100%;height:100%;object-fit:contain;transform:translateX(${offscreen});pointer-events:none;will-change:transform;`;
          wrapper.appendChild(previewEl);
        }
        const img = wrapper.querySelector('.zoom-image');
        if (img) img.style.willChange = 'transform';
      }
    }

    if (!isDragging) return;

    const img = wrapper.querySelector('.zoom-image');
    if (img) {
      img.style.transition = 'none';
      img.style.transform = `translateX(${dx}px)`;
    }
    if (previewEl) {
      const baseOffset = previewDir > 0 ? 100 : -100;
      previewEl.style.transition = 'none';
      previewEl.style.transform = `translateX(calc(${baseOffset}% + ${dx}px))`;
    }
  }, { passive: true });

  wrapper.addEventListener('touchend', (e) => {
    const touch = e.changedTouches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;

    // Tap (no drag) → close when tapping the letterbox area (transparent region
    // outside the contained image). On mobile the <img> covers the full wrapper
    // via inset:0, so e.target is never the wrapper — use visual bounds instead.
    if (!isDragging && Math.abs(dx) < 15 && Math.abs(dy) < 15) {
      const isMob = window.matchMedia('(hover: none)').matches;
      if (isMob ? tappedInLetterbox(touch) : e.target === wrapper) closeZoom();
      return;
    }

    if (!isDragging) return;

    const img = wrapper.querySelector('.zoom-image');
    const DUR = 280;
    const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';
    const THRESHOLD = 50;
    const capturedDir = previewDir;
    const capturedAnimId = ++zoomSwipeAnimId;

    if (Math.abs(dx) > THRESHOLD && zoomImages.length > 1 && previewEl) {
      // Update index immediately so a rapid second swipe navigates from the
      // correct position rather than the stale pre-commit index.
      currentZoomIndex = (currentZoomIndex + capturedDir + zoomImages.length) % zoomImages.length;
      updateZoomIndicatorsUI();
      updateZoomProductInfo();
      updateZoomDeprecatedTag();
      preloadAdjacentImages(currentZoomIndex);

      // Commit: slide current out, preview in
      const exitDir = capturedDir > 0 ? '-100%' : '100%';
      if (img) {
        img.style.transition = `transform ${DUR}ms ${EASE}`;
        img.style.transform = `translateX(${exitDir})`;
      }
      previewEl.style.transition = `transform ${DUR}ms ${EASE}`;
      previewEl.style.transform = 'translateX(0)';

      const capturedPreview = previewEl;
      previewEl = null;
      isDragging = false;
      previewDir = 0;

      setTimeout(() => {
        if (zoomSwipeAnimId !== capturedAnimId) {
          // This commit was superseded by a newer swipe — remove the preview
          // element that was already detached from previewEl and would otherwise
          // be orphaned in the DOM forever.
          capturedPreview.remove();
          return;
        }
        // Swap main image src (served from cache, near-instant)
        if (img) {
          img.src = zoomImages[currentZoomIndex];
          img.onload = null;
          img.onerror = null;
          img.style.transition = '';
          img.style.transform = '';
          img.style.willChange = '';
          img.style.opacity = '1';
        }
        capturedPreview.remove();
      }, DUR + 20);
    } else {
      // Snap back
      const snapDur = 220;
      if (img) {
        img.style.transition = `transform ${snapDur}ms ${EASE}`;
        img.style.transform = 'translateX(0)';
      }
      if (previewEl) {
        const baseOffset = capturedDir > 0 ? 100 : -100;
        previewEl.style.transition = `transform ${snapDur}ms ${EASE}`;
        previewEl.style.transform = `translateX(${baseOffset}%)`;
        const pe = previewEl;
        previewEl = null;
        setTimeout(() => pe.remove(), snapDur + 20);
      }
      isDragging = false;
      previewDir = 0;
      setTimeout(() => {
        if (zoomSwipeAnimId !== capturedAnimId) return;
        if (img) {
          img.style.transition = '';
          img.style.transform = '';
          img.style.willChange = '';
        }
      }, snapDur + 20);
    }
  }, { passive: true });

  wrapper.addEventListener('touchcancel', () => abortDrag(), { passive: true });
}

function setupZoomPinch() {
  const overlay = document.querySelector('.zoom-overlay');
  const cluster = document.querySelector('.zoom-cluster');
  if (!overlay || !cluster) return;

  let pinchStartDist = 0;
  let currentScale = 1;
  let pinchActive = false;

  const getDistance = (touches) =>
    Math.hypot(
      touches[0].clientX - touches[1].clientX,
      touches[0].clientY - touches[1].clientY
    );

  const getMidpoint = (touches) => ({
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2
  });

  const springBack = () => {
    cluster.style.transition = 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), transform-origin 0s';
    cluster.style.transform = 'scale(1)';
    // Reset origin after animation completes
    setTimeout(() => {
      cluster.style.transformOrigin = '';
    }, 400);
  };

  overlay.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      pinchActive = true;
      pinchStartDist = getDistance(e.touches);

      // Set transform origin to pinch midpoint relative to the cluster element
      const mid = getMidpoint(e.touches);
      const rect = cluster.getBoundingClientRect();
      const originX = ((mid.x - rect.left) / rect.width) * 100;
      const originY = ((mid.y - rect.top) / rect.height) * 100;
      cluster.style.transformOrigin = `${originX}% ${originY}%`;

      e.preventDefault();
    }
  }, { passive: false });

  overlay.addEventListener('touchmove', (e) => {
    if (!pinchActive || e.touches.length !== 2) return;
    const dist = getDistance(e.touches);
    currentScale = Math.min(Math.max(dist / pinchStartDist, 0.8), 3);
    cluster.style.transition = 'none';
    cluster.style.transform = `scale(${currentScale})`;
    e.preventDefault();
  }, { passive: false });

  overlay.addEventListener('touchend', (e) => {
    if (!pinchActive) return;
    if (e.touches.length < 2) {
      pinchActive = false;
      currentScale = 1;
      springBack();
    }
  }, { passive: true });

  overlay.addEventListener('touchcancel', () => {
    pinchActive = false;
    currentScale = 1;
    springBack();
  }, { passive: true });
}

/**
 * Build the mobile scroll-snap carousel inside the wrapper.
 * For >10 images, uses IntersectionObserver to lazy-load slides as the user
 * scrolls toward them so the initial open isn't blocked by a long image fetch.
 */
function openMobileCarousel(startIndex) {
  const wrapper = document.querySelector('.zoom-wrapper');
  if (!wrapper) return;

  // Pre-calculate wrapper height from image aspect ratios (parsed from as= URL params).
  // All slides get this same fixed height so no Y-shift occurs when swiping between
  // images of different proportions. Cap at viewport height minus chrome (indicators +
  // close row ≈ 80px). Fall back to that cap if no as= metadata is available.
  const CHROME_HEIGHT = 80;
  const maxViewportH = (window.innerHeight || 700) - CHROME_HEIGHT;
  const maxAspectRatio = zoomImages.reduce((best, url) => {
    const r = getAspectRatioFromUrl(url);
    return r && r > best ? r : best;
  }, 0);
  const wrapperH = maxAspectRatio
    ? Math.min(Math.round(window.innerWidth * maxAspectRatio), maxViewportH)
    : maxViewportH;
  wrapper.style.height = `${wrapperH}px`;

  // Tear down any previous carousel
  if (mobileCarouselObserver) {
    mobileCarouselObserver.disconnect();
    mobileCarouselObserver = null;
  }
  const oldTrack = wrapper.querySelector('.zoom-carousel-track');
  if (oldTrack) oldTrack.remove();
  mobileCarouselTrack = null;

  const track = document.createElement('div');
  track.className = 'zoom-carousel-track';
  mobileCarouselTrack = track;

  const LAZY_THRESHOLD = 10;
  const useLazy = zoomImages.length > LAZY_THRESHOLD;

  zoomImages.forEach((src, i) => {
    const slide = document.createElement('div');
    slide.className = 'zoom-slide';

    const img = document.createElement('img');
    img.className = 'zoom-slide-img';
    img.alt = '';

    const nearStart = Math.abs(i - startIndex) <= 2;
    if (!useLazy || nearStart) {
      img.src = src;
    } else {
      img.dataset.src = src;
      img.style.opacity = '0';
    }

    slide.appendChild(img);
    track.appendChild(slide);

    // Tap in letterbox/pillarbox area closes zoom
    slide.addEventListener('click', (e) => {
      if (!img.naturalWidth || !img.naturalHeight) {
        closeZoom();
        return;
      }
      const bounds = getDisplayedImageRect(img);
      if (
        e.clientX < bounds.left || e.clientX > bounds.right ||
        e.clientY < bounds.top  || e.clientY > bounds.bottom
      ) {
        closeZoom();
      }
    });
  });

  wrapper.appendChild(track);

  // Lazy-load slides entering the nearby viewport
  if (useLazy) {
    mobileCarouselObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const lazyImg = entry.target.querySelector('img[data-src]');
        if (lazyImg) {
          lazyImg.src = lazyImg.dataset.src;
          lazyImg.removeAttribute('data-src');
          lazyImg.style.opacity = '';
          mobileCarouselObserver.unobserve(entry.target);
        }
      });
    }, { root: track, rootMargin: '0px 200% 0px 200%' });

    track.querySelectorAll('.zoom-slide').forEach(slide => {
      mobileCarouselObserver.observe(slide);
    });
  }

  // Scroll to start index once layout is ready
  requestAnimationFrame(() => {
    track.scrollLeft = startIndex * track.clientWidth;
  });

  // Remove initial loading state when the start-image loads.
  // Also size the wrapper to the image aspect ratio so indicators and the
  // close-row end up flush against the image rather than at the viewport edges.
  const startImg = track.querySelectorAll('.zoom-slide-img')[startIndex];

  const revealOverlay = () => {
    const overlayEl = document.querySelector('.zoom-overlay');
    if (overlayEl) overlayEl.classList.remove('zoom-loading-initial');
  };

  if (startImg) {
    if (startImg.complete && startImg.naturalWidth) {
      revealOverlay();
    } else {
      startImg.addEventListener('load', revealOverlay, { once: true });
      startImg.addEventListener('error', revealOverlay, { once: true });
    }
  } else {
    revealOverlay();
  }

  // Update indicators and product info as the user scrolls
  track.addEventListener('scroll', () => {
    if (!mobileCarouselTrack) return;
    const newIndex = Math.round(track.scrollLeft / track.clientWidth);
    if (newIndex !== currentZoomIndex && newIndex >= 0 && newIndex < zoomImages.length) {
      currentZoomIndex = newIndex;
      updateZoomIndicatorsUI();
      updateZoomProductInfo();
      updateZoomDeprecatedTag();
    }
  }, { passive: true });
}

/**
 * Open zoom with array of images
 * @param {Array<string>} images - Array of image URLs
 * @param {number} startIndex - Index of image to show first
 * @param {Array<Object>} products - Optional array of product info for each image
 * @param {Object} options - Optional: { showIndicators: boolean, deprecated: boolean[] }
 */
function openZoom(images, startIndex = 0, products = null, options = {}) {
  zoomImages = images;
  zoomProducts = products || [];
  zoomDeprecated = options.deprecated || [];
  zoomShowIndicators = options.showIndicators !== false;
  currentZoomIndex = startIndex;

  const overlay = document.querySelector('.zoom-overlay');
  const image = document.querySelector('.zoom-image');
  const indicatorsContainer = document.getElementById('zoom-indicators');
  const prevBtn = document.querySelector('.zoom-prev');
  const nextBtn = document.querySelector('.zoom-next');

  if (!overlay) return;

  const isMobile = window.matchMedia('(hover: none)').matches;

  // Reset dimension tracking and cancel any in-flight swipe animations
  zoomMaxDisplayWidth = 0;
  zoomSwipeAnimId++;

  // Clear inline styles and stale images from previous session
  const wrapperEl = document.querySelector('.zoom-wrapper');
  if (wrapperEl) {
    wrapperEl.style.width = '';
    wrapperEl.style.height = '';
    wrapperEl.style.aspectRatio = '';
    if (!isMobile) {
      wrapperEl.querySelectorAll('img:not(.zoom-image)').forEach(el => el.remove());
    }
  }

  // Show overlay in loading state (only spinner visible until image loads)
  overlay.classList.add('active');
  overlay.classList.add('zoom-loading-initial');
  document.body.classList.add('modal-open');
  document.documentElement.style.setProperty('--locked-dvh', window.innerHeight + 'px');
  const backdrop = document.querySelector('.zoom-backdrop');
  if (backdrop) window.addBackdropGrain?.(backdrop);

  // Update indicators (hide when only one image or showIndicators is false)
  if (indicatorsContainer) {
    if (zoomShowIndicators && zoomImages.length > 1) {
      indicatorsContainer.innerHTML = '';
      zoomImages.forEach((_, index) => {
        const indicator = document.createElement('button');
        indicator.className = 'zoom-indicator';
        if (index === currentZoomIndex) {
          indicator.classList.add('active');
        }
        indicator.addEventListener('click', () => {
          if (mobileCarouselTrack) {
            mobileCarouselTrack.scrollTo({
              left: index * mobileCarouselTrack.clientWidth,
              behavior: 'smooth'
            });
          } else {
            currentZoomIndex = index;
            updateZoomDisplay();
          }
        });
        indicatorsContainer.appendChild(indicator);
      });
      indicatorsContainer.style.display = '';
    } else {
      indicatorsContainer.innerHTML = '';
      indicatorsContainer.style.display = 'none';
    }
  }

  if (isMobile) {
    // Mobile: scroll-snap carousel (handles its own image loading & reveal)
    openMobileCarousel(startIndex);
    updateZoomProductInfo();
    updateZoomDeprecatedTag();
  } else {
    // Desktop: single image with JS-driven navigation
    if (!image) return;
    setZoomImageSrc(image, zoomImages[currentZoomIndex]);
    updateZoomProductInfo();
    updateZoomDeprecatedTag();

    // Show/hide nav buttons based on image count
    if (prevBtn && nextBtn) {
      const showNav = zoomImages.length > 1;
      prevBtn.style.display = showNav ? 'flex' : 'none';
      nextBtn.style.display = showNav ? 'flex' : 'none';
    }

    // Preload adjacent images for fast navigation
    preloadAdjacentImages(startIndex);
  }
}

/**
 * Close zoom popup
 */
function closeZoom() {
  const overlay = document.querySelector('.zoom-overlay');
  if (overlay) {
    overlay.classList.remove('active');
    overlay.classList.remove('zoom-loading-initial');
  }

  document.body.classList.remove('modal-open');
  if (!document.body.classList.contains('sheet-open')) {
    document.documentElement.style.removeProperty('--locked-dvh');
  }

  // Remove backdrop grain
  const backdrop = document.querySelector('.zoom-backdrop');
  if (backdrop) window.removeBackdropGrain?.(backdrop);

  // Tear down mobile carousel
  if (mobileCarouselObserver) {
    mobileCarouselObserver.disconnect();
    mobileCarouselObserver = null;
  }
  const track = document.querySelector('.zoom-carousel-track');
  if (track) track.remove();
  mobileCarouselTrack = null;

  // Clear desktop image so the previous photo isn't visible on the next open
  const image = document.querySelector('.zoom-image');
  if (image) {
    image.src = '';
    image.style.opacity = '';
    image.style.transition = '';
    image.style.transform = '';
    image.style.willChange = '';
  }
  const wrapper = document.querySelector('.zoom-wrapper');
  if (wrapper) {
    wrapper.classList.remove('loading');
    wrapper.style.width = '';
    wrapper.style.height = '';
    wrapper.style.aspectRatio = '';
  }

  zoomImages = [];
  zoomProducts = [];
  zoomDeprecated = [];
  zoomShowIndicators = true;
  currentZoomIndex = 0;
  zoomMaxDisplayWidth = 0;
}

/**
 * Show or hide the deprecated tag based on the current image index
 */
function updateZoomDeprecatedTag() {
  const tag = document.getElementById('zoom-deprecated-tag');
  if (!tag) return;
  tag.style.display = zoomDeprecated[currentZoomIndex] ? 'flex' : 'none';
}

/**
 * Update product info display in zoom popup
 */
function updateZoomProductInfo() {
  const productLink = document.getElementById('zoom-product-link');
  const productTitle = document.getElementById('zoom-product-title');

  if (!productLink || !productTitle) return;

  const currentProduct = zoomProducts[currentZoomIndex];

  const productUrl = currentProduct?.slug
    ? `/product?id=${currentProduct.slug}`
    : (currentProduct?.id ? `/product?id=${currentProduct.id}` : null);

  if (currentProduct && currentProduct.title && productUrl) {
    productLink.style.display = '';
    productTitle.textContent = currentProduct.title;
    productLink.href = productUrl;
  } else {
    productLink.style.display = 'none';
  }
}

/**
 * Navigate zoom images
 * @param {number} direction - -1 for previous, 1 for next
 */
function navigateZoom(direction) {
  if (zoomImages.length === 0) return;

  if (mobileCarouselTrack) {
    // Mobile: scroll carousel to adjacent slide (wrapping disabled on mobile for natural feel)
    const newIndex = Math.max(0, Math.min(zoomImages.length - 1, currentZoomIndex + direction));
    mobileCarouselTrack.scrollTo({
      left: newIndex * mobileCarouselTrack.clientWidth,
      behavior: 'smooth'
    });
    return;
  }

  // Desktop: JS-driven navigation with slide animation
  currentZoomIndex += direction;
  if (currentZoomIndex < 0) {
    currentZoomIndex = zoomImages.length - 1;
  } else if (currentZoomIndex >= zoomImages.length) {
    currentZoomIndex = 0;
  }

  updateZoomDisplay();
  preloadAdjacentImages(currentZoomIndex);
}

function updateZoomIndicatorsUI() {
  document.querySelectorAll('.zoom-indicator').forEach((indicator, index) => {
    indicator.classList.toggle('active', index === currentZoomIndex);
  });
}

/**
 * Update zoom display (image, indicators, and product info) — desktop only.
 * Desktop always fades between images; no slide animation.
 */
function updateZoomDisplay() {
  const image = document.querySelector('.zoom-image');
  if (image) setZoomImageSrc(image, zoomImages[currentZoomIndex]);
  updateZoomIndicatorsUI();
  updateZoomProductInfo();
  updateZoomDeprecatedTag();
}

// Auto-initialize when script loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initZoom);
} else {
  initZoom();
}

// Close zoom when the SPA navigates away (prevents stale images carrying over)
window.addEventListener('spa:pageleave', () => {
  if (document.querySelector('.zoom-overlay.active')) closeZoom();
});

// Export functions for use by other scripts
window.openZoom = openZoom;
window.closeZoom = closeZoom;
