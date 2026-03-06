// ============================================================
// CART PAGE SCRIPT
// Cart page functionality including rendering and item management
// ============================================================

// Import auth and data sync functions
import { init as initAuth, isLoggedIn, getCurrentUser, getAccessToken } from '../core/auth.js';
import { isVKMiniApp } from '../core/vk-miniapp.js';
import { syncCartToServer, loadCartFromServer, mergeCart, mergeCartVariations, ensureCartSynced } from '../core/data-sync.js';
import { initFAQPopup, addFAQButton } from '../modules/faq-popup.js';
import { renderFaqInfoBoxes } from '../modules/faq-info-boxes.js';
import { showSkeletonLoaders, hideSkeletonLoaders } from '../modules/skeleton-loader.js';
import { actionSheet, confirmDanger } from '../modules/mobile-modal.js';
import { getBackgroundForCart, isCustomProduct as isCustomProductStatus } from './product/background-selection.js';
import { getPendingImageForContext, removePendingImagesForContext } from '../modules/image-upload.js';
import { showImageUploadModal } from '../modules/image-upload-modal.js';
import { isVkCdnUrl, proxyVkCdnUrl, formatNumberRussian, addImageSize, sanitizeUrl, getBaseProperty } from '../core/formatters.js';
import { loadFavorites } from '../core/favorites.js';
import { formatOptions, triptychFormatOptions, propertyToPriceId, propertyDimensions } from './product/pricing.js';
import { AppSettings } from '../core/app-settings.js';
import { initItemRendering, createCartItemElement, attachCartItemListeners } from './cart/item-rendering.js';
import { showPageScreen } from '../modules/page-screen.js';

// ============ GLOBAL VARIABLES ============

let allProducts = [];
let productPrices = {};
let cart = window.cart || {};
let cartVariations = {};
// favorites is global - use window.favorites
let isUserLoggedIn = false;

// Promo code state
let appliedPromo = null; // { code, type, value, min_order_amount }
let discountAmount = 0;

// ============ UTILITY FUNCTIONS ============

/**
 * Shows toast notification using global toast module
 */
const showToast = (message, type = 'success', duration, allowHTML, customStyles, onUndo) => {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type, duration, allowHTML, customStyles, onUndo);
  }
};

const triggerHaptic = (typeOrDuration = 'light') => {
  if (typeof window.triggerHaptic === 'function') {
    window.triggerHaptic(typeOrDuration);
  } else {
    navigator.vibrate?.(typeof typeOrDuration === 'number' ? typeOrDuration : 10);
  }
};

/**
 * Show custom confirmation modal
 */
const showConfirmationModal = (message, type = 'info', duration = 3000) => {
  const existingModal = document.querySelector('.confirmation-modal');
  if (existingModal) {
    existingModal.remove();
  }

  let icon = 'ℹ';
  if (type === 'success') icon = '✓';
  else if (type === 'error') icon = '✕';

  const modal = document.createElement('div');
  modal.className = `confirmation-modal ${type}`;
  modal.innerHTML = `
    <div class="confirmation-modal-content">
      <div class="confirmation-modal-icon">${icon}</div>
      <div class="confirmation-modal-message">${message}</div>
      <button class="confirmation-modal-button">OK</button>
    </div>
  `;

  document.body.appendChild(modal);

  const button = modal.querySelector('.confirmation-modal-button');
  button.addEventListener('click', () => {
    modal.remove();
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });

  if (duration > 0) {
    setTimeout(() => {
      if (document.body.contains(modal)) {
        modal.remove();
      }
    }, duration);
  }
};

/**
 * Alias for compatibility
 */
const showErrorPopup = (title, message) => {
  showConfirmationModal(`${title}\n\n${message}`, 'error');
};

// ============ PRODUCT PRICING & PROPERTIES ============

const getProductPrice = (product, property) => {
  // PRIORITY 1: Use product-specific price if available (overrides discount_price)
  if (product.price && product.price > 0) {
    let price = product.price;
    // Triptych = 3 panels
    if (product.triptych) price *= 3;
    return parseFloat(price);
  }

  // PRIORITY 2: Fall back to generic product_prices table
  const baseProperty = getBaseProperty(property);
  const priceId = propertyToPriceId[baseProperty];
  if (!priceId || !productPrices[priceId]) return 0;

  const priceData = productPrices[priceId];
  // Use discount_price when discount is active, otherwise use base_price
  let price = product.discount ? priceData.discount_price : priceData.base_price;
  if (product.triptych) price *= 3;

  return parseFloat(price) || 0;
};

const getProductOldPrice = (product, property) => {
  // Only show old price when discount is active
  if (!product.discount) return null;

  // PRIORITY 1: Use product-specific old_price if available (overrides base_price)
  if (product.old_price && product.old_price > 0) {
    let price = product.old_price;
    // Triptych = 3 panels
    if (product.triptych) price *= 3;
    return parseFloat(price);
  }

  // PRIORITY 2: Fall back to generic product_prices table base_price
  const baseProperty = getBaseProperty(property);
  const priceId = propertyToPriceId[baseProperty];
  if (!priceId || !productPrices[priceId]) return null;

  const priceData = productPrices[priceId];
  let price = priceData.base_price;
  if (product.triptych) price *= 3;

  return price;
};

// Favorites functions are in core/favorites.js using window.favorites

// ============ CART FUNCTIONS ============

const saveCart = () => {
  try {
    localStorage.setItem('tributeCart', JSON.stringify(cart));
    localStorage.setItem('tributeCartVariations', JSON.stringify(cartVariations));
    window.cart = cart;
  } catch (e) {
    console.error('Error saving cart:', e);
  }

  // Sync to server if logged in (don't await to avoid blocking UI)
  if (isUserLoggedIn) {
    syncCartToServer(cart, cartVariations).catch(err => {
      console.error('Failed to sync cart to server:', err);
    });
  }

  // Dispatch cart updated event to update global cart counter
  window.dispatchEvent(new Event('cartUpdated'));

  // Re-render cart
  renderCart();
};

// Save cart without triggering a full re-render (used for quantity changes)
const saveCartSilent = () => {
  try {
    localStorage.setItem('tributeCart', JSON.stringify(cart));
    localStorage.setItem('tributeCartVariations', JSON.stringify(cartVariations));
    window.cart = cart;
  } catch (e) {
    console.error('Error saving cart:', e);
  }
  if (isUserLoggedIn) {
    syncCartToServer(cart, cartVariations).catch(err => {
      console.error('Failed to sync cart to server:', err);
    });
  }
  window.dispatchEvent(new Event('cartUpdated'));
};

// Debounced order summary update (for quantity changes - much faster than full re-render)
let _updateSummaryTimer = null;
const updateOrderSummaryOnly = () => {
  clearTimeout(_updateSummaryTimer);
  _updateSummaryTimer = setTimeout(() => {
    // Recalculate summary items from current cart state
    const summaryItems = [];
    let totalPrice = 0;
    let totalOldPrice = 0;

    Object.entries(cart).forEach(([cartKey, item]) => {
      if (item.type === 'certificate_redemption') return; // redemptions shown as discount card, not in summary table
      if (item.type === 'certificate') {
        if (item.checked !== false) {
          totalPrice += item.amount;
          summaryItems.push({ name: 'Подар. сертификат', quantity: item.quantity, price: item.amount, oldPrice: null });
        }
        return;
      }

      const product = allProducts.find(p => p.id === item.productId);
      if (!product) return;

      const price = getProductPrice(product, item.property);
      const oldPrice = getProductOldPrice(product, item.property);
      if (item.checked !== false) {
        totalPrice += price * item.quantity;
        if (oldPrice) totalOldPrice += oldPrice * item.quantity;
        const label = formatOptions.find(o => o.value === getBaseProperty(item.property))?.label || item.property;
        const summaryQuantity = product.triptych ? item.quantity * 3 : item.quantity;
        summaryItems.push({ name: label, quantity: summaryQuantity, price: price * item.quantity, oldPrice: oldPrice ? oldPrice * item.quantity : null });
      }
    });

    // Aggregate same formats
    const aggregatedMap = new Map();
    summaryItems.forEach(si => {
      const existing = aggregatedMap.get(si.name);
      if (existing) {
        existing.quantity += si.quantity;
        existing.price += si.price;
        if (si.oldPrice) existing.oldPrice = (existing.oldPrice || 0) + si.oldPrice;
      } else {
        aggregatedMap.set(si.name, { ...si });
      }
    });
    const aggregatedItems = [...aggregatedMap.values()];

    // Sort by price from highest to lowest
    aggregatedItems.sort((a, b) => b.price - a.price);

    // Update the summary table rows in place (only present on checkout/order pages)
    const summaryTable = document.querySelector('.cart-order-summary-table');
    if (summaryTable) {
      summaryTable.innerHTML = '';
      aggregatedItems.forEach(si => {
        const row = document.createElement('div');
        row.className = 'cart-summary-row';
        row.innerHTML = `
          <span class="cart-summary-item-qty">${si.quantity} шт</span>
          <span class="cart-summary-item-name">${si.name}</span>
          <span class="cart-summary-item-price-wrapper">
            ${si.oldPrice ? `<span class="cart-summary-item-old-price">${formatNumberRussian(si.oldPrice)} ₽</span>` : ''}
            <span class="cart-summary-item-price">${formatNumberRussian(si.price)} ₽</span>
          </span>
        `;
        summaryTable.appendChild(row);
      });
    }

    // Recalculate discount based on current total (handles deselected items)
    if (appliedPromo) {
      if (totalPrice <= 0) {
        discountAmount = 0;
      } else if (appliedPromo.type === 'fixed') {
        discountAmount = Math.min(appliedPromo.value, totalPrice);
      } else if (appliedPromo.type === 'percent') {
        discountAmount = Math.round(totalPrice * appliedPromo.value / 100);
      }
    } else {
      discountAmount = 0;
    }

    // Update total row
    const totalRow = document.querySelector('.cart-summary-total-row');
    if (totalRow) {
      const finalTotal = totalPrice - discountAmount;
      let totalPriceHTML = '';
      if (discountAmount > 0) {
        totalPriceHTML = `
          <span class="cart-summary-total-old">${formatNumberRussian(totalPrice)} ₽</span>
          <span class="cart-summary-total-price">${formatNumberRussian(finalTotal)} ₽</span>
        `;
      } else if (totalOldPrice > totalPrice) {
        totalPriceHTML = `
          <span class="cart-summary-total-old">${formatNumberRussian(totalOldPrice)} ₽</span>
          <span class="cart-summary-total-price">${formatNumberRussian(totalPrice)} ₽</span>
        `;
      } else {
        totalPriceHTML = `<span class="cart-summary-total-price">${formatNumberRussian(totalPrice)} ₽</span>`;
      }

      totalRow.querySelector('.cart-summary-total-prices').innerHTML = totalPriceHTML;
    }
  }, 300);
};

// Debounced full re-render for when items are added/removed (need to add DOM elements)
let _renderCartTimer = null;
const renderCartDebounced = () => {
  clearTimeout(_renderCartTimer);
  _renderCartTimer = setTimeout(renderCart, 400);
};

// Directly patch quantity and price in a cart item's DOM (instant feedback)
const updateItemQtyInDOM = (cartItemDiv, key, product) => {
  const qty = cart[key].quantity;
  const price = getProductPrice(product, cart[key].property);
  const oldPrice = getProductOldPrice(product, cart[key].property);
  const itemTotal = price * qty;
  const itemOldTotal = oldPrice ? oldPrice * qty : null;

  const barQty = cartItemDiv.querySelector('.cart-item-bar-counter-qty');
  if (barQty) barQty.textContent = qty;

  const formatQty = cartItemDiv.querySelector('.cart-item-format-qty');
  if (formatQty) formatQty.textContent = qty;

  const priceEl = cartItemDiv.querySelector('.cart-item-price');
  if (priceEl) priceEl.textContent = `${formatNumberRussian(itemTotal)} ₽`;

  const oldPriceEl = cartItemDiv.querySelector('.cart-item-old-price');
  if (oldPriceEl && itemOldTotal) oldPriceEl.textContent = `${formatNumberRussian(itemOldTotal)} ₽`;
};

const loadCart = () => {
  try {
    const saved = localStorage.getItem('tributeCart');
    if (saved) {
      let parsed = JSON.parse(saved);

      // Handle corrupted format where localStorage contains { cart: {...}, variations: {...} }
      // instead of the actual cart items directly
      if (parsed && parsed.cart && typeof parsed.cart === 'object' && !parsed.productId) {
        console.warn('Detected corrupted cart format in localStorage, fixing...');
        // Extract the actual cart from the nested structure
        const actualCart = parsed.cart;
        const actualVariations = parsed.variations || {};

        // Save the corrected data back to localStorage
        localStorage.setItem('tributeCart', JSON.stringify(actualCart));
        if (Object.keys(actualVariations).length > 0) {
          localStorage.setItem('tributeCartVariations', JSON.stringify(actualVariations));
        }

        parsed = actualCart;
        cartVariations = actualVariations;
      }

      // Filter out any remaining invalid entries (keys that don't match product key format)
      const validCart = {};
      for (const key of Object.keys(parsed)) {
        const item = parsed[key];
        // Valid cart items must have a productId or be certificates
        // Cart keys should be in format "123_property" or be certificate keys
        if (item && typeof item === 'object') {
          if (item.type === 'certificate' || item.type === 'certificate_redemption') {
            validCart[key] = item;
          } else if (item.productId || /^\d+_/.test(key)) {
            validCart[key] = item;
          } else {
            console.warn('Filtering out invalid cart entry:', key, item);
          }
        }
      }

      // Deduplicate: merge any two entries that represent the same product+format.
      // Happens when old-format keys ("123") and new-format keys ("123_A3 без рамки")
      // coexist, both pointing at the same item.
      // Custom product (id=1) items are intentionally NOT deduplicated — each upload is unique.
      const seenItems = new Map(); // "{productId}_{property}" -> canonical key
      for (const key of Object.keys(validCart)) {
        const item = validCart[key];
        if (item.type === 'certificate' || item.type === 'certificate_redemption') continue;

        // Ensure productId is set (may be missing on old-format entries)
        if (!item.productId && /^\d+/.test(key)) {
          item.productId = parseInt(key);
        }
        if (!item.productId || !item.property) continue;

        // Custom product (id=1): each image+format combination is unique, skip deduplication
        if (item.productId === 1) continue;

        const dedupeKey = `${item.productId}_${item.property}`;
        if (seenItems.has(dedupeKey)) {
          const canonicalKey = seenItems.get(dedupeKey);
          validCart[canonicalKey].quantity = (validCart[canonicalKey].quantity || 1) + (item.quantity || 1);
          delete validCart[key];
        } else {
          seenItems.set(dedupeKey, key);
        }
      }

      cart = validCart;
      window.cart = cart;
      localStorage.setItem('tributeCart', JSON.stringify(cart));
    } else if (window.cart && Object.keys(window.cart).length > 0) {
      // Fallback to window.cart if localStorage is empty but window.cart has data
      cart = window.cart;
    }
    const savedVariations = localStorage.getItem('tributeCartVariations');
    if (savedVariations) {
      cartVariations = JSON.parse(savedVariations);
    }
  } catch (e) {
    console.error('Error loading cart:', e);
    // Try to use window.cart as fallback
    if (window.cart && Object.keys(window.cart).length > 0) {
      cart = window.cart;
    }
  }

  // Dispatch cart updated event to update global cart counter
  window.dispatchEvent(new Event('cartUpdated'));
};

// ============ MODAL FUNCTIONS ============

const showContactSellerModal = () => {
  const actions = [];
  if (!isVKMiniApp()) {
    actions.push({
      text: 'Перейти в Telegram',
      icon: 'socials-telegram',
      href: 'https://t.me/buy_tribute',
      style: 'primary'
    });
  }
  actions.push({
    text: 'ВКонтакте',
    icon: 'socials-vk',
    href: 'https://vk.com/buy_tribute'
  });
  actionSheet({
    title: 'Связаться с нами',
    message: 'Для заказа нажмите на кнопку директа снизу-слева\nEmail: buy-tribute@yandex.ru',
    actions,
    cancelText: 'Закрыть'
  });
};

const showUnloggedOrderModal = () => {
  const contactActions = [];
  if (!isVKMiniApp()) {
    contactActions.push({
      text: 'Telegram',
      icon: 'socials-telegram',
      href: 'https://t.me/buy_tribute'
    });
  }
  contactActions.push({
    text: 'ВКонтакте',
    icon: 'socials-vk',
    href: 'https://vk.com/buy_tribute'
  });
  actionSheet({
    title: 'Оформление заказа',
    message: 'Для оформления заказа войдите в аккаунт или свяжитесь с нами напрямую',
    actions: [
      {
        text: 'Войти в профиль',
        icon: 'user-circle-outline',
        style: 'primary',
        onClick: () => {
          window.location.href = '/profile';
        }
      },
      ...contactActions
    ],
    cancelText: 'Отмена'
  });
};

const copyCartToClipboard = () => {
  // Check if cart is empty first
  if (Object.keys(cart).length === 0) {
    if (window.showToast) {
      window.showToast('Корзина пуста', 'info');
    }
    return;
  }

  let hasValidPrice = false;
  for (const key in cart) {
    const item = cart[key];
    if (item.checked === false) continue;

    const product = allProducts.find(p => p.id === item.productId);
    if (!product) continue;

    const price = getProductPrice(product, item.property);
    if (price && price > 0) {
      hasValidPrice = true;
      break;
    }
  }

  if (!hasValidPrice) {
    if (window.showToast) {
      window.showToast('Нет выбранных товаров', 'info');
    }
    return;
  }

  let cartText = 'Заказ в TR/BUTE:\n\n';
  let totalItems = 0;
  let totalPrice = 0;
  let totalOldPrice = 0;
  let cartKeys = Object.keys(cart);

  const groupedItems = {};
  cartKeys.forEach(key => {
    const item = cart[key];
    if (!groupedItems[item.productId]) {
      groupedItems[item.productId] = [];
    }
    groupedItems[item.productId].push({ key, item });
  });

  const sortedGroups = Object.entries(groupedItems).sort((a, b) => {
    const productA = allProducts.find(p => p.id === parseInt(a[0]));
    const productB = allProducts.find(p => p.id === parseInt(b[0]));
    if (!productA || !productB) return 0;
    return productA.title.localeCompare(productB.title);
  });

  for (const [productId, items] of sortedGroups) {
    const product = allProducts.find(p => p.id === parseInt(productId));
    if (!product) continue;

    items.sort((a, b) => (a.item.addedAt || 0) - (b.item.addedAt || 0));

    items.forEach(({ key, item }) => {
      if (item.checked === false) return;

      const price = getProductPrice(product, item.property);
      const oldPrice = getProductOldPrice(product, item.property);
      const itemTotal = price * item.quantity;
      const itemOldTotal = oldPrice ? oldPrice * item.quantity : null;

      const quantityText = items.length > 1 ? ` (${item.quantity} шт)` : '';
      const typeText = item.triptych ? ` [триптих]` : '';

      const variationKey = `${item.productId}_${item.property}`;
      const variationNum = cartVariations[variationKey] || '';
      const variationText = variationNum && !item.triptych && product.type !== 'фирменный' ? ` вар. ${variationNum}` : '';

      cartText += `${item.quantity > 1 && items.length === 1 ? `(${item.quantity} шт) ` : ''}${product.title}${variationText}${typeText}${items.length > 1 ? quantityText : ''}\n\n`;
      cartText += `− тип:${' '.repeat(30)} ${product.type === 'оригинал' ? 'оригинал' : 'фирменный'}${item.triptych ? ' (триптих)' : ''}\n`;
      cartText += `− формат:${' '.repeat(26)} ${item.property}\n`;
      cartText += `− количество:${' '.repeat(22)} ${item.quantity} шт\n`;
      cartText += `− стоимость:${' '.repeat(23)} ${formatNumberRussian(itemTotal)} руб\n`;
      cartText += '\n\n';

      totalItems += item.quantity;
      totalPrice += itemTotal;
      if (itemOldTotal) totalOldPrice += itemOldTotal;
    });
  }

  cartText += `Всего товаров:${' '.repeat(26)} ${totalItems} шт\n`;
  cartText += `Итого:${' '.repeat(36)} ${formatNumberRussian(totalPrice)} руб\n\n`;
  cartText += 'Стоимость доставки уточняйте у продавца.';

  navigator.clipboard.writeText(cartText).then(() => {
    if (window.showToast) {
      window.showToast('Заказ скопирован в буфер обмена', 'success');
    } else {
      showErrorPopup('Успешно', 'Заказ скопирован в буфер обмена');
    }
  }).catch(err => {
    console.error('Ошибка копирования:', err);
    if (window.showToast) {
      window.showToast('Не удалось скопировать в буфер обмена', 'error');
    } else {
      showErrorPopup('Ошибка', 'Не удалось скопировать в буфер обмена');
    }
  });
};

const showConfirmation = async (title, text, onConfirm) => {
  const confirmed = await confirmDanger(text, title);
  if (confirmed && onConfirm) {
    onConfirm();
  }
};

// ============ PROMO CODE FUNCTIONS ============

async function applyPromoCode() {
  const promoInput = document.getElementById('cart-promo-code-input');
  const errorBanner = document.getElementById('cart-discount-error');
  const applyBtn = document.getElementById('cart-discount-apply-btn');
  const hiddenInput = document.getElementById('cart-applied-promo-code');

  const code = promoInput?.value?.trim();
  if (!code) {
    showPromoErrorBanner(errorBanner, 'Введите промо-код');
    return;
  }

  hideDiscountErrorBanner(errorBanner);

  // Disable button during request
  if (applyBtn) {
    applyBtn.disabled = true;
    applyBtn.textContent = '...';
  }

  try {
    const response = await fetch(`/api/promo-codes/validate?code=${encodeURIComponent(code)}`);
    const data = await response.json();

    if (response.ok && data.success) {
      const promo = data.promo_code;

      // Check minimum order amount
      const itemsTotal = calculateCartTotal();
      if (promo.min_order_amount > 0 && itemsTotal < promo.min_order_amount) {
        showPromoErrorBanner(errorBanner, `Минимальная сумма заказа: ${formatNumberRussian(promo.min_order_amount)} р.`);
        return;
      }

      // Apply promo
      appliedPromo = promo;

      // Calculate discount
      if (promo.type === 'fixed') {
        discountAmount = Math.min(promo.value, itemsTotal);
      } else if (promo.type === 'percent') {
        discountAmount = Math.round(itemsTotal * promo.value / 100);
      }

      // Save to localStorage for checkout
      localStorage.setItem('tributary_appliedPromoCode', JSON.stringify(promo));

      // Re-render cart to show updated prices and applied state
      renderCart();

      showToast(`Промо-код ${promo.code} применен`, 'success');
    } else {
      showPromoErrorBanner(errorBanner, data.error || 'Промо-код недействителен');
    }
  } catch (err) {
    console.error('Error validating promo code:', err);
    showPromoErrorBanner(errorBanner, 'Ошибка проверки промо-кода');
  } finally {
    if (applyBtn) {
      applyBtn.disabled = false;
      applyBtn.textContent = 'Применить';
    }
  }
}

function removePromoCode() {
  appliedPromo = null;
  discountAmount = 0;
  localStorage.removeItem('tributary_appliedPromoCode');
  renderCart();
  showToast('Промо-код удален', 'info');
}

function showPromoErrorBanner(el, message) {
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  el.closest('.cart-discount-section')?.classList.add('has-error');
}

function hideDiscountErrorBanner(el) {
  if (!el) return;
  el.hidden = true;
  el.closest('.cart-discount-section')?.classList.remove('has-error');
}

function calculateCartTotal() {
  const checkedItems = Object.entries(cart).filter(([key, item]) => item.checked !== false);
  let total = 0;

  for (const [key, item] of checkedItems) {
    if (item.type === 'certificate_redemption') {
      continue; // redemptions are discounts, not part of product total
    } else if (item.type === 'certificate') {
      total += item.amount || 0;
    } else {
      const product = allProducts.find(p => p.id === item.productId);
      if (product) {
        total += getProductPrice(product, item.property) * (item.quantity || 1);
      }
    }
  }

  return total;
}

function buildPromoTermsText(promo) {
  if (!promo) return '';
  const parts = [];
  if (promo.min_order_amount > 0) {
    parts.push(`Мин. сумма заказа: ${formatNumberRussian(promo.min_order_amount)} р.`);
  }
  if (promo.valid_until) {
    const d = new Date(promo.valid_until);
    const formatted = d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    parts.push(`Действует до ${formatted}`);
  }
  return parts.join(' · ');
}

// ============ CART RENDERING ============

function getMissingVariations() {
  return Object.entries(cart).filter(([key, item]) => {
    if (item.checked === false) return false;
    if (item.type === 'certificate' || item.type === 'certificate_redemption') return false;
    if (!item.productId) return false;
    if (item.productId === window.CUSTOM_PRODUCT_ID) return false;
    const product = allProducts.find(p => p.id === item.productId);
    if (!product) return false;
    const isSpecial = product.type === 'фирменный';
    const isTriptych = !!item.triptych;
    if (isSpecial || isTriptych || product.type !== 'оригинал') return false;
    const variationKey = `${item.productId}_${item.property}`;
    return !cartVariations[variationKey];
  });
}

function getMissingCustomImages() {
  return Object.entries(cart).filter(([key, item]) => {
    if (item.checked === false) return false;
    if (!item.productId || item.productId !== window.CUSTOM_PRODUCT_ID) return false;
    const pendingImg = getPendingImageForContext('product', String(item.productId));
    return !item.custom_url && !pendingImg;
  });
}

function scrollToCartError(el) {
  const headerEl = document.querySelector('.header');
  const headerH = headerEl ? headerEl.offsetHeight : 60;
  const rect = el.getBoundingClientRect();
  const targetScroll = window.pageYOffset + rect.top - headerH - 16;
  window.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
}

// ============ CERTIFICATE HELPERS ============

function addCertRedemptionToCart(cert) {
  // Enforce one certificate per order: remove any existing redemptions
  Object.keys(cart).forEach(k => {
    if (cart[k].type === 'certificate_redemption') delete cart[k];
  });
  const cartKey = `cert_redeemed_${cert.id}`;
  cart[cartKey] = {
    type: 'certificate_redemption',
    certificate_id: cert.id,
    certificate_code: cert.code || cert.certificate_code,
    amount: -Math.abs(Number(cert.amount)),
    min_cart_amount: cert.min_cart_amount || 0,
    quantity: 1
  };
  saveCart();
}

async function applyCertCodeFromCart(certInput, errorBanner, applyBtn) {
  const rawCode = certInput.value.trim().toUpperCase().replace(/-/g, '');
  if (!rawCode || rawCode.length < 8) {
    showPromoErrorBanner(errorBanner, 'Введите полный код сертификата');
    return;
  }
  applyBtn.disabled = true;
  applyBtn.textContent = '...';
  hideDiscountErrorBanner(errorBanner);
  try {
    const response = await fetch(`/api/certificates/verify/${rawCode}`);
    const data = await response.json();
    if (!data.success) {
      showPromoErrorBanner(errorBanner, data.message || 'Сертификат не найден');
      applyBtn.disabled = false;
      applyBtn.textContent = 'Применить';
      return;
    }
    addCertRedemptionToCart(data.certificate);
    // saveCart() triggers renderCart() which will show the applied cert card
  } catch (err) {
    console.error('Error applying certificate:', err);
    showPromoErrorBanner(errorBanner, 'Ошибка при проверке сертификата');
    applyBtn.disabled = false;
    applyBtn.textContent = 'Применить';
  }
}

async function loadUserActiveCertsForCart(container) {
  const user = getCurrentUser();
  if (!user) return;
  try {
    const token = getAccessToken();
    const response = await fetch(`/api/certificates/user/${user.id}`, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });
    if (!response.ok) return;
    const data = await response.json();
    const activeCerts = (data.certificates || []).filter(c =>
      (c.status === 'paid' || c.status === 'delivered') && c.relationship === 'redeemed'
    );
    if (activeCerts.length === 0) return;

    const label = document.createElement('div');
    label.className = 'cart-cert-active-label';
    label.textContent = 'Ваши сертификаты:';
    container.appendChild(label);

    const chipsRow = document.createElement('div');
    chipsRow.className = 'cart-cert-chips-row';
    activeCerts.forEach(cert => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'cart-cert-active-chip';
      chip.innerHTML = `<span class="cart-cert-chip-amount">${formatNumberRussian(cert.amount)} ₽</span>`;
      chip.title = cert.certificate_code;
      chip.addEventListener('click', () => {
        addCertRedemptionToCart({
          id: cert.id,
          code: cert.certificate_code,
          certificate_code: cert.certificate_code,
          amount: cert.amount,
          min_cart_amount: cert.min_cart_amount || 0
        });
      });
      chipsRow.appendChild(chip);
    });
    container.appendChild(chipsRow);
  } catch (err) {
    console.warn('Failed to load user certificates:', err);
  }
}

const renderCart = () => {
  const cartItemsList = document.getElementById('cart-items-list');
  if (!cartItemsList) return;

  cartItemsList.innerHTML = '';

  // Select all checkbox
  const selectAllWrapper = document.createElement('div');
  selectAllWrapper.className = 'select-all-wrapper';
  selectAllWrapper.innerHTML = `
    <label for="select-all-checkbox" class="select-all-checkbox">
      <input type="checkbox" id="select-all-checkbox" style="position: absolute; opacity: 0; pointer-events: none;">
      <svg width="10" height="10"><use href="#checkmark"></use></svg>
    </label>
    <label for="select-all-checkbox" class="select-all-label">Выбрать все</label>
  `;

  const selectAllCheckboxInput = selectAllWrapper.querySelector('#select-all-checkbox');
  const selectAllCheckboxLabel = selectAllWrapper.querySelector('.select-all-checkbox');

  let totalChecked = 0;
  for (const key in cart) {
    if (cart[key].checked !== false) totalChecked++;
  }
  const allChecked = Object.keys(cart).length > 0 && totalChecked === Object.keys(cart).length;
  selectAllCheckboxInput.checked = allChecked;
  selectAllCheckboxLabel.classList.toggle('checked', allChecked);

  selectAllCheckboxInput.addEventListener('change', () => {
    const checked = selectAllCheckboxInput.checked;
    selectAllCheckboxLabel.classList.toggle('checked', checked);
    Object.keys(cart).forEach(key => {
      cart[key].checked = checked;
    });
    renderCart();
    saveCart();
  });

  cartItemsList.appendChild(selectAllWrapper);

  // Separate items: purchased certificates, redemptions (discount), and products
  const certPurchaseItems = [];
  const certRedemptionItems = [];
  const productItems = {};

  Object.keys(cart).forEach(key => {
    const item = cart[key];

    if (item.type === 'certificate') {
      certPurchaseItems.push({ key, item });
    } else if (item.type === 'certificate_redemption') {
      certRedemptionItems.push({ key, item });
    } else {
      // Regular product - validate productId
      let productId = item.productId;

      // Try to extract productId from key if not in item (format: "123_A3 без рамки")
      if (!productId && key) {
        const keyParts = key.split('_');
        if (keyParts.length >= 1) {
          const parsedId = parseInt(keyParts[0]);
          if (!isNaN(parsedId)) {
            productId = parsedId;
            // Fix the item
            item.productId = productId;
          }
        }
      }

      // Skip items without valid productId
      if (!productId) {
        console.warn('Skipping cart item with invalid productId:', key, item);
        return;
      }

      if (!productItems[productId]) {
        productItems[productId] = [];
      }
      productItems[productId].push({ key, item });
    }
  });

  const sortedGroups = Object.entries(productItems).sort((a, b) => {
    const productA = allProducts.find(p => p.id === parseInt(a[0]));
    const productB = allProducts.find(p => p.id === parseInt(b[0]));
    if (!productA || !productB) return 0;
    return productA.title.localeCompare(productB.title);
  });

  let totalPrice = 0;
  let totalOldPrice = 0;
  let totalItems = 0;
  let certRedemptionDiscount = 0;

  // Render purchased certificate items alongside products
  certPurchaseItems.forEach(({ key, item }) => {
    const certDiv = createCertificateItemElement(item, key);
    cartItemsList.appendChild(certDiv);
    attachCertificateItemListeners(certDiv, key, item);

    if (item.checked !== false) {
      totalPrice += item.amount;
      totalItems += item.quantity;
    }
  });

  // Track redemption discounts (rendered in right column, not in item list)
  certRedemptionItems.forEach(({ item }) => {
    if (item.checked !== false) {
      certRedemptionDiscount += Math.abs(item.amount);
    }
  });

  // Render regular product items
  for (const [productId, items] of sortedGroups) {
    const product = allProducts.find(p => p.id === parseInt(productId));
    if (!product) continue;

    items.sort((a, b) => (a.item.addedAt || 0) - (b.item.addedAt || 0));

    if (items.length > 1) {
      const groupDiv = document.createElement('div');
      groupDiv.className = 'cart-group';

      items.forEach(({ key, item }) => {
        const cartItemDiv = createCartItemElement(product, item, key);
        groupDiv.appendChild(cartItemDiv);
        attachCartItemListeners(cartItemDiv, key, product, item);

        // Calculate totals
        if (item.checked !== false) {
          const price = getProductPrice(product, item.property);
          const oldPrice = getProductOldPrice(product, item.property);
          totalPrice += price * item.quantity;
          if (oldPrice) totalOldPrice += oldPrice * item.quantity;
          totalItems += item.quantity;
        }
      });

      cartItemsList.appendChild(groupDiv);
    } else {
      const { key, item } = items[0];
      const cartItemDiv = createCartItemElement(product, item, key);
      cartItemsList.appendChild(cartItemDiv);
      attachCartItemListeners(cartItemDiv, key, product, item);

      // Calculate totals
      if (item.checked !== false) {
        const price = getProductPrice(product, item.property);
        const oldPrice = getProductOldPrice(product, item.property);
        totalPrice += price * item.quantity;
        if (oldPrice) totalOldPrice += oldPrice * item.quantity;
        totalItems += item.quantity;
      }
    }
  }

  // Build right column cards
  const rightColumnContent = document.createDocumentFragment();

  // === CARD 1 + 2: Discount section — unified cert + promo table ===
  const checkedRedemptions = certRedemptionItems.filter(({ item }) => item.checked !== false);
  const hasCertRedemptions = checkedRedemptions.length > 0;
  const certApplied = hasCertRedemptions;
  const promoApplied = !hasCertRedemptions && !!appliedPromo;
  const isDiscountApplied = certApplied || promoApplied;

  if (Object.keys(cart).length > 0) {
    const discountSection = document.createElement('div');
    discountSection.className = 'cart-discount-section';

    const errorBanner = document.createElement('div');
    errorBanner.id = 'cart-discount-error';
    errorBanner.className = 'cart-discount-error';
    errorBanner.hidden = true;
    discountSection.appendChild(errorBanner);

    const titleEl = document.createElement('div');
    titleEl.className = 'cart-discount-title';
    titleEl.textContent = 'У меня есть сертификат/промокод';
    discountSection.appendChild(titleEl);

    const table = document.createElement('div');
    table.className = 'cart-discount-table';

    // --- Cert row ---
    const certLabelCell = document.createElement('div');
    certLabelCell.className = 'cart-discount-cell cart-discount-cert-label' +
      (certApplied ? ' cart-discount-cell--applied' : '') +
      (promoApplied ? ' cart-discount-cell--dimmed' : '');
    certLabelCell.textContent = 'Сертификат';

    const certValueCell = document.createElement('div');
    certValueCell.className = 'cart-discount-cell cart-discount-cert-value' +
      (certApplied ? ' cart-discount-cell--applied' : '') +
      (promoApplied ? ' cart-discount-cell--dimmed' : '');

    if (certApplied) {
      const redemption = checkedRedemptions[0];
      certValueCell.innerHTML = `
        <span class="cart-discount-applied-code">${redemption.item.certificate_code || ''}</span>
        <svg class="cart-discount-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      `;
    } else {
      certValueCell.innerHTML = `<input type="text" id="cart-cert-code-input" class="cart-discount-input" placeholder="XXXX-XXXX" autocomplete="off">`;
    }

    table.appendChild(certLabelCell);
    table.appendChild(certValueCell);

    // --- Promo row ---
    const promoLabelCell = document.createElement('div');
    promoLabelCell.className = 'cart-discount-cell cart-discount-promo-label' +
      (promoApplied ? ' cart-discount-cell--applied' : '') +
      (certApplied ? ' cart-discount-cell--dimmed' : '');
    promoLabelCell.textContent = 'Промокод';

    const promoValueCell = document.createElement('div');
    promoValueCell.className = 'cart-discount-cell cart-discount-promo-value' +
      (promoApplied ? ' cart-discount-cell--applied' : '') +
      (certApplied ? ' cart-discount-cell--dimmed' : '');

    if (promoApplied) {
      promoValueCell.innerHTML = `
        <span class="cart-discount-applied-code">${appliedPromo.code}</span>
        <svg class="cart-discount-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      `;
    } else {
      promoValueCell.innerHTML = `
        <input type="text" id="cart-promo-code-input" class="cart-discount-input" placeholder="PROMO" autocomplete="off">
        <input type="hidden" id="cart-applied-promo-code" value="">
      `;
    }

    table.appendChild(promoLabelCell);
    table.appendChild(promoValueCell);

    // --- Action row ---
    const applyCell = document.createElement('button');
    applyCell.type = 'button';
    applyCell.id = 'cart-discount-apply-btn';
    applyCell.className = 'cart-discount-cell cart-discount-apply' + (isDiscountApplied ? ' applied' : '');
    applyCell.textContent = isDiscountApplied ? 'Применен' : 'Применить';

    const resultCell = document.createElement('div');
    resultCell.className = 'cart-discount-cell cart-discount-result';

    if (isDiscountApplied) {
      let resultText = '';
      if (certApplied) {
        const totalCertDiscount = checkedRedemptions.reduce((s, { item }) => s + Math.abs(item.amount || 0), 0);
        resultText = `−${formatNumberRussian(totalCertDiscount)} ₽`;
      } else if (promoApplied) {
        resultText = appliedPromo.type === 'percent'
          ? `−${appliedPromo.value}% (−${formatNumberRussian(discountAmount)} ₽)`
          : `−${formatNumberRussian(discountAmount)} ₽`;
      }
      resultCell.innerHTML = `<span class="cart-discount-result-value">${resultText}</span>`;
    } else {
      resultCell.innerHTML = `<span class="cart-discount-result-placeholder">Размер скидки</span>`;
    }

    table.appendChild(applyCell);
    table.appendChild(resultCell);

    discountSection.appendChild(table);

    // --- Event handlers ---
    if (isDiscountApplied) {
      applyCell.addEventListener('click', () => {
        if (certApplied) {
          checkedRedemptions.forEach(({ key, item }) => {
            const removedItem = { ...cart[key] };
            delete cart[key];
            saveCart();
            showToast('Сертификат убран', 'removed', 3000, false, {}, () => {
              cart[key] = removedItem;
              saveCart();
            });
          });
        } else {
          removePromoCode();
        }
      });
    } else {
      applyCell.addEventListener('click', () => {
        const certInput = table.querySelector('#cart-cert-code-input');
        const promoInput = table.querySelector('#cart-promo-code-input');
        const certCode = certInput?.value?.trim();
        const promoCode = promoInput?.value?.trim();
        if (certCode) {
          applyCertCodeFromCart(certInput, errorBanner, applyCell);
        } else if (promoCode) {
          applyPromoCode();
        } else {
          showPromoErrorBanner(errorBanner, 'Введите сертификат или промокод');
        }
      });

      table.querySelector('#cart-cert-code-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); applyCell.click(); }
      });
      table.querySelector('#cart-promo-code-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); applyCell.click(); }
      });

      if (isUserLoggedIn) loadUserActiveCertsForCart(discountSection);
    }

    rightColumnContent.appendChild(discountSection);
  }

  // === CARD 4: Total + actions ===
  const totalActionsCard = document.createElement('div');
  totalActionsCard.className = 'cart-total-actions-card';

  // Recalculate discount based on current total (handles deselected items)
  if (appliedPromo) {
    if (totalPrice <= 0) {
      discountAmount = 0;
    } else if (appliedPromo.type === 'fixed') {
      discountAmount = Math.min(appliedPromo.value, totalPrice);
    } else if (appliedPromo.type === 'percent') {
      discountAmount = Math.round(totalPrice * appliedPromo.value / 100);
    }
  } else {
    discountAmount = 0;
  }

  // Total row
  const totalDiscount = discountAmount + certRedemptionDiscount;
  const finalTotal = totalPrice - totalDiscount;

  const totalRow = document.createElement('div');
  totalRow.className = 'cart-summary-total-row';

  let totalPriceHTML = '';
  if (totalDiscount > 0) {
    totalPriceHTML = `
      <span class="cart-summary-total-old">${formatNumberRussian(totalPrice)} ₽</span>
      <span class="cart-summary-total-price">${formatNumberRussian(finalTotal)} ₽</span>
    `;
  } else if (totalOldPrice > totalPrice) {
    totalPriceHTML = `
      <span class="cart-summary-total-old">${formatNumberRussian(totalOldPrice)} ₽</span>
      <span class="cart-summary-total-price">${formatNumberRussian(totalPrice)} ₽</span>
    `;
  } else {
    totalPriceHTML = `<span class="cart-summary-total-price">${formatNumberRussian(totalPrice)} ₽</span>`;
  }

  totalRow.innerHTML = `
    <span class="cart-summary-total-label">ИТОГО</span>
    <div class="cart-summary-total-prices">${totalPriceHTML}</div>
  `;
  totalActionsCard.appendChild(totalRow);

  // Action buttons bar
  const actionsBar = document.createElement('div');
  actionsBar.className = 'cart-order-actions';

  // Check if any active certificate redemption minimum isn't met by product-only total
  const productOnlyTotal = Object.values(cart).reduce((sum, item) => {
    if (item.type === 'certificate' || item.type === 'certificate_redemption') return sum;
    if (item.checked === false) return sum;
    const product = allProducts.find(p => p.id === item.productId);
    if (!product) return sum;
    return sum + getProductPrice(product, item.property) * item.quantity;
  }, 0);

  const blockedRedemption = checkedRedemptions.find(({ item }) =>
    (item.min_cart_amount || 0) > 0 && productOnlyTotal < item.min_cart_amount
  );

  if (blockedRedemption) {
    const minAmount = formatNumberRussian(blockedRedemption.item.min_cart_amount);
    const warningEl = document.createElement('div');
    warningEl.className = 'cart-cert-min-warning';
    warningEl.textContent = `Для использования сертификата сумма товаров должна быть от ${minAmount} ₽`;
    totalActionsCard.appendChild(warningEl);
  }

  const orderBtn = document.createElement('button');
  orderBtn.className = 'cart-order-checkout-btn';
  if (blockedRedemption) orderBtn.disabled = true;
  orderBtn.innerHTML = 'Оформить заказ <svg class="cart-order-arrow" width="16" height="16"><use href="#arrow-right"></use></svg>';
  orderBtn.addEventListener('click', () => {
    if (Object.keys(cart).length === 0) {
      if (window.showToast) window.showToast('Корзина пуста', 'info');
      return;
    }

    document.querySelectorAll('.cart-item.variation-missing').forEach(el => {
      el.classList.remove('variation-missing');
      const msg = el.querySelector('.cart-item-error-msg');
      if (msg) msg.hidden = true;
    });
    document.querySelectorAll('.cart-item.image-missing').forEach(el => {
      el.classList.remove('image-missing');
      const msg = el.querySelector('.cart-item-error-msg');
      if (msg) msg.hidden = true;
    });

    const missingImages = getMissingCustomImages();
    const missingVars = getMissingVariations();

    missingImages.forEach(([key]) => {
      const itemEl = document.querySelector(`.cart-item[data-key="${CSS.escape(key)}"]`);
      if (!itemEl) return;
      itemEl.classList.add('image-missing');
      const msg = itemEl.querySelector('.cart-item-error-msg');
      if (msg) { msg.textContent = 'Загрузите изображение для этого товара'; msg.hidden = false; }
    });

    missingVars.forEach(([key]) => {
      const itemEl = document.querySelector(`.cart-item[data-key="${CSS.escape(key)}"]`);
      if (!itemEl) return;
      itemEl.classList.add('variation-missing');
      const msg = itemEl.querySelector('.cart-item-error-msg');
      if (msg) { msg.textContent = 'Укажите номер варианта'; msg.hidden = false; }
    });

    if (missingImages.length > 0 || missingVars.length > 0) {
      if (missingImages.length > 0 && missingVars.length > 0) {
        if (window.showToast) window.showToast('Загрузите изображение и укажите варианты для выделенных товаров', 'error');
      } else if (missingImages.length > 0) {
        if (window.showToast) window.showToast('Загрузите изображение для товара с персональным фото', 'error');
      } else {
        if (window.showToast) window.showToast('Укажите вариант для выделенных товаров', 'error');
      }
      const firstMissing = document.querySelector('.cart-item.image-missing, .cart-item.variation-missing');
      if (firstMissing) scrollToCartError(firstMissing);
      return;
    }

    if (isLoggedIn()) {
      const url = '/checkout';
      if (typeof smoothNavigate === 'function') smoothNavigate(url);
      else window.location.href = url;
    } else {
      showUnloggedOrderModal();
    }
  });
  actionsBar.appendChild(orderBtn);

  const iconButtons = document.createElement('div');
  iconButtons.className = 'cart-order-icon-buttons';

  const contactBtn = document.createElement('button');
  contactBtn.className = 'cart-order-icon-btn';
  contactBtn.innerHTML = '<svg width="16" height="16"><use href="#message"></use></svg>';
  contactBtn.title = 'Связаться';
  contactBtn.addEventListener('click', showContactSellerModal);
  iconButtons.appendChild(contactBtn);

  const copyBtn = document.createElement('button');
  copyBtn.className = 'cart-order-icon-btn';
  copyBtn.innerHTML = '<svg width="16" height="16"><use href="#copy"></use></svg>';
  copyBtn.title = 'Копировать';
  copyBtn.addEventListener('click', copyCartToClipboard);
  iconButtons.appendChild(copyBtn);

  const clearBtn = document.createElement('button');
  clearBtn.className = 'cart-order-icon-btn cart-order-icon-btn-danger';
  clearBtn.innerHTML = '<svg width="16" height="16"><use href="#trash"></use></svg>';
  clearBtn.title = 'Очистить';
  clearBtn.addEventListener('click', async () => {
    if (Object.keys(cart).length === 0) {
      if (window.showToast) window.showToast('Корзина уже пуста', 'info');
      return;
    }
    const confirmed = await confirmDanger('Все товары будут удалены из корзины', 'Очистить корзину');
    if (!confirmed) return;
    const savedCart = { ...cart };
    const savedVariations = { ...cartVariations };
    cart = {};
    cartVariations = {};
    saveCart();
    showToast('Корзина очищена', 'removed', 4000, false, {}, () => {
      cart = savedCart;
      cartVariations = savedVariations;
      saveCart();
    });
  });
  iconButtons.appendChild(clearBtn);
  actionsBar.appendChild(iconButtons);
  totalActionsCard.appendChild(actionsBar);

  rightColumnContent.appendChild(totalActionsCard);

  // Place in right column or fallback
  const cartRightColumn = document.getElementById('cart-right-column');
  if (cartRightColumn) {
    cartRightColumn.innerHTML = '';
    cartRightColumn.appendChild(rightColumnContent);
  } else {
    cartItemsList.appendChild(rightColumnContent);
  }

  // Empty cart state
  if (Object.keys(cart).length === 0) {
    cartItemsList.innerHTML = '';
    if (cartRightColumn) cartRightColumn.innerHTML = '';

    // Hide cart header and layout when empty
    const cartHeader = document.querySelector('.cart-header');
    const twoColumnLayout = document.querySelector('.cart-two-column-layout');
    if (cartHeader) cartHeader.style.display = 'none';
    if (twoColumnLayout) twoColumnLayout.style.display = 'none';

    // Show error screen in a full-height container
    const pageOverlay = document.querySelector('.cart-page-content');
    if (pageOverlay) {
      showPageScreen(pageOverlay, {
        icon: '<svg width="64" height="64" viewBox="0 0 64 64"><path d="m58,28v6h-4l-3.33,20H13.33l-3.33-20h-4v-6h8.63l10-20,5.37,2.68-8.66,17.32h21.32l-8.66-17.32,5.37-2.68,10,20h8.63Z"/></svg>',
        title: 'Корзина пуста',
        buttons: [{ label: 'На главную', href: '/' }],
      });
    }
  } else {
    // Show cart content when not empty
    const cartHeader = document.querySelector('.cart-header');
    const twoColumnLayout = document.querySelector('.cart-two-column-layout');
    if (cartHeader) cartHeader.style.display = '';
    if (twoColumnLayout) twoColumnLayout.style.display = '';
  }
};

// ============ CERTIFICATE CART ITEM FUNCTIONS ============

const createCertificateItemElement = (item, key) => {
  const cartItemDiv = document.createElement('div');
  cartItemDiv.className = 'cart-item certificate-item';
  cartItemDiv.dataset.key = key;

  const isCreditItem = item.type === 'certificate_redemption';
  const displayAmount = isCreditItem ? -item.amount : item.amount;
  const amountClass = isCreditItem ? 'certificate-credit' : '';
  const title = isCreditItem ? 'Сертификат (используется)' : 'Подарочный сертификат';
  const isChecked = item.checked !== false;

  cartItemDiv.innerHTML = `
    <div class="cart-item-error-msg" hidden></div>
    <div class="cart-item-content">
      <div class="cart-item-image-wrapper certificate">
        <a href="/certificate" class="cart-item-image-link">
          <img class="cart-item-image" src="${item.template_image || '/images/certificate-placeholder.png'}" alt="Сертификат"/>
        </a>
        ${isCreditItem ? '<div class="certificate-badge">Скидка</div>' : ''}
        <button class="cart-item-check ${isChecked ? 'checked' : ''}" type="button" aria-label="${isChecked ? 'Снять выбор' : 'Выбрать'}" title="${isChecked ? 'Снять выбор' : 'Выбрать'}">
          <svg width="14" height="14"><use href="#checkmark"></use></svg>
        </button>
      </div>
      <div class="cart-item-middle">
        <div class="cart-item-info">
          <a href="/certificate" class="cart-item-title-link">
            <div class="cart-item-title">${title}</div>
          </a>
          ${item.template_title ? `<div class="cart-item-format-info">${item.template_title}</div>` : ''}
        </div>
        <div class="cart-item-bar">
          <div class="cart-item-bar-toggle certificate-recipient-label">
            ${item.recipient_name ? `Для: ${item.recipient_name}` : ''}
          </div>
          <div class="cart-item-bar-price">
            <span class="cart-item-price ${amountClass}">${isCreditItem ? '−' : ''}${formatNumberRussian(Math.abs(displayAmount))} ₽</span>
          </div>
          <button class="cart-item-bar-delete" type="button" aria-label="Удалить" title="Удалить">
            <svg width="14" height="14"><use href="#trash"></use></svg>
          </button>
        </div>
      </div>
    </div>
  `;

  return cartItemDiv;
};

const attachCertificateItemListeners = (cartItemDiv, key, item) => {
  const navigate = (e) => {
    e.stopPropagation();
    if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault();
      if (typeof smoothNavigate === 'function') {
        smoothNavigate('/certificate');
      } else {
        window.location.href = '/certificate';
      }
    }
  };

  cartItemDiv.querySelector('.cart-item-title-link').addEventListener('click', navigate);
  cartItemDiv.querySelector('.cart-item-image-link').addEventListener('click', navigate);

  const checkBtn = cartItemDiv.querySelector('.cart-item-check');
  checkBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isChecked = checkBtn.classList.toggle('checked');
    checkBtn.title = isChecked ? 'Снять выбор' : 'Выбрать';
    cart[key].checked = isChecked;
    renderCart();
    saveCart();
  });

  const deleteBtn = cartItemDiv.querySelector('.cart-item-bar-delete');
  deleteBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (cartItemDiv.classList.contains('removing')) return;

    const overlay = document.createElement('div');
    overlay.className = 'cart-item-remove-overlay';
    const undoBtn = document.createElement('button');
    undoBtn.className = 'cart-item-remove-undo';
    undoBtn.textContent = 'Вернуть';
    overlay.appendChild(undoBtn);
    cartItemDiv.appendChild(overlay);
    cartItemDiv.classList.add('removing');

    const timer = setTimeout(() => {
      delete cart[key];
      saveCart();
      cartItemDiv.remove();
    }, 2000);

    undoBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      clearTimeout(timer);
      overlay.remove();
      cartItemDiv.classList.remove('removing');
    });
  });
};

// ============ INITIALIZATION ============
// Order submission is in checkout.js

async function initCartPage() {

  // Initialize auth
  await initAuth();
  isUserLoggedIn = isLoggedIn();

  // Initialize FAQ popup
  initFAQPopup('cart');
  addFAQButton('.cart-title');

  // Load data
  loadCart();
  loadFavorites();

  // Wait for the session-restore sync (data-sync.js) to finish merging
  // local and server cart data, then reload from localStorage.
  if (isUserLoggedIn) {
    try {
      await ensureCartSynced();
      loadCart();
    } catch (e) {
      console.error('Error syncing cart:', e);
    }
  }

  // Load applied promo code from localStorage
  try {
    const savedPromo = localStorage.getItem('tributary_appliedPromoCode');
    if (savedPromo) {
      appliedPromo = JSON.parse(savedPromo);
      // Recalculate discount
      const itemsTotal = calculateCartTotal();
      if (appliedPromo.type === 'fixed') {
        discountAmount = Math.min(appliedPromo.value, itemsTotal);
      } else if (appliedPromo.type === 'percent') {
        discountAmount = Math.round(itemsTotal * appliedPromo.value / 100);
      }
    }
  } catch (e) {
    console.error('Error loading promo code:', e);
    appliedPromo = null;
    discountAmount = 0;
  }

  // Show skeleton while loading products and prices
  const cartItemsList = document.getElementById('cart-items-list');
  if (cartItemsList && Object.keys(cart).length > 0) {
    // Desktop needs more skeletons than mobile to fill the viewport
    const isDesktop = window.innerWidth > 1024;
    const maxSkeletons = isDesktop ? 10 : 5;
    showSkeletonLoaders(cartItemsList, 'cart', Math.min(Object.keys(cart).length, maxSkeletons));
  }

  // Load products
  try {
    const productsRes = await fetch('/api/products');
    allProducts = await productsRes.json();
  } catch (e) {
    console.error('Error loading products:', e);
  }

  // Load prices
  try {
    const pricesRes = await fetch('/api/product-prices');
    const prices = await pricesRes.json();

    prices.forEach(price => {
      if (price.id) {
        productPrices[price.id] = {
          discount_price: parseFloat(price.discount_price) || 0,
          base_price: parseFloat(price.base_price) || 0
        };
      }
    });
  } catch (e) {
    console.error('Error loading prices:', e);
  }

  // Wire item-rendering module with cart state and functions
  initItemRendering({
    getCart: () => cart,
    getCartVariations: () => cartVariations,
    getAllProducts: () => allProducts,
    getProductPrice,
    getProductOldPrice,
    getBaseProperty,
    formatOptions,
    triptychFormatOptions,
    propertyDimensions,
    saveCart,
    saveCartSilent,
    renderCart,
    updateItemQtyInDOM,
    updateOrderSummaryOnly,
    calculateCartTotal,
  });

  // Render cart
  renderCart();

  // Load FAQ info boxes
  renderFaqInfoBoxes('cart', document.getElementById('cart-faq-info-boxes'));

  // Close format dropdowns when clicking outside
  document.addEventListener('click', (e) => {
    const clickedOnCard = e.target.closest('.cart-item');
    if (!clickedOnCard) {
      document.querySelectorAll('.cart-item-formats.expanded').forEach(el => {
        el.classList.remove('expanded');
        const toggle = el.closest('.cart-item')?.querySelector('.cart-item-bar-toggle');
        if (toggle) toggle.classList.remove('open');
      });
    }
  });

  // Listen for cart updates from other sources (e.g., header search)
  // Track previous cart state to detect if this is just a quantity change vs structure change
  let previousCartKeys = new Set(Object.keys(cart));
  cartUpdateHandler = () => {
    // Reload cart from window.cart before rendering to capture external changes
    loadCart();

    const currentKeys = new Set(Object.keys(cart));
    // Check if cart structure changed (items added/removed) vs just quantities changed
    const structureChanged = currentKeys.size !== previousCartKeys.size ||
      ![...currentKeys].every(k => previousCartKeys.has(k));

    if (structureChanged) {
      // Items added or removed - need full re-render
      renderCart();
    } else {
      // Only quantities changed - update summary only for faster response
      updateOrderSummaryOnly();
    }

    previousCartKeys = currentKeys;
  };
  window.addEventListener('cartUpdated', cartUpdateHandler);

}

// Page-level state for cleanup
let isCartPageInitialized = false;
let cartScrollHandler = null;
let cartUpdateHandler = null;

/**
 * Cleanup cart page (called when navigating away via SPA router)
 */
function cleanupCartPage() {

  // Reset initialization flag for re-entry
  isCartPageInitialized = false;

  // Remove scroll handler
  if (cartScrollHandler) {
    window.removeEventListener('scroll', cartScrollHandler);
    cartScrollHandler = null;
  }

  // Remove cart update listener
  if (cartUpdateHandler) {
    window.removeEventListener('cartUpdated', cartUpdateHandler);
    cartUpdateHandler = null;
  }

  // Clear product grid carousels
  if (window.activeCarousels) {
    window.activeCarousels.forEach((state, productId) => {
      if (state.autoPlayInterval) {
        clearInterval(state.autoPlayInterval);
      }
    });
    window.activeCarousels.clear();
  }
}

// Wrap initCartPage with initialization guard
const originalInitCartPage = initCartPage;
initCartPage = async function() {
  if (isCartPageInitialized) {
    return;
  }
  isCartPageInitialized = true;
  return originalInitCartPage();
};

// Register with SPA router
if (typeof window.registerPage === 'function') {
  window.registerPage('/cart', {
    init: initCartPage,
    cleanup: cleanupCartPage
  });
}

// Auto-initialize when script loads (for direct page visits only)
const isCartPagePath = window.location.pathname === '/cart' || window.location.pathname === '/cart.html';
if (isCartPagePath) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCartPage);
  } else {
    initCartPage();
  }
}
