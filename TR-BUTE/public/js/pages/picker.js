// ============================================================
// PICKER PAGE
// Swipeable card-based product picker
// ============================================================

// DEPENDENCIES:
// - utils.js (utilities, state, and API functions)
// - faq-popup.js (FAQ popup component)
// - skeleton-loader.js (skeleton loading states)

import { initFAQPopup, addFAQButton } from '../modules/faq-popup.js';
import { renderFaqInfoBoxes } from '../modules/faq-info-boxes.js';
import { showSkeletonLoaders, hideSkeletonLoaders } from '../modules/skeleton-loader.js';
import { DataStore } from '../core/data-store.js';
import { favorites } from '../core/state.js';
import { allImagesByProduct } from '../core/state.js';
import { addImageSize, filterImagesByExtra } from '../core/formatters.js';
import { toggleFavoriteSynced } from '../core/favorites.js';

// ============================================================
// ELEMENT REFERENCES (queried in init)
// ============================================================

let pickerGameScreen = null;
let pickerCardContainer = null;
let pickerCounter = null;
let pickerDislikeBtn = null;
let pickerLikeBtn = null;
let pickerUndoBtn = null;

/**
 * Query all DOM elements (called during init)
 */
const queryPickerElements = () => {
  pickerGameScreen = document.querySelector('.picker-game-screen');
  pickerCardContainer = document.querySelector('.picker-card-container');
  pickerCounter = document.getElementById('picker-counter');
  pickerDislikeBtn = document.querySelector('.picker-control-button.dislike');
  pickerLikeBtn = document.querySelector('.picker-control-button.like');
  pickerUndoBtn = document.querySelector('.picker-control-button.undo');
};

// ============================================================
// STATE VARIABLES
// ============================================================

// Batch loading configuration
const BATCH_SIZE = 20; // Load 20 products at a time

let allProducts = []; // All products loaded from API
let pickerProducts = [];
let pickerCurrentIndex = 0;
let pickerHistory = [];
let discardedImageUrls = []; // Images of left-swiped products (for red bg cards)
let likedImageUrls = [];     // Images of right-swiped products (for green bg cards)
let pickerDragStartX = 0;
let pickerDragStartY = 0;
let pickerDragCurrentX = 0;
let pickerIsDragging = false;
let pickerDragDirectionLocked = null; // 'horizontal' or 'vertical' once determined
let _pickerRafId = null; // rAF handle for drag move throttling
let currentBatchOffset = 0; // Track how many products we've loaded
let isLoadingBatch = false; // Prevent concurrent batch loads
let totalEligibleProducts = 0; // Total count of фирменные products available

// ============================================================
// DATA LOADING
// ============================================================

/**
 * Load products in batches for better performance
 * @param {number} offset - Starting index for this batch
 * @param {number} limit - Number of products to load
 * @returns {Promise<Array>} - Array of products
 */
const loadProductBatch = async (offset = 0, limit = BATCH_SIZE) => {
  try {
    // Load all products using DataStore (cached if coming from main page)
    const allProductsFromAPI = await DataStore.loadProducts();
    if (!Array.isArray(allProductsFromAPI)) return [];

    // Filter eligible products (фирменный, available, not triptych, not id 1, not in favorites)
    const eligible = allProductsFromAPI.filter(p =>
      p.type === 'фирменный' && p.status === 'available' && !p.triptych && p.id !== 1 && !favorites.has(p.id)
    );

    // Store total count on first load
    if (offset === 0) {
      totalEligibleProducts = eligible.length;
    }

    // Return batch slice
    return eligible.slice(offset, offset + limit);
  } catch (err) {
    console.error('Error loading product batch:', err);
    return [];
  }
};

/**
 * Load all products from API (for backward compatibility and session restore)
 */
const loadAllProducts = async () => {
  try {
    const products = await DataStore.loadProducts();
    return Array.isArray(products) ? products : [];
  } catch (err) {
    console.error('Error loading products:', err);
    return [];
  }
};

/**
 * Load next batch of products if needed
 */
const loadNextBatchIfNeeded = async () => {
  // Don't load if already loading or if we're not close to the end
  if (isLoadingBatch) return;

  const remainingCards = pickerProducts.length - pickerCurrentIndex;

  // Load next batch when 5 or fewer cards remain
  if (remainingCards <= 5) {
    isLoadingBatch = true;

    const nextBatch = await loadProductBatch(currentBatchOffset, BATCH_SIZE);

    if (nextBatch.length > 0) {
      // Add new products to picker queue
      pickerProducts.push(...nextBatch);
      currentBatchOffset += nextBatch.length;


      // Update localStorage
      localStorage.setItem('tribuePickerState', JSON.stringify({
        products: pickerProducts.map(p => p.id),
        index: pickerCurrentIndex,
        history: pickerHistory,
        timestamp: Date.now()
      }));
    }

    isLoadingBatch = false;
  }
};

// ============================================================
// IMAGE HELPERS
// ============================================================

/**
 * Return the display image URL for a product (same logic as card rendering)
 */
const getProductImageUrl = (product) => {
  const images = allImagesByProduct.get(product.id) || [];
  if (images.length > 0) {
    const variantsImage = images.find(img => typeof img !== 'string' && img.extra === 'варианты');
    return variantsImage
      ? (variantsImage.url || variantsImage)
      : product.image;
  }
  return product.image;
};

// ============================================================
// PICKER SESSION MANAGEMENT
// ============================================================

/**
 * Load picker session from localStorage
 */
const loadPickerSession = () => {
  try {
    const saved = localStorage.getItem('tribuePickerState');
    if (!saved) return false;

    const state = JSON.parse(saved);

    if (state.products && state.products.length > 0) {
      pickerProducts = state.products
        .map(id => allProducts.find(p => p.id === id))
        .filter(p => p !== undefined && p.type === 'фирменный' && p.status === 'available' && !p.triptych && p.id !== 1);

      if (pickerProducts.length === 0) return false;

      pickerCurrentIndex = state.index || 0;
      pickerHistory = state.history || [];
      return true;
    }
  } catch (e) {
    console.error('Error loading picker session:', e);
  }
  return false;
};

/**
 * Shuffle picker products and reset progress (using batch loading)
 */
const shufflePickerProducts = async () => {
  // Load first batch of products
  const firstBatch = await loadProductBatch(0, BATCH_SIZE);

  if (firstBatch.length === 0) {
    console.error('No eligible products found for picker');
    return;
  }

  // Shuffle the first batch
  pickerProducts = firstBatch
    .map(p => ({ product: p, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(item => item.product);

  pickerCurrentIndex = 0;
  pickerHistory = [];
  discardedImageUrls = [];
  likedImageUrls = [];
  currentBatchOffset = firstBatch.length;

  localStorage.setItem('tribuePickerState', JSON.stringify({
    products: pickerProducts.map(p => p.id),
    index: 0,
    history: [],
    timestamp: Date.now()
  }));

  // Remove only picker cards and indicators, keep background cards
  pickerCardContainer.querySelectorAll('.picker-card, .picker-swipe-indicators-overlay').forEach(el => el.remove());
  loadNextPickerCard();

  // Sync to server if user is logged in
  if (typeof syncDataToServer === 'function') {
    syncDataToServer('picker');
  }
};

// ============================================================
// CARD RENDERING & SETUP
// ============================================================

/**
 * Set up drag/swipe listeners for a picker card
 */
// Document-level touchmove guard: prevents page scroll during horizontal card drag
// even when the finger strays outside the card element boundaries.
function _pickerScrollGuard(e) {
  if (pickerIsDragging && pickerDragDirectionLocked === 'horizontal') {
    e.preventDefault();
  }
}

const setupPickerCardListeners = (card) => {
  if (!card) return;

  card.removeEventListener('touchstart', handlePickerDragStart);
  card.removeEventListener('touchmove', handlePickerDragMove);
  card.removeEventListener('touchend', handlePickerDragEnd);
  card.removeEventListener('mousedown', handlePickerDragStart);
  card.removeEventListener('mousemove', handlePickerDragMove);
  card.removeEventListener('mouseup', handlePickerDragEnd);

  // Debounce timer for mouseleave — prevents edge jitter when the 3D transform
  // briefly moves the card boundary past the cursor position.
  let _hoverLeaveTimer = null;

  card.addEventListener('touchstart', (e) => {
    pickerDragStartY = e.touches[0].clientY;
    pickerDragDirectionLocked = null;
    handlePickerDragStart(e.touches[0].clientX);
    // Attach document guard for this touch session
    document.addEventListener('touchmove', _pickerScrollGuard, { passive: false });
  }, { passive: true });

  card.addEventListener('touchmove', (e) => {
    if (!pickerIsDragging) return;

    const dx = Math.abs(e.touches[0].clientX - pickerDragStartX);
    const dy = Math.abs(e.touches[0].clientY - pickerDragStartY);

    if (!pickerDragDirectionLocked) {
      if (dx > 6 || dy > 6) {
        // Require vertical to be clearly dominant (1.5x) before treating as vertical;
        // any ambiguous or mostly-horizontal move is treated as a card swipe.
        pickerDragDirectionLocked = (dy > dx * 1.5) ? 'vertical' : 'horizontal';

        if (pickerDragDirectionLocked === 'vertical') {
          // Release card drag and let scroll happen
          pickerIsDragging = false;
          pickerDragDirectionLocked = null;
          document.removeEventListener('touchmove', _pickerScrollGuard);
          const pickerCard = document.getElementById('picker-card');
          if (pickerCard) {
            pickerCard.style.transform = 'translateX(0) rotate(0deg) scale(1)';
            pickerCard.classList.remove('show-left', 'show-right', 'swiping');
          }
          pickerCardContainer.classList.remove('swiping-left', 'swiping-right');
          return; // Don't preventDefault — allow scroll
        }
      } else {
        // Direction undecided and movement tiny — block scroll tentatively
        // so horizontal intent doesn't trigger page scroll for the first frames
        e.preventDefault();
        return;
      }
    }

    if (pickerDragDirectionLocked === 'horizontal') {
      e.preventDefault();
      handlePickerDragMove(e.touches[0].clientX);
    }
  }, { passive: false });

  card.addEventListener('touchend', handlePickerDragEnd, { passive: true });

  const resetStackTilt = (instant) => {
    const easing = instant ? 'none' : 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
    const secondCard = pickerCardContainer.querySelector('.picker-card-second');
    const thirdCard  = pickerCardContainer.querySelector('.picker-card-third');
    if (secondCard) { secondCard.style.transition = easing; secondCard.style.transform = ''; }
    if (thirdCard)  { thirdCard.style.transition  = easing; thirdCard.style.transform  = ''; }
  };

  card.addEventListener('mousedown', (e) => {
    if (_hoverLeaveTimer) { clearTimeout(_hoverLeaveTimer); _hoverLeaveTimer = null; }
    e.preventDefault(); // Prevent browser from grabbing the image as a draggable
    card.style.transition = 'none';
    card.style.transform = '';
    const gloss = card.querySelector('.picker-card-gloss');
    if (gloss) gloss.style.opacity = '0';
    resetStackTilt(true);
    handlePickerDragStart(e.clientX);
  });

  card.addEventListener('mousemove', (e) => {
    if (_hoverLeaveTimer) { clearTimeout(_hoverLeaveTimer); _hoverLeaveTimer = null; }
    if (pickerIsDragging) {
      handlePickerDragMove(e.clientX);
      return;
    }
    if (!window.matchMedia('(hover: hover)').matches) return;
    const rect = card.getBoundingClientRect();
    // Clamp to ±0.4 to avoid extreme tilt at edges (prevents edge jitter)
    const cx = Math.max(-0.4, Math.min(0.4, (e.clientX - rect.left) / rect.width - 0.5));
    const cy = Math.max(-0.4, Math.min(0.4, (e.clientY - rect.top) / rect.height - 0.5));
    card.style.transition = 'none';
    card.style.transform = `perspective(600px) rotateX(${cy * -10}deg) rotateY(${cx * 10}deg)`;
    const gloss = card.querySelector('.picker-card-gloss');
    if (gloss) {
      // Invert: light reflects from the opposite side to the cursor
      card.style.setProperty('--gloss-x', `${(0.5 - cx) * 100}%`);
      card.style.setProperty('--gloss-y', `${(0.5 - cy) * 100}%`);
      gloss.style.opacity = '1';
    }
    const secondCard = pickerCardContainer.querySelector('.picker-card-second');
    const thirdCard  = pickerCardContainer.querySelector('.picker-card-third');
    if (secondCard) {
      secondCard.style.transition = 'none';
      secondCard.style.transform = `perspective(600px) rotateX(${cy * -6}deg) rotateY(${cx * 6}deg) translateY(14px) scale(0.93)`;
    }
    if (thirdCard) {
      thirdCard.style.transition = 'none';
      thirdCard.style.transform = `perspective(600px) rotateX(${cy * -3}deg) rotateY(${cx * 3}deg) translateY(26px) scale(0.87)`;
    }
  });

  card.addEventListener('mouseup', handlePickerDragEnd);
  card.addEventListener('mouseleave', (e) => {
    const wasDragging = pickerIsDragging;
    if (wasDragging) {
      handlePickerDragEnd(e);
      return;
    }
    // Debounce the tilt reset so rapid leave/enter on card edges doesn't cause jitter.
    // The 3D transform can momentarily shift the card's hit boundary past the cursor.
    _hoverLeaveTimer = setTimeout(() => {
      _hoverLeaveTimer = null;
      card.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
      card.style.transform = '';
      const gloss = card.querySelector('.picker-card-gloss');
      if (gloss) gloss.style.opacity = '0';
      resetStackTilt(false);
    }, 80);
  });
};

/**
 * Load and render the next picker card(s)
 */
const loadNextPickerCard = () => {
  if (pickerCurrentIndex >= pickerProducts.length) {
    // Check if we can load more batches
    loadNextBatchIfNeeded().then(() => {
      // If still no more cards after attempted load, restart with discarded products
      if (pickerCurrentIndex >= pickerProducts.length) {
        const discardedIds = pickerHistory
          .filter(h => h.action === 'left')
          .map(h => h.productId);
        const discardedProducts = discardedIds
          .map(id => allProducts.find(p => p.id === id))
          .filter(Boolean);

        if (discardedProducts.length > 0) {
          // Start a new round with previously discarded products
          pickerProducts = discardedProducts;
          pickerCurrentIndex = 0;
          pickerHistory = [];
          discardedImageUrls = [];
          likedImageUrls = [];
          backgroundScrollOffset = 0;
          currentBatchOffset = discardedProducts.length;
          totalEligibleProducts = discardedProducts.length;

          localStorage.setItem('tribuePickerState', JSON.stringify({
            products: pickerProducts.map(p => p.id),
            index: 0,
            history: [],
            timestamp: Date.now()
          }));

          resetBackgroundCards();
          updateBackgroundCardColors();
          loadNextPickerCard();

          if (typeof window.showToast === 'function') {
            window.showToast('Начинаем заново с отклонёнными постерами', 'info');
          }
        } else {
          // No discarded products — all done
          pickerCardContainer.querySelectorAll('.picker-card, .picker-swipe-indicators-overlay, .picker-skeleton, .skeleton').forEach(el => el.remove());
          document.querySelector('.picker-product-title').textContent = '';
          pickerCounter.textContent = 'Все просмотрено!';
          pickerUndoBtn.disabled = true;
        }
      }
    });
    return;
  }

  // Remove picker cards, indicators, and skeletons, keep background cards
  pickerCardContainer.querySelectorAll('.picker-card, .picker-swipe-indicators-overlay, .picker-skeleton, .skeleton').forEach(el => el.remove());

  // Render up to 3 cards for stack effect
  for (let i = 0; i < 3 && pickerCurrentIndex + i < pickerProducts.length; i++) {
    const product = pickerProducts[pickerCurrentIndex + i];
    let images = allImagesByProduct.get(product.id) || [];

    // Only show "варианты" image
    let targetImage = null;
    if (images.length > 0) {
      const variantsImage = images.find(img =>
        typeof img !== 'string' && img.extra === 'варианты'
      );
      targetImage = variantsImage ? (variantsImage.url || variantsImage) : product.image;
    } else {
      targetImage = product.image;
    }

    const card = document.createElement('div');
    card.className = 'picker-card';
    if (i === 0) {
      card.id = 'picker-card';
      card.classList.add('picker-card-top');
    } else if (i === 1) {
      card.classList.add('picker-card-second');
    } else if (i === 2) {
      card.classList.add('picker-card-third');
    }
    card.innerHTML = `<img class="picker-card-image" src="${targetImage}" alt="" draggable="false"/><div class="picker-card-gloss"></div>`;

    pickerCardContainer.appendChild(card);

    // Only set up listeners and click handlers for the top card
    if (i === 0) {
      setupPickerCardListeners(card);

      const img = card.querySelector('img');
      img.addEventListener('click', (e) => {
        e.stopPropagation();

        // Drag on desktop fires a click on mouseup — ignore it
        if (pickerJustDragged) {
          pickerJustDragged = false;
          return;
        }

        // Get all images for zoom
        let allImages = allImagesByProduct.get(product.id) || [];
        const extraTypes = ['обложка', 'варианты', 'приближение'];
        const filtered = filterImagesByExtra(allImages, extraTypes);
        const sourceImages = filtered.length > 0 ? filtered : allImages;
        const imagesToZoom = sourceImages.map(img => {
          if (typeof img === 'string') return addImageSize(img, '1500x0');
          return addImageSize(img.url || img, '1500x0');
        });

        const variantsIdx = sourceImages.findIndex(img => typeof img !== 'string' && img.extra === 'варианты');
        const startIndex = variantsIdx >= 0 ? variantsIdx : 0;

        // Open zoom using window.openZoom if available
        if (imagesToZoom.length > 0) {
          if (typeof window.openZoom === 'function') {
            const productInfo = imagesToZoom.map(() => ({
              title: product.title,
              id: product.id,
              slug: product.slug
            }));
            window.openZoom(imagesToZoom, startIndex, productInfo);
          } else {
            console.warn('Zoom module not available');
          }
        }
      });
    }
  }

  // Add swipe indicators overlay
  const existingOverlay = pickerCardContainer.querySelector('.picker-swipe-indicators-overlay');
  if (existingOverlay) existingOverlay.remove();

  const indicatorsOverlay = document.createElement('div');
  indicatorsOverlay.className = 'picker-swipe-indicators-overlay';
  indicatorsOverlay.innerHTML = `
    <div class="picker-swipe-indicator left">
      <svg width="50" height="50"><use href="#x"></use></svg>
    </div>
    <div class="picker-swipe-indicator right">
      <svg width="50" height="50"><use href="#favorite"></use></svg>
    </div>
  `;
  pickerCardContainer.appendChild(indicatorsOverlay);

  // Update product title as link with smart navigation
  const currentProduct = pickerProducts[pickerCurrentIndex];
  const pickerTitleContainer = document.querySelector('.picker-product-title');
  const productParam = currentProduct.slug || currentProduct.id;
  const productUrl = `/product?id=${productParam}`;

  // Replace content with link
  pickerTitleContainer.innerHTML = `<a href="${productUrl}" title="Открыть товар" style="text-decoration: none; color: inherit; display: block; cursor: pointer;">${currentProduct.title}</a>`;

  // Add smart navigation handler
  const pickerTitleLink = pickerTitleContainer.querySelector('a');
  if (pickerTitleLink) {
    pickerTitleLink.addEventListener('click', (e) => {
      // Only prevent default for left-clicks without modifier keys
      if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        if (typeof smoothNavigate === 'function') {
          smoothNavigate(productUrl);
        } else {
          window.location.href = productUrl;
        }
      }
    });
  }

  // Update counter with actual total of eligible products
  pickerCounter.textContent = `${pickerCurrentIndex + 1} / ${totalEligibleProducts}`;
  pickerUndoBtn.disabled = pickerHistory.length === 0;

  // Load next batch if running low on cards
  loadNextBatchIfNeeded();

  // Save picker state to localStorage
  localStorage.setItem('tribuePickerState', JSON.stringify({
    products: pickerProducts.map(p => p.id),
    index: pickerCurrentIndex,
    history: pickerHistory,
    timestamp: Date.now()
  }));
};

// ============================================================
// BACKGROUND CARD ARRAYS
// ============================================================

// Track background card scroll position
let backgroundScrollOffset = 0;
const CARD_GAP = 35; // Gap between background cards (must match CSS gap)
let currentDragTintDirection = null; // null | 'left' | 'right'
let pickerJustDragged = false;       // suppresses zoom click after a drag release
let _pickerBgScrollRaf = null;

// When background cards live inside the fixed star backdrop, keep their Y position
// aligned with the picker card container so they scroll with the page content.
const syncBackgroundCardsToContainer = () => {
  const cardsArray = document.querySelector('.picker-background-cards-unified');
  if (!cardsArray || !pickerCardContainer) return;
  if (cardsArray.parentElement !== window._backdropContainer) return;
  const rect = pickerCardContainer.getBoundingClientRect();
  cardsArray.style.top = `${rect.top + rect.height / 2}px`;
};

const onPickerScrollOrResize = () => {
  if (_pickerBgScrollRaf !== null) return;
  _pickerBgScrollRaf = requestAnimationFrame(() => {
    _pickerBgScrollRaf = null;
    syncBackgroundCardsToContainer();
  });
};

/**
 * Create background card array (single array, colors set dynamically based on position)
 */
const createBackgroundCards = () => {
  // Remove existing background cards and mobile edge gradients if any
  document.querySelectorAll('.picker-background-cards-unified').forEach(el => el.remove());
  document.querySelectorAll('.picker-edge-gradient-left, .picker-edge-gradient-right').forEach(el => el.remove());
  // Remove stale scroll/resize listeners from a previous call (e.g. on shuffle)
  window.removeEventListener('scroll', onPickerScrollOrResize);
  window.removeEventListener('resize', onPickerScrollOrResize);

  // Mobile-only full-height edge gradient strips (behind all picker cards)
  const leftEdge = document.createElement('div');
  leftEdge.className = 'picker-edge-gradient-left';
  pickerCardContainer.appendChild(leftEdge);
  const rightEdge = document.createElement('div');
  rightEdge.className = 'picker-edge-gradient-right';
  pickerCardContainer.appendChild(rightEdge);

  // Create unified cards array - create enough for seamless infinite scroll
  const cardsArray = document.createElement('div');
  cardsArray.className = 'picker-background-cards-unified';

  // Create 40 cards (enough for seamless looping in both directions)
  for (let i = 0; i < 40; i++) {
    const card = document.createElement('div');
    card.className = 'picker-background-card';

    const undoBtn = document.createElement('button');
    undoBtn.className = 'picker-bg-card-undo';
    undoBtn.title = 'Вернуть';
    undoBtn.innerHTML = '<svg width="22" height="22"><use href="#arrow-uturn"></use></svg>';
    undoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      undoLastSwipe();
    });
    card.appendChild(undoBtn);

    cardsArray.appendChild(card);
  }

  // On desktop (where stars exist), place background cards inside the star backdrop
  // at z-index 5 so they sit between mid stars (z=4) and the front star layer (z=6).
  // Scroll-sync keeps their Y position aligned with the picker card container so
  // they move with the page content even though the backdrop is position:fixed.
  if (window._backdropContainer && window.innerWidth >= 1025) {
    cardsArray.style.zIndex = '5';
    window._backdropContainer.appendChild(cardsArray);
    syncBackgroundCardsToContainer();
    window.addEventListener('scroll', onPickerScrollOrResize, { passive: true });
    window.addEventListener('resize', onPickerScrollOrResize, { passive: true });
  } else {
    pickerCardContainer.appendChild(cardsArray);
  }

  // Reset scroll offset
  backgroundScrollOffset = 0;

  // Update card colors based on position
  updateBackgroundCardColors();
};

/**
 * Update background card colors (and images) based on their visual position.
 *
 * Grey by default; full gradient + full opacity when a swipe image is assigned.
 * Drag-direction tinting is handled separately by applyDragTintToBackgroundCards.
 *
 * Image assignment logic:
 *   Left cards  (visualIndex < 20): most-recently-discarded closest to center.
 *     imgIdx = discardedImageUrls.length - 20 + visualIndex
 *   Right cards (visualIndex >= 20): most-recently-liked closest to center.
 *     imgIdx = likedImageUrls.length + 19 - visualIndex
 *   Negative imgIdx → no history yet → grey fallback.
 */
const updateBackgroundCardColors = () => {
  currentDragTintDirection = null;

  const cardsArray = document.querySelector('.picker-background-cards-unified');
  if (!cardsArray) return;

  const cards = cardsArray.querySelectorAll('.picker-background-card');
  const centerIndex = 20;

  cards.forEach((card, index) => {
    const visualIndex = index - backgroundScrollOffset;

    if (visualIndex < centerIndex) {
      // Left (discarded) side
      const imgIdx = discardedImageUrls.length - 20 + visualIndex;
      const imgUrl = imgIdx >= 0 ? discardedImageUrls[imgIdx] : null;
      if (imgUrl) {
        card.dataset.hasImage = 'true';
        card.classList.add('has-image');
        // Muted dark-red tint + black darkening overlay; card is blurred
        card.style.background = `linear-gradient(135deg, rgba(80,20,30,0.72), rgba(35,8,14,0.82)), url("${imgUrl}") center / cover no-repeat`;
        card.style.boxShadow = '0 2px 10px rgba(80, 20, 30, 0.35)';
        card.style.opacity = '1';
        card.style.filter = 'blur(3px)';
      } else {
        card.dataset.hasImage = 'false';
        card.classList.remove('has-image');
        card.style.background = '';
        card.style.boxShadow = '';
        card.style.opacity = '';
        card.style.filter = '';
      }
    } else {
      // Right (liked) side
      const imgIdx = likedImageUrls.length + 19 - visualIndex;
      const imgUrl = imgIdx >= 0 ? likedImageUrls[imgIdx] : null;
      if (imgUrl) {
        card.dataset.hasImage = 'true';
        card.classList.add('has-image');
        // Muted dark-green tint + black darkening overlay; card is blurred
        card.style.background = `linear-gradient(135deg, rgba(15,70,40,0.72), rgba(5,28,16,0.82)), url("${imgUrl}") center / cover no-repeat`;
        card.style.boxShadow = '0 2px 10px rgba(15, 70, 40, 0.35)';
        card.style.opacity = '1';
        card.style.filter = 'blur(3px)';
      } else {
        card.dataset.hasImage = 'false';
        card.classList.remove('has-image');
        card.style.background = '';
        card.style.boxShadow = '';
        card.style.opacity = '';
        card.style.filter = '';
      }
    }
  });
};

/**
 * Apply color tint to grey background cards based on drag direction.
 * Cards with images are not affected; only grey (no-image) cards get tinted.
 */
const applyDragTintToBackgroundCards = (direction) => {
  if (currentDragTintDirection === direction) return;
  currentDragTintDirection = direction;

  const cardsArray = document.querySelector('.picker-background-cards-unified');
  if (!cardsArray) return;

  const cards = cardsArray.querySelectorAll('.picker-background-card');
  const centerIndex = 20;

  cards.forEach((card, index) => {
    if (card.dataset.hasImage === 'true') return;

    const visualIndex = index - backgroundScrollOffset;
    const isLeftSide = visualIndex < centerIndex;

    if (direction === 'left' && isLeftSide) {
      card.style.background = 'linear-gradient(135deg, rgba(110,30,42,0.55), rgba(65,14,22,0.45))';
    } else if (direction === 'right' && !isLeftSide) {
      card.style.background = 'linear-gradient(135deg, rgba(22,95,55,0.55), rgba(10,52,28,0.45))';
    } else {
      card.style.background = '';
    }
  });
};

/**
 * Animate background cards based on drag distance — applies directional color tint.
 */
const animateBackgroundCards = (distance) => {
  if (distance < -30) {
    applyDragTintToBackgroundCards('left');
  } else if (distance > 30) {
    applyDragTintToBackgroundCards('right');
  } else {
    applyDragTintToBackgroundCards(null);
  }
};

/**
 * Advance background cards after successful swipe (infinite scroll effect)
 */
const advanceBackgroundCards = (direction) => {
  const cardsArray = document.querySelector('.picker-background-cards-unified');
  if (!cardsArray) return;

  if (direction === 'left') {
    // Swipe left - move array to the LEFT by one card
    backgroundScrollOffset++;
  } else if (direction === 'right') {
    // Swipe right - move array to the RIGHT by one card
    backgroundScrollOffset--;
  }

  // Loop back after moving too far in either direction (with 40 cards, we can go ±20)
  if (backgroundScrollOffset >= 20) {
    backgroundScrollOffset = backgroundScrollOffset - 20;
  } else if (backgroundScrollOffset <= -20) {
    backgroundScrollOffset = backgroundScrollOffset + 20;
  }

  resetBackgroundCards();
  updateBackgroundCardColors();
};

/**
 * Reset background cards to current scroll position.
 * Reads the actual rendered card width each time so the step is always correct
 * regardless of viewport size or CSS changes.
 */
const resetBackgroundCards = () => {
  const cardsArray = document.querySelector('.picker-background-cards-unified');
  if (!cardsArray) return;

  const firstCard = cardsArray.querySelector('.picker-background-card');
  const cardWidth = firstCard ? firstCard.offsetWidth : 150;
  const offset = -backgroundScrollOffset * (cardWidth + CARD_GAP);
  cardsArray.style.transform = `translate(calc(-50% + ${offset}px), -50%)`;
};

// ============================================================
// SWIPE GESTURE HANDLERS
// ============================================================

const handlePickerDragStart = (clientX) => {
  // Cancel any pending drag-move frame from a previous gesture
  if (_pickerRafId !== null) {
    cancelAnimationFrame(_pickerRafId);
    _pickerRafId = null;
  }
  pickerIsDragging = true;
  pickerDragStartX = clientX;
  pickerDragCurrentX = clientX;
  const pickerCard = document.getElementById('picker-card');
  if (pickerCard) {
    pickerCard.classList.remove('undo-left', 'undo-right', 'swipe-left', 'swipe-right');
    pickerCard.style.transform = '';
    pickerCard.classList.add('swiping');
  }
};

const handlePickerDragMove = (clientX) => {
  if (!pickerIsDragging) return;

  // Always record the latest position so rAF uses the freshest value
  pickerDragCurrentX = clientX;

  // Skip scheduling a new frame if one is already queued.
  // This coalesces burst touch events (e.g. after app switch) into one paint.
  if (_pickerRafId !== null) return;

  _pickerRafId = requestAnimationFrame(() => {
    _pickerRafId = null;
    if (!pickerIsDragging) return;

    const diff = pickerDragCurrentX - pickerDragStartX;
    const rotation = diff / 20;
    const pickerCard = document.getElementById('picker-card');

    if (pickerCard) {
      pickerCard.style.transform = `translateX(${diff}px) rotate(${rotation}deg) scale(1)`;
      animateBackgroundCards(diff);

      if (diff < -30) {
        pickerCard.classList.add('show-left');
        pickerCard.classList.remove('show-right');
        pickerCardContainer.classList.add('swiping-left');
        pickerCardContainer.classList.remove('swiping-right');
      } else if (diff > 30) {
        pickerCard.classList.add('show-right');
        pickerCard.classList.remove('show-left');
        pickerCardContainer.classList.add('swiping-right');
        pickerCardContainer.classList.remove('swiping-left');
      } else {
        pickerCard.classList.remove('show-left', 'show-right');
        pickerCardContainer.classList.remove('swiping-left', 'swiping-right');
      }
    }
  });
};

const handlePickerDragEnd = () => {
  if (!pickerIsDragging) return;

  // Flush any pending frame before processing the end state
  if (_pickerRafId !== null) {
    cancelAnimationFrame(_pickerRafId);
    _pickerRafId = null;
  }

  pickerIsDragging = false;
  document.removeEventListener('touchmove', _pickerScrollGuard);
  const pickerCard = document.getElementById('picker-card');
  if (pickerCard) pickerCard.classList.remove('swiping');

  const diff = pickerDragCurrentX - pickerDragStartX;

  // Suppress the img click that fires after mouseup when dragging on desktop
  if (Math.abs(diff) > 5) pickerJustDragged = true;

  if (Math.abs(diff) > 100) {
    handlePickerSwipe(diff < 0 ? 'left' : 'right');
  } else {
    if (pickerCard) {
      // Reset with scale(1) to maintain card size
      pickerCard.style.transform = 'translateX(0) rotate(0deg) scale(1)';
      pickerCard.classList.remove('show-left', 'show-right');
    }
    pickerCardContainer.classList.remove('swiping-left', 'swiping-right');
    // Reset background cards if swipe wasn't completed
    resetBackgroundCards();
    updateBackgroundCardColors();
  }
};

// ============================================================
// SWIPE ACTIONS
// ============================================================

/**
 * Handle card swipe (left = skip, right = like/favorite)
 */
const handlePickerSwipe = (direction) => {
  if (pickerCurrentIndex >= pickerProducts.length) return;

  const product = pickerProducts[pickerCurrentIndex];
  const pickerCard = document.getElementById('picker-card');

  // Add to favorites if swiping right
  if (direction === 'right') {
    if (!favorites.has(product.id)) {
      toggleFavoriteSynced(product.id);
    }
  }

  // Record action in history (with image URL for background card display)
  pickerHistory.push({
    index: pickerCurrentIndex,
    action: direction,
    productId: product.id
  });
  const swipedImageUrl = getProductImageUrl(product);
  if (direction === 'left') {
    discardedImageUrls.push(swipedImageUrl);
  } else {
    likedImageUrls.push(swipedImageUrl);
  }

  // Add swipe animation class
  pickerCard.classList.add(direction === 'left' ? 'swipe-left' : 'swipe-right');
  pickerCardContainer.classList.remove('swiping-left', 'swiping-right');

  // Show indicator animation
  const indicators = pickerCardContainer.querySelector('.picker-swipe-indicators-overlay');
  if (indicators) {
    const indicator = indicators.querySelector(direction === 'left' ? '.picker-swipe-indicator.left' : '.picker-swipe-indicator.right');
    if (indicator) {
      indicator.classList.add('show');
    }
  }

  // Advance background cards with infinite scroll effect
  advanceBackgroundCards(direction);

  // Load next card after animation
  setTimeout(() => {
    pickerCurrentIndex++;
    loadNextPickerCard();

    // Sync to server if logged in
    if (typeof syncDataToServer === 'function') {
      setTimeout(() => {
        syncDataToServer('picker');
      }, 100);
    }
  }, 300);
};

/**
 * Undo last swipe action
 */
const undoLastSwipe = () => {
  if (pickerHistory.length === 0) return;

  const lastAction = pickerHistory.pop();

  // Remove from favorites if we added it
  if (lastAction.action === 'right') {
    if (favorites.has(lastAction.productId)) {
      toggleFavoriteSynced(lastAction.productId);
    }
  }

  // Remove image from the appropriate tracking array
  if (lastAction.action === 'left') {
    discardedImageUrls.pop();
  } else {
    likedImageUrls.pop();
  }

  // Reverse background card scroll
  if (lastAction.action === 'left') {
    backgroundScrollOffset--; // Reverse left swipe
  } else if (lastAction.action === 'right') {
    backgroundScrollOffset++; // Reverse right swipe
  }

  // Loop back if needed (with 40 cards, we can go ±20)
  if (backgroundScrollOffset >= 20) {
    backgroundScrollOffset = backgroundScrollOffset - 20;
  } else if (backgroundScrollOffset <= -20) {
    backgroundScrollOffset = backgroundScrollOffset + 20;
  }

  resetBackgroundCards();
  updateBackgroundCardColors();

  // Reset drag state
  pickerIsDragging = false;
  pickerDragStartX = 0;
  pickerDragCurrentX = 0;

  // Go back to previous card
  pickerCurrentIndex = lastAction.index;
  loadNextPickerCard();

  // Animate undo
  setTimeout(() => {
    const pickerCard = document.getElementById('picker-card');
    if (pickerCard) {
      pickerCard.style.transform = '';
      pickerCard.classList.remove('show-left', 'show-right', 'swiping', 'swipe-left', 'swipe-right', 'undo-left', 'undo-right');

      const undoClass = lastAction.action === 'left' ? 'undo-left' : 'undo-right';
      pickerCard.classList.add(undoClass);

      setTimeout(() => {
        if (pickerCard) {
          pickerCard.classList.remove('undo-left', 'undo-right');
        }
      }, 400);
    }
  }, 10);

  // Sync to server if logged in
  if (typeof syncDataToServer === 'function') {
    syncDataToServer('picker');
  }
};

// ============================================================
// EVENT LISTENERS
// ============================================================

/**
 * Set up event listeners for picker controls
 * Must be called after queryPickerElements()
 */
const setupPickerEventListeners = () => {
  // Dislike button - swipe left
  if (pickerDislikeBtn) {
    pickerDislikeBtn.addEventListener('click', () => {
      handlePickerSwipe('left');
    });
  }

  // Like button - swipe right
  if (pickerLikeBtn) {
    pickerLikeBtn.addEventListener('click', () => {
      handlePickerSwipe('right');
    });
  }

  // Undo button
  if (pickerUndoBtn) {
    pickerUndoBtn.addEventListener('click', () => {
      undoLastSwipe();
    });
  }
};

// ============================================================
// INITIALIZATION
// ============================================================

/**
 * Quick check if picker session exists in localStorage (no product loading)
 * @returns {boolean} True if a potentially valid session exists
 */
function hasPickerSessionStored() {
  try {
    const saved = localStorage.getItem('tribuePickerState');
    if (!saved) return false;
    const state = JSON.parse(saved);
    return state.products && state.products.length > 0 && state.index < state.products.length;
  } catch (e) {
    return false;
  }
}

/**
 * Initialize picker page
 */
async function initPickerPage() {

  // Query DOM elements (required for SPA navigation)
  queryPickerElements();

  // Set up event listeners
  setupPickerEventListeners();

  // Initialize FAQ popup and add standard button to title row
  initFAQPopup('picker');
  addFAQButton('.picker-product-title-row');

  // Load FAQ info boxes
  renderFaqInfoBoxes('picker', document.getElementById('picker-faq-info-boxes'));

  // Show game screen with skeleton immediately
  pickerGameScreen.style.display = 'flex';
  showSkeletonLoaders(pickerCardContainer, 'picker', 1);

  // Wait for utils.js to finish loading images
  if (window.utilsReady) {
    await window.utilsReady;
  }

  // Load all products
  allProducts = await loadAllProducts();

  if (allProducts.length === 0) {
    console.error('Failed to load products');
    pickerCardContainer.innerHTML = '';
    return;
  }

  // Calculate total eligible products (фирменный, available, not triptych, not id 1, not in favorites)
  const eligible = allProducts.filter(p =>
    p.type === 'фирменный' && p.status === 'available' && !p.triptych && p.id !== 1 && !favorites.has(p.id)
  );
  totalEligibleProducts = eligible.length;

  // Try to load existing session (validates products still exist)
  const hasSession = loadPickerSession();
  const sessionValid = hasSession && pickerProducts.length > 0 && pickerCurrentIndex < pickerProducts.length;

  if (sessionValid) {
    // Resume existing session
    createBackgroundCards();
    loadNextPickerCard();
  } else {
    // No valid session - start fresh automatically
    pickerCardContainer.innerHTML = '';
    if (hasSession) {
      localStorage.removeItem('tribuePickerState');
    }
    await shufflePickerProducts();
    createBackgroundCards();
  }
}

// Page-level state for cleanup
let isPickerPageInitialized = false;

/**
 * Cleanup picker page (called when navigating away via SPA router)
 */
function cleanupPickerPage() {
  isPickerPageInitialized = false;

  window.removeEventListener('scroll', onPickerScrollOrResize);
  window.removeEventListener('resize', onPickerScrollOrResize);
  if (_pickerBgScrollRaf !== null) {
    cancelAnimationFrame(_pickerBgScrollRaf);
    _pickerBgScrollRaf = null;
  }

  // Background cards may live in _backdropContainer (outside the page DOM),
  // so they must be explicitly removed on navigation.
  document.querySelectorAll(
    '.picker-background-cards-unified, .picker-edge-gradient-left, .picker-edge-gradient-right'
  ).forEach(el => el.remove());
}

// Wrap initPickerPage with initialization guard
const originalInitPickerPage = initPickerPage;
initPickerPage = async function() {
  if (isPickerPageInitialized) {
    return;
  }
  isPickerPageInitialized = true;
  return originalInitPickerPage();
};

// Register with SPA router
if (typeof window.registerPage === 'function') {
  window.registerPage('/picker', {
    init: initPickerPage,
    cleanup: cleanupPickerPage
  });
}

// Auto-initialize when script loads (for direct page visits only)
const isPickerPagePath = window.location.pathname === '/picker' || window.location.pathname === '/picker.html';
if (isPickerPagePath) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPickerPage);
  } else {
    initPickerPage();
  }
}
