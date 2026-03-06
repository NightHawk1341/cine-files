// Product page format dropdown, price row, and cart action buttons
//
// Deps injected via initFormatDropdown():
//   saveCart                    - persist cart to localStorage
//   addToCartSynced             - add item to cart and sync
//   showToast                   - display toast notification
//   getCartVariations           - getter returning cartVariations object
//   getVariantCount             - getter returning currentVariantCount
//   renderCustomProductCombinations  - refresh custom combinations UI
//   renderOriginalProductCombinations - refresh original combinations UI

import {
  formatOptions,
  triptychFormatOptions,
  propertyDimensions,
  getProductProperty,
  getProductPrice,
  getProductOldPrice,
  formatNumberRussian,
} from './pricing.js';
import { CUSTOM_PRODUCT_ID } from '../../core/constants.js';
import { currentProduct } from './data.js';
import { isLoggedIn } from '../../core/auth.js';
import { isVKMiniApp } from '../../core/vk-miniapp.js';
import { showMobileModal } from '../../modules/mobile-modal.js';
import { getPendingImageForContext } from '../../modules/image-upload.js';

let _saveCart, _addToCartSynced, _showToast, _getCartVariations, _getVariantCount;
let _renderCustomProductCombinations, _renderOriginalProductCombinations;

export const initFormatDropdown = ({
  saveCart, addToCartSynced, showToast, getCartVariations, getVariantCount,
  renderCustomProductCombinations, renderOriginalProductCombinations,
}) => {
  _saveCart = saveCart;
  _addToCartSynced = addToCartSynced;
  _showToast = showToast;
  _getCartVariations = getCartVariations;
  _getVariantCount = getVariantCount;
  _renderCustomProductCombinations = renderCustomProductCombinations;
  _renderOriginalProductCombinations = renderOriginalProductCombinations;
};

export const getSelectedFormatValue = () => selectedFormatValue;

// Track currently selected format
let selectedFormatValue = null;

export const renderFormatDropdown = (product) => {
  const optionsContainer = document.getElementById('product-format-options');
  const priceRow = document.getElementById('product-price-row');
  const selectBtn = document.getElementById('product-format-select-btn');
  const dropdown = document.getElementById('product-format-dropdown');

  if (!optionsContainer || !priceRow || !selectBtn || !dropdown) return;

  optionsContainer.innerHTML = ''; // Clear options

  const options = product.triptych ? triptychFormatOptions : formatOptions;

  // If no format selected yet, default to A3 без рамки (always the default)
  if (!selectedFormatValue) {
    // Always default to A3 без рамки which is the standard format
    const defaultFormat = options.find(opt => opt.value === 'A3 без рамки');
    selectedFormatValue = defaultFormat ? defaultFormat.value : options[0].value;
  }

  // Build format options - simple list like grid's card-format-dropdown
  options.forEach((opt, idx) => {
    const optionBtn = document.createElement('button');
    optionBtn.className = 'product-format-option';
    optionBtn.dataset.formatValue = opt.value;

    // Check if this format is in cart
    const displayProperty = getProductProperty(product, opt.value);
    const cartKey = `${product.id}_${displayProperty}`;
    const inCart = !!window.cart[cartKey];
    const cartQuantity = inCart ? window.cart[cartKey]?.quantity : 0;

    // Add in-cart class for lighter background
    if (inCart) {
      optionBtn.classList.add('in-cart');
    }

    // Get format details
    const dimensions = propertyDimensions[opt.value] || '';
    const price = getProductPrice(product, opt.value);
    const oldPrice = getProductOldPrice(product, opt.value);
    const priceLabel = price ? `${formatNumberRussian(price)} ₽` : '';
    const oldPriceLabel = oldPrice ? `${formatNumberRussian(oldPrice)} ₽` : '';

    // Format option structure: name | dimensions | price (with counter if in cart)
    // Counter visibility toggled like grid, price hidden when counter visible
    const priceVis = inCart ? ' style="visibility:hidden"' : '';
    const counterVis = inCart ? '' : ' style="visibility:hidden"';

    optionBtn.innerHTML = `
      <span class="product-format-option-name">${opt.label}</span>
      <span class="product-format-option-dimensions">${dimensions}</span>
      <span class="product-format-option-price-wrapper"${priceVis}>
        ${oldPriceLabel ? `<span class="product-format-option-price-old">${oldPriceLabel}</span>` : ''}
        <span class="product-format-option-price">${priceLabel}</span>
      </span>
      <span class="product-format-option-counter"${counterVis}>
        <span class="product-format-counter-minus" title="Убрать">−</span>
        <span class="product-format-counter-qty">${cartQuantity || 0}</span>
        <span class="product-format-counter-plus" title="Добавить">+</span>
      </span>
    `;

    optionBtn.addEventListener('click', async (e) => {
      e.stopPropagation();

      const clickedElement = e.target;
      const displayProperty = getProductProperty(product, opt.value);
      const cartKey = `${product.id}_${displayProperty}`;

      // Handle counter button clicks (+ / -) — not used for custom product
      if (clickedElement.classList.contains('product-format-counter-minus')) {
        if (window.cart[cartKey]) {
          if (window.cart[cartKey].quantity > 1) {
            window.cart[cartKey].quantity--;
          } else {
            delete window.cart[cartKey];
          }
          _saveCart();
          updatePriceRow();
          renderFormatDropdown(product);
        }
        return;
      }

      if (clickedElement.classList.contains('product-format-counter-plus')) {
        if (window.cart[cartKey]) {
          window.cart[cartKey].quantity++;
          _saveCart();
          updatePriceRow();
          renderFormatDropdown(product);
        }
        return;
      }

      // Regular click — add to cart
      selectedFormatValue = opt.value;
      await _addToCartSynced(product.id, opt.value);

      if (product.id === CUSTOM_PRODUCT_ID) {
        // For custom product: close the format dropdown after adding combination
        const dropdown2 = document.getElementById('product-format-dropdown');
        const priceRow2 = document.getElementById('product-price-row');
        if (dropdown2) dropdown2.classList.remove('active');
        if (priceRow2) priceRow2.classList.remove('product-format-open');
        const chevron2 = document.getElementById('product-format-select-btn')?.querySelector('svg.product-format-select-chevron');
        if (chevron2) chevron2.classList.add('up');
        return;
      }

      // Keep dropdown open - just update the display
      updatePriceRow();
      renderFormatDropdown(product);
    });

    optionsContainer.appendChild(optionBtn);
  });

  // Format select button toggles dropdown
  // Remove old listeners by cloning the button
  const newSelectBtn = selectBtn.cloneNode(true);
  selectBtn.parentNode.replaceChild(newSelectBtn, selectBtn);

  newSelectBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = dropdown.classList.contains('active');

    // Check if ANY format is in cart
    const options = product.triptych ? triptychFormatOptions : formatOptions;
    const hasAnyInCart = options.some(opt => {
      const prop = getProductProperty(product, opt.value);
      const cartKey = `${product.id}_${prop}`;
      return !!window.cart[cartKey];
    });

    if (isOpen) {
      dropdown.classList.remove('active');
      priceRow.classList.remove('product-format-open');

      // Rotate chevron back up
      const chevron = newSelectBtn.querySelector('svg.product-format-select-chevron');
      if (chevron) {
        chevron.classList.add('up');
      }
    } else {
      dropdown.classList.add('active');
      priceRow.classList.add('product-format-open');

      // Rotate chevron down
      const chevron = newSelectBtn.querySelector('svg.product-format-select-chevron');
      if (chevron) {
        chevron.classList.remove('up');
      }

      // Only scroll if dropdown is not fully visible in viewport
      setTimeout(() => {
        const headerHeight = document.querySelector('.header')?.offsetHeight || 60;
        const rect = dropdown.getBoundingClientRect();
        const viewportHeight = window.innerHeight;

        // Check if dropdown is cut off or not visible
        const dropdownTop = rect.top;
        const dropdownBottom = rect.bottom;
        const isAboveViewport = dropdownTop < headerHeight;
        const isBelowViewport = dropdownBottom > viewportHeight;
        const isCutOff = isAboveViewport || isBelowViewport;

        // Only scroll if dropdown is not fully visible
        if (isCutOff) {
          if (isBelowViewport) {
            // Account for bottom nav on mobile
            const bottomNavEl = window.innerWidth <= 1024 ? document.querySelector('.bottom-nav') : null;
            const bottomNavHeight = bottomNavEl ? bottomNavEl.offsetHeight : 0;
            // Scroll just enough to reveal the bottom of the dropdown + 20px gap
            const scrollNeeded = dropdownBottom - viewportHeight + 20 + bottomNavHeight;
            window.scrollTo({
              top: window.pageYOffset + scrollNeeded,
              behavior: 'smooth'
            });
          } else {
            // Dropdown top is above header — scroll up to show it
            const absoluteTop = rect.top + window.pageYOffset;
            window.scrollTo({
              top: absoluteTop - headerHeight - 10,
              behavior: 'smooth'
            });
          }
        }
      }, 100); // Small delay to let dropdown expand first
    }
  });

  // Initialize price row
  updatePriceRow();
};

// Update price row based on cart status
export const updatePriceRow = () => {
  if (!currentProduct || !selectedFormatValue) return;

  const product = currentProduct;
  const format = selectedFormatValue;
  const displayProperty = getProductProperty(product, format);
  const key = `${product.id}_${displayProperty}`;

  const priceRow = document.getElementById('product-price-row');
  const priceInfo = document.getElementById('product-price-info');
  const priceCurrent = document.getElementById('product-price-current');
  const priceOld = document.getElementById('product-price-old');
  const cartStatusBtn = document.getElementById('product-cart-status-btn');
  const formatSelectBtn = document.getElementById('product-format-select-btn');
  const deleteBtn = document.getElementById('product-cart-delete-btn');

  if (!priceRow || !priceInfo || !priceCurrent || !cartStatusBtn || !formatSelectBtn || !deleteBtn) return;

  // Get price for selected format
  const price = getProductPrice(product, format);
  const oldPrice = getProductOldPrice(product, format);

  // Check if any format is in cart
  const isInCart = !!window.cart[key];

  if (isInCart) {
    // Show "В корзине" button, delete button, AND format select button with chevron
    priceRow.classList.add('has-cart-items');
    priceInfo.style.display = 'none';
    cartStatusBtn.style.display = 'flex';
    deleteBtn.style.display = 'flex'; // Show delete button after cart status
    formatSelectBtn.style.display = 'flex'; // Keep format select visible

    // Change format select button text when items in cart
    const dropdown = document.getElementById('product-format-dropdown');
    const isOpen = dropdown && dropdown.classList.contains('active');
    if (!isOpen) {
      // Update text to "Изменить формат" when items in cart
      const span = formatSelectBtn.querySelector('span');
      if (span) {
        span.textContent = 'Изменить формат';
      }
      // Ensure chevron is pointing up when closed
      const chevron = formatSelectBtn.querySelector('svg.product-format-select-chevron');
      if (chevron) {
        chevron.classList.add('up');
      }
    }

    // Cart status button navigates to cart
    cartStatusBtn.onclick = () => {
      window.location.href = '/cart';
    };

    // Delete button clears ALL formats from cart
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      // Get all format options and clear each from cart
      const options = product.triptych ? triptychFormatOptions : formatOptions;
      options.forEach(opt => {
        const prop = getProductProperty(product, opt.value);
        const cartKey = `${product.id}_${prop}`;
        if (window.cart[cartKey]) {
          delete window.cart[cartKey];
          const variationKey = `${product.id}_${prop}`;
          if (window.cartVariations) {
            delete window._getCartVariations()[variationKey];
          }
        }
      });

      // After clearing, reset and default to A3 без рамки (always the default)
      selectedFormatValue = null;
      const defaultFormat = options.find(opt => opt.value === 'A3 без рамки');
      selectedFormatValue = defaultFormat ? defaultFormat.value : options[0].value;

      _saveCart();
      updatePriceRow();
      // Re-render dropdown to update cart badges
      if (currentProduct) renderFormatDropdown(currentProduct);
      _showToast('Все форматы удалены из корзины', 'removed');
    };
  } else {
    // Show price info and format select button with plus icon
    priceRow.classList.remove('has-cart-items');
    priceInfo.style.display = 'flex';
    cartStatusBtn.style.display = 'none';
    deleteBtn.style.display = 'none';
    formatSelectBtn.style.display = 'flex';

    // Reset format select button text to "Выбрать формат"
    const dropdown = document.getElementById('product-format-dropdown');
    const isOpen = dropdown && dropdown.classList.contains('active');
    if (!isOpen) {
      // Keep chevron, just update text
      const span = formatSelectBtn.querySelector('span');
      if (span) {
        span.textContent = 'Выбрать формат';
      }
      // Ensure chevron is pointing up when closed
      const chevron = formatSelectBtn.querySelector('svg.product-format-select-chevron');
      if (chevron) {
        chevron.classList.add('up');
      }
    }

    // Update price display
    priceCurrent.textContent = price ? `${formatNumberRussian(price)} ₽` : '';

    if (oldPrice && oldPrice > price) {
      priceOld.textContent = `${formatNumberRussian(oldPrice)} ₽`;
      priceOld.style.display = 'block';
    } else {
      priceOld.style.display = 'none';
    }
  }
};

export const updateAddToCartButton = () => {
  if (!currentProduct) return;

  const product = currentProduct;
  const productAddToCartWrapper = document.getElementById('add-to-cart-wrapper-tools');
  const productFavoriteBtn = document.querySelector('.favorite-button');
  const productShareBtn = document.querySelector('.share-button');
  const arViewBtn = document.getElementById('ar-view-btn');

  if (!productAddToCartWrapper) return;

  productAddToCartWrapper.innerHTML = '';

  // Create tools group container (now only contains favorite, share, ar buttons)
  const toolsGroup = document.createElement('div');
  toolsGroup.className = 'product-tools-group';

  if (productFavoriteBtn) toolsGroup.appendChild(productFavoriteBtn);
  if (productShareBtn) toolsGroup.appendChild(productShareBtn);
  if (arViewBtn) toolsGroup.appendChild(arViewBtn);

  productAddToCartWrapper.appendChild(toolsGroup);
};

export const updateNotForSaleDisplay = () => {
  if (!currentProduct) return;

  const priceRow = document.getElementById('product-price-row');
  const productAddToCartWrapper = document.getElementById('add-to-cart-wrapper-tools');
  const productFavoriteBtn = document.querySelector('.favorite-button');
  const productShareBtn = document.querySelector('.share-button');
  const arViewBtn = document.getElementById('ar-view-btn');

  // Hide the price row
  if (priceRow) priceRow.style.display = 'none';

  // Update tools group
  if (productAddToCartWrapper) {
    productAddToCartWrapper.innerHTML = '';

    // Tools group
    const toolsGroup = document.createElement('div');
    toolsGroup.className = 'product-tools-group';

    if (productFavoriteBtn) toolsGroup.appendChild(productFavoriteBtn);
    if (productShareBtn) toolsGroup.appendChild(productShareBtn);
    if (arViewBtn) toolsGroup.appendChild(arViewBtn);

    productAddToCartWrapper.appendChild(toolsGroup);
  }
};

export const updateNotifyButton = async () => {
  if (!currentProduct) return;

  const priceRow = document.getElementById('product-price-row');
  const productAddToCartWrapper = document.getElementById('add-to-cart-wrapper-tools');
  const productFavoriteBtn = document.querySelector('.favorite-button');
  const productShareBtn = document.querySelector('.share-button');
  const arViewBtn = document.getElementById('ar-view-btn');

  // Hide the price row
  if (priceRow) priceRow.style.display = 'none';

  if (!productAddToCartWrapper) return;

  productAddToCartWrapper.innerHTML = '';

  // Create notify button group
  const notifyGroup = document.createElement('div');
  notifyGroup.className = 'product-cart-group';
  notifyGroup.style.flex = '1';
  notifyGroup.style.marginRight = '10px';

  const notifyBtn = document.createElement('button');
  notifyBtn.id = 'notify-release';
  notifyBtn.className = 'notify-release';
  notifyBtn.innerHTML = '<svg width="16" height="16"><use href="#bell"></use></svg><span class="notify-release-text">Уведомить о поступлении</span>';

  // Check if user is subscribed
  if (isLoggedIn()) {
    try {
      const response = await fetch(`/api/products/subscribed?product_id=${currentProduct.id}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('tributary_accessToken')}`
        }
      });
      const data = await response.json();

      if (data.subscribed) {
        notifyBtn.classList.add('subscribed');
        notifyBtn.querySelector('.notify-release-text').textContent = 'Вы подписаны на уведомление';
      }
    } catch (error) {
      console.error('Error checking subscription:', error);
    }
  }

  // Attach click handler for subscribe/unsubscribe
  notifyBtn.addEventListener('click', async () => {
    if (!isLoggedIn()) {
      _showToast('Войдите, чтобы подписаться на уведомление');
      setTimeout(() => {
        window.location.href = '/profile';
      }, 1500);
      return;
    }

    if (!currentProduct) return;

    try {
      const isSubscribed = notifyBtn.classList.contains('subscribed');
      const action = isSubscribed ? 'unsubscribe' : 'subscribe';

      const userRes = await fetch('/api/auth/user', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('tributary_accessToken')}`
        }
      });

      if (!userRes.ok) throw new Error('Failed to get user data');
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
          _showToast('Вы подписались на уведомление о поступлении');
        } else {
          notifyBtn.classList.remove('subscribed');
          notifyBtn.querySelector('.notify-release-text').textContent = 'Уведомить о поступлении';
          _showToast('Вы отписались от уведомления');
        }
      } else {
        throw new Error(data.error || 'Failed to subscribe');
      }
    } catch (error) {
      console.error('Error subscribing:', error);
      _showToast('Ошибка при подписке на уведомление');
    }
  });

  notifyGroup.appendChild(notifyBtn);
  productAddToCartWrapper.appendChild(notifyGroup);

  // Create tools group container
  const toolsGroup = document.createElement('div');
  toolsGroup.className = 'product-tools-group';

  if (productFavoriteBtn) toolsGroup.appendChild(productFavoriteBtn);
  if (productShareBtn) toolsGroup.appendChild(productShareBtn);
  if (arViewBtn) toolsGroup.appendChild(arViewBtn);

  productAddToCartWrapper.appendChild(toolsGroup);
};

export const updateCustomProductTextInput = () => {
  const customProductTextGroup = document.getElementById('custom-product-text-group');
  const variationInputGroup = document.getElementById('variation-input-group');

  if (!currentProduct) {
    if (customProductTextGroup) customProductTextGroup.style.display = 'none';
    if (variationInputGroup) variationInputGroup.style.display = 'none';
    return;
  }

  // Show custom image upload for product ID=1
  if (currentProduct.id === CUSTOM_PRODUCT_ID) {
    if (customProductTextGroup) {
      customProductTextGroup.style.display = 'block';

      const imagePreview = document.getElementById('custom-product-image-preview');
      const previewImg = document.getElementById('custom-product-preview-img');

      // Check for pending image upload
      const pendingImage = getPendingImageForContext('product', String(currentProduct.id));
      if (pendingImage && imagePreview && previewImg) {
        previewImg.src = pendingImage.dataUrl;
        imagePreview.classList.add('active');
      }
    }
    if (variationInputGroup) variationInputGroup.style.display = 'none';
    // Render any existing combinations from cart
    _renderCustomProductCombinations();
  }
  // Show variation number input for оригинальные products (excluding triptych and product ID=1)
  // Only show the input if product has more than one variant image
  else if (currentProduct.type === 'оригинал' && !currentProduct.triptych) {
    const hasMultipleVariants = (_getVariantCount ? _getVariantCount() : 0) > 1;
    if (variationInputGroup) {
      variationInputGroup.style.display = hasMultipleVariants ? 'block' : 'none';
      if (hasMultipleVariants) {
        const variationNumberInput = document.getElementById('variation-number-input');
        if (variationNumberInput && selectedFormatValue) {
          const format = selectedFormatValue;
          const displayProperty = getProductProperty(currentProduct, format);
          const variationKey = `${currentProduct.id}_${displayProperty}`;
          const savedNum = _getCartVariations()[variationKey] || '';
          variationNumberInput.value = savedNum;
        }
      }
    }
    if (customProductTextGroup) customProductTextGroup.style.display = 'none';
    _renderOriginalProductCombinations();
  }
  // Hide both for other products
  else {
    if (customProductTextGroup) customProductTextGroup.style.display = 'none';
    if (variationInputGroup) variationInputGroup.style.display = 'none';
  }
};

/**
 * Show contact/consultation modal for custom product
 */
export const showConsultationModal = () => {
  const actions = [];
  if (!isVKMiniApp()) {
    actions.push({
      text: 'Telegram',
      icon: 'socials-telegram',
      href: 'https://t.me/buy_tribute',
      target: '_blank'
    });
  }
  actions.push({
    text: 'ВКонтакте',
    icon: 'socials-vk',
    href: 'https://vk.com/buy_tribute',
    target: '_blank'
  });
  showMobileModal({
    type: 'action-sheet',
    title: 'Консультация по выбору постера',
    message: 'Не уверены, какое изображение выбрать? Мы поможем подобрать идеальный постер!',
    actions,
    cancelText: 'Закрыть'
  });
};

