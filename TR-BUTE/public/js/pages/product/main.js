// ============================================================
// PRODUCT PAGE MAIN MODULE
// Coordinates all product page functionality
// ============================================================

import { init as initAuth, isLoggedIn } from '../../core/auth.js';
import { showPageScreen } from '../../modules/page-screen.js';
import { isVKMiniApp } from '../../core/vk-miniapp.js';
import { syncCartToServer } from '../../core/data-sync.js';
import { initFAQPopup, addFAQButton } from '../../modules/faq-popup.js';
import { CUSTOM_PRODUCT_ID } from '../../core/constants.js';
import { AppSettings } from '../../core/app-settings.js';
import {
  isCustomProduct,
  getBackgroundImages,
  renderBackgroundSelection,
  getSelectedBackground
} from './background-selection.js';

import {
  loadProductData,
  loadProductImages,
  allProducts,
  getProductImages,
  getProductAdditionalImages,
  currentProduct,
  setCurrentProduct,
  currentUser,
  addImageSize,
  filterImagesByExtra,
  loadLinkedProducts,
  loadTypeLinkedProduct
} from './data.js';

import {
  renderProductCarousel,
  setupProductCarouselArrows,
  initCarouselTouch,
  centerScrollingDots,
  updateIndicatorLabel,
  currentCarouselIndex,
  showScrubTooltip,
  hideScrubTooltip
} from './carousel.js';

import {
  formatOptions,
  triptychFormatOptions,
  propertyDimensions,
  getProductProperty,
  getBaseProperty,
  getProductPrice,
  getProductOldPrice,
  getSelectedFormat,
  isItemInCart,
  formatNumberRussian
} from './pricing.js';

import { renderProductReviews } from './reviews.js';
import { renderProductComments } from './comments.js';
import { updateProductReviewForm, updateProductCommentForm } from './forms.js';
import { addViewedProduct } from '../../core/viewed-products.js';
import { showImageUploadModal } from '../../modules/image-upload-modal.js';
import { getPendingImageForContext, removePendingImagesForContext, validateImageUrl } from '../../modules/image-upload.js';
import { showMobileModal } from '../../modules/mobile-modal.js';
import { createPageFilters } from '../../modules/page-filters.js';
import { renderProductInfo } from './quality-popup.js';
import {
  initCombinations,
  renderCustomProductCombinations,
  renderOriginalProductCombinations,
} from './combinations.js';
import {
  initFormatDropdown,
  getSelectedFormatValue,
  renderFormatDropdown,
  updatePriceRow,
  updateAddToCartButton,
  updateNotForSaleDisplay,
  updateNotifyButton,
  updateCustomProductTextInput,
  showConsultationModal,
} from './format-dropdown.js';
import { loadProductRecommendations } from '../../modules/product-recomendation.js';

/**
 * Resolve variant number to the actual variant image URL for a product.
 * Filters out hidden_product images, counts only extra='варианты'.
 */
function resolveVariantImageUrl(productId, variantNum) {
  const images = getProductImages(productId);
  if (!images || !images.length || !variantNum) return null;
  const visibleVariants = images
    .filter(img => typeof img === 'object' && !img.hidden_product && img.extra === 'варианты');
  const idx = variantNum - 1;
  if (idx >= 0 && idx < visibleVariants.length) {
    return visibleVariants[idx].url || null;
  }
  return null;
}

// Make available globally for cart page
window.resolveVariantImageUrl = resolveVariantImageUrl;

// ============ PAGE STATE ============
let isProductPageInitialized = false;

// ============ MASONRY FILTER STATE ============
let allProductMasonryImages = [];   // Full set for this product (excludes "процесс")
let currentProductMasonryFilter = 'all';
let masonryPageFilters = null;

// ============ MASONRY HELPERS ============
const VK_CDN_WIDTHS = [240, 360, 480, 540, 640, 720, 1080];
const pickMasonrySize = (renderedPx) => {
  const target = Math.ceil(renderedPx * (window.devicePixelRatio || 1));
  const w = VK_CDN_WIDTHS.find(w => w >= target) || VK_CDN_WIDTHS[VK_CDN_WIDTHS.length - 1];
  return `${w}x0`;
};

// ============ PRODUCT MASONRY RENDERING ============

/**
 * Render the product masonry grid with a given images array.
 */
function renderProductMasonryGrid(images, grid, productTitle) {
  grid.innerHTML = '';

  if (images.length === 0) return;

  const highResUrls = images.map(img => {
    const url = typeof img === 'string' ? img : img.url;
    return addImageSize(url, '1500x0');
  });
  const allDeprecated = images.map(img => (typeof img === 'string' ? false : (img.deprecated || false)));
  const SKELETON_RATIOS = [0.6, 0.67, 0.75, 0.8, 0.9, 1.0, 1.25];

  const imgRefs = [];
  images.forEach((img, index) => {
    const url = typeof img === 'string' ? img : img.url;
    const isDeprecated = allDeprecated[index];
    const extra = typeof img === 'string' ? null : img.extra;

    const el = document.createElement('div');
    el.className = 'product-masonry-item';
    el.style.setProperty('--skeleton-ratio', SKELETON_RATIOS[Math.floor(Math.random() * SKELETON_RATIOS.length)]);

    if (extra === 'рендеры') el.dataset.tooltip = '3D-рендер в интерьере';
    else if (extra === 'фото') el.dataset.tooltip = 'Фото покупателя';

    const imgEl = document.createElement('img');
    imgEl.alt = productTitle || '';
    imgEl.loading = 'lazy';
    imgEl.onerror = function () { el.style.display = 'none'; };

    imgRefs.push({ imgEl, url });
    el.appendChild(imgEl);

    if (isDeprecated) {
      const tag = document.createElement('div');
      tag.className = 'masonry-deprecated-tag';
      tag.textContent = 'Устаревший вариант';
      tag.dataset.tooltip = 'Устаревшие варианты так же доступны к заказу';
      el.appendChild(tag);
    }

    el.addEventListener('click', () => {
      if (window.openZoom) window.openZoom(highResUrls, index, null, { showIndicators: false, deprecated: allDeprecated });
    });
    grid.appendChild(el);
  });

  // "Больше фото" button only on the unfiltered view
  if (currentProductMasonryFilter === 'all') {
    const morePhotosEl = document.createElement('div');
    morePhotosEl.className = 'product-masonry-item masonry-more-button';
    morePhotosEl.style.aspectRatio = '2 / 3';
    morePhotosEl.style.display = 'flex';
    morePhotosEl.style.alignItems = 'center';
    morePhotosEl.style.justifyContent = 'center';
    morePhotosEl.style.cursor = 'pointer';
    morePhotosEl.style.backgroundColor = 'var(--bg-secondary)';
    morePhotosEl.style.borderRadius = '6px';
    morePhotosEl.style.transition = 'background-color 0.2s ease';
    morePhotosEl.style.flexDirection = 'column';
    morePhotosEl.style.gap = '10px';
    morePhotosEl.innerHTML = `
      <span class="masonry-more-icon"><svg width="24" height="24"><use href="#logo-mini"></use></svg></span>
      <span class="masonry-more-title">Больше фото</span>`;
    morePhotosEl.addEventListener('click', () => {
      if (typeof window.smoothNavigate === 'function') {
        window.smoothNavigate('/customers');
      } else {
        window.location.href = '/customers';
      }
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
 * Initialize masonry filter buttons for the product page using page-filters module.
 */
function initProductMasonryFilters(grid, productTitle) {
  const wrapper = document.getElementById('product-masonry-filters-wrapper');
  if (!wrapper) return;

  const hasPhotos = allProductMasonryImages.some(img => {
    const extra = typeof img === 'string' ? null : img.extra;
    return extra === 'фото';
  });
  const hasRenders = allProductMasonryImages.some(img => {
    const extra = typeof img === 'string' ? null : img.extra;
    return extra === 'рендеры';
  });
  const buttons = [];
  if (hasPhotos) buttons.push({ label: 'Фото', value: 'фото' });
  if (hasRenders) buttons.push({ label: 'Рендеры', value: 'рендеры' });

  if (masonryPageFilters) {
    masonryPageFilters.destroy();
    masonryPageFilters = null;
  }

  masonryPageFilters = createPageFilters(wrapper, {
    pageId: 'product-masonry',
    features: { collapse: true },
    extraGroups: buttons.length > 0 ? [{
      key: 'imageType',
      groupClass: 'extras-group',
      buttonClass: 'extra-filter-button',
      buttons
    }] : [],
    onFilter: (filterState) => {
      currentProductMasonryFilter = filterState.imageType || 'all';
      const filtered = currentProductMasonryFilter === 'all'
        ? allProductMasonryImages
        : allProductMasonryImages.filter(img => {
            const extra = typeof img === 'string' ? null : img.extra;
            return extra === currentProductMasonryFilter;
          });
      renderProductMasonryGrid(filtered, grid, productTitle);
    }
  });
}

// ============ CAROUSEL BACKGROUND ============

/**
 * Update carousel slides with selected background
 * @param {string} backgroundUrl - URL of the selected background
 */
const updateCarouselBackground = (backgroundUrl) => {
  const track = document.getElementById('product-carousel-track');
  if (!track) return;

  const slides = track.querySelectorAll('.product-carousel-slide');
  slides.forEach(slide => {
    // Add custom-product class for styling
    slide.classList.add('custom-product');

    // Check if background element exists
    let bgEl = slide.querySelector('.carousel-background');
    if (!bgEl) {
      bgEl = document.createElement('div');
      bgEl.className = 'carousel-background';
      slide.insertBefore(bgEl, slide.firstChild);
    }

    // Set background image
    bgEl.style.backgroundImage = `url('${backgroundUrl}')`;

    // Ensure the image is positioned above the background
    const imgEl = slide.querySelector('img');
    if (imgEl) {
      imgEl.classList.add('carousel-image');
    }
  });
};

// ============ CART MANAGEMENT ============

let cartVariations = {};
let currentVariantCount = 0;

const saveCart = () => {
  try {
    localStorage.setItem('tributeCart', JSON.stringify(window.cart));
    localStorage.setItem('tributeCartVariations', JSON.stringify(cartVariations));
    window.dispatchEvent(new Event('cartUpdated'));
  } catch (e) {
    console.error('Error saving cart:', e);
  }
};

const addToCartSynced = async (productId, format) => {
  const product = allProducts.find(p => p.id === productId);
  if (!product) return;

  const displayProperty = getProductProperty(product, format);

  // Special handling for custom product (id=1): each image+format is a unique item
  if (productId === CUSTOM_PRODUCT_ID) {
    const pendingImage = getPendingImageForContext('product', String(productId));
    if (!pendingImage) {
      const errorEl = document.getElementById('custom-product-image-error');
      const section = document.querySelector('.custom-product-image-section');
      if (errorEl) { errorEl.textContent = 'Сначала загрузите изображение'; errorEl.hidden = false; }
      if (section) section.classList.add('has-error');
      return;
    }

    const imageId = Date.now().toString(36);
    const key = `${productId}_${displayProperty}_${imageId}`;

    // Use originalUrl for URL-sourced images, otherwise use dataUrl (may be large but works for session)
    const customUrl = pendingImage.originalUrl || pendingImage.dataUrl || '';

    // Get product image for fallback
    const images = getProductImages(product.id);
    const filtered = filterImagesByExtra(images, ['сборка обложки', 'варианты', 'приближение']);
    let productImage = product.image || '';
    if (filtered.length > 0) {
      productImage = typeof filtered[0] === 'string' ? filtered[0] : filtered[0].url || filtered[0];
    }

    window.cart[key] = {
      productId: product.id,
      title: product.title,
      property: displayProperty,
      quantity: 1,
      triptych: product.triptych || false,
      image: productImage,
      custom_url: customUrl,
      imageId,
      checked: true,
      addedAt: Date.now()
    };

    // Remove pending image and clear the upload preview
    removePendingImagesForContext('product', String(productId));
    const imagePreview = document.getElementById('custom-product-image-preview');
    const previewImg = document.getElementById('custom-product-preview-img');
    if (imagePreview) imagePreview.classList.remove('active');
    if (previewImg) previewImg.src = '';

    try {
      localStorage.setItem('tributeCart', JSON.stringify(window.cart));
      localStorage.setItem('tributeCartVariations', JSON.stringify(cartVariations));
    } catch (e) {
      console.error('Error saving cart:', e);
    }

    if (typeof syncCartToServer === 'function' && typeof isLoggedIn === 'function' && isLoggedIn()) {
      await syncCartToServer(window.cart, cartVariations);
    }

    window.dispatchEvent(new Event('cartUpdated'));
    renderCustomProductCombinations();
    showToast('Комбинация добавлена <a href="/cart">в корзину</a>', 'success', 3000, true);
    return;
  }

  const key = `${productId}_${displayProperty}`;

  // Get product image
  const images = getProductImages(product.id);
  const filtered = filterImagesByExtra(images, ['сборка обложки', 'варианты', 'приближение']);
  let productImage = 'https://placeholder.com/200x240';
  if (filtered.length > 0) {
    productImage = typeof filtered[0] === 'string' ? filtered[0] : filtered[0].url || filtered[0];
  } else if (product.image) {
    productImage = product.image;
  }

  // Add or update cart item
  const limits = AppSettings.getCartLimits();
  const unitPrice = getProductPrice(product, displayProperty) || 0;
  const currentTotal = typeof window.cartModule?.getCartTotal === 'function' ? window.cartModule.getCartTotal() : 0;

  if (limits.max_cart_total > 0 && currentTotal + unitPrice > limits.max_cart_total) {
    showToast(`Сумма <a href="/cart">корзины</a> не может превышать ${formatNumberRussian(limits.max_cart_total)}\u00a0₽`, 'error', 3000, true);
    return;
  }

  // Resolve variant image if variant number is selected
  const variationInput = document.getElementById('variation-number-input');
  const variationNum = variationInput ? variationInput.value : '';
  let variantImageUrl = null;
  if (variationNum && product.type === 'оригинал') {
    variantImageUrl = resolveVariantImageUrl(product.id, parseInt(variationNum, 10));
  }

  if (!window.cart[key]) {
    const cartItem = {
      productId: product.id,
      title: product.title,
      property: displayProperty,
      quantity: 1,
      triptych: product.triptych || false,
      image: productImage,
      checked: true,
      addedAt: Date.now(),
      unitPrice
    };
    if (variantImageUrl) cartItem.variant_image_url = variantImageUrl;
    window.cart[key] = cartItem;
    showToast('Товар добавлен <a href="/cart">в корзину</a>', 'success', 3000, true);
  } else {
    window.cart[key].quantity++;
    showToast('Количество увеличено');
  }

  // Save to localStorage
  try {
    localStorage.setItem('tributeCart', JSON.stringify(window.cart));
    localStorage.setItem('tributeCartVariations', JSON.stringify(cartVariations));
  } catch (e) {
    console.error('Error saving cart:', e);
  }

  // Sync to server if logged in
  if (typeof syncCartToServer === 'function' && typeof isLoggedIn === 'function' && isLoggedIn()) {
    await syncCartToServer(window.cart, cartVariations);
  }

  // Update cart counter
  window.dispatchEvent(new Event('cartUpdated'));
  renderOriginalProductCombinations();
};


// ============ TOAST & CONFIRMATION ============
// Use global modules for consistent styling and behavior
const showToast = (message, type = 'success', duration = 3000, allowHTML = false) => {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type, duration, allowHTML);
  }
};

const showConfirmation = async (message, subtitle = '', callback = null) => {
  const fullMessage = subtitle ? `${message}\n\n${subtitle}` : message;

  if (callback && typeof callback === 'function') {
    const confirmed = await window.mobileModal.confirm({
      title: 'Подтверждение',
      message: fullMessage,
      confirmText: 'Да',
      cancelText: 'Отмена'
    });
    if (confirmed) callback();
  } else {
    await window.mobileModal.alert(fullMessage, { title: 'Уведомление' });
  }
};

// Wire up sub-module dependencies
initCombinations({
  saveCart,
  showToast,
  getCartVariations: () => cartVariations,
});

initFormatDropdown({
  saveCart,
  addToCartSynced,
  showToast,
  getCartVariations: () => cartVariations,
  getVariantCount: () => currentVariantCount,
  renderCustomProductCombinations,
  renderOriginalProductCombinations,
});

// ============ PRODUCT VARIANTS ============

// Mobile scrub on the variants strip: shows a tooltip with the variant name
// while the user drags their finger across the thumbnails.
const setupVariantsScrub = (list) => {
  if (!list) return;
  if (list._variantsScrubCleanup) list._variantsScrubCleanup();

  let scrubbing = false;

  const getItemAtPoint = (x, y) => {
    for (const item of list.querySelectorAll('.product-variant-item')) {
      const r = item.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return item;
    }
    return null;
  };

  const showFor = (x, y) => {
    const item = getItemAtPoint(x, y);
    if (item) {
      const text = item.dataset.tooltip || item.title;
      if (text) showScrubTooltip(text, item);
    }
  };

  const onStart = (e) => { scrubbing = true; showFor(e.touches[0].clientX, e.touches[0].clientY); };
  const onMove  = (e) => { if (scrubbing) showFor(e.touches[0].clientX, e.touches[0].clientY); };
  const onEnd   = ()  => { scrubbing = false; hideScrubTooltip(); };

  list.addEventListener('touchstart',  onStart, { passive: true });
  list.addEventListener('touchmove',   onMove,  { passive: true });
  list.addEventListener('touchend',    onEnd,   { passive: true });
  list.addEventListener('touchcancel', onEnd,   { passive: true });

  list._variantsScrubCleanup = () => {
    list.removeEventListener('touchstart',  onStart);
    list.removeEventListener('touchmove',   onMove);
    list.removeEventListener('touchend',    onEnd);
    list.removeEventListener('touchcancel', onEnd);
  };
};

const renderProductVariants = async (productId) => {
  const variantsSection = document.getElementById('product-variants-section');
  if (!variantsSection) return;

  try {
    const linkedProducts = await loadLinkedProducts(productId);

    // Only show if there are multiple linked products (more than just the current one)
    if (!linkedProducts || linkedProducts.length <= 1) {
      variantsSection.style.display = 'none';
      return;
    }

    // Keep section visible while updating to prevent flickering
    variantsSection.style.display = 'block';

    // Build the HTML with fresh data
    const variantsHTML = `
      <div class="product-variants-label">Варианты:</div>
      <div class="product-variants-list">
        ${linkedProducts.map((variant, idx) => {
          const isCurrentProduct = variant.product_id === productId;
          const imageUrl = variant.image ? addImageSize(variant.image, '120x0') : '';
          const productUrl = variant.slug ? `/product?id=${variant.slug}` : `/product?id=${variant.product_id}`;
          const label = variant.variant_name || `вар. ${idx + 1}`;

          if (isCurrentProduct) {
            return `
              <span class="product-variant-item is-current"
                    data-product-id="${variant.product_id}"
                    data-tooltip="${label}">
                ${imageUrl ?
                  `<img src="${imageUrl}" alt="${label}" class="product-variant-image" loading="lazy">` :
                  `<div class="product-variant-placeholder">IMG</div>`
                }
              </span>
            `;
          }
          return `
            <a href="${productUrl}"
               class="product-variant-item"
               data-product-id="${variant.product_id}"
               data-tooltip="${label}">
              ${imageUrl ?
                `<img src="${imageUrl}" alt="${label}" class="product-variant-image" loading="lazy">` :
                `<div class="product-variant-placeholder">IMG</div>`
              }
            </a>
          `;
        }).join('')}
      </div>
    `;

    // Update the content
    variantsSection.innerHTML = variantsHTML;

    // Mobile: scrub through variants to preview tooltip with variant name
    setupVariantsScrub(variantsSection.querySelector('.product-variants-list'));
  } catch (error) {
    console.error('Error rendering product variants:', error);
    // Only hide on error if there was a real failure, keep previous content if available
    if (!variantsSection.innerHTML || variantsSection.innerHTML.trim() === '') {
      variantsSection.style.display = 'none';
    }
  }
};

const renderProductTypeLink = async (productId) => {
  const section = document.getElementById('product-type-link-section');
  if (!section) return;

  try {
    const linked = await loadTypeLinkedProduct(productId);

    if (!linked) {
      section.style.display = 'none';
      return;
    }

    section.style.display = 'block';

    const imageUrl = linked.image ? addImageSize(linked.image, '120x0') : '';
    const productUrl = linked.slug ? `/product?id=${linked.slug}` : `/product?id=${linked.product_id}`;
    const typeLabel = linked.type === 'фирменный' ? 'Фирменный' : 'Оригинальный';
    const baseTitle = (linked.title || '').replace(/ \[\/\]$/, '');

    section.innerHTML = `
      <div class="product-type-link-label">Также доступен:</div>
      <div class="product-type-link-list">
        <a href="${productUrl}" class="product-type-link-item" data-tooltip="${typeLabel}">
          ${imageUrl
            ? `<img src="${imageUrl}" alt="${baseTitle}" class="product-type-link-image" loading="lazy">`
            : `<div class="product-type-link-placeholder">IMG</div>`
          }
        </a>
      </div>
    `;
  } catch (err) {
    console.error('Error rendering product type link:', err);
    section.style.display = 'none';
  }
};

// These functions are no longer needed - price and dimensions are shown in product-price-row and dropdown
// Kept as no-ops for compatibility
const updateProductDimensions = () => {
  // No-op: dimensions are shown in format dropdown
};

const updateProductPrice = () => {
  // No-op: price is shown in product-price-row
};

const shareProduct = async () => {
  const url = window.location.href;
  const title = currentProduct ? currentProduct.title : 'TR/BUTE';

  // Check if running in Telegram Mini App
  if (window.isInsideTelegram?.()) {
    try {
      const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`;
      window.Telegram.WebApp.openTelegramLink(shareUrl);
      return;
    } catch (err) {
      console.warn('Telegram share error:', err);
    }
  }

  // Try Web Share API first (mobile browsers)
  if (navigator.share) {
    try {
      await navigator.share({
        title: title,
        url: url
      });
      return;
    } catch (err) {
      if (err.name === 'AbortError') {
        return;
      }
      console.warn('Share API error:', err);
    }
  }

  // Fallback to clipboard
  try {
    await navigator.clipboard.writeText(url);
    showToast('Ссылка скопирована');
  } catch (err) {
    console.error('Copy failed:', err);
    showToast('Не удалось скопировать ссылку', 'removed');
  }
};

// ============ LOAD PRODUCT ============

export const loadProduct = async (product) => {
  setCurrentProduct(product);

  // Track viewed product for "recently viewed" feature (#24)
  addViewedProduct(product);

  // Update page title
  document.title = `${product.title} - TR/BUTE`;

  // Get images, excluding ones hidden from the product page (Скрыть с товара in admin)
  let allImages = getProductImages(product.id).filter(img => !(typeof img === 'object' && img.hidden_product));

  // For custom products, only show "варианты" images (transparent PNGs)
  const isCustom = isCustomProduct(product);
  const extraTypes = isCustom ? ['варианты'] : ['обложка', 'варианты', 'приближение'];
  const filtered = filterImagesByExtra(allImages, extraTypes);

  const filteredImages = filtered.length > 0 ? filtered : allImages;

  // Extract 'extra' type strings for tooltip labels (Обложка→Интерьер, etc.)
  const imageExtras = filteredImages.map(img =>
    (typeof img === 'object' && img !== null) ? (img.extra || null) : null
  );

  // Build per-slide variant info for "Текущий вариант" indicator
  const variantSlides = {};
  let variantNum = 0;
  filteredImages.forEach((img, idx) => {
    const extra = typeof img === 'object' ? img.extra : null;
    if (extra === 'варианты') {
      variantNum++;
      variantSlides[idx] = { variantNum, isMix: !!(typeof img === 'object' && img.mix) };
    }
  });
  currentVariantCount = variantNum;

  const currentImages = filteredImages.map(img => {
    if (typeof img === 'string') return addImageSize(img, '1500x0');
    return addImageSize(img.url || img, '1500x0');
  });

  // For custom products, get background images (extra="фон")
  const backgroundImages = isCustom ? getBackgroundImages(product.id, allImages) : [];

  const allAdditionalImages = isCustom ? [] : getProductAdditionalImages(product.id);

  // Process images: only images explicitly tagged "процесс"
  const processImages = allAdditionalImages.filter(img =>
    typeof img === 'object' && img !== null && img.extra === 'процесс'
  );

  // Masonry gallery: all additional images except "процесс"
  const masonryImages = allAdditionalImages.filter(img => {
    const extra = typeof img === 'string' ? null : img.extra;
    return extra !== 'процесс';
  });

  // Update DOM elements
  const productTitle = document.getElementById('product-title');
  const productSubtitle = document.getElementById('product-subtitle');
  const productTags = document.getElementById('product-tags');
  const productDescription = document.getElementById('description-text');

  // Update title (respects emergency mode)
  const existingFAQButton = productTitle.querySelector('.page-faq-button');
  productTitle.textContent = AppSettings.getProductTitle(product);
  if (existingFAQButton) {
    productTitle.appendChild(existingFAQButton);
  }

  productSubtitle.textContent = product.alt || '';

  // Update tags
  productTags.innerHTML = '';
  if (product.status === 'coming_soon') {
    const comingSoonTag = document.createElement('span');
    comingSoonTag.className = 'tag coming-soon';
    comingSoonTag.textContent = 'скоро';
    productTags.appendChild(comingSoonTag);
  }
  if (product.status === 'not_for_sale') {
    const notForSaleTag = document.createElement('span');
    notForSaleTag.className = 'tag not-for-sale';
    notForSaleTag.textContent = 'не в продаже';
    productTags.appendChild(notForSaleTag);
  }
  if (product.status === 'custom') {
    const customTag = document.createElement('span');
    customTag.className = 'tag custom';
    customTag.textContent = 'кастомный';
    productTags.appendChild(customTag);
  }
  if (product.genre) {
    const genreTag = document.createElement('span');
    genreTag.className = 'tag genre';
    genreTag.textContent = product.genre;
    productTags.appendChild(genreTag);
  }
  if (product.type) {
    const typeTag = document.createElement('span');
    typeTag.className = `tag type${product.type === 'оригинал' ? '-original' : ''}`;
    typeTag.textContent = product.type;
    productTags.appendChild(typeTag);
  }
  if (product.editing === true) {
    const editingTag = document.createElement('span');
    editingTag.className = 'tag editing';
    editingTag.textContent = 'Редактирование текста';
    productTags.appendChild(editingTag);
  }
  if (product.restored) {
    const restoredTag = document.createElement('span');
    restoredTag.className = 'tag';
    restoredTag.textContent = 'Отреставрировано';
    restoredTag.dataset.tooltip = 'Нашли в лучшем разрешении и вручную отреставрировали';
    productTags.appendChild(restoredTag);
  }

  const originalFallback = 'Макеты оригинальных постеров проходят тщательный отбор по качеству изображения и аутентичности в случае более старых макетов (которые мы еще и реставрируем в случае повреждений на сканах).';
  productDescription.textContent = product.description || (product.type === 'оригинал' ? originalFallback : 'Описание отсутствует');

  // Remove legacy author element if it exists from previous loads
  const legacyAuthor = document.getElementById('product-author');
  if (legacyAuthor) legacyAuthor.remove();

  // Populate collapsible Materials section
  const specsSection = document.getElementById('product-specs-section');
  const specsList = document.getElementById('specs-list');
  if (specsSection && specsList) {
    const specs = [
      { label: 'Бумага', value: 'глянцевая 180 г/м²' },
      { label: 'Рамка', value: 'черная глянцевая алюминиевая' },
      { label: 'Глубина рамки', value: '3 см' },
      { label: 'Толщина профиля рамки', value: '3 см' }
    ];
    specsList.innerHTML = specs.map(s =>
      `<li><span class="spec-label">${s.label}:</span> ${s.value}</li>`
    ).join('');
    specsSection.style.display = '';
  }

  // Populate collapsible Authors section
  const authorsSection = document.getElementById('product-authors-section');
  const authorsList = document.getElementById('authors-list');
  if (authorsSection && authorsList) {
    if (product.author) {
      const authors = product.author.split(',').map(a => a.trim()).filter(a => a);
      authorsList.innerHTML = authors.map(a => `<li>${a}</li>`).join('');

      const devTimeEl = document.getElementById('product-dev-time');
      const devTimeValue = document.getElementById('product-dev-time-value');
      if (devTimeEl && devTimeValue && product.development_time && product.development_time > 0 && !product.hide_development_time) {
        devTimeValue.textContent = `${product.development_time} ч`;
        devTimeEl.style.display = '';
      }

      const noAiBadge = document.getElementById('product-no-ai-badge');
      if (noAiBadge) {
        noAiBadge.style.display = '';
      }

      authorsSection.style.display = '';
    } else {
      authorsSection.style.display = 'none';
    }
  }

  // Clear skeleton from description title
  const descriptionTitle = document.querySelector('.description h3, .description-title');
  if (descriptionTitle) {
    const descSkeleton = descriptionTitle.querySelector('.skeleton');
    if (descSkeleton) descSkeleton.remove();
    descriptionTitle.textContent = 'Описание';
  }

  // Show buttons that were hidden for skeleton loading
  const favoriteBtn = document.querySelector('.favorite-button');
  const shareBtn = document.querySelector('.share-button');
  const arViewBtn = document.getElementById('ar-view-btn');
  if (favoriteBtn) favoriteBtn.style.display = '';
  if (shareBtn) shareBtn.style.display = '';
  if (arViewBtn) arViewBtn.style.display = '';

  // Display quality and development time info
  renderProductInfo(product);

  // Render product variants (linked products)
  renderProductVariants(product.id);

  // Render type link (фирменный <-> оригинальный)
  renderProductTypeLink(product.id);

  // Render main carousel
  const productCarouselTrack = document.getElementById('product-carousel-track');
  const productCarouselIndicators = document.getElementById('product-carousel-indicators');

  renderProductCarousel(currentImages, productCarouselTrack, productCarouselIndicators, product, false, imageExtras, (idx) => {
    const indicator = document.getElementById('variant-carousel-indicator');
    const info = variantSlides[idx];
    if (!indicator) return;
    if (info) {
      indicator.style.display = 'flex';
      const mixLabel = document.getElementById('variant-mix-label');
      const selectBtn = document.getElementById('select-variant-btn');
      const currentLabel = document.getElementById('current-variant-label');
      if (info.isMix) {
        if (currentLabel) currentLabel.style.display = 'none';
        if (selectBtn) selectBtn.style.display = 'none';
        if (mixLabel) mixLabel.style.display = '';
      } else {
        if (currentLabel) { currentLabel.textContent = `Текущий вариант: #${info.variantNum}`; currentLabel.style.display = ''; }
        if (selectBtn) {
          selectBtn.style.display = '';
          const variationInput = document.getElementById('variation-number-input');
          const currentVal = variationInput ? variationInput.value : '';
          if (currentVal && String(currentVal) === String(info.variantNum)) {
            selectBtn.textContent = 'Выбран';
            selectBtn.classList.add('selected');
          } else {
            selectBtn.textContent = 'Выбрать';
            selectBtn.classList.remove('selected');
          }
        }
        if (mixLabel) mixLabel.style.display = 'none';
      }
    } else {
      indicator.style.display = 'none';
    }
  });

  const selectVariantBtn = document.getElementById('select-variant-btn');
  if (selectVariantBtn) {
    selectVariantBtn.onclick = () => {
      const info = variantSlides[currentCarouselIndex];
      if (info && !info.isMix) {
        const input = document.getElementById('variation-number-input');
        if (input) {
          input.value = info.variantNum;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        selectVariantBtn.textContent = 'Выбран';
        selectVariantBtn.classList.add('selected');
      }
    };
  }

  setupProductCarouselArrows();

  // Fade carousel for custom product (id=1): cross-fade images with timed cycling
  if (product.id === CUSTOM_PRODUCT_ID && currentImages.length > 1) {
    const carouselWrapper = document.querySelector('.product-carousel-wrapper');
    if (carouselWrapper) {
      carouselWrapper.classList.add('fade-carousel');

      // No indicators or thumbnails for this carousel
      const carouselNav = document.querySelector('.product-carousel-nav');
      const thumbnailsStrip = document.getElementById('product-carousel-thumbnails');
      if (carouselNav) carouselNav.style.display = 'none';
      if (thumbnailsStrip) thumbnailsStrip.style.display = 'none';

      const fadeSlides = productCarouselTrack.querySelectorAll('.product-carousel-slide');

      fadeSlides[0].classList.add('fade-active');
      let fadeIndex = 0;
      let fadeHovered = false;

      // Clear any previous fade timer
      if (window._productFadeTimeout) clearTimeout(window._productFadeTimeout);

      const cycleFade = () => {
        // First image stays 5s, rest cycle every 2s
        const delay = fadeIndex === 0 ? 5000 : 2000;
        window._productFadeTimeout = setTimeout(() => {
          if (fadeHovered) return;
          fadeSlides[fadeIndex].classList.remove('fade-active');
          fadeIndex = (fadeIndex + 1) % fadeSlides.length;
          fadeSlides[fadeIndex].classList.add('fade-active');
          cycleFade();
        }, delay);
      };
      cycleFade();

      // Pause on hover
      carouselWrapper.addEventListener('mouseenter', () => {
        fadeHovered = true;
        clearTimeout(window._productFadeTimeout);
      });
      carouselWrapper.addEventListener('mouseleave', () => {
        fadeHovered = false;
        cycleFade();
      });
    }
  }

  // Process carousel: all Процесс images for this product
  const processSection = document.getElementById('product-process-section');
  const processTrack = document.getElementById('product-process-track');
  const processIndicators = document.getElementById('product-process-indicators');
  const processPrevBtn = document.getElementById('product-process-prev');
  const processNextBtn = document.getElementById('product-process-next');
  if (processSection && processTrack) {
    if (processImages.length > 0) {
      processSection.style.display = 'block';
      processTrack.innerHTML = '';
      if (processIndicators) processIndicators.innerHTML = '';

      const processUrls = processImages.map(img => {
        const url = typeof img === 'string' ? img : img.url;
        return addImageSize(url, '1500x0');
      });

      processUrls.forEach((url, index) => {
        const slide = document.createElement('div');
        slide.className = 'gallery-carousel-slide';
        if (product.title) slide.dataset.tooltip = 'Процесс создания постера ' + product.title;

        const imgEl = document.createElement('img');
        imgEl.src = url;
        imgEl.alt = product.title || '';
        imgEl.loading = index === 0 ? 'eager' : 'lazy';
        imgEl.onerror = function () { this.style.display = 'none'; };

        slide.appendChild(imgEl);
        slide.addEventListener('click', () => {
          if (window.openZoom) window.openZoom(
            processUrls, index,
            processUrls.map(() => ({ title: product.title, id: product.id, slug: product.slug }))
          );
        });
        processTrack.appendChild(slide);

        if (processIndicators) {
          const dot = document.createElement('div');
          dot.className = 'gallery-carousel-indicator' + (index === 0 ? ' active' : '');
          dot.addEventListener('click', () => {
            const slideWidth = processTrack.clientWidth;
            processTrack.scrollTo({ left: index * slideWidth, behavior: 'smooth' });
          });
          processIndicators.appendChild(dot);
        }
      });

      // Hide indicators when only one image
      if (processIndicators) {
        processIndicators.style.display = processUrls.length <= 1 ? 'none' : '';
      }

      // Arrow visibility helper
      const updateProcessArrows = () => {
        if (!processPrevBtn || !processNextBtn) return;
        const atStart = processTrack.scrollLeft <= 1;
        const atEnd = processTrack.scrollLeft + processTrack.clientWidth >= processTrack.scrollWidth - 1;
        processPrevBtn.classList.toggle('hidden', atStart);
        processNextBtn.classList.toggle('hidden', atEnd);
      };
      setTimeout(updateProcessArrows, 100);

      processTrack.addEventListener('scroll', () => {
        updateProcessArrows();
        if (processIndicators) {
          const slideWidth = processTrack.scrollWidth / (processTrack.children.length || 1);
          const currentIndex = Math.round(processTrack.scrollLeft / slideWidth);
          processIndicators.querySelectorAll('.gallery-carousel-indicator').forEach((dot, idx) => {
            dot.classList.toggle('active', idx === currentIndex);
          });
        }
      }, { passive: true });

      if (processPrevBtn) {
        processPrevBtn.addEventListener('click', () => {
          processTrack.scrollBy({ left: -processTrack.clientWidth, behavior: 'smooth' });
        });
      }
      if (processNextBtn) {
        processNextBtn.addEventListener('click', () => {
          processTrack.scrollBy({ left: processTrack.clientWidth, behavior: 'smooth' });
        });
      }
    } else {
      processSection.style.display = 'none';
    }
  }

  // Masonry gallery
  const masonrySection = document.getElementById('product-masonry-section');
  const masonryGrid = document.getElementById('product-masonry-grid');
  if (masonrySection && masonryGrid) {
    if (masonryImages.length > 0) {
      allProductMasonryImages = masonryImages;
      currentProductMasonryFilter = 'all';

      masonrySection.style.display = 'block';
      window.dispatchEvent(new CustomEvent('spa:stickyfilterready'));
      initProductMasonryFilters(masonryGrid, product.title);
      renderProductMasonryGrid(allProductMasonryImages, masonryGrid, product.title);
    } else {
      allProductMasonryImages = [];
      masonrySection.style.display = 'none';
    }
  }

  // Handle custom product background selection
  const backgroundSelectionContainer = document.getElementById('background-selection');
  if (backgroundSelectionContainer) {
    if (isCustom && backgroundImages.length > 0) {
      backgroundSelectionContainer.style.display = 'block';
      renderBackgroundSelection(backgroundSelectionContainer, product, backgroundImages);

      // Apply initial background selection to carousel
      const initialBackground = getSelectedBackground(product.id, backgroundImages);
      if (initialBackground) {
        updateCarouselBackground(initialBackground.displayUrl);
      }

      // Listen for background selection changes
      const handleBackgroundSelected = (e) => {
        if (e.detail.productId === product.id) {
          updateCarouselBackground(e.detail.url);
        }
      };
      window.addEventListener('backgroundSelected', handleBackgroundSelected);

      // Store handler for cleanup
      if (!window.productPageEventHandlers) {
        window.productPageEventHandlers = {};
      }
      window.productPageEventHandlers.backgroundSelected = handleBackgroundSelected;
    } else {
      backgroundSelectionContainer.style.display = 'none';
    }
  }

  const isComingSoon = product.status === 'coming_soon';
  const isNotForSale = product.status === 'not_for_sale';

  // Hide/show elements based on product status
  const priceEl = document.getElementById('price');
  const formatGroup = document.querySelector('.format-group');

  if (isComingSoon) {
    // Hide price and format for coming_soon products, show notify button
    if (priceEl) priceEl.style.display = 'none';
    if (formatGroup) formatGroup.style.display = 'none';
    updateNotifyButton();
  } else if (isNotForSale) {
    // Hide price and format for not_for_sale products, no buttons
    if (priceEl) priceEl.style.display = 'none';
    if (formatGroup) formatGroup.style.display = 'none';
    updateNotForSaleDisplay();
  } else {
    // Show price and format for regular products
    if (priceEl) priceEl.style.display = 'block';
    if (formatGroup) formatGroup.style.display = 'block';
    renderFormatDropdown(product);
    updateProductPrice();
    updateProductDimensions();
    updateAddToCartButton();
    updateCustomProductTextInput();
  }

  // Update favorite button
  const productFavoriteBtn = document.querySelector('.favorite-button');
  productFavoriteBtn.classList.toggle('is-favorite', window.favorites && window.favorites.has(product.id));

  // Load reviews, comments, and update forms in parallel
  await Promise.all([
    renderProductReviews(product.id, product.vk_market_url),
    renderProductComments(product.id),
    updateProductReviewForm(),
    updateProductCommentForm()
  ]);

  // Load product recommendations (non-blocking)
  const recsContainer = document.getElementById('product-recommendations');
  if (recsContainer) {
    loadProductRecommendations(recsContainer, product).catch(err => {
      console.warn('Failed to load recommendations:', err);
    });
  }

  // Recalculate scroll height after dynamic content loads (fixes jerky mobile scroll)
  requestAnimationFrame(() => {
    // Trigger a reflow to ensure browser recalculates layout
    document.body.style.minHeight = '';
    document.body.offsetHeight; // Force reflow

    // On mobile, sometimes we need to dispatch a resize event to update scrollbar
    if (window.innerWidth <= 1024) {
      window.dispatchEvent(new Event('resize'));
    }
  });

  // Reset tabs and hide reviews for coming_soon products
  const modernTabBtns = document.querySelectorAll('.tab');
  const productReviewsTab = document.getElementById('product-reviews-tab');
  const productCommentsTab = document.getElementById('product-comments-tab');
  const tabsContainer = document.querySelector('.tabs-container');

  const tabsWrapper = tabsContainer ? tabsContainer.closest('.tabs-wrapper') : null;

  if (isComingSoon) {
    // Hide reviews tab for coming_soon products; comments tab becomes first visible
    modernTabBtns.forEach(btn => {
      if (btn.dataset.tab === 'reviews') {
        btn.style.display = 'none';
        btn.classList.remove('active');
      } else if (btn.dataset.tab === 'comments') {
        btn.style.display = '';
        btn.classList.add('active');
      }
    });
    if (productReviewsTab) {
      productReviewsTab.classList.remove('active');
    }
    if (productCommentsTab) {
      productCommentsTab.classList.add('active');
    }
    if (tabsWrapper) {
      tabsWrapper.classList.add('first-tab-active');
      tabsWrapper.classList.add('last-tab-active');
    }
  } else {
    // Show reviews tab for regular products (both tabs accessible)
    modernTabBtns.forEach(btn => {
      btn.style.display = ''; // Clear any inline display style
      if (btn.dataset.tab === 'reviews') {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    if (productReviewsTab) {
      productReviewsTab.classList.add('active');
    }
    if (productCommentsTab) {
      productCommentsTab.classList.remove('active');
    }
    if (tabsWrapper) {
      tabsWrapper.classList.add('first-tab-active');
      tabsWrapper.classList.remove('last-tab-active');
    }
  }
};

// ============ EVENT LISTENERS ============

export const initEventListeners = () => {
  // Favorite button
  const productFavoriteBtn = document.querySelector('.favorite-button');
  if (productFavoriteBtn) {
    productFavoriteBtn.addEventListener('click', () => {
      if (currentProduct && window.toggleFavoriteSynced) {
        window.currentProduct = currentProduct;
        window.toggleFavoriteSynced(currentProduct.id);
      }
    });
  }

  // Share button
  const productShareBtn = document.querySelector('.share-button');
  if (productShareBtn) {
    productShareBtn.addEventListener('click', () => {
      shareProduct();
    });
  }

  // AR View (3D) button
  const arViewBtn = document.getElementById('ar-view-btn');
  if (arViewBtn) {
    arViewBtn.addEventListener('click', () => {
      if (currentProduct) {
        const arUrl = `/ar-view?id=${currentProduct.id}`;
        if (typeof window.smoothNavigate === 'function') {
          window.smoothNavigate(arUrl);
        } else {
          window.location.href = arUrl;
        }
      }
    });
  }

  // Notify button for coming_soon products
  const notifyBtn = document.getElementById('notify-release');
  if (notifyBtn) {
    notifyBtn.addEventListener('click', async () => {
      if (!isLoggedIn()) {
        showToast('Войдите, чтобы подписаться на уведомление');
        setTimeout(() => {
          window.location.href = '/profile';
        }, 1500);
        return;
      }

      if (!currentProduct) return;

      try {
        const isSubscribed = notifyBtn.classList.contains('subscribed');
        const action = isSubscribed ? 'unsubscribe' : 'subscribe';

        // Get current user
        const userRes = await fetch('/api/auth/user', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('tributary_accessToken')}`
          }
        });

        if (!userRes.ok) {
          throw new Error('Failed to get user data');
        }

        const user = await userRes.json();

        const response = await fetch('/api/products/subscribe-release', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('tributary_accessToken')}`
          },
          body: JSON.stringify({
            user_id: user.id,
            product_id: currentProduct.id,
            action: action
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Server error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();

        if (data.success) {
          if (data.subscribed) {
            notifyBtn.classList.add('subscribed');
            notifyBtn.querySelector('.notify-release-text').textContent = 'Вы подписаны на уведомление';
            showToast('Вы подписались на уведомление о поступлении');
          } else {
            notifyBtn.classList.remove('subscribed');
            notifyBtn.querySelector('.notify-release-text').textContent = 'Уведомить о поступлении';
            showToast('Вы отписались от уведомления');
          }
        } else {
          throw new Error(data.error || 'Failed to subscribe');
        }
      } catch (error) {
        console.error('Error subscribing:', error);
        showToast('Ошибка при подписке на уведомление');
      }
    });
  }

  // Collapsible sections toggle
  document.querySelectorAll('.product-collapsible-section .collapsible-header').forEach(header => {
    header.addEventListener('click', () => {
      const contentId = header.getAttribute('aria-controls');
      const content = document.getElementById(contentId);
      if (!content) return;

      const isOpen = content.classList.toggle('open');
      header.setAttribute('aria-expanded', isOpen);
    });
  });

  // Format dropdown click outside handler
  document.addEventListener('click', (e) => {
    const priceRow = document.getElementById('product-price-row');
    const dropdown = document.getElementById('product-format-dropdown');
    const selectBtn = document.getElementById('product-format-select-btn');

    if (priceRow && dropdown && selectBtn) {
      // Check if click is outside the price row entirely
      if (!priceRow.contains(e.target)) {
        if (dropdown.classList.contains('active')) {
          dropdown.classList.remove('active');
          priceRow.classList.remove('product-format-open');
          // Rotate chevron back up
          const chevron = selectBtn.querySelector('svg.product-format-select-chevron');
          if (chevron) {
            chevron.classList.add('up');
          }
        }
      }
    }
  });

  // Modern tabs
  const modernTabBtns = document.querySelectorAll('.tab');
  modernTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;
      const targetContent = document.getElementById(`product-${tabName}-tab`);

      if (targetContent) {
        const parentTabContainer = btn.closest('.tabs-container');
        const siblingTabs = parentTabContainer ? parentTabContainer.querySelectorAll('.tab') : [btn];
        const siblingContents = document.querySelectorAll('#product-reviews-tab, #product-comments-tab');

        siblingTabs.forEach(t => t.classList.remove('active'));
        siblingContents.forEach(c => c.classList.remove('active'));

        btn.classList.add('active');
        targetContent.classList.add('active');

        // Update corner rounding: square top-left/right when first/last visible tab is active
        const wrapper = parentTabContainer.closest('.tabs-wrapper');
        if (wrapper) {
          const visibleTabs = Array.from(siblingTabs).filter(t => t.style.display !== 'none');
          wrapper.classList.toggle('first-tab-active', btn === visibleTabs[0]);
          wrapper.classList.toggle('last-tab-active', btn === visibleTabs[visibleTabs.length - 1]);
        }
      }
    });
  });

  // Initialize carousel touch
  initCarouselTouch();

  // Custom product image upload
  const customProductUploadBtn = document.getElementById('custom-product-upload-btn');
  const customProductImagePreview = document.getElementById('custom-product-image-preview');
  const customProductPreviewImg = document.getElementById('custom-product-preview-img');
  const customProductImageRemove = document.getElementById('custom-product-image-remove');
  const customProductConsultBtn = document.getElementById('custom-product-consult-btn');

  // Upload button - opens image upload modal
  if (customProductUploadBtn) {
    customProductUploadBtn.addEventListener('click', async () => {
      if (!currentProduct || currentProduct.id !== CUSTOM_PRODUCT_ID) return;

      const result = await showImageUploadModal({
        type: 'product',
        contextId: String(currentProduct.id),
        title: 'Загрузить изображение',
        urlFirst: true,
        onSelect: (imageData) => {
          // Show preview
          if (customProductImagePreview && customProductPreviewImg) {
            customProductPreviewImg.src = imageData.dataUrl;
            customProductImagePreview.classList.add('active');
          }
          // Clear error state
          const errorEl = document.getElementById('custom-product-image-error');
          const section = document.querySelector('.custom-product-image-section');
          if (errorEl) errorEl.hidden = true;
          if (section) section.classList.remove('has-error');
        },
        onRemove: () => {
          if (customProductImagePreview) {
            customProductImagePreview.classList.remove('active');
          }
        }
      });
    });
  }

  // Remove preview image
  if (customProductImageRemove) {
    customProductImageRemove.addEventListener('click', (e) => {
      e.stopPropagation();
      if (currentProduct) {
        removePendingImagesForContext('product', String(currentProduct.id));
      }
      if (customProductImagePreview) {
        customProductImagePreview.classList.remove('active');
        if (customProductPreviewImg) customProductPreviewImg.src = '';
      }
      if (customProductTextInput) {
        customProductTextInput.value = '';
        // Clear from cart variations
        const _sfv = getSelectedFormatValue();
        if (_sfv) {
          const format = _sfv;
          const displayProperty = getProductProperty(currentProduct, format);
          const variationKey = `${currentProduct.id}_${displayProperty}`;
          delete cartVariations[variationKey];
          saveCart();
        }
      }
    });
  }

  // Consultation button
  if (customProductConsultBtn) {
    customProductConsultBtn.addEventListener('click', showConsultationModal);
  }

  // Variation number input
  const variationNumberInput = document.getElementById('variation-number-input');
  if (variationNumberInput) {
    variationNumberInput.addEventListener('input', () => {
      const _sfv2 = getSelectedFormatValue();
      if (currentProduct && currentProduct.type === 'оригинал' && _sfv2) {
        const format = _sfv2;
        const displayProperty = getProductProperty(currentProduct, format);
        const variationKey = `${currentProduct.id}_${displayProperty}`;
        cartVariations[variationKey] = variationNumberInput.value;
        saveCart();
      }
    });

    // Scroll input into view on focus (may be hidden behind keyboard or header)
    variationNumberInput.addEventListener('focus', () => {
      const fullViewportHeight = window.innerHeight;
      setTimeout(() => {
        const headerHeight = document.querySelector('.header')?.offsetHeight || 60;
        const rect = variationNumberInput.getBoundingClientRect();
        const isAboveViewport = rect.top < headerHeight;
        const isBelowViewport = rect.bottom > fullViewportHeight;
        if (isAboveViewport || isBelowViewport) {
          if (isBelowViewport) {
            const bottomNavEl = window.innerWidth <= 1024 ? document.querySelector('.bottom-nav') : null;
            const bottomNavHeight = bottomNavEl ? bottomNavEl.offsetHeight : 0;
            window.scrollTo({ top: window.pageYOffset + rect.bottom - fullViewportHeight + 20 + bottomNavHeight, behavior: 'smooth' });
          } else {
            window.scrollTo({ top: window.pageYOffset + rect.top - headerHeight - 10, behavior: 'smooth' });
          }
        }
      }, 300);
    });
  }

  // Keep format dropdown and combinations in sync when cart is updated externally
  window.addEventListener('cartUpdated', () => {
    if (currentProduct) {
      renderFormatDropdown(currentProduct);
      if (currentProduct.id === CUSTOM_PRODUCT_ID) {
        renderCustomProductCombinations();
      } else if (currentProduct.type === 'оригинал') {
        renderOriginalProductCombinations();
      }
    }
  });
};

// ============ INITIALIZATION ============

export const initProductPage = async () => {
  // Prevent double initialization
  if (isProductPageInitialized) {
    return;
  }
  isProductPageInitialized = true;

  // Set global constant for CUSTOM_PRODUCT_ID
  window.CUSTOM_PRODUCT_ID = CUSTOM_PRODUCT_ID;

  // Initialize auth
  await initAuth();

  // Get product ID from URL for FAQ initialization
  // Support both /product?id=123 and /product/slug formats
  const urlParams = new URLSearchParams(window.location.search);
  let productIdParam = urlParams.get('id');

  // Check for slug in URL path: /product/some-slug
  if (!productIdParam) {
    const pathMatch = window.location.pathname.match(/^\/product\/(.+)$/);
    if (pathMatch) {
      productIdParam = pathMatch[1]; // This could be a slug or ID
    }
  }

  const productIdNum = productIdParam ? parseInt(productIdParam) : null;

  // Initialize FAQ with product ID
  initFAQPopup('product', productIdNum);
  addFAQButton('#product-title');

  // Load cart and favorites
  try {
    const savedCart = localStorage.getItem('tributeCart');
    const savedCartVariations = localStorage.getItem('tributeCartVariations');
    const savedFavorites = localStorage.getItem('tributeFavorites');

    if (savedCart) {
      window.cart = JSON.parse(savedCart);
    }
    if (savedCartVariations) {
      cartVariations = JSON.parse(savedCartVariations);
    }
    if (savedFavorites) {
      window.favorites = new Set(JSON.parse(savedFavorites));
    } else {
      window.favorites = new Set();
    }
  } catch (e) {
    console.error('Error loading cart/favorites:', e);
  }

  // Load product data
  const loaded = await loadProductData();
  if (!loaded) {
    console.error('Failed to load product data');
    // Still mark page as ready even on error
    document.documentElement.classList.remove('page-loading');
    document.documentElement.classList.add('page-ready');
    return;
  }

  // Use productIdParam from above (supports both ?id= and /product/slug formats)
  if (!productIdParam) {
    const mainContent = document.querySelector('.product-page-content') || document.querySelector('.product-page-overlay');
    if (mainContent) {
      showPageScreen(mainContent, {
        title: 'Товар не найден',
        text: 'Воспользуйтесь навигацией',
        buttons: [{ label: 'На главную', href: '/' }],
      });
    }
    document.documentElement.classList.remove('page-loading');
    document.documentElement.classList.add('page-ready');
    return;
  }

  // Find product by ID or slug
  const isNumericId = !isNaN(productIdNum) && productIdNum !== null && productIdNum.toString() === productIdParam;
  const product = isNumericId
    ? allProducts.find(p => p.id === productIdNum)
    : allProducts.find(p => p.slug === productIdParam);

  if (product) {
    // Load images only for this product (not all products)
    await loadProductImages(product.id);
    await loadProduct(product);
    initEventListeners();
  } else {
    // Product not in public list (e.g. available_via_var) — try fetching directly
    let directProduct = null;
    try {
      const directRes = await fetch(`/api/products/${encodeURIComponent(productIdParam)}`);
      if (directRes.ok) {
        const directData = await directRes.json();
        // Map to the shape expected by loadProduct
        directProduct = {
          id: directData.id,
          title: directData.title,
          description: directData.description,
          discount: directData.discount,
          triptych: directData.triptych,
          slug: directData.slug,
          author: directData.author,
          status: directData.status || 'available_via_var',
          price: null,
          old_price: null,
          genre: directData.genre,
          type: directData.type,
          alt: directData.alt,
          editing: directData.editing,
          restored: directData.restored,
          image: directData.images && directData.images[0] ? directData.images[0] : null
        };
      }
    } catch (_) {
      // fall through to not-found
    }

    if (directProduct) {
      await loadProductImages(directProduct.id, directProduct.image);
      await loadProduct(directProduct);
      initEventListeners();
    } else {
      console.error('Product not found:', productIdParam);
      const mainContent = document.querySelector('.product-page-content');
      if (mainContent) {
        showPageScreen(mainContent, {
          title: 'Товар не найден',
          text: `Товар «${productIdParam}» не найден в каталоге.`,
          buttons: [{ label: '← Вернуться в каталог', href: '/catalog', primary: false }],
        });
      }
    }
  }

  // Mark page as ready (remove loading state for SPA navigation)
  document.documentElement.classList.remove('page-loading');
  document.documentElement.classList.add('page-ready');

};

// ============ CLEANUP ============

/**
 * Cleanup product page (called when navigating away via SPA router)
 */
export const cleanupProductPage = () => {

  // Reset initialization flag
  isProductPageInitialized = false;

  // Reset masonry filter state
  if (masonryPageFilters) {
    masonryPageFilters.destroy();
    masonryPageFilters = null;
  }
  allProductMasonryImages = [];
  currentProductMasonryFilter = 'all';

  // No additional carousel autoplay to stop

  // Clear fade carousel timer
  if (window._productFadeTimeout) {
    clearTimeout(window._productFadeTimeout);
    window._productFadeTimeout = null;
  }

  // Reset current product
  setCurrentProduct(null);

  // Remove background selection event listener
  if (window.productPageEventHandlers?.backgroundSelected) {
    window.removeEventListener('backgroundSelected', window.productPageEventHandlers.backgroundSelected);
    delete window.productPageEventHandlers.backgroundSelected;
  }

  // Close any open popups/zoom views
  const zoomOverlay = document.querySelector('.product-zoom-overlay');
  if (zoomOverlay && zoomOverlay.classList.contains('active')) {
    zoomOverlay.classList.remove('active');
    document.body.classList.remove('popup-open');
  }
};

// Register with SPA router
if (typeof window.registerPage === 'function') {
  window.registerPage('/product', {
    init: initProductPage,
    cleanup: cleanupProductPage
  });
}

// Auto-initialize when script loads (for direct page visits)
// Handle both /product?id=xxx and /product/slug formats
const isProductPagePath = window.location.pathname === '/product' ||
                          window.location.pathname.startsWith('/product/');
if (isProductPagePath) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProductPage);
  } else {
    initProductPage();
  }
}

