/**
 * Customers Page JavaScript
 * Handles galleries, reviews, comments, and suggestions functionality
 */

// Import auth functions
import { isLoggedIn, getCurrentUser, init as initAuth } from '../core/auth.js';
import { initFAQPopup, addFAQButton } from '../modules/faq-popup.js';
import { showSkeletonLoaders, hideSkeletonLoaders } from '../modules/skeleton-loader.js';
import { escapeHtml, isVkCdnUrl, proxyVkCdnUrl, addImageSize } from '../core/formatters.js';
import { SMALL_MOBILE_BREAKPOINT } from '../core/constants.js';
import { confirmDanger } from '../modules/mobile-modal.js';
import { initEmojiSuggestions } from '../modules/emoji-suggestions.js';
import { showImageUploadModal } from '../modules/image-upload-modal.js';
import { createPageFilters } from '../modules/page-filters.js';
import { getPendingImageForContext, removePendingImagesForContext } from '../modules/image-upload.js';
import { renderReviewsPopup, initReviews, invalidateReviewsCache } from './customers/reviews.js';
import { renderCommentsPopup, displayCommentsInPopup, submitComment, initComments, getCachedComments, invalidateCommentsCache } from './customers/comments.js';
import { renderSuggestionsPopup, displaySuggestionsInPopup, submitSuggestion, getCachedSuggestions, invalidateSuggestionsCache } from './customers/suggestions.js';

// Global variables (will be populated from API)
let allProducts = [];
let allImagesByProduct = new Map();
let allAdditionalImagesByProduct = new Map();

// Gallery state
let galleryAutoPlayIntervals = [];
let galleryZoomCurrentImages = [];
let galleryZoomCurrentIndex = 0;
let galleryZoomOverlay = null;

// Masonry filter state
let allMasonryImages = [];
let currentMasonryFilter = 'all';
let masonryPageFilters = null;

// Utility functions - use global modules for consistent styling
const showToast = (message, type = 'success', duration = 3000, allowHTML = false) => {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type, duration, allowHTML);
  }
};

const VK_CDN_WIDTHS = [240, 360, 480, 540, 640, 720, 1080];
const pickMasonrySize = (renderedPx) => {
  const target = Math.ceil(renderedPx * (window.devicePixelRatio || 1));
  const w = VK_CDN_WIDTHS.find(w => w >= target) || VK_CDN_WIDTHS[VK_CDN_WIDTHS.length - 1];
  return `${w}x0`;
};

const filterImagesByExtra = (images, extras) => {
  if (!Array.isArray(images)) return [];
  return images.filter(img => {
    const extra = typeof img === 'string' ? null : img.extra;
    return extras.includes(extra);
  });
};

// ==================== DATA LOADING ====================

/**
 * Load all products from API
 */
const loadProducts = async () => {
  try {
    const response = await fetch('/api/products');
    const data = await response.json();
    allProducts = Array.isArray(data) ? data : (data.products || []);
  } catch (err) {
    console.error('Error loading products:', err);
  }
};

/**
 * Load all product images
 */
const loadProductImages = async () => {
  try {
    const response = await fetch('/api/all-images');
    const images = await response.json();

    if (Array.isArray(images)) {
      allImagesByProduct.clear();
      images.forEach(img => {
        if (!allImagesByProduct.has(img.product_id)) {
          allImagesByProduct.set(img.product_id, []);
        }
        allImagesByProduct.get(img.product_id).push(img);
      });
    }
  } catch (err) {
    console.error('Error loading images:', err);
  }
};

/**
 * Load additional product images (for galleries)
 */
const loadAdditionalImages = async () => {
  try {
    const response = await fetch('/api/all-images-2');
    const images = await response.json();

    if (Array.isArray(images)) {
      allAdditionalImagesByProduct.clear();
      images.forEach(img => {
        if (!allAdditionalImagesByProduct.has(img.product_id)) {
          allAdditionalImagesByProduct.set(img.product_id, []);
        }
        allAdditionalImagesByProduct.get(img.product_id).push(img);
      });
    }
  } catch (err) {
    console.error('Error loading additional images:', err);
  }
};

// ==================== TABS FUNCTIONALITY ====================

/**
 * Initialize modern collapsible tabs for customers page
 */
const initializeCustomersTabs = () => {
  const collapsibleTabs = document.querySelectorAll('.tab');

  collapsibleTabs.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;
      const targetContent = document.getElementById(`${tabName}-tab-content`);

      if (targetContent) {
        if (btn.classList.contains('active')) {
          return;
        }

        const parentTabGroup = btn.closest('.tabs-container');
        const siblingTabs = parentTabGroup ? parentTabGroup.querySelectorAll('.tab') : [btn];
        const siblingContents = document.querySelectorAll('#reviews-tab-content, #comments-tab-content, #suggestions-tab-content');

        siblingTabs.forEach(t => t.classList.remove('active'));
        siblingContents.forEach(c => c.classList.remove('active'));

        btn.classList.add('active');
        targetContent.classList.add('active');

        // Update corner rounding: square top-left/right when first/last tab is active
        const wrapper = parentTabGroup.closest('.tabs-wrapper');
        if (wrapper) {
          wrapper.classList.toggle('first-tab-active', btn === siblingTabs[0]);
          wrapper.classList.toggle('last-tab-active', btn === siblingTabs[siblingTabs.length - 1]);
        }

        if (tabName === 'comments' && !targetContent.dataset.loaded) {
          renderCommentsPopup();
          targetContent.dataset.loaded = 'true';
        } else if (tabName === 'reviews' && !targetContent.dataset.loaded) {
          renderReviewsPopup();
          targetContent.dataset.loaded = 'true';
        } else if (tabName === 'suggestions' && !targetContent.dataset.loaded) {
          renderSuggestionsPopup();
          targetContent.dataset.loaded = 'true';
        }
      }
    });
  });
};

// ==================== GALLERY FUNCTIONALITY ====================

/**
 * Load process carousel: all "процесс" images from all products
 */
const loadProcessCarousel = async () => {
  try {
    const section = document.getElementById('customers-process-section');
    const track = document.getElementById('customers-process-track');
    const indicators = document.getElementById('customers-process-indicators');
    const prevBtn = document.getElementById('customers-process-prev');
    const nextBtn = document.getElementById('customers-process-next');

    if (!section || !track || !indicators) return;

    const images = [];
    for (const product of allProducts) {
      const productImages = allAdditionalImagesByProduct.get(product.id) || [];
      productImages.forEach(img => {
        const extra = typeof img === 'string' ? null : img.extra;
        if (extra === 'процесс') {
          const url = typeof img === 'string' ? img : img.url;
          images.push({ url: addImageSize(url, '1500x0'), product });
        }
      });
    }

    if (images.length === 0) {
      section.style.display = 'none';
      return;
    }

    section.style.display = 'block';
    track.innerHTML = '';
    indicators.innerHTML = '';
    track.scrollLeft = 0;

    images.forEach((item, index) => {
      const slide = document.createElement('div');
      slide.className = 'gallery-carousel-slide';
      if (item.product.title) slide.dataset.tooltip = 'Процесс создания постера ' + item.product.title;

      const imgEl = document.createElement('img');
      imgEl.src = item.url;
      imgEl.alt = item.product.title || '';
      imgEl.loading = index === 0 ? 'eager' : 'lazy';

      imgEl.onerror = function () {
        const src = this.src;
        if (isVkCdnUrl(src) && !src.includes('/api/img')) {
          this.src = proxyVkCdnUrl(src);
          this.addEventListener('error', () => { this.style.display = 'none'; }, { once: true });
        } else {
          this.style.display = 'none';
        }
      };

      slide.appendChild(imgEl);
      slide.addEventListener('click', () => {
        if (typeof window.openZoom === 'function') {
          const urls = images.map(i => i.url);
          const products = images.map(i => i.product);
          window.openZoom(urls, index, products);
        }
      });
      track.appendChild(slide);

    });

    setupGalleryCarousel(section, track, prevBtn, nextBtn, indicators);
    setupGifAutoAdvance(track, images);
  } catch (err) {
    console.error('Error loading process carousel:', err);
  }
};

/**
 * Render masonry grid with the given images array.
 * Called on initial load and on filter change.
 */
function renderMasonryGrid(images, grid) {
  grid.innerHTML = '';

  if (images.length === 0) return;

  const allHighRes = images.map(i => i.highRes);
  const allProductsZoom = images.map(i => i.product);
  const allDeprecated = images.map(i => i.deprecated);

  const SKELETON_RATIOS = [0.6, 0.67, 0.75, 0.8, 0.9, 1.0, 1.25];

  const imgRefs = [];
  images.forEach((item, index) => {
    const el = document.createElement('div');
    el.className = 'customers-masonry-item';
    el.style.setProperty('--skeleton-ratio', SKELETON_RATIOS[Math.floor(Math.random() * SKELETON_RATIOS.length)]);

    if (item.extra === 'рендеры') el.dataset.tooltip = '3D-рендер в интерьере';
    else if (item.extra === 'фото') el.dataset.tooltip = 'Фото покупателя';

    const imgEl = document.createElement('img');
    imgEl.alt = item.product.title || '';
    imgEl.onerror = function () {
      const src = this.src;
      if (isVkCdnUrl(src) && !src.includes('/api/img')) {
        this.src = proxyVkCdnUrl(src);
        this.addEventListener('error', () => { el.style.display = 'none'; }, { once: true });
      } else {
        el.style.display = 'none';
      }
    };

    imgRefs.push({ imgEl, url: item.url });
    el.appendChild(imgEl);

    if (item.deprecated) {
      const tag = document.createElement('div');
      tag.className = 'masonry-deprecated-tag';
      tag.textContent = 'Устаревший вариант';
      tag.dataset.tooltip = 'Устаревшие варианты так же доступны к заказу';
      el.appendChild(tag);
    }

    el.addEventListener('click', () => {
      if (typeof window.openZoom === 'function') {
        window.openZoom(allHighRes, index, allProductsZoom, { showIndicators: false, deprecated: allDeprecated });
      }
    });
    grid.appendChild(el);
  });

  // "Больше постеров" card (only when showing all images)
  if (currentMasonryFilter === 'all') {
    const morePhotosEl = document.createElement('div');
    morePhotosEl.className = 'customers-masonry-item masonry-more-button';
    morePhotosEl.style.display = 'flex';
    morePhotosEl.style.flexDirection = 'column';
    morePhotosEl.style.alignItems = 'center';
    morePhotosEl.style.justifyContent = 'center';
    morePhotosEl.style.gap = '10px';
    morePhotosEl.style.cursor = 'pointer';
    morePhotosEl.style.backgroundColor = 'var(--bg-secondary)';
    morePhotosEl.style.borderRadius = '6px';
    morePhotosEl.style.transition = 'background-color 0.2s ease';
    morePhotosEl.innerHTML = `
      <span class="masonry-more-icon"><svg width="24" height="24"><use href="#socials-vk"></use></svg></span>
      <span class="masonry-more-title">Больше постеров</span>
      <span class="masonry-more-subtitle">в нашем сообществе ВКонтакте</span>`;
    morePhotosEl.addEventListener('click', () => {
      window.open('https://vk.com/buy_tribute', '_blank');
    });
    morePhotosEl.addEventListener('mouseenter', () => {
      morePhotosEl.style.backgroundColor = 'var(--bg-tertiary)';
    });
    morePhotosEl.addEventListener('mouseleave', () => {
      morePhotosEl.style.backgroundColor = 'var(--bg-secondary)';
    });
    grid.appendChild(morePhotosEl);
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const firstItem = grid.firstElementChild;
      const colWidth = firstItem ? firstItem.offsetWidth : 300;
      const size = pickMasonrySize(colWidth);
      const C = parseInt(getComputedStyle(grid).columnCount) || 2;
      const itemsPerCol = Math.ceil(imgRefs.length / C);

      // Build Z-order batches: each batch = one visual row across all columns.
      // CSS column-count places DOM index j at col=floor(j/itemsPerCol), row=j%itemsPerCol,
      // so visual row r covers DOM indices: r, itemsPerCol+r, 2*itemsPerCol+r, ...
      const batches = [];
      for (let row = 0; row < itemsPerCol; row++) {
        const batch = [];
        for (let col = 0; col < C; col++) {
          const domIdx = col * itemsPerCol + row;
          if (domIdx < imgRefs.length) {
            const { imgEl, url } = imgRefs[domIdx];
            batch.push({ imgEl, src: addImageSize(url, size) });
          }
        }
        if (batch.length > 0) batches.push(batch);
      }

      // Preload each visual row fully, then reveal all items in that row at once.
      batches.forEach(batch => {
        Promise.all(batch.map(({ src }) => new Promise(resolve => {
          const img = new Image();
          img.onload = resolve;
          img.onerror = resolve;
          img.src = src;
        }))).then(() => {
          batch.forEach(({ imgEl, src }) => {
            imgEl.src = src;
            imgEl.classList.add('loaded');
            if (imgEl.parentElement) imgEl.parentElement.classList.add('loaded');
          });
        });
      });
    });
  });
}

/**
 * Initialize masonry filter buttons for the customers page using page-filters module.
 */
function initCustomersMasonryFilters(grid) {
  const wrapper = document.getElementById('customers-masonry-filters-wrapper');
  if (!wrapper) return;

  // Build extra buttons based on available image types
  const hasPhotos = allMasonryImages.some(item => item.extra === 'фото');
  const hasRenders = allMasonryImages.some(item => item.extra === 'рендеры');
  const buttons = [];
  if (hasPhotos) buttons.push({ label: 'Фото', value: 'фото' });
  if (hasRenders) buttons.push({ label: 'Рендеры', value: 'рендеры' });

  if (masonryPageFilters) {
    masonryPageFilters.destroy();
    masonryPageFilters = null;
  }

  masonryPageFilters = createPageFilters(wrapper, {
    pageId: 'customers-masonry',
    features: { collapse: true },
    extraGroups: buttons.length > 0 ? [{
      key: 'imageType',
      groupClass: 'extras-group',
      buttonClass: 'extra-filter-button',
      buttons
    }] : [],
    onFilter: (filterState) => {
      currentMasonryFilter = filterState.imageType || 'all';
      const filtered = currentMasonryFilter === 'all'
        ? allMasonryImages
        : allMasonryImages.filter(item => item.extra === currentMasonryFilter);
      renderMasonryGrid(filtered, grid);
    }
  });
}

/**
 * Load masonry gallery: all additional images except "процесс", randomized
 */
const loadMasonryGallery = async () => {
  try {
    const section = document.getElementById('customers-masonry-section');
    const grid = document.getElementById('customers-masonry-grid');

    if (!section || !grid) return;

    const images = [];
    for (const product of allProducts) {
      // Exclude product id=1 (custom poster) — its images are user uploads, not gallery content
      if (product.id === 1) continue;
      const productImages = allAdditionalImagesByProduct.get(product.id) || [];
      productImages.forEach(img => {
        const extra = typeof img === 'string' ? null : img.extra;
        if (extra !== 'процесс') {
          const url = typeof img === 'string' ? img : img.url;
          const deprecated = typeof img === 'string' ? false : (img.deprecated || false);
          images.push({ url, highRes: addImageSize(url, '1500x0'), product, extra, deprecated });
        }
      });
    }

    if (images.length === 0) {
      section.style.display = 'none';
      return;
    }

    // Shuffle randomly once; filtering preserves this order
    for (let i = images.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [images[i], images[j]] = [images[j], images[i]];
    }

    allMasonryImages = images;
    currentMasonryFilter = 'all';

    section.style.display = 'block';
    window.dispatchEvent(new CustomEvent('spa:stickyfilterready'));

    initCustomersMasonryFilters(grid);
    renderMasonryGrid(allMasonryImages, grid);
  } catch (err) {
    console.error('Error loading masonry gallery:', err);
  }
};


/**
 * Parse an animated GIF's binary to get total one-loop duration in ms.
 * Returns null for static GIFs, non-GIF files, or on fetch error.
 */
const getGifDurationMs = async (url) => {
  try {
    const resp = await fetch(url, { cache: 'force-cache' });
    const bytes = new Uint8Array(await resp.arrayBuffer());
    // Check GIF signature
    if (bytes[0] !== 0x47 || bytes[1] !== 0x49 || bytes[2] !== 0x46) return null;
    let i = 6;
    // Skip Logical Screen Descriptor + optional Global Color Table
    const lsdFlags = bytes[10];
    i += 7 + (lsdFlags & 0x80 ? 3 * (2 << (lsdFlags & 0x07)) : 0);
    let totalCs = 0; // centiseconds
    while (i < bytes.length) {
      const b = bytes[i];
      if (b === 0x3B) break; // GIF trailer
      if (b === 0x21 && bytes[i + 1] === 0xF9) {
        // Graphic Control Extension: delay is at bytes i+4 (lo) and i+5 (hi)
        totalCs += bytes[i + 4] | (bytes[i + 5] << 8);
        i += 8;
      } else if (b === 0x21) {
        // Other extension — skip sub-blocks
        i += 2;
        while (i < bytes.length && bytes[i]) i += bytes[i] + 1;
        i++;
      } else if (b === 0x2C) {
        // Image Descriptor — skip descriptor, optional LCT, LZW byte, and sub-blocks
        i += 10;
        const imgFlags = bytes[i - 1];
        i += (imgFlags & 0x80 ? 3 * (2 << (imgFlags & 0x07)) : 0) + 1;
        while (i < bytes.length && bytes[i]) i += bytes[i] + 1;
        i++;
      } else {
        i++;
      }
    }
    return totalCs > 0 ? totalCs * 10 : null; // centiseconds → ms
  } catch {
    return null;
  }
};

/**
 * Setup gallery carousel controls
 */
const setupGalleryCarousel = (wrapper, track, prevBtn, nextBtn, indicators) => {
  if (!track || !prevBtn || !nextBtn) return;

  track.scrollLeft = 0;

  setTimeout(() => {
    updateCarouselArrows(track, prevBtn, nextBtn);
  }, 100);

  track.addEventListener('scroll', () => {
    updateCarouselArrows(track, prevBtn, nextBtn);

    const slideWidth = track.scrollWidth / (track.children.length || 1);
    const currentIndex = Math.round(track.scrollLeft / slideWidth);

    indicators.querySelectorAll('.gallery-carousel-indicator').forEach((ind, idx) => {
      ind.classList.toggle('active', idx === currentIndex);
    });
  }, { passive: true });

  prevBtn.addEventListener('click', () => {
    const slideWidth = track.scrollWidth / track.children.length;
    track.scrollBy({ left: -slideWidth, behavior: 'smooth' });
  });

  nextBtn.addEventListener('click', () => {
    const slideWidth = track.scrollWidth / track.children.length;
    track.scrollBy({ left: slideWidth, behavior: 'smooth' });
  });
};

const updateCarouselArrows = (track, prevBtn, nextBtn) => {
  if (!track || !prevBtn || !nextBtn) return;

  const isAtStart = track.scrollLeft <= 1;
  const isAtEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 1;

  prevBtn.classList.toggle('hidden', isAtStart);
  nextBtn.classList.toggle('hidden', isAtEnd);
};

const updateCarouselScroll = (track, index, totalCount) => {
  const slideWidth = track.scrollWidth / totalCount;
  track.scrollTo({ left: slideWidth * index, behavior: 'smooth' });
};

/**
 * Auto-advance a carousel after each GIF's full animation duration.
 * Fetches GIF durations from binary (browser cache), then schedules advances.
 * Manual scroll resets the timer for the newly visible slide.
 */
const setupGifAutoAdvance = async (track, images) => {
  const total = images.length;
  if (total <= 1) return;

  // Pre-load all durations (from browser cache via force-cache)
  const durations = await Promise.all(images.map(item => getGifDurationMs(item.url)));

  let current = 0;
  let timer = null;

  const schedule = () => {
    clearTimeout(timer);
    const delay = durations[current] ?? 5000;
    timer = setTimeout(() => {
      current = (current + 1) % total;
      track.scrollTo({ left: (track.scrollWidth / total) * current, behavior: 'smooth' });
      schedule();
    }, delay);
    galleryAutoPlayIntervals.push(timer);
  };

  // Reset timer when user manually scrolls to a different slide
  track.addEventListener('scroll', () => {
    const idx = Math.round(track.scrollLeft / (track.scrollWidth / total || 1));
    if (idx !== current) {
      current = idx;
      schedule();
    }
  }, { passive: true });

  schedule();
};

// ==================== FORMS FUNCTIONALITY ====================

/**
 * Update general review form based on login status
 */
const updateGeneralReviewForm = () => {
  const generalReviewForm = document.getElementById('general-review-form');
  if (!generalReviewForm) return;

  const currentlyLoggedIn = isLoggedIn();
  const loginPrompt = document.getElementById('general-review-login-prompt');
  const formContent = document.getElementById('general-review-form-content');

  if (!currentlyLoggedIn) {
    if (loginPrompt) loginPrompt.classList.add('active');
    if (formContent) formContent.classList.add('hidden');
    generalReviewForm.dataset.initialized = '';
  } else if (!generalReviewForm.dataset.initialized) {
    if (loginPrompt) loginPrompt.classList.remove('active');
    if (formContent) formContent.classList.remove('hidden');

    generalReviewForm.dataset.initialized = 'true';

    const stars = generalReviewForm.querySelectorAll('.review-star-btn');
    const textarea = generalReviewForm.querySelector('.review-form-textarea');
    const submitBtn = generalReviewForm.querySelector('.review-form-button');
    let selectedRating = 0;

    stars.forEach(star => {
      const rating = parseInt(star.dataset.rating);

      star.addEventListener('mouseenter', () => {
        // Add hovered class to all stars up to and including this one
        stars.forEach((s, idx) => {
          s.classList.toggle('hovered', idx < rating);
        });
      });

      star.addEventListener('click', () => {
        if (selectedRating === rating) {
          selectedRating = 0;
          stars.forEach(s => {
            s.classList.remove('selected');
          });
        } else {
          selectedRating = rating;
          stars.forEach((s, idx) => {
            s.classList.toggle('selected', idx < rating);
          });
        }
      });

      star.addEventListener('mouseleave', () => {
        // Remove all hover classes - selected classes remain
        stars.forEach(s => {
          s.classList.remove('hovered');
        });
      });
    });

    if (textarea) {
      textarea.addEventListener('input', () => {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
      });

      // Initialize emoji suggestions for review textarea
      initEmojiSuggestions(textarea);
    }

    // Image upload button handler
    const addPhotoBtn = generalReviewForm.querySelector('#general-review-add-photo-btn');
    const imagePreview = generalReviewForm.querySelector('#general-review-image-preview');
    const previewImg = imagePreview?.querySelector('img');
    const removePreviewBtn = imagePreview?.querySelector('.review-image-preview-remove');
    let pendingImageData = null;

    // Check for existing pending image
    const existing = getPendingImageForContext('review', 'general-review');
    if (existing) {
      pendingImageData = existing;
      if (previewImg && imagePreview) {
        previewImg.src = existing.dataUrl;
        imagePreview.classList.add('active');
        if (addPhotoBtn) {
          addPhotoBtn.querySelector('span').textContent = 'Заменить фото';
        }
      }
    }

    if (addPhotoBtn) {
      addPhotoBtn.addEventListener('click', async () => {
        const result = await showImageUploadModal({
          type: 'review',
          contextId: 'general-review',
          title: pendingImageData ? 'Заменить фото' : 'Добавить фото',
          urlFirst: false,
          allowReplace: !!pendingImageData,
          onSelect: (imageData) => {
            pendingImageData = imageData;
            if (previewImg && imagePreview) {
              previewImg.src = imageData.dataUrl;
              imagePreview.classList.add('active');
            }
            addPhotoBtn.querySelector('span').textContent = 'Заменить фото';
          },
          onRemove: () => {
            pendingImageData = null;
            if (imagePreview) {
              imagePreview.classList.remove('active');
            }
            addPhotoBtn.querySelector('span').textContent = 'Добавить фото';
          }
        });
      });
    }

    if (removePreviewBtn) {
      removePreviewBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removePendingImagesForContext('review', 'general-review');
        pendingImageData = null;
        if (imagePreview) {
          imagePreview.classList.remove('active');
          if (previewImg) previewImg.src = '';
        }
        if (addPhotoBtn) {
          addPhotoBtn.querySelector('span').textContent = 'Добавить фото';
        }
      });
    }

    if (submitBtn) {
      submitBtn.addEventListener('click', async () => {
        if (selectedRating === 0) {
          showToast('Выберите оценку', 'removed');
          return;
        }
        if (!textarea.value.trim()) {
          showToast('Напишите отзыв', 'removed');
          return;
        }

        try {
          const reviewData = {
            productId: null,
            rating: selectedRating,
            reviewText: textarea.value.trim()
          };

          // Add image if present
          if (pendingImageData) {
            reviewData.imageUrl = pendingImageData.dataUrl;
          }

          const response = await fetch('/api/reviews', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('tributary_accessToken')}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(reviewData)
          });

          if (response.ok) {
            showToast('Отзыв отправлен');
            textarea.value = '';
            selectedRating = 0;
            stars.forEach(s => s.classList.remove('selected'));
            // Clear pending image
            pendingImageData = null;
            removePendingImagesForContext('review', 'general-review');
            if (imagePreview) {
              imagePreview.classList.remove('active');
              if (previewImg) previewImg.src = '';
            }
            if (addPhotoBtn) {
              addPhotoBtn.querySelector('span').textContent = 'Добавить фото';
            }
            invalidateReviewsCache();
            renderReviewsPopup();
          }
        } catch (err) {
          console.error('Error submitting general review:', err);
        }
      });
    }
  }
};

/**
 * Update general comment form based on login status
 */
const updateGeneralCommentForm = () => {
  const generalCommentForm = document.getElementById('general-comment-form');
  if (!generalCommentForm) return;

  const currentlyLoggedIn = isLoggedIn();
  const loginPrompt = document.getElementById('general-comment-login-prompt');
  const formContent = document.getElementById('general-comment-form-content');
  const textarea = generalCommentForm.querySelector('.comment-form-textarea');

  if (!currentlyLoggedIn) {
    if (loginPrompt) loginPrompt.classList.add('active');
    if (formContent) formContent.classList.add('hidden');
    generalCommentForm.dataset.initialized = '';
  } else if (!generalCommentForm.dataset.initialized) {
    if (loginPrompt) loginPrompt.classList.remove('active');
    if (formContent) formContent.classList.remove('hidden');

    generalCommentForm.dataset.initialized = 'true';

    const submitBtn = generalCommentForm.querySelector('.comment-form-button');

    if (textarea) {
      textarea.addEventListener('input', () => {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
      });

      // Initialize emoji suggestions for comment textarea
      initEmojiSuggestions(textarea);
    }

    if (submitBtn) {
      submitBtn.addEventListener('click', async () => {
        if (!textarea.value.trim()) {
          showToast('Напишите комментарий', 'removed');
          return;
        }

        await submitComment(textarea.value.trim());
        textarea.value = '';
        textarea.style.height = 'auto';
      });
    }
  }
};

/**
 * Update general suggestion form based on login status
 */
const updateGeneralSuggestionForm = () => {
  const suggestionForm = document.getElementById('suggestion-form');
  if (!suggestionForm) return;

  const currentlyLoggedIn = isLoggedIn();
  const loginPrompt = document.getElementById('suggestion-login-prompt');
  const formContent = document.getElementById('suggestion-form-content');
  const textarea = suggestionForm.querySelector('.suggestion-form-textarea');

  if (!currentlyLoggedIn) {
    if (loginPrompt) loginPrompt.classList.add('active');
    if (formContent) formContent.classList.add('hidden');
    suggestionForm.dataset.initialized = '';
  } else if (!suggestionForm.dataset.initialized) {
    if (loginPrompt) loginPrompt.classList.remove('active');
    if (formContent) formContent.classList.remove('hidden');

    suggestionForm.dataset.initialized = 'true';

    const submitBtn = suggestionForm.querySelector('.suggestion-form-button');

    if (textarea) {
      textarea.addEventListener('input', () => {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
      });

      // Initialize emoji suggestions for suggestion textarea
      initEmojiSuggestions(textarea);
    }

    if (submitBtn) {
      submitBtn.addEventListener('click', async () => {
        if (!textarea.value.trim()) {
          showToast('Напишите предложение', 'removed');
          return;
        }

        const success = await submitSuggestion(textarea.value.trim());
        if (success) {
          textarea.value = '';
          textarea.style.height = 'auto';
        }
      });
    }
  }
};

// ==================== SORTING FUNCTIONALITY ====================

// Current sort state for mobile sheets
let currentCommentsSort = 'date';
let currentSuggestionsSort = 'upvotes';

/**
 * Check if we're on mobile
 */
const isMobile = () => window.innerWidth <= SMALL_MOBILE_BREAKPOINT;

/**
 * Sort comments by the given key
 */
const sortComments = async (sortBy) => {
  currentCommentsSort = sortBy;
  const commentsList = document.getElementById('comments-list');

  // Update select to match (for desktop)
  const commentsSortSelect = document.querySelector('.comments-sort-select');
  if (commentsSortSelect) {
    commentsSortSelect.value = sortBy;
  }

  const cachedAllComments = getCachedComments();
  if (!cachedAllComments) {
    await renderCommentsPopup();
    return;
  }

  let sortedComments = [...cachedAllComments];

  if (sortBy === 'date') {
    sortedComments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  } else {
    sortedComments.sort((a, b) => {
      const likesA = parseInt(a.like_count) || 0;
      const likesB = parseInt(b.like_count) || 0;
      if (likesB !== likesA) return likesB - likesA;
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }

  displayCommentsInPopup(sortedComments, commentsList);
};

/**
 * Sort suggestions by the given key
 */
const sortSuggestions = async (sortBy) => {
  currentSuggestionsSort = sortBy;
  const suggestionsList = document.getElementById('suggestions-list');

  // Update select to match (for desktop)
  const suggestionsSortSelect = document.querySelector('.suggestions-sort-select');
  if (suggestionsSortSelect) {
    suggestionsSortSelect.value = sortBy;
  }

  const cachedAllSuggestions = getCachedSuggestions();
  if (!cachedAllSuggestions) {
    await renderSuggestionsPopup();
    return;
  }

  let sortedSuggestions = [...cachedAllSuggestions];

  if (sortBy === 'date') {
    sortedSuggestions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  } else {
    sortedSuggestions.sort((a, b) => {
      const upvotesA = parseInt(a.upvote_count) || 0;
      const upvotesB = parseInt(b.upvote_count) || 0;
      if (upvotesB !== upvotesA) return upvotesB - upvotesA;
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }

  displaySuggestionsInPopup(sortedSuggestions, suggestionsList);
};

/**
 * Initialize comments sorting
 */
const initializeCommentsSorting = () => {
  const commentsSortSelect = document.querySelector('.comments-sort-select');
  const commentsSortWrapper = document.querySelector('.comments-sort');

  if (!commentsSortSelect) return;

  // On mobile, hide native select and show button to trigger mobile sheet
  // Check isMobile() only - check showMobileSortSheet at click time for reliability
  if (isMobile()) {
    // Hide the select on mobile
    commentsSortSelect.style.display = 'none';

    // Create a button for mobile
    const sortBtn = document.createElement('button');
    sortBtn.className = 'sort-button mobile-sort-trigger';
    sortBtn.textContent = 'По дате';
    sortBtn.addEventListener('click', () => {
      // Check for showMobileSortSheet at click time (may not be available on first load)
      if (typeof window.showMobileSortSheet === 'function') {
        window.showMobileSortSheet({
          sortOptions: [
            { key: 'likes', label: 'По лайкам' },
            { key: 'date', label: 'По дате' }
          ],
          currentSort: currentCommentsSort,
          direction: 'desc',
          onSelect: (sortKey) => {
            sortComments(sortKey);
            sortBtn.textContent = sortKey === 'likes' ? 'По лайкам' : 'По дате';
          }
        });
      }
    });

    // Insert button after label
    const label = commentsSortWrapper?.querySelector('.sort-label');
    if (label) {
      label.after(sortBtn);
    } else {
      commentsSortWrapper?.appendChild(sortBtn);
    }
  } else {
    // Desktop: use native select
    commentsSortSelect.addEventListener('change', (e) => {
      sortComments(e.target.value);
    });
  }
};

/**
 * Initialize suggestions sorting
 */
const initializeSuggestionsSorting = () => {
  const suggestionsSortSelect = document.querySelector('.suggestions-sort-select');
  const suggestionsSortWrapper = document.querySelector('.suggestions-sort');

  if (!suggestionsSortSelect) return;

  // On mobile, hide native select and show button to trigger mobile sheet
  // Check isMobile() only - check showMobileSortSheet at click time for reliability
  if (isMobile()) {
    // Hide the select on mobile
    suggestionsSortSelect.style.display = 'none';

    // Create a button for mobile
    const sortBtn = document.createElement('button');
    sortBtn.className = 'sort-button mobile-sort-trigger';
    sortBtn.textContent = 'По голосам';
    sortBtn.addEventListener('click', () => {
      // Check for showMobileSortSheet at click time (may not be available on first load)
      if (typeof window.showMobileSortSheet === 'function') {
        window.showMobileSortSheet({
          sortOptions: [
            { key: 'upvotes', label: 'По голосам' },
            { key: 'date', label: 'По дате' }
          ],
          currentSort: currentSuggestionsSort,
          direction: 'desc',
          onSelect: (sortKey) => {
            sortSuggestions(sortKey);
            sortBtn.textContent = sortKey === 'upvotes' ? 'По голосам' : 'По дате';
          }
        });
      }
    });

    // Insert button after label
    const label = suggestionsSortWrapper?.querySelector('.sort-label');
    if (label) {
      label.after(sortBtn);
    } else {
      suggestionsSortWrapper?.appendChild(sortBtn);
    }
  } else {
    // Desktop: use native select
    suggestionsSortSelect.addEventListener('change', (e) => {
      sortSuggestions(e.target.value);
    });
  }
};

// ==================== INITIALIZATION ====================

// Page-level state for cleanup
let scrollHandler = null;
let authStateHandler = null;
let isCustomersPageInitialized = false;

/**
 * Initialize customers page
 */
const initializeCustomersPage = async () => {
  // Prevent double initialization (can happen on first SPA navigation)
  if (isCustomersPageInitialized) {
    return;
  }
  isCustomersPageInitialized = true;

  // Reset page state
  allProducts = [];
  allImagesByProduct.clear();
  allAdditionalImagesByProduct.clear();
  invalidateReviewsCache();
  invalidateCommentsCache();
  invalidateSuggestionsCache();

  // Initialize auth first
  await initAuth();

  // Initialize FAQ popup
  initFAQPopup('customers');
  addFAQButton('.customers-title');

  // Load all required data
  await Promise.all([
    loadProducts(),
    loadProductImages(),
    loadAdditionalImages()
  ]);

  // Wire shared data into sub-modules
  initReviews(() => allProducts, () => allImagesByProduct);
  initComments(() => allProducts, () => allImagesByProduct);

  // Initialize tabs
  initializeCustomersTabs();

  // Load process carousel and masonry gallery
  await Promise.all([
    loadProcessCarousel(),
    loadMasonryGallery()
  ]);

  // Initialize forms
  updateGeneralReviewForm();
  updateGeneralCommentForm();
  updateGeneralSuggestionForm();

  // Load reviews by default
  await renderReviewsPopup();

  // Initialize sorting
  initializeCommentsSorting();
  initializeSuggestionsSorting();

  // Setup scroll-to-top button
  const scrollToTopBtn = document.getElementById('scroll-to-top-btn');
  if (scrollToTopBtn) {
    scrollHandler = () => {
      if (window.scrollY > 300) {
        scrollToTopBtn.classList.add('visible');
      } else {
        scrollToTopBtn.classList.remove('visible');
      }
    };
    window.addEventListener('scroll', scrollHandler, { passive: true });

    scrollToTopBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (typeof window.triggerHaptic === 'function') {
        window.triggerHaptic();
      }
    });
  }

  // Setup auth state change handler
  authStateHandler = () => {
    updateGeneralReviewForm();
    updateGeneralCommentForm();
    updateGeneralSuggestionForm();
  };
  window.addEventListener('authStateChanged', authStateHandler);

};

/**
 * Cleanup customers page (called when navigating away via SPA router)
 */
const cleanupCustomersPage = () => {

  // Reset initialization flag for re-entry
  isCustomersPageInitialized = false;

  // Remove scroll handler
  if (scrollHandler) {
    window.removeEventListener('scroll', scrollHandler);
    scrollHandler = null;
  }

  // Remove auth state handler
  if (authStateHandler) {
    window.removeEventListener('authStateChanged', authStateHandler);
    authStateHandler = null;
  }

  // Clear gallery intervals
  galleryAutoPlayIntervals.forEach(interval => clearInterval(interval));
  galleryAutoPlayIntervals = [];

  // Destroy masonry page filters
  if (masonryPageFilters) {
    masonryPageFilters.destroy();
    masonryPageFilters = null;
  }

  // Clear cached data
  invalidateReviewsCache();
  invalidateCommentsCache();
  invalidateSuggestionsCache();

  // Clear product grid carousels
  if (window.activeCarousels) {
    window.activeCarousels.forEach((state, productId) => {
      if (state.autoPlayInterval) {
        clearInterval(state.autoPlayInterval);
      }
    });
    window.activeCarousels.clear();
  }
};

// Register with SPA router
if (typeof window.registerPage === 'function') {
  window.registerPage('/customers', {
    init: initializeCustomersPage,
    cleanup: cleanupCustomersPage
  });
}

// Auto-initialize when script loads (for direct page visits only)
const isCustomersPagePath = window.location.pathname === '/customers' || window.location.pathname === '/customers.html';
if (isCustomersPagePath) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeCustomersPage);
  } else {
    initializeCustomersPage();
  }
}
