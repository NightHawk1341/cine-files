// ============================================================
// PRODUCT GRID MODULE
// Reusable product card rendering for catalog, favorites, and main page
// ============================================================

// Import required state and utility functions
import { activeCarousels } from '../core/state.js';
import { filterImagesByExtra, addImageSize, formatNumberRussian, isVkCdnUrl, proxyVkCdnUrl, createImageReloadOverlay } from '../core/formatters.js';
import { getProductPrice, getProductOldPrice } from '../core/product-helpers.js';
import { toggleFavoriteSynced } from '../core/favorites.js';
import { AppSettings } from '../core/app-settings.js';
import { formatOptions, triptychFormatOptions, CUSTOM_PRODUCT_ID } from '../core/constants.js';
import { syncCartToServer } from '../core/data-sync.js';
import { isLoggedIn } from '../core/auth.js';

// SVG icon markup for the price-row-add-btn states
const PLUS_ICON_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
const CHEVRON_DOWN_SVG = '<svg class="add-btn-chevron" width="12" height="12"><use href="#chevron-down"></use></svg>';
const CHEVRON_UP_SVG = '<svg class="add-btn-chevron up" width="12" height="12"><use href="#chevron-down"></use></svg>';

// SVG markup for notify button (3 states via CSS class toggling)
const NOTIFY_BELL_SVG = '<svg class="bell-icon bell-normal" width="14" height="14"><use href="#bell-notify"></use></svg><svg class="bell-icon bell-active" width="14" height="14"><use href="#bell-notify-active"></use></svg><svg class="bell-icon bell-remove" width="14" height="14"><use href="#bell-notify-remove"></use></svg>';

function getNotifyList() {
  try {
    const raw = localStorage.getItem('tributeNotifyList');
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function saveNotifyList(set) {
  try {
    localStorage.setItem('tributeNotifyList', JSON.stringify([...set]));
  } catch (e) {
    console.error('Error saving notify list:', e);
  }
}

// ============================================================
// PRODUCT VARIANTS STATE
// Maps product_id to array of variant products
// ============================================================
let productVariantsMap = new Map(); // product_id -> [{ product_id, variant_name, title, slug, status, image, price, ... }]
let variantsLoaded = false;

/**
 * Load all product link groups for variant dropdown feature
 * @returns {Promise<Map>} Map of product_id to variants array
 */
async function loadProductVariants() {
  if (variantsLoaded && productVariantsMap.size > 0) {
    return productVariantsMap;
  }

  try {
    const response = await fetch('/api/products/links?all=true');
    if (!response.ok) {
      console.warn('Failed to load product variants');
      return productVariantsMap;
    }

    const data = await response.json();
    const groups = data.groups || [];

    // Clear and rebuild the map
    productVariantsMap.clear();

    for (const group of groups) {
      // Check if group has any available_via_var products
      const hasVariantProducts = group.some(p => p.status === 'available_via_var');

      if (hasVariantProducts) {
        // Only non-excluded products participate in the variant dropdown
        const activeVariants = group.filter(p => !p.variant_excluded);

        // For each non-excluded, non-variant product in the group, store its variants
        for (const product of activeVariants) {
          if (product.status !== 'available_via_var') {
            // This product should show a dropdown with all active variants
            productVariantsMap.set(product.product_id, activeVariants);
          }
        }
      }
    }

    variantsLoaded = true;

    // Prefetch variant images so they're already in the browser cache when user switches
    if (window.allImagesByProduct && window.allImagesByProduct.size > 0) {
      _preloadVariantImages();
    } else {
      window.addEventListener('imagesLoaded', _preloadVariantImages, { once: true });
    }

    return productVariantsMap;
  } catch (error) {
    console.error('Error loading product variants:', error);
    return productVariantsMap;
  }
}

function _preloadVariantImages() {
  const imagesMap = getImagesMap();
  if (!imagesMap.size) return;

  const gridExtras = ['сборка обложки', 'варианты', 'приближение'];
  const seen = new Set();

  for (const variants of productVariantsMap.values()) {
    for (const v of variants) {
      const images = imagesMap.get(v.product_id) || [];
      const filtered = filterImagesByExtra(images, gridExtras);
      const toLoad = filtered.length ? filtered : (v.image ? [v.image] : []);
      for (const img of toLoad) {
        const raw = typeof img === 'string' ? img : (img.url || img);
        const url = addImageSize(raw, '480x0');
        if (!seen.has(url)) {
          seen.add(url);
          new Image().src = url;
        }
      }
    }
  }
}

/**
 * Get variants for a product (if any)
 * @param {number} productId - Product ID
 * @returns {Array|null} Array of variant products or null
 */
function getProductVariants(productId) {
  return productVariantsMap.get(productId) || null;
}

// Make loadProductVariants available globally
window.loadProductVariants = loadProductVariants;

/**
 * Get the images map from the most reliable source
 * During SPA navigation, the window global is more reliable than ES6 imports
 * @returns {Map} The images map
 */
function getImagesMap() {
  // Always prefer window global as it's consistently updated across SPA navigation
  if (window.allImagesByProduct && window.allImagesByProduct.size > 0) {
    return window.allImagesByProduct;
  }
  return new Map();
}

// ============================================================
// CARD CART HELPERS
// Format dropdown and cart counter for product cards
// ============================================================

const getTriptychProperty = (property) => {
  const mapping = {
    'A3 без рамки': '3 A3 без рамок',
    'A2 без рамки': '3 A2 без рамок',
    'A1 без рамки': '3 A1 без рамок',
    'A3 в рамке': '3 A3 в рамках',
    'A2 в рамке': '3 A2 в рамках'
  };
  return mapping[property] || property;
};

const getDisplayProperty = (product, format) => {
  return product.triptych ? getTriptychProperty(format) : format;
};

/**
 * Save cart to localStorage and dispatch update event
 */
function saveCartFromGrid() {
  try {
    localStorage.setItem('tributeCart', JSON.stringify(window.cart));
    window.dispatchEvent(new Event('cartUpdated'));
  } catch (e) {
    console.error('Error saving cart:', e);
  }
  if (isLoggedIn()) {
    const variations = getCartVariations();
    syncCartToServer(window.cart, variations).catch(err => {
      console.error('Failed to sync cart to server:', err);
    });
  }
}

function getCartVariations() {
  try {
    return JSON.parse(localStorage.getItem('tributeCartVariations') || '{}');
  } catch {
    return {};
  }
}

function saveCartVariation(variationKey, value) {
  const variations = getCartVariations();
  if (value) {
    variations[variationKey] = value;
  } else {
    delete variations[variationKey];
  }
  localStorage.setItem('tributeCartVariations', JSON.stringify(variations));
  window.dispatchEvent(new Event('cartUpdated'));
}

/**
 * Update the price-row-add-btn icon based on dropdown/cart state.
 * @param {HTMLElement} addBtn - The .price-row-add-btn element
 * @param {'plus'|'chevron-down'|'chevron-up'} state - Desired icon state
 */
function setAddBtnIcon(addBtn, state) {
  if (!addBtn) return;
  const existing = addBtn.querySelector('svg.add-btn-chevron');
  if (state === 'chevron-down') {
    if (existing) {
      existing.classList.remove('up');
    } else {
      addBtn.innerHTML = CHEVRON_DOWN_SVG;
    }
    addBtn.dataset.tooltip = 'Скрыть';
  } else if (state === 'chevron-up') {
    if (existing) {
      existing.classList.add('up');
    } else {
      addBtn.innerHTML = CHEVRON_UP_SVG;
    }
    addBtn.dataset.tooltip = 'Изменить формат';
  } else {
    addBtn.innerHTML = PLUS_ICON_SVG;
    addBtn.dataset.tooltip = 'Выбрать формат';
  }
  // Strip native browser tooltip now that data-tooltip owns the text
  addBtn.removeAttribute('title');
}

/**
 * Add product to cart from a product card
 */
function addToCartFromCard(product, format) {
  const displayProperty = getDisplayProperty(product, format);
  const key = `${product.id}_${displayProperty}`;

  const imagesMap = getImagesMap();
  let images = imagesMap.get(product.id) || [];
  const filtered = filterImagesByExtra(images, ['сборка обложки', 'варианты', 'приближение']);
  let productImage = 'https://placeholder.com/200x240';
  if (filtered.length > 0) {
    productImage = typeof filtered[0] === 'string' ? filtered[0] : filtered[0].url || filtered[0];
  } else if (product.image) {
    productImage = product.image;
  }

  const limits = AppSettings.getCartLimits();
  const unitPrice = getProductPrice(product, displayProperty) || 0;
  const currentTotal = typeof window.cartModule?.getCartTotal === 'function' ? window.cartModule.getCartTotal() : 0;

  if (limits.max_cart_total > 0 && currentTotal + unitPrice > limits.max_cart_total) {
    if (typeof window.showToast === 'function') {
      window.showToast(`Сумма <a href="/cart">корзины</a> не может превышать ${formatNumberRussian(limits.max_cart_total)}\u00a0₽`, 'error', 3000, true);
    }
    return;
  }

  if (!window.cart[key]) {
    window.cart[key] = {
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
  } else {
    window.cart[key].quantity++;
  }

  saveCartFromGrid();
}

/**
 * Refresh in-cart counters in a card's format dropdown.
 * When a format is in cart, replaces the price with a proper − N + counter.
 */
function refreshFormatDropdownCounts(card, product) {
  const formatDropdown = card.querySelector('.card-format-dropdown');
  if (!formatDropdown) return;

  const isOriginal = product.type === 'оригинал';
  const variations = isOriginal ? getCartVariations() : null;

  formatDropdown.querySelectorAll('.card-format-option').forEach(btn => {
    const fmt = btn.dataset.format;
    const dp = getDisplayProperty(product, fmt);
    const ck = `${product.id}_${dp}`;
    const qty = window.cart[ck] ? window.cart[ck].quantity : 0;
    const priceSpan = btn.querySelector('.card-format-price');
    const counter = btn.querySelector('.card-format-counter');
    const label = btn.querySelector('.card-format-label');
    const varRow = btn.querySelector('.card-format-var-row');

    if (qty > 0) {
      // Hide price, show counter (both always in DOM for stable column width)
      btn.classList.add('in-cart');
      if (priceSpan) priceSpan.style.visibility = 'hidden';
      if (counter) {
        counter.style.visibility = '';
        counter.querySelector('.card-format-qty').textContent = qty;
      }
      if (isOriginal && label) label.style.visibility = 'hidden';
      if (isOriginal && varRow) {
        varRow.style.visibility = '';
        const input = varRow.querySelector('.card-format-var-input');
        if (input) input.value = variations[ck] || '';
      }
    } else {
      // Show price, hide counter
      btn.classList.remove('in-cart');
      if (priceSpan) priceSpan.style.visibility = '';
      if (counter) counter.style.visibility = 'hidden';
      if (isOriginal && label) label.style.visibility = '';
      if (isOriginal && varRow) varRow.style.visibility = 'hidden';
    }
  });
}

/**
 * Update the card's price row when any format is in cart.
 * Replaces price with "в корзине" text and makes the price-row section
 * act as a big button that opens the format dropdown.
 */
function updateCardCartView(card, product) {
  const priceRow = card.querySelector('.price-row');
  if (!priceRow) return;

  const priceEl = priceRow.querySelector('.price');

  // Check if ANY format of this product is in cart
  const fmtOptions = product.triptych ? triptychFormatOptions : formatOptions;
  const hasAnyInCart = fmtOptions.some(opt => {
    const dp = getDisplayProperty(product, opt.value);
    const key = `${product.id}_${dp}`;
    return window.cart[key] && window.cart[key].quantity > 0;
  });

  let inCartText = priceRow.querySelector('.card-in-cart-text');

  if (hasAnyInCart) {
    card.classList.add('has-cart-items');
    if (priceEl) priceEl.style.display = 'none';
    if (!inCartText) {
      inCartText = document.createElement('div');
      inCartText.className = 'card-in-cart-text';
      inCartText.textContent = 'В корзине';
      inCartText.dataset.tooltip = 'Перейти в корзину';
      // Insert before the + button so text appears on the left
      const addBtnEl = priceRow.querySelector('.price-row-add-btn');
      if (addBtnEl) {
        priceRow.insertBefore(inCartText, addBtnEl);
      } else {
        priceRow.appendChild(inCartText);
      }
    }

    // Set up price-row click interceptor (once) — navigate to cart page
    if (!priceRow._cartClickSet) {
      priceRow._cartClickSet = true;
      priceRow.addEventListener('click', (e) => {
        if (!card.classList.contains('has-cart-items')) return;
        // Don't intercept clicks on the + button (it has its own handler)
        if (e.target.closest('.price-row-add-btn')) return;
        e.preventDefault();
        e.stopPropagation();
        // Navigate to cart via SPA router (create temporary link for router interception)
        const a = document.createElement('a');
        a.href = '/cart';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
      });
    }
  } else {
    card.classList.remove('has-cart-items');
    if (priceEl) priceEl.style.display = '';
    if (inCartText) inCartText.remove();
  }

  // Update add-btn icon when dropdown is closed (don't override chevron-down while open)
  const dropdownOpen = card.querySelector('.card-format-dropdown.active');
  if (!dropdownOpen) {
    const addBtnEl = priceRow.querySelector('.price-row-add-btn');
    setAddBtnIcon(addBtnEl, hasAnyInCart ? 'chevron-up' : 'plus');
  }
}

/**
 * Reset all other carousels to first slide
 * @param {HTMLElement} currentCard - Current card element
 */
function resetOtherCarousels(currentCard) {
  activeCarousels.forEach(card => {
    if (card !== currentCard) {
      const carousel = card.querySelector('.image-carousel') || card.querySelector('.favorite-item-image-carousel');
      if (!carousel) return;

      const slides = carousel.querySelector('.slides');
      const resetIndicators = card.querySelectorAll('.indicator');

      if (slides) {
        slides.style.transform = 'translateX(0%)';
      }
      if (resetIndicators) {
        resetIndicators.forEach((d, i) => d.classList.toggle('active', i === 0));
      }

      activeCarousels.delete(card);
    }
  });
}

/**
 * Build hover zones for desktop carousel navigation
 * @param {HTMLElement} card - Card element
 * @param {number} imagesLength - Number of images
 * @param {Function} setSlide - Function to set slide index
 */
function buildHoverZones(card, imagesLength, setSlide) {
  card.querySelectorAll('.hover-zone').forEach(z => z.remove());
  if (imagesLength <= 1) return;

  const zoneWidthPercent = 100 / imagesLength;
  const productLink = card.querySelector('.product-card-inner');
  const productUrl = productLink ? productLink.href : '#';

  for (let i = 0; i < imagesLength; i++) {
    // Use <a> tag so native context menu shows "Open link in new tab" option
    const zone = document.createElement('a');
    zone.className = 'hover-zone';
    zone.href = productUrl;
    zone.style.left = `calc(${zoneWidthPercent * i}% + 6px)`;
    zone.style.right = '6px';
    zone.style.width = `${zoneWidthPercent}%`;
    zone.addEventListener('mouseenter', () => setSlide(i));

    // Handle regular clicks - navigate via SPA router if available
    zone.addEventListener('click', (e) => {
      // Let modifier clicks (ctrl, cmd, shift) and middle click work naturally for <a> tags
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) {
        return; // Browser handles these natively for <a> tags
      }
      // Regular click - use SPA navigation if onclick handler exists on productLink
      if (productLink && productLink.onclick) {
        e.preventDefault();
        productLink.click();
      }
      // Otherwise let the <a> tag navigate naturally
    });

    card.appendChild(zone);
  }
}

/**
 * Creates a product card element with carousel, favorites, and click handlers
 * @param {Object} product - Product object from database
 * @param {Object} options - Configuration options
 * @param {string} options.defaultProperty - Default size property (e.g., 'A3 без рамки')
 * @param {Array<string>} options.gridExtras - Image extra types to filter (e.g., ['сборка обложки', 'варианты', 'приближение'])
 * @param {Function} options.onClick - Custom click handler for the card
 * @param {Function} options.onFavoriteClick - Custom favorite button handler
 * @param {number} options.cardIndex - Position in grid for loading prioritization (0-based)
 * @returns {HTMLElement} Product card element
 */
function createProductCard(product, options = {}) {
  // Default options
  // cardIndex defaults to 999 so standalone calls (infinite scroll, etc.) use lazy loading
  const {
    defaultProperty = 'A3 без рамки',
    gridExtras = ['сборка обложки', 'варианты', 'приближение'],
    onClick = null,
    onFavoriteClick = null,
    cardIndex = 999
  } = options;

  // Get product images - always use window global for consistency during SPA navigation
  const imagesMap = getImagesMap();
  let images = (imagesMap.get(product.id) || []).filter(img => !(typeof img === 'object' && img.hidden));

  const filtered = filterImagesByExtra(images, gridExtras);

  if (!filtered.length) {
    images = [product.image || 'https://placeholder.com/300x400?text=No+Image'];
  } else {
    images = filtered;
  }

  const gridImages = images.map(img => {
    const url = typeof img === 'string' ? img : (img.url || img);
    return addImageSize(url, '480x0');
  });

  const rawImageUrls = images.map(img => typeof img === 'string' ? img : (img.url || img));

  // Build image slides HTML
  const altText = (product.alt || product.title || '').replace(/"/g, '&quot;');
  const imageSlides = gridImages.map((imgUrl) => {
    return `<div class="slide"><img src="${imgUrl}" alt="${altText}"></div>`;
  }).join('');

  // Build indicators HTML
  const indicators = gridImages.map((_, idx) =>
    `<span class="indicator${idx === 0 ? ' active' : ''}" data-index="${idx}"></span>`
  ).join('');

  // Calculate price
  const price = getProductPrice(product, defaultProperty);
  const oldPrice = getProductOldPrice(product, defaultProperty);

  let priceBlock;
  // Custom product (id=1) shows navigation link instead of price
  if (product.id === CUSTOM_PRODUCT_ID) {
    priceBlock = '<div class="price price-go-label">Перейти</div>';
  } else if (product.status === 'coming_soon') {
    const notifyList = getNotifyList();
    const isNotified = notifyList.has(product.id);
    priceBlock = isNotified
      ? '<div class="price notify-waiting" data-tooltip="Перейти к списку ожидаемого">В ожидании</div>'
      : '<div class="price">Скоро</div>';
  } else if (!price || price === 0) {
    priceBlock = '<div class="price">Цена не указана</div>';
  } else if (product.discount && oldPrice && oldPrice !== price) {
    priceBlock = `<div class="price"><span>${formatNumberRussian(price)} ₽</span> <span class="disabled">${formatNumberRussian(oldPrice)} ₽</span></div>`;
  } else {
    priceBlock = `<div class="price">${formatNumberRussian(price)} ₽</div>`;
  }

  // Check if product has variants (available_via_var linked products)
  const variants = getProductVariants(product.id);
  let variantToggleHtml = '';
  let variantMenuHtml = '';

  if (variants && variants.length > 1) {
    // Find current product's index in variants
    const currentIndex = variants.findIndex(v => v.product_id === product.id);
    const currentVarLabel = currentIndex >= 0
      ? (variants[currentIndex].variant_name || `вар. ${currentIndex + 1}`)
      : 'вар. 1';

    // Build dropdown options
    const variantOptions = variants.map((v, idx) => {
      const label = v.variant_name || `вар. ${idx + 1}`;
      const isCurrent = v.product_id === product.id;
      return `<button class="variant-option${isCurrent ? ' active' : ''}" data-product-id="${v.product_id}" data-index="${idx}">${label}</button>`;
    }).join('');

    // Toggle button (goes in button group)
    variantToggleHtml = `
      <button class="variant-dropdown-toggle" data-tooltip="Изменить вариант">
        <svg width="14" height="14" viewBox="0 0 64 64"><use href="#var-hashtag"></use></svg>
      </button>
    `;

    // Menu (goes outside button group, direct child of card)
    variantMenuHtml = `
      <div class="variant-dropdown-menu">
        <div class="variant-dropdown-header">Выбрать вариант</div>
        <div class="variant-dropdown-options">
          ${variantOptions}
        </div>
      </div>
    `;
  }

  // Build format dropdown for add-to-cart
  // Custom products (id=1 and status='custom') don't get an add-to-cart button
  const isCustomForCart = product.id === CUSTOM_PRODUCT_ID || product.status === 'custom';
  const isAvailableForCart = !isCustomForCart && product.status !== 'coming_soon' && price && price > 0;
  let priceRowAddHtml = '';
  let formatDropdownHtml = '';
  const isOriginalProduct = product.type === 'оригинал';

  if (isAvailableForCart) {
    const fmtOptions = product.triptych ? triptychFormatOptions : formatOptions;
    const currentVariations = isOriginalProduct ? getCartVariations() : {};
    const formatOptionButtons = fmtOptions.map((opt) => {
      const displayProp = getDisplayProperty(product, opt.value);
      const fmtPrice = getProductPrice(product, opt.value);
      const priceLabel = fmtPrice ? `${formatNumberRussian(fmtPrice)} ₽` : '';
      const inCartKey = `${product.id}_${displayProp}`;
      const inCartQty = window.cart && window.cart[inCartKey] ? window.cart[inCartKey].quantity : 0;
      // Counter always in DOM to lock grid column width; toggle visibility
      const priceVis = inCartQty > 0 ? ' style="visibility:hidden"' : '';
      const counterVis = inCartQty > 0 ? '' : ' style="visibility:hidden"';
      const inCartClass = inCartQty > 0 ? ' in-cart' : '';
      // For оригинальный products: show variation input when in cart, hide label
      const labelVis = (isOriginalProduct && inCartQty > 0) ? ' style="visibility:hidden"' : '';
      const varRowVis = (isOriginalProduct && inCartQty > 0) ? '' : ' style="visibility:hidden"';
      const varNum = (isOriginalProduct && inCartQty > 0) ? (currentVariations[inCartKey] || '') : '';
      const varRowHtml = isOriginalProduct
        ? `<span class="card-format-var-row" data-tooltip="Указать вариант"${varRowVis}><span class="card-format-var-label">вар.</span><input class="card-format-var-input" type="text" inputmode="numeric" maxlength="2" value="${varNum}" data-var-key="${inCartKey}"/></span>`
        : '';
      return `<button class="card-format-option${inCartClass}" data-format="${opt.value}"><span class="card-format-label"${labelVis}>${opt.label}</span>${varRowHtml}<span class="card-format-price"${priceVis}>${priceLabel}</span><span class="card-format-counter"${counterVis}><span class="card-format-minus" title="Убрать">−</span><span class="card-format-qty">${inCartQty || 0}</span><span class="card-format-plus" title="Добавить">+</span></span></button>`;
    }).join('');

    priceRowAddHtml = `<div class="price-row-add-btn" title="Добавить в корзину"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></div>`;

    formatDropdownHtml = `
      <div class="card-format-dropdown">
        <div class="card-format-header">Выбрать формат</div>
        <div class="card-format-options">
          ${formatOptionButtons}
        </div>
      </div>
    `;
  } else if (product.status === 'coming_soon') {
    const notifyList = getNotifyList();
    const isNotified = notifyList.has(product.id);
    priceRowAddHtml = `<div class="price-row-notify-btn${isNotified ? ' notified' : ''}" data-tooltip="Уведомить о поступлении">${NOTIFY_BELL_SVG}</div>`;
  }

  const isSpecialProduct = product.type === 'фирменный';
  const isFavorite = window.favorites && window.favorites.has(product.id);

  // Use slug if available, otherwise fall back to id
  const productParam = product.slug || product.id;
  const productUrl = "/product?id=" + productParam;

  // Create card element
  const card = document.createElement('div');
  const isComingSoon = product.status === 'coming_soon';
  const isTest = product.status === 'test';
  card.className = 'product' + (isSpecialProduct ? ' special-product' : '') + (isComingSoon ? ' coming-soon' : '') + (isTest ? ' test-product' : '');
  card.setAttribute('data-product-id', product.id);
  // Store product reference for cartUpdated sync
  card._product = product;

  // Add data attributes for sort scrubber navigation
  if (product.created_at) {
    card.setAttribute('data-created-at', product.created_at);
  }
  if (product.release_date) {
    card.setAttribute('data-release-date', product.release_date);
  }
  if (product.development_time !== undefined && product.development_time !== null) {
    card.setAttribute('data-development-time', product.development_time);
  }

  // Get product title (respects emergency mode)
  const displayTitle = AppSettings.getProductTitle(product);

  card.innerHTML = `
    <a href="${productUrl}" class="product-card-inner">
      <div class="image-carousel" data-count="${gridImages.length}">
        <div class="slides">${imageSlides}</div>
      </div>
      <div class="indicators">${indicators}</div>
      <h3>${displayTitle}</h3>
      <div class="price-row">
        ${priceBlock}
        ${priceRowAddHtml}
      </div>
    </a>
    <div class="product-card-buttons">
      ${product.id !== 1 ? `<button class="favorite-button btn-favorite ${isFavorite ? 'is-favorite' : ''}" title="${isFavorite ? 'Убрать из избранного' : 'В избранное'}">
        <svg width="14" height="14"><use href="#heart"></use></svg>
      </button>` : ''}
      ${product.id !== 1 ? `<button class="zoom-button btn-zoom" title="Приблизить">
        <svg width="13" height="13"><use href="#search"></use></svg>
      </button>` : ''}
      ${variantToggleHtml}
    </div>
    ${variantMenuHtml}
    ${formatDropdownHtml}
  `;

  // Handle onClick if provided
  if (onClick) {
    card.querySelector('a').addEventListener('click', (e) => {
      // Allow middle-click, right-click, and modifier keys (Ctrl/Cmd/Shift) to work normally
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) {
        return;
      }

      e.preventDefault();
      onClick(product);
    });
  }

  // Carousel setup
  const carousel = card.querySelector('.image-carousel');
  const slidesContainer = carousel.querySelector('.slides');
  const slides = carousel.querySelectorAll('.slide');
  const indicatorEls = card.querySelectorAll('.indicators .indicator');
  const favoriteBtn = card.querySelector('.favorite-button');
  let currentIndex = 0;

  // Image load handlers — make images visible once loaded.
  slides.forEach(slide => {
    const img = slide.querySelector('img');
    if (img) {
      if (img.complete && img.naturalHeight !== 0) {
        img.classList.add('loaded');
      } else {
        img.addEventListener('load', () => img.classList.add('loaded'));
        img.addEventListener('error', () => {
          const originalSrc = img.src;
          if (isVkCdnUrl(originalSrc) && !originalSrc.includes('/api/img')) {
            img.src = proxyVkCdnUrl(originalSrc);
            img.addEventListener('error', () => {
              img.classList.add('loaded');
              createImageReloadOverlay(img, originalSrc, slide);
            }, { once: true });
          } else {
            img.classList.add('loaded');
            createImageReloadOverlay(img, originalSrc, slide);
          }
        }, { once: true });
        // Fallback: reveal image after 5 s even if load/error never fires
        setTimeout(() => {
          if (!img.classList.contains('loaded')) img.classList.add('loaded');
        }, 5000);
      }
    }
  });

  // Favorite button handler - prevent link navigation and toggle favorite
  favoriteBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onFavoriteClick) {
      onFavoriteClick(product.id);
    } else {
      toggleFavoriteSynced(product.id);
    }
  });

  // Zoom button handler - open zoom popup at first image
  const zoomBtn = card.querySelector('.zoom-button');
  zoomBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (window.openZoom) {
      const productInfoArr = rawImageUrls.map(() => ({ title: displayTitle, id: product.id, slug: product.slug }));
      window.openZoom(rawImageUrls, 0, productInfoArr);
    }
  });

  // Fade carousel for custom product (id=1): cross-fade images with timed cycling
  if (product.id === CUSTOM_PRODUCT_ID && slides.length > 1) {
    carousel.classList.add('fade-carousel');
    card.classList.add('custom-product-card');
    slides[0].classList.add('fade-active');

    // Wrap indicators in a scrolling track when there are many images
    let indicatorsTrack = null;
    const indicatorsContainer = card.querySelector('.indicators');
    if (slides.length > 5 && indicatorsContainer) {
      indicatorsTrack = document.createElement('div');
      indicatorsTrack.className = 'indicators-track';
      while (indicatorsContainer.firstChild) {
        indicatorsTrack.appendChild(indicatorsContainer.firstChild);
      }
      indicatorsContainer.appendChild(indicatorsTrack);
    }

    const centerIndicator = (index) => {
      if (!indicatorsTrack || !indicatorsContainer) return;
      const dotW = 8, activeW = 16, gap = 4;
      let pos = 0;
      for (let i = 0; i < index; i++) pos += dotW + gap;
      pos += activeW / 2;
      const offset = indicatorsContainer.clientWidth / 2 - pos;
      indicatorsTrack.style.transform = `translateX(${offset}px)`;
    };
    centerIndicator(0);

    let fadeIndex = 0;
    let fadeHovered = false;
    const cycleFade = () => {
      // First image stays 5s, rest cycle every 2s
      const delay = fadeIndex === 0 ? 5000 : 2000;
      carousel._fadeTimeout = setTimeout(() => {
        if (fadeHovered) return;
        slides[fadeIndex].classList.remove('fade-active');
        fadeIndex = (fadeIndex + 1) % slides.length;
        slides[fadeIndex].classList.add('fade-active');
        indicatorEls.forEach((d, i) => d.classList.toggle('active', i === fadeIndex));
        centerIndicator(fadeIndex);
        cycleFade();
      }, delay);
    };
    cycleFade();

    // Pause auto-cycle on hover
    card.addEventListener('mouseenter', () => {
      fadeHovered = true;
      clearTimeout(carousel._fadeTimeout);
    });
    card.addEventListener('mouseleave', () => {
      fadeHovered = false;
      cycleFade();
    });

    // Indicator click handlers for fade carousel
    indicatorEls.forEach(indicator => {
      indicator.addEventListener('click', (e) => {
        e.stopPropagation();
        clearTimeout(carousel._fadeTimeout);
        slides[fadeIndex].classList.remove('fade-active');
        fadeIndex = Number(indicator.dataset.index);
        slides[fadeIndex].classList.add('fade-active');
        indicatorEls.forEach((d, i) => d.classList.toggle('active', i === fadeIndex));
        centerIndicator(fadeIndex);
        if (!fadeHovered) cycleFade();
      });
    });
  } else {
    // Normal carousel: slide with transform
    const setSlide = (idx) => {
      if (idx !== 0) {
        resetOtherCarousels(card);
        activeCarousels.add(card);
      }

      if (idx < 0) {
        currentIndex = slides.length - 1;
      } else if (idx >= slides.length) {
        currentIndex = 0;
      } else {
        currentIndex = idx;
      }

      slidesContainer.style.transform = `translateX(-${currentIndex * 100}%)`;
      indicatorEls.forEach((d, i) => d.classList.toggle('active', i === currentIndex));
    };

    // Indicator click handlers
    indicatorEls.forEach(indicator => {
      indicator.addEventListener('click', (e) => {
        e.stopPropagation();
        setSlide(Number(indicator.dataset.index));
      });
    });

    // Touch swipe handlers for mobile
    let touchStartX = 0;
    let touchEndX = 0;

    carousel.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].clientX;
      // Disable transition during touch for immediate response (prevents flicker)
      carousel.classList.add('touching');
    }, { passive: true });

    carousel.addEventListener('touchmove', () => {
      // Keep touching class during move
      if (!carousel.classList.contains('touching')) {
        carousel.classList.add('touching');
      }
    }, { passive: true });

    carousel.addEventListener('touchend', (e) => {
      touchEndX = e.changedTouches[0].clientX;
      const dx = touchEndX - touchStartX;
      // Re-enable transition BEFORE setting slide for smooth animation
      carousel.classList.remove('touching');
      if (Math.abs(dx) > 30) {
        card._navigate(dx < 0 ? 1 : -1);
      }
    }, { passive: true });

    carousel.addEventListener('touchcancel', () => {
      carousel.classList.remove('touching');
    }, { passive: true });

    // Store navigate fn so touch handlers stay in sync after variant switches
    card._navigate = (dir) => setSlide(currentIndex + dir);

    // Build hover zones for desktop
    buildHoverZones(card, gridImages.length, setSlide);
  }

  // Variant dropdown handlers (toggle in button group, menu as card child)
  const variantToggle = card.querySelector('.variant-dropdown-toggle');
  const variantMenu = card.querySelector('.variant-dropdown-menu');
  if (variantToggle && variantMenu && variants) {
    const variantOptions = variantMenu.querySelectorAll('.variant-option');

    // Toggle dropdown on button click
    variantToggle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const isCurrentlyOpen = variantMenu.classList.contains('active');

      // Close all other dropdowns (format, variant, tag) on all cards
      document.querySelectorAll('.card-format-dropdown.active, .variant-dropdown-menu.active, .tag-dropdown.active').forEach(dropdown => {
        if (dropdown !== variantMenu) {
          dropdown.classList.remove('active');
          // Also remove format-open class from cards
          const parentCard = dropdown.closest('.product');
          if (parentCard) {
            parentCard.classList.remove('format-open');
          }
        }
      });

      // Toggle this dropdown
      variantMenu.classList.toggle('active', !isCurrentlyOpen);

      // Update tooltip based on state
      if (!isCurrentlyOpen) {
        variantToggle.dataset.tooltip = 'Скрыть';

        setTimeout(() => {
          const headerHeight = document.querySelector('.header')?.offsetHeight || 60;
          const rect = variantMenu.getBoundingClientRect();
          const viewportHeight = window.innerHeight;
          const isAboveViewport = rect.top < headerHeight;
          const isBelowViewport = rect.bottom > viewportHeight;
          if (isAboveViewport || isBelowViewport) {
            if (isBelowViewport) {
              const bottomNavEl = window.innerWidth <= 1024 ? document.querySelector('.bottom-nav') : null;
              const bottomNavHeight = bottomNavEl ? bottomNavEl.offsetHeight : 0;
              window.scrollTo({ top: window.pageYOffset + rect.bottom - viewportHeight + 20 + bottomNavHeight, behavior: 'smooth' });
            } else {
              window.scrollTo({ top: window.pageYOffset + rect.top - headerHeight - 10, behavior: 'smooth' });
            }
          }
        }, 100);
      } else {
        variantToggle.dataset.tooltip = 'Изменить вариант';
      }
    });

    // Handle variant selection
    variantOptions.forEach(optionBtn => {
      optionBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const selectedProductId = parseInt(optionBtn.dataset.productId);
        if (selectedProductId === parseInt(card.getAttribute('data-product-id'))) {
          variantMenu.classList.remove('active');
          return; // Already showing this variant
        }

        const selectedVariant = variants.find(v => v.product_id === selectedProductId);
        if (!selectedVariant) {
          variantMenu.classList.remove('active');
          return;
        }

        // Update the card content with the selected variant
        updateCardWithVariant(card, selectedVariant, variants, options);
        variantMenu.classList.remove('active');
      });
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!variantToggle.contains(e.target) && !variantMenu.contains(e.target)) {
        variantMenu.classList.remove('active');
      }
    });
  }

  // Format dropdown (add to cart) handlers
  const addBtn = card.querySelector('.price-row-add-btn');
  const formatDropdown = card.querySelector('.card-format-dropdown');
  if (addBtn && formatDropdown) {
    const openFormatDropdown = () => {
      // Close all other dropdowns (format, variant, tag) on all cards
      document.querySelectorAll('.card-format-dropdown.active, .variant-dropdown-menu.active, .tag-dropdown.active').forEach(d => {
        if (d !== formatDropdown) {
          const otherCard = d.closest('.product');
          d.classList.remove('active');
          otherCard?.classList.remove('format-open');
          // Update other card's add-btn icon: chevron-up if has items, else plus
          const otherBtn = otherCard?.querySelector('.price-row-add-btn');
          setAddBtnIcon(otherBtn, otherCard?.classList.contains('has-cart-items') ? 'chevron-up' : 'plus');
        }
      });
      refreshFormatDropdownCounts(card, product);
      card.classList.add('format-open');
      formatDropdown.classList.add('active');
      setAddBtnIcon(addBtn, 'chevron-down');

      setTimeout(() => {
        const headerHeight = document.querySelector('.header')?.offsetHeight || 60;
        const rect = formatDropdown.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const isAboveViewport = rect.top < headerHeight;
        const isBelowViewport = rect.bottom > viewportHeight;
        if (isAboveViewport || isBelowViewport) {
          if (isBelowViewport) {
            const bottomNavEl = window.innerWidth <= 1024 ? document.querySelector('.bottom-nav') : null;
            const bottomNavHeight = bottomNavEl ? bottomNavEl.offsetHeight : 0;
            window.scrollTo({ top: window.pageYOffset + rect.bottom - viewportHeight + 20 + bottomNavHeight, behavior: 'smooth' });
          } else {
            window.scrollTo({ top: window.pageYOffset + rect.top - headerHeight - 10, behavior: 'smooth' });
          }
        }
      }, 100);
    };

    const closeFormatDropdown = () => {
      const wasOpen = formatDropdown.classList.contains('active');
      formatDropdown.classList.remove('active');
      card.classList.remove('format-open');
      if (wasOpen) {
        // Chevron-up if this product has items in cart, otherwise revert to plus
        setAddBtnIcon(addBtn, card.classList.contains('has-cart-items') ? 'chevron-up' : 'plus');
      }
    };

    // Debounce to prevent race condition on rapid clicks
    let lastToggleTime = 0;
    addBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const now = Date.now();
      if (now - lastToggleTime < 50) return;
      lastToggleTime = now;
      if (formatDropdown.classList.contains('active')) {
        closeFormatDropdown();
      } else {
        openFormatDropdown();
      }
    });

    // Handle clicks inside format dropdown via event delegation
    // Supports: format option click (add to cart), counter minus/plus clicks
    formatDropdown.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Variation input clicks must not trigger format selection
      if (e.target.closest('.card-format-var-input')) return;

      const minusBtn = e.target.closest('.card-format-minus');
      const plusBtn = e.target.closest('.card-format-plus');
      const optBtn = e.target.closest('.card-format-option');
      if (!optBtn) return;

      const format = optBtn.dataset.format;
      const dp = getDisplayProperty(product, format);
      const key = `${product.id}_${dp}`;

      if (minusBtn) {
        // Decrement or remove from cart
        if (window.cart[key]) {
          if (window.cart[key].quantity > 1) {
            window.cart[key].quantity--;
          } else {
            delete window.cart[key];
          }
          saveCartFromGrid();
          refreshFormatDropdownCounts(card, product);
          updateCardCartView(card, product);
        }
      } else if (plusBtn) {
        // Increment in cart
        addToCartFromCard(product, format);
        refreshFormatDropdownCounts(card, product);
        updateCardCartView(card, product);
      } else {
        // On mobile touch: if format is already in cart, label click should not increment —
        // only the counter's + button should.
        if (window.matchMedia('(hover: none) and (pointer: coarse)').matches && optBtn.classList.contains('in-cart')) {
          return;
        }
        addToCartFromCard(product, format);
        refreshFormatDropdownCounts(card, product);
        updateCardCartView(card, product);
      }
    });

    // Close format dropdown when clicking outside add button and dropdown
    document.addEventListener('click', (e) => {
      if (!addBtn.contains(e.target) && !formatDropdown.contains(e.target)) {
        closeFormatDropdown();
      }
    });

    // Variation input listeners for оригинальный products
    if (isOriginalProduct) {
      formatDropdown.querySelectorAll('.card-format-var-input').forEach(input => {
        input.addEventListener('click', e => { e.stopPropagation(); });
        input.addEventListener('input', () => {
          input.value = input.value.replace(/[^0-9]/g, '').slice(0, 2);
        });
        input.addEventListener('change', () => {
          saveCartVariation(input.dataset.varKey, input.value);
        });
        input.addEventListener('blur', () => {
          if (!input.value) {
            saveCartVariation(input.dataset.varKey, '');
          }
        });
      });
    }

    // Check if product is already in cart for any format and show "в корзине" button
    if (window.cart) {
      updateCardCartView(card, product);
    }
  }

  // Notify button handler for coming_soon products
  const notifyBtn = card.querySelector('.price-row-notify-btn');
  if (notifyBtn) {
    notifyBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const notifyList = getNotifyList();
      const productId = parseInt(card.getAttribute('data-product-id'));
      const isNotified = notifyList.has(productId);

      const priceEl = card.querySelector('.price-row .price');

      if (!isNotified) {
        notifyList.add(productId);
        saveNotifyList(notifyList);
        notifyBtn.classList.add('notified');
        notifyBtn.dataset.tooltip = 'Отменить уведомление';

        if (priceEl) {
          priceEl.textContent = 'В ожидании';
          priceEl.classList.add('notify-waiting');
          priceEl.dataset.tooltip = 'Перейти к списку ожидаемого';
          if (!priceEl._notifyWaitingClickSet) {
            priceEl._notifyWaitingClickSet = true;
            priceEl.addEventListener('click', (ev) => {
              if (!priceEl.classList.contains('notify-waiting')) return;
              ev.preventDefault();
              ev.stopPropagation();
              const a = document.createElement('a');
              a.href = '/profile';
              a.style.display = 'none';
              document.body.appendChild(a);
              a.click();
              a.remove();
            });
          }
        }

        if (typeof window.showToast === 'function') {
          window.showToast('Вы подписались на уведомление о поступлении', 'success');
        }
      } else {
        notifyList.delete(productId);
        saveNotifyList(notifyList);
        notifyBtn.classList.remove('notified');
        notifyBtn.dataset.tooltip = 'Уведомить о поступлении';

        if (priceEl) {
          priceEl.textContent = 'Скоро';
          priceEl.classList.remove('notify-waiting');
          delete priceEl.dataset.tooltip;
        }

        if (typeof window.showToast === 'function') {
          window.showToast('Вы отписались от уведомления', 'info');
        }
      }
    });
  }

  return card;
}

/**
 * Update a product card's content with a new variant's data
 * @param {HTMLElement} card - The card element to update
 * @param {Object} variant - The variant product data
 * @param {Array} allVariants - All variants in the group
 * @param {Object} options - Card options
 */
function updateCardWithVariant(card, variant, allVariants, options = {}) {
  const { defaultProperty = 'A3 без рамки', gridExtras = ['сборка обложки', 'варианты', 'приближение'] } = options;

  // Update card data attribute
  card.setAttribute('data-product-id', variant.product_id);

  // Update data attributes for sort scrubber navigation
  if (variant.created_at) {
    card.setAttribute('data-created-at', variant.created_at);
  }
  if (variant.release_date) {
    card.setAttribute('data-release-date', variant.release_date);
  }
  if (variant.development_time !== undefined && variant.development_time !== null) {
    card.setAttribute('data-development-time', variant.development_time);
  }

  // Update link URL
  const productLink = card.querySelector('.product-card-inner');
  const productParam = variant.slug || variant.product_id;
  productLink.href = `/product?id=${productParam}`;

  // Update title
  const titleEl = card.querySelector('h3');
  if (titleEl) {
    titleEl.textContent = AppSettings.getProductTitle(variant);
  }

  // Update images - prefer full image list from global map, fall back to variant.image
  const imagesMap = getImagesMap();
  let variantImages = (imagesMap.get(variant.product_id) || []).filter(img => !(typeof img === 'object' && img.hidden));
  const filtered = filterImagesByExtra(variantImages, gridExtras);
  if (!filtered.length && variant.image) {
    variantImages = [variant.image];
  } else if (filtered.length) {
    variantImages = filtered;
  } else if (variant.image) {
    variantImages = [variant.image];
  }

  const gridImages = variantImages.map(img => {
    const url = typeof img === 'string' ? img : (img.url || img);
    return addImageSize(url, '480x0');
  });

  const slidesContainer = card.querySelector('.slides');
  if (slidesContainer) {
    slidesContainer.style.transform = 'translateX(0%)';
    const varAlt = (variant.alt || variant.title || '').replace(/"/g, '&quot;');
    slidesContainer.innerHTML = gridImages.map(url => `<div class="slide"><img src="${url}" alt="${varAlt}"></div>`).join('');
    slidesContainer.querySelectorAll('.slide').forEach(slide => {
      const img = slide.querySelector('img');
      if (!img) return;
      if (img.complete && img.naturalHeight !== 0) {
        img.classList.add('loaded');
      } else {
        img.addEventListener('load', () => img.classList.add('loaded'));
        img.addEventListener('error', () => {
          const src = img.src;
          if (isVkCdnUrl(src) && !src.includes('/api/img')) {
            img.src = proxyVkCdnUrl(src);
            img.addEventListener('error', () => { img.classList.add('loaded'); createImageReloadOverlay(img, src, slide); }, { once: true });
          } else {
            img.classList.add('loaded');
            createImageReloadOverlay(img, src, slide);
          }
        }, { once: true });
      }
    });
  }

  // Update indicators
  const indicatorsContainer = card.querySelector('.indicators');
  if (indicatorsContainer) {
    indicatorsContainer.innerHTML = gridImages.map((_, idx) =>
      `<span class="indicator${idx === 0 ? ' active' : ''}" data-index="${idx}"></span>`
    ).join('');
  }

  // Update price
  const price = getProductPrice(variant, defaultProperty);
  const oldPrice = getProductOldPrice(variant, defaultProperty);
  const priceEl = card.querySelector('.price');

  if (priceEl) {
    if (variant.status === 'coming_soon') {
      priceEl.innerHTML = 'Скоро';
    } else if (!price || price === 0) {
      priceEl.innerHTML = 'Цена не указана';
    } else if (variant.discount && oldPrice && oldPrice !== price) {
      priceEl.innerHTML = `<span>${formatNumberRussian(price)} ₽</span> <span class="disabled">${formatNumberRussian(oldPrice)} ₽</span>`;
    } else {
      priceEl.innerHTML = `${formatNumberRussian(price)} ₽`;
    }
  }

  // Update variant dropdown label and active state
  const variantIdx = allVariants.findIndex(v => v.product_id === variant.product_id);
  const variantLabel = card.querySelector('.variant-label');
  if (variantLabel) {
    variantLabel.textContent = variant.variant_name || `вар. ${variantIdx + 1}`;
  }

  // Update active state in dropdown options
  card.querySelectorAll('.variant-option').forEach((opt, idx) => {
    opt.classList.toggle('active', parseInt(opt.dataset.productId) === variant.product_id);
  });

  // Update special product class
  card.classList.toggle('special-product', variant.type === 'фирменный');
  card.classList.toggle('coming-soon', variant.status === 'coming_soon');
  card.classList.toggle('test-product', variant.status === 'test');

  // Clear hover zones and rebuild with actual image count
  card.querySelectorAll('.hover-zone').forEach(z => z.remove());
  const productLink2 = card.querySelector('.product-card-inner');
  if (productLink2) {
    const carousel2 = card.querySelector('.image-carousel');
    if (carousel2 && gridImages.length > 1) {
      let currentIndex2 = 0;
      const slides2 = carousel2.querySelectorAll('.slide');
      const indicatorEls2 = card.querySelectorAll('.indicators .indicator');
      const slidesEl = carousel2.querySelector('.slides');

      const setSlide2 = (idx) => {
        if (idx < 0) currentIndex2 = slides2.length - 1;
        else if (idx >= slides2.length) currentIndex2 = 0;
        else currentIndex2 = idx;
        if (slidesEl) slidesEl.style.transform = `translateX(-${currentIndex2 * 100}%)`;
        indicatorEls2.forEach((d, i) => d.classList.toggle('active', i === currentIndex2));
      };

      indicatorEls2.forEach(ind => {
        ind.addEventListener('click', (e) => { e.stopPropagation(); setSlide2(Number(ind.dataset.index)); });
      });

      card._navigate = (dir) => setSlide2(currentIndex2 + dir);
      buildHoverZones(card, gridImages.length, setSlide2);
    }
  }
}

/**
 * Renders multiple product cards into a container
 * @param {HTMLElement} container - Container element to append cards to
 * @param {Array<Object>} products - Array of product objects
 * @param {Object} options - Configuration options (same as createProductCard)
 * @param {boolean} options.clearContainer - Whether to clear container first (default: true)
 * @param {Function} options.afterCardRender - Optional callback called after each card is rendered
 */
function renderProductGrid(container, products, options = {}) {
  const { clearContainer = true, afterCardRender, skipCustomPriority = false, ...cardOptions } = options;

  if (clearContainer) {
    // Clean up fade carousel timers before clearing
    container.querySelectorAll('.fade-carousel').forEach(c => {
      if (c._fadeTimeout) clearTimeout(c._fadeTimeout);
    });
    container.innerHTML = '';
  }

  if (products.length === 0) {
    const noResults = document.createElement('div');
    noResults.className = 'no-results';
    noResults.innerHTML = '<p>Ничего не найдено</p>';
    container.appendChild(noResults);
    return;
  }

  // Sort products with custom product first (unless sorting is being applied)
  const sortedProducts = window.sortProductsWithCustomFirst
    ? window.sortProductsWithCustomFirst(products, skipCustomPriority)
    : products;

  sortedProducts.forEach((product, index) => {
    const card = createProductCard(product, { ...cardOptions, cardIndex: index });
    container.appendChild(card);

    // Call afterCardRender callback if provided
    if (typeof afterCardRender === 'function') {
      afterCardRender(card, product);
    }
  });
}

/**
 * Remove product from cart or decrement quantity
 * Exported for use by other modules (e.g., header search)
 * @param {Object|number} product - Product object or product ID
 * @param {string} format - Format value
 */
function removeFromCart(product, format) {
  const productId = typeof product === 'object' ? product.id : product;
  const productObj = typeof product === 'object' ? product : { id: productId };
  const displayProperty = getDisplayProperty(productObj, format);
  const key = `${productId}_${displayProperty}`;

  if (window.cart[key]) {
    const removedItem = { ...window.cart[key] };
    const wasLastItem = window.cart[key].quantity === 1;

    if (window.cart[key].quantity > 1) {
      window.cart[key].quantity--;
      saveCartFromGrid();
    } else {
      delete window.cart[key];
      saveCartFromGrid();

      // Show toast with undo for last item removal
      if (typeof window.showToast === 'function') {
        window.showToast('Товар удалён из корзины', 'removed', 3000, false, {}, () => {
          window.cart[key] = removedItem;
          saveCartFromGrid();
          if (typeof window.showToast === 'function') {
            window.showToast('Товар восстановлен', 'success');
          }
        });
      }
    }
  }
}

// Sync all rendered product cards when cart is updated externally
// (e.g. header search format dropdown adds/removes items)
window.addEventListener('cartUpdated', () => {
  document.querySelectorAll('.product[data-product-id]').forEach(card => {
    if (card._product) {
      refreshFormatDropdownCounts(card, card._product);
      updateCardCartView(card, card._product);
    }
  });
});

// Export functions for use in other modules (window for legacy compatibility)
window.createProductCard = createProductCard;
window.renderProductGrid = renderProductGrid;
window.addToCart = addToCartFromCard;
window.removeFromCart = removeFromCart;

// ES module exports
export { createProductCard, renderProductGrid, addToCartFromCard as addToCart, removeFromCart };
