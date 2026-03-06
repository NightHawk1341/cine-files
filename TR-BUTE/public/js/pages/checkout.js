// ============================================================
// CHECKOUT PAGE SCRIPT
// Dedicated page for order submission (extracted from cart popup)
// ============================================================

// Import auth and data sync functions
import { init as initAuth, isLoggedIn, getCurrentUser, getAccessToken } from '../core/auth.js';
import { syncCartToServer, loadCartFromServer, mergeCart, mergeCartVariations } from '../core/data-sync.js';
import { initFAQPopup, addFAQButton } from '../modules/faq-popup.js';
import { renderFaqInfoBoxes } from '../modules/faq-info-boxes.js';
import { alert as showMobileAlert, confirm as showMobileConfirm } from '../modules/mobile-modal.js';

// Import shipping module
import {
  initShippingModule,
  initShippingCalculation,
  triggerShippingCalculation,
  calculateShipping,
  resetShippingSelection,
  updateOrderSummaryWithShipping,
  getSelectedShippingOption
} from './cart/shipping.js';

import { showPageScreen } from '../modules/page-screen.js';
import { formatNumberRussian, addImageSize, getBaseProperty } from '../core/formatters.js';
import { propertyToPriceId } from './product/pricing.js';


// ============ GLOBAL VARIABLES ============

let allProducts = [];
let productPrices = {};
let cart = window.cart || {};
let cartVariations = {};
let isUserLoggedIn = false;

// Promo code state
let appliedPromo = null; // { code, type, value, min_order_amount }
let discountAmount = 0;

// ============ UTILITY FUNCTIONS ============

/**
 * Shows toast notification using global toast module
 */
const showToast = (message, type = 'success') => {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
  }
};

const triggerHaptic = (typeOrDuration = 'light') => {
  if (typeof window.triggerHaptic === 'function') {
    window.triggerHaptic(typeOrDuration);
  } else {
    navigator.vibrate?.(typeof typeOrDuration === 'number' ? typeOrDuration : 10);
  }
};

const showConfirmationModal = (message, type = 'info') => {
  window.showToast(message, type, 4000);
};

// ============ PRODUCT PRICING ============

const getProductPrice = (product, property) => {
  // PRIORITY 1: Use product-specific price if available
  if (product.price && product.price > 0) {
    let price = product.price;
    if (product.triptych) price *= 3;
    return parseFloat(price);
  }

  // PRIORITY 2: Fall back to generic product_prices table
  const baseProperty = getBaseProperty(property);
  const priceId = propertyToPriceId[baseProperty];
  if (!priceId || !productPrices[priceId]) return 0;

  const priceData = productPrices[priceId];
  let price = product.discount ? priceData.discount_price : priceData.base_price;
  if (product.triptych) price *= 3;

  return parseFloat(price) || 0;
};

// ============ CART FUNCTIONS ============

function loadCart() {
  try {
    const savedCart = localStorage.getItem('tributeCart');
    if (savedCart) {
      const parsed = JSON.parse(savedCart);
      // Filter out non-product entries (e.g. stale "success" stubs from old sync format)
      const validCart = {};
      for (const key of Object.keys(parsed)) {
        const item = parsed[key];
        if (item && typeof item === 'object') {
          if (item.type === 'certificate' || item.type === 'certificate_redemption') {
            validCart[key] = item;
          } else if (item.productId || /^\d+_/.test(key)) {
            validCart[key] = item;
          }
        }
      }
      cart = validCart;
    }
    const savedVariations = localStorage.getItem('tributeCartVariations');
    if (savedVariations) {
      cartVariations = JSON.parse(savedVariations);
    }
    window.cart = cart;
  } catch (e) {
    console.error('Error loading cart:', e);
    cart = {};
    cartVariations = {};
  }
}

function saveCart() {
  try {
    localStorage.setItem('tributeCart', JSON.stringify(cart));
    localStorage.setItem('tributeCartVariations', JSON.stringify(cartVariations));
    window.cart = cart;
    // Update cart badge
    if (typeof window.updateCartBadge === 'function') {
      window.updateCartBadge();
    }
  } catch (e) {
    console.error('Error saving cart:', e);
  }
}

// ============ DATA LOADING ============

async function loadProducts() {
  try {
    const productsRes = await fetch('/api/products');
    allProducts = await productsRes.json();
  } catch (error) {
    console.error('Error loading products:', error);
  }
}

async function loadPrices() {
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
  } catch (error) {
    console.error('Error loading prices:', error);
  }
}

// ============ VARIATION VALIDATION ============

function checkMissingVariations() {
  const checkedItems = Object.entries(cart).filter(([, item]) => item.checked !== false);
  return checkedItems.filter(([, item]) => {
    if (item.type === 'certificate' || item.type === 'certificate_redemption') return false;
    if (!item.productId) return false;
    const product = allProducts.find(p => p.id === item.productId);
    if (!product) return false;
    const isSpecial = product.type === 'фирменный';
    const isTriptych = !!item.triptych;
    if (isSpecial || isTriptych || product.type !== 'оригинал') return false;
    const variationKey = `${item.productId}_${item.property}`;
    return !cartVariations[variationKey];
  });
}

function showVariationWarningBanner() {
  const container = document.querySelector('.checkout-form-container');
  if (!container || document.getElementById('checkout-variation-warning')) return;

  const banner = document.createElement('div');
  banner.id = 'checkout-variation-warning';
  banner.className = 'checkout-variation-warning';
  banner.innerHTML = `Для некоторых товаров не указан вариант. <button type="button">Вернитесь в корзину</button> и заполните все поля.`;
  banner.querySelector('button').addEventListener('click', () => {
    if (typeof smoothNavigate === 'function') smoothNavigate('/cart');
    else window.location.href = '/cart';
  });
  container.insertBefore(banner, container.firstChild);
}

// ============ CART SUMMARY RENDERING ============

function renderCartSummary() {
  const summaryContainer = document.getElementById('checkout-order-summary');
  const orderItemsCountEl = document.getElementById('order-summary-items-count');
  const orderTotalEl = document.getElementById('order-summary-total');

  if (!summaryContainer) return;

  // Get checked items only
  const checkedItems = Object.entries(cart).filter(([key, item]) => item.checked !== false);

  if (checkedItems.length === 0) {
    showPageScreen(document.querySelector('.checkout-form-container'), {
      icon: '<svg width="48" height="48" viewBox="0 0 64 64"><use href="#shopping-basket"></use></svg>',
      title: 'Корзина пуста',
      text: 'Добавьте товары в корзину для оформления заказа',
      buttons: [{ label: 'Перейти в корзину', href: '/cart' }],
    });
    return;
  }

  let totalPrice = 0;
  let totalItems = 0;
  let certRedemptionDiscount = 0;
  const summaryItems = [];

  for (const [key, item] of checkedItems) {
    if (item.type === 'certificate_redemption') {
      certRedemptionDiscount += Math.abs(item.amount || 0);
      continue;
    }

    if (item.type === 'certificate') {
      const itemPrice = item.amount || 0;
      totalPrice += itemPrice;
      totalItems += item.quantity || 1;
      summaryItems.push({ name: 'Подар. сертификат', quantity: item.quantity || 1, price: itemPrice });
    } else {
      const product = allProducts.find(p => p.id === item.productId);
      if (!product) {
        console.warn(`[Checkout] Product not found for item:`, item);
        continue;
      }
      const qty = item.quantity || 1;
      const itemPrice = getProductPrice(product, item.property) * qty;
      totalPrice += itemPrice;
      totalItems += qty;
      const label = getBaseProperty(item.property);
      const summaryQty = product.triptych ? qty * 3 : qty;
      summaryItems.push({ name: label, quantity: summaryQty, price: itemPrice });
    }
  }

  // Aggregate same formats into single rows
  const aggregatedMap = new Map();
  summaryItems.forEach(si => {
    const existing = aggregatedMap.get(si.name);
    if (existing) {
      existing.quantity += si.quantity;
      existing.price += si.price;
    } else {
      aggregatedMap.set(si.name, { ...si });
    }
  });
  const aggregatedItems = [...aggregatedMap.values()].sort((a, b) => b.price - a.price);

  // Build Состав заказа card
  const summaryCard = document.createElement('div');
  summaryCard.className = 'cart-order-summary';

  const titleEl = document.createElement('div');
  titleEl.className = 'cart-order-summary-title';
  titleEl.textContent = 'Состав заказа';
  summaryCard.appendChild(titleEl);

  if (aggregatedItems.length > 0) {
    const table = document.createElement('div');
    table.className = 'cart-order-summary-table';

    aggregatedItems.forEach(si => {
      const row = document.createElement('div');
      row.className = 'cart-summary-row';
      row.innerHTML = `
        <span class="cart-summary-item-qty">${si.quantity} шт</span>
        <span class="cart-summary-item-name">${si.name}</span>
        <span class="cart-summary-item-price-wrapper">
          <span class="cart-summary-item-price">${formatNumberRussian(si.price)} ₽</span>
        </span>
      `;
      table.appendChild(row);
    });

    // Certificate redemption discount rows inside the table
    if (certRedemptionDiscount > 0) {
      const redemptionItems = checkedItems.filter(([, item]) => item.type === 'certificate_redemption');
      redemptionItems.forEach(([, item]) => {
        const discountRow = document.createElement('div');
        discountRow.className = 'cart-summary-row cart-summary-discount-row';
        discountRow.innerHTML = `
          <span class="cart-summary-item-qty">%</span>
          <span class="cart-summary-item-name">Сертификат <strong>${item.certificate_code || ''}</strong></span>
          <span class="cart-summary-item-price-wrapper">
            <span class="cart-summary-item-price">−${formatNumberRussian(Math.abs(item.amount))} ₽</span>
          </span>
        `;
        table.appendChild(discountRow);
      });
    }

    // Promo code discount row inside the table
    if (appliedPromo && discountAmount > 0) {
      const promoRow = document.createElement('div');
      promoRow.className = 'cart-summary-row cart-summary-discount-row';
      promoRow.innerHTML = `
        <span class="cart-summary-item-qty">%</span>
        <span class="cart-summary-item-name">Промокод <strong>${appliedPromo.code}</strong></span>
        <span class="cart-summary-item-price-wrapper">
          <span class="cart-summary-item-price">−${formatNumberRussian(discountAmount)} ₽</span>
        </span>
      `;
      table.appendChild(promoRow);
    }

    summaryCard.appendChild(table);
  }

  summaryContainer.innerHTML = '';
  summaryContainer.appendChild(summaryCard);

  // Update order summary totals
  if (orderItemsCountEl) orderItemsCountEl.textContent = totalItems;
  const displayTotal = Math.max(0, totalPrice - certRedemptionDiscount - discountAmount);
  if (orderTotalEl) orderTotalEl.textContent = `${formatNumberRussian(displayTotal)} р.`;

  return totalPrice;
}

// ============ FORM INITIALIZATION ============

function initPersonalInfoVisibility() {
  const personalSection = document.getElementById('personal-info-section');
  if (!personalSection) return;

  function unlockPersonalInfo() {
    personalSection.classList.remove('personal-info-locked');
  }

  // Certificate-only orders: section hidden entirely by initCertificateDeliveryToggle
  const hasOnlyCertificates =
    Object.values(cart).some(item => item.type === 'certificate' && item.checked !== false) &&
    !Object.values(cart).some(item => item.type !== 'certificate' && item.type !== 'certificate_redemption' && item.checked !== false);

  if (hasOnlyCertificates) return;

  // Unlock when delivery type is selected (CDEK / Pochta flow)
  document.querySelectorAll('.shipping-type-btn').forEach(btn => {
    btn.addEventListener('click', unlockPersonalInfo);
  });

  // Unlock immediately when international is selected (no delivery-type step)
  document.querySelector('.international-shipping-btn')?.addEventListener('click', unlockPersonalInfo);
}

function initCertificateDeliveryToggle() {
  const certToggle = document.getElementById('certificate-delivery-toggle');
  const certPdfOnlyInfo = document.getElementById('certificate-pdf-only-info');
  const certDeliveryHidden = document.getElementById('certificate-delivery-type');
  const certDeliveryBtns = document.querySelectorAll('.certificate-delivery-btn');

  if (!certToggle) return;

  // Only purchased certificates affect delivery options (not redemptions)
  const hasCertificates = Object.values(cart).some(item =>
    item.type === 'certificate' && item.checked !== false
  );

  const hasPhysicalProducts = Object.values(cart).some(item =>
    item.type !== 'certificate' && item.type !== 'certificate_redemption' && item.checked !== false
  );

  if (hasCertificates && hasPhysicalProducts) {
    // Show toggle between PDF and physical
    certToggle.style.display = 'block';
    if (certPdfOnlyInfo) certPdfOnlyInfo.style.display = 'none';
  } else if (hasCertificates && !hasPhysicalProducts) {
    // Only certificates - PDF only, no shipping or personal info needed
    certToggle.style.display = 'none';
    if (certPdfOnlyInfo) certPdfOnlyInfo.style.display = 'block';
    if (certDeliveryHidden) certDeliveryHidden.value = 'pdf';
    const shippingSection = document.getElementById('shipping-section');
    if (shippingSection) shippingSection.style.display = 'none';
    const personalSection = document.getElementById('personal-info-section');
    if (personalSection) personalSection.style.display = 'none';
    // Strip required from every field in the form so browser validation
    // doesn't block submission on hidden fields (address, surname, name, phone)
    document.getElementById('checkoutForm')
      ?.querySelectorAll('[required]')
      .forEach(el => el.removeAttribute('required'));
  } else {
    // No certificates
    certToggle.style.display = 'none';
    if (certPdfOnlyInfo) certPdfOnlyInfo.style.display = 'none';
  }

  // Toggle button handlers
  certDeliveryBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      certDeliveryBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (certDeliveryHidden) {
        certDeliveryHidden.value = btn.dataset.certDelivery;
      }
    });
  });
}

async function loadSavedAddressSelector() {
  if (!isLoggedIn()) return;
  try {
    const token = localStorage.getItem('tributary_accessToken');
    const resp = await fetch('/api/user/addresses', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!resp.ok) return;
    const data = await resp.json();
    const addresses = data.addresses || [];
    if (addresses.length === 0) return;
    // Find the personal-info section to insert selector before it
    const personalSection = document.getElementById('personal-info-section');
    if (!personalSection) return;
    // Create address selector
    const selector = document.createElement('div');
    selector.className = 'saved-address-selector';
    selector.id = 'saved-address-selector';
    const title = document.createElement('div');
    title.className = 'saved-address-selector-title';
    title.textContent = 'Сохранённые адреса';
    selector.appendChild(title);
    const chips = document.createElement('div');
    chips.className = 'saved-address-chips';
    addresses.forEach(addr => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'saved-address-chip' + (addr.is_default ? ' default' : '');
      chip.dataset.addressId = addr.id;
      const chipLabel = addr.label || `${addr.surname} ${addr.name}`.trim();
      const chipAddr = addr.address.length > 30 ? addr.address.substring(0, 30) + '...' : addr.address;
      chip.innerHTML = `<span class="chip-label">${chipLabel}</span><span class="chip-addr">${chipAddr}</span>`;
      chip.addEventListener('click', () => {
        chips.querySelectorAll('.saved-address-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        fillFormWithAddress(addr);
      });
      chips.appendChild(chip);
    });
    // "New address" chip
    const newChip = document.createElement('button');
    newChip.type = 'button';
    newChip.className = 'saved-address-chip new-address';
    newChip.textContent = '+ Новый';
    newChip.addEventListener('click', () => {
      chips.querySelectorAll('.saved-address-chip').forEach(c => c.classList.remove('active'));
      newChip.classList.add('active');
      clearAddressForm();
    });
    chips.appendChild(newChip);
    selector.appendChild(chips);
    personalSection.parentNode.insertBefore(selector, personalSection);
  } catch (err) {
    console.warn('Failed to load address selector:', err);
  }
}
function fillFormWithAddress(addr) {
  const fields = {
    'order-surname': addr.surname,
    'order-name': addr.name,
    'order-phone': addr.phone,
    'order-address': addr.address,
    'order-postal-index': addr.postal_index || '',
    'order-comment': addr.comment || ''
  };
  for (const [id, value] of Object.entries(fields)) {
    const el = document.getElementById(id);
    if (el) {
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
}
function clearAddressForm() {
  const fieldIds = ['order-surname', 'order-name', 'order-phone', 'order-address', 'order-postal-index', 'order-comment'];
  fieldIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
}

function loadSavedOrderData() {
  const savedData = localStorage.getItem('tributary_orderFormData');
  if (!savedData) return;

  try {
    const data = JSON.parse(savedData);

    // Restore form fields (visible but locked until provider + type selected)
    const fields = ['surname', 'name', 'phone', 'address', 'postal_index', 'comment'];
    fields.forEach(field => {
      const el = document.getElementById(`order-${field.replace('_', '-')}`);
      if (el && data[field]) {
        el.value = data[field];
      }
    });
  } catch (e) {
    console.error('Error loading saved order data:', e);
  }
}

function saveOrderDataToLocalStorage() {
  const formData = {
    surname: document.getElementById('order-surname')?.value || '',
    name: document.getElementById('order-name')?.value || '',
    phone: document.getElementById('order-phone')?.value || '',
    address: document.getElementById('order-address')?.value || '',
    postal_index: document.getElementById('order-postal-index')?.value || '',
    comment: document.getElementById('order-comment')?.value || '',
    country: document.getElementById('order-country')?.value || ''
  };

  localStorage.setItem('tributary_orderFormData', JSON.stringify(formData));
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

function getCertRedemptionDiscount() {
  return Object.values(cart)
    .filter(item => item.type === 'certificate_redemption' && item.checked !== false)
    .reduce((sum, item) => sum + Math.abs(item.amount || 0), 0);
}

function updateOrderSummaryWithDiscount() {
  const discountRow = document.getElementById('order-summary-discount-row');
  const discountEl = document.getElementById('order-summary-discount');
  const totalEl = document.getElementById('order-summary-total');
  const totalPriceEl = document.getElementById('checkout-total-price');

  const certDiscount = getCertRedemptionDiscount();
  const totalDiscount = discountAmount + certDiscount;

  if (totalDiscount > 0 && discountRow && discountEl) {
    discountRow.style.display = '';
    discountEl.textContent = `-${formatNumberRussian(totalDiscount)} р.`;
  } else if (discountRow) {
    discountRow.style.display = 'none';
  }

  // Recalculate total with all discounts
  const itemsTotal = calculateCartTotal();
  const finalTotal = Math.max(0, itemsTotal - totalDiscount);

  if (totalEl) totalEl.textContent = `${formatNumberRussian(finalTotal)} р.`;
  if (totalPriceEl) totalPriceEl.textContent = `${formatNumberRussian(finalTotal)} р.`;
}

// ============ AUTO-APPLY PROMO FROM CART ============

function autoApplyPromoFromCart() {
  try {
    const savedPromo = localStorage.getItem('tributary_appliedPromoCode');
    if (!savedPromo) return;

    const promo = JSON.parse(savedPromo);
    if (!promo || !promo.code) return;

    appliedPromo = promo;
    const itemsTotal = calculateCartTotal();
    if (promo.type === 'fixed') {
      discountAmount = Math.min(promo.value, itemsTotal);
    } else if (promo.type === 'percent') {
      discountAmount = Math.round(itemsTotal * promo.value / 100);
    }

    const hiddenInput = document.getElementById('applied-promo-code');
    if (hiddenInput) hiddenInput.value = promo.code;

    renderCartSummary();
    updateOrderSummaryWithDiscount();
  } catch (e) {
    console.error('Error auto-applying promo code from cart:', e);
  }
}

// ============ FIELD VALIDATION WITH RED HIGHLIGHTING ============

/**
 * Mark a form field as having an error
 */
function setFieldError(fieldEl) {
  if (!fieldEl) return;
  fieldEl.classList.add('field-error');
}

/**
 * Clear a single field error
 */
function clearFieldError(fieldEl) {
  if (!fieldEl) return;
  fieldEl.classList.remove('field-error');
}

/**
 * Clear all field errors
 */
function clearAllFieldErrors() {
  document.querySelectorAll('.field-error').forEach(el => el.classList.remove('field-error'));
}

/**
 * Validate required fields and highlight empty ones in red.
 * Returns true if all fields are valid.
 */
function validateRequiredFields(isPdfCertOnly) {
  clearAllFieldErrors();
  if (isPdfCertOnly) return true;

  const requiredFields = [
    document.getElementById('order-surname'),
    document.getElementById('order-name'),
    document.getElementById('order-phone'),
  ];

  // Address is required unless cert-only
  const addressEl = document.getElementById('order-address');
  if (addressEl && addressEl.offsetParent !== null) {
    requiredFields.push(addressEl);
  }

  let firstError = null;
  for (const el of requiredFields) {
    if (el && !el.value.trim()) {
      setFieldError(el);
      if (!firstError) firstError = el;
    }
  }

  if (firstError) {
    const headerHeight = document.querySelector('.header')?.offsetHeight || 60;
    const rect = firstError.getBoundingClientRect();
    if (rect.top < headerHeight || rect.bottom > window.innerHeight) {
      window.scrollTo({ top: window.pageYOffset + rect.top - headerHeight - 20, behavior: 'smooth' });
    }
    firstError.focus();
    return false;
  }
  return true;
}

/**
 * Attach blur listeners to mark fields that were touched then left empty
 */
function initFieldBlurValidation() {
  const ids = ['order-surname', 'order-name', 'order-phone', 'order-address'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('blur', () => {
      if (el.dataset.touched && !el.value.trim() && el.hasAttribute('required')) {
        setFieldError(el);
      }
    });
    el.addEventListener('input', () => {
      el.dataset.touched = '1';
      if (el.value.trim()) clearFieldError(el);
    });
  });
}


// ============ CONFIRMATION MODAL ============

/**
 * Show order confirmation modal with terms acceptance.
 * Returns true if user confirmed, false if cancelled.
 */
async function showOrderConfirmationModal() {
  const totalEl = document.getElementById('order-summary-total');
  const totalText = totalEl ? totalEl.textContent : '';
  return showMobileConfirm({
    title: 'Подтверждение заказа',
    message: `Итого к оплате: <strong>${totalText}</strong><br><br><span style="font-size: 12px; color: var(--text-tertiary);">Оформляя заказ, вы соглашаетесь с <a href="/legal" target="_blank" style="color: var(--link-color); text-decoration: underline;">условиями оферты и политикой конфиденциальности</a></span>`,
    confirmText: 'Подтвердить заказ',
    cancelText: 'Отмена',
    confirmStyle: 'primary'
  });
}


// ============ ORDER SUBMISSION ============

async function handleOrderSubmit(e) {
  e.preventDefault();

  const currentUser = getCurrentUser();
  if (!isLoggedIn() || !currentUser) {
    showConfirmationModal('Пожалуйста, войдите в аккаунт', 'info');
    return;
  }

  const checkoutForm = document.getElementById('checkoutForm');

  // Get form data
  const formData = new FormData(checkoutForm);
  const address = {
    surname: formData.get('surname') || '',
    name: formData.get('name') || '',
    phone: formData.get('phone') || '',
    postal_index: formData.get('postal_index') || '',
    address: formData.get('address'),
    comment: formData.get('comment') || ''
  };
  const deliveryType = formData.get('delivery_type');
  const country = formData.get('country') || null;
  const certificateDeliveryType = formData.get('certificate_delivery_type') || 'pdf';

  // PDF certificate-only orders don't need a shipping provider
  const isPdfCertOnly =
    certificateDeliveryType === 'pdf' &&
    Object.values(cart).some(item => item.type === 'certificate' && item.checked !== false) &&
    !Object.values(cart).some(item => item.type !== 'certificate' && item.type !== 'certificate_redemption' && item.checked !== false);

  // Cert-only: saved form data may prefill hidden address fields — clear them so
  // the order address record isn't populated with a previous order's info.
  if (isPdfCertOnly) {
    address.surname = '';
    address.name = '';
    address.phone = '';
    address.postal_index = '';
    address.address = '';
    address.comment = '';
  }

  const finalDeliveryType = deliveryType || (isPdfCertOnly ? 'pdf' : null);

  // Validate delivery_type is set
  if (!finalDeliveryType) {
    showConfirmationModal('Пожалуйста, выберите способ доставки', 'error');
    return;
  }

  // Validate required fields with red highlighting
  if (!validateRequiredFields(isPdfCertOnly)) {
    showConfirmationModal('Пожалуйста, заполните все обязательные поля', 'error');
    return;
  }

  // Prepare order items
  let checkedEntries = Object.entries(cart).filter(([key, item]) => item.checked !== false);

  // Fix missing productId by extracting from key
  checkedEntries = checkedEntries.filter(([key, item]) => {
    if (item.type === 'certificate' || item.type === 'certificate_redemption') {
      return true;
    }

    if (!item.productId) {
      const keyParts = key.split('_');
      if (keyParts.length >= 1) {
        const parsedId = parseInt(keyParts[0]);
        if (!isNaN(parsedId) && parsedId > 0) {
          item.productId = parsedId;
        }
      }
    }

    if (!item.productId) {
      console.warn('Filtering out invalid cart item (no productId):', key, item);
      delete cart[key];
      return false;
    }

    return true;
  });

  if (checkedEntries.length === 0) {
    showConfirmationModal('Корзина пуста или содержит недействительные товары.', 'error');
    return;
  }

  const checkedItems = checkedEntries.map(([key, item]) => item);

  // Validate certificate redemption floors (min_cart_amount)
  const redemptions = checkedItems.filter(item => item.type === 'certificate_redemption' && (item.min_cart_amount || 0) > 0);
  if (redemptions.length > 0) {
    const regularTotal = checkedItems
      .filter(item => item.type !== 'certificate' && item.type !== 'certificate_redemption')
      .reduce((sum, item) => {
        const product = allProducts.find(p => p.id === item.productId);
        return sum + (product ? getProductPrice(product, item.property) * (item.quantity || 1) : 0);
      }, 0);

    for (const redemption of redemptions) {
      if (regularTotal < redemption.min_cart_amount) {
        const floor = formatNumberRussian(redemption.min_cart_amount);
        showConfirmationModal(
          `Сертификат «${redemption.certificate_code}» можно применить только при сумме товаров от ${floor} р. Сейчас в корзине товаров на ${formatNumberRussian(regularTotal)} р.`,
          'error'
        );
        return;
      }
    }
  }

  // Validate that all original products have variation numbers filled in
  const missingVars = checkMissingVariations();
  if (missingVars.length > 0) {
    showConfirmationModal('Для некоторых товаров не указан вариант. Вернитесь в корзину и заполните поле «Вариант».', 'error');
    return;
  }

  // Create pending certificates first (code will be generated after payment)
  for (const item of checkedItems) {
    if ((item.type === 'certificate' || item.type === 'certificate_redemption') && item.pending_creation) {
      try {
        const createResponse = await fetch('/api/certificates/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('tributary_accessToken')}`
          },
          body: JSON.stringify({
            template_id: item.template_id,
            recipient_name: item.recipient_name,
            amount: item.amount,
            user_id: currentUser.id
          })
        });

        const createResult = await createResponse.json();

        if (!createResponse.ok || !createResult.success) {
          throw new Error(createResult.error || createResult.message || 'Failed to create certificate');
        }

        item.certificate_id = createResult.certificate.id;
        delete item.pending_creation;
      } catch (certError) {
        console.error('Error creating certificate:', certError);
        showConfirmationModal(`Ошибка при создании сертификата: ${certError.message}`, 'error');
        return;
      }
    }
  }

  const items = checkedItems.map(item => {
    if (item.type === 'certificate' || item.type === 'certificate_redemption') {
      const certItem = {
        is_certificate: true,
        is_redemption: item.type === 'certificate_redemption',
        certificate_id: item.certificate_id,
        title: `Подарочный сертификат на ${item.amount} р.`,
        quantity: 1,
        price_at_purchase: item.amount,
        recipient_name: item.recipient_name,
        image: item.template_image,
        min_cart_amount: item.min_cart_amount || 0
      };

      if (item.template_id) {
        certItem.template_id = item.template_id;
      }

      return certItem;
    }

    const product = allProducts.find(p => p.id === item.productId);

    if (!product) {
      console.error('Product not found for cart item:', item.productId);
      return null;
    }

    const price = getProductPrice(product, item.property);
    const variationKey = `${item.productId}_${item.property}`;
    const variationNum = cartVariations[variationKey] || '';

    const isCustomProduct = item.productId === window.CUSTOM_PRODUCT_ID;
    // For custom product: use item.custom_url (stored with item) rather than cartVariations
    const customUrl = isCustomProduct ? (item.custom_url || variationNum || null) : null;

    return {
      is_certificate: false,
      product_id: item.productId,
      title: item.title,
      quantity: item.quantity,
      price_at_purchase: price,
      property: item.property,
      variation_num: isCustomProduct ? null : variationNum,
      custom_url: customUrl,
      image: item.image
    };
  }).filter(item => item !== null);

  // Get shipping data
  const shippingCode = formData.get('shipping_code') || '';
  const shippingPrice = parseFloat(formData.get('shipping_price')) || 0;
  const shippingProvider = formData.get('shipping_provider') || '';
  const isManualCalculation = formData.get('manual_calculation') === 'true';
  const estimatedDeliveryDays = formData.get('estimated_delivery_days') || '';
  const pvzCode = formData.get('pvz_code') || '';
  const pvzAddress = formData.get('pvz_address') || '';
  const pochtaOfficeAddress = formData.get('pochta_office_address') || '';
  const expressDelivery = formData.get('express_delivery') === 'true';

  const shippingOption = getSelectedShippingOption();


  // Get applied promo code
  const appliedPromoCode = document.getElementById('applied-promo-code')?.value || null;

  const orderData = {
    user_id: currentUser.id,
    items: items,
    address: address,
    delivery_type: finalDeliveryType,
    country: country,
    certificate_delivery_type: certificateDeliveryType,
    shipping_code: shippingCode,
    shipping_provider: shippingProvider,
    delivery_cost: shippingPrice,
    packaging_cost: 0,
    estimated_delivery_days: estimatedDeliveryDays,
    manual_calculation: isManualCalculation,
    express_delivery: expressDelivery,
    pvz_code: pvzCode || shippingOption?.selectedPvz?.code,
    pvz_address: pvzAddress || pochtaOfficeAddress || shippingOption?.selectedPvz?.address,
    is_international: shippingOption?.isInternational || false,
    promo_code: appliedPromoCode || undefined
  };

  // Show confirmation modal before submitting
  const confirmed = await showOrderConfirmationModal();
  if (!confirmed) return;

  // Disable submit button
  const submitButton = checkoutForm.querySelector('button[type="submit"]');
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = 'Отправка...';
  }

  try {
    const response = await fetch('/api/orders/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('tributary_accessToken')}`
      },
      body: JSON.stringify(orderData)
    });

    const result = await response.json();

    if (response.ok && result.success) {
      // Clear cart
      cart = {};
      cartVariations = {};
      saveCart();

      // Clear pending images for custom products
      if (window.imageUpload && window.imageUpload.removePendingImagesForContext) {
        // Clear all product-type pending images (custom product uploads)
        const pendingImages = window.imageUpload.getPendingImages();
        for (const [id, img] of Object.entries(pendingImages)) {
          if (img.type === 'product') {
            window.imageUpload.removePendingImage(id);
          }
        }
      }

      // Clear saved form data
      localStorage.removeItem('tributary_orderFormData');

      // Navigate immediately to order page
      const url = `/order?id=${result.order_id}&new=1`;
      if (typeof smoothNavigate === 'function') {
        smoothNavigate(url);
      } else {
        window.location.href = url;
      }
    } else {
      throw new Error(result.error || 'Ошибка при создании заказа');
    }
  } catch (error) {
    console.error('Error creating order:', error);
    showConfirmationModal('Произошла ошибка при оформлении заказа. Попробуйте позже.', 'error');

    if (submitButton) {
      submitButton.disabled = false;
      submitButton.innerHTML = '<svg width="16" height="16" style="margin-right: 8px;"><use href="#checkmark"></use></svg> Отправить заказ';
    }
  }
}

// ============ PAGE INITIALIZATION ============

async function initCheckoutPage() {

  // Initialize auth
  await initAuth();
  isUserLoggedIn = isLoggedIn();

  // Check if user is logged in
  if (!isUserLoggedIn) {
    showPageScreen(document.querySelector('.checkout-form-container'), {
      title: 'Необходима авторизация',
      text: 'Войдите в аккаунт для оформления заказа',
      buttons: [{ label: 'Войти', href: '/profile' }],
    });
    return;
  }

  // Load cart
  loadCart();

  // Load from server if logged in
  if (isUserLoggedIn) {
    try {
      const serverData = await loadCartFromServer();

      // Merge local cart with server cart
      if (serverData && serverData.cart) {
        const mergedCart = mergeCart(cart, serverData.cart);
        const mergedVariations = mergeCartVariations(cartVariations, serverData.variations);

        // Save merged data to localStorage
        localStorage.setItem('tributeCart', JSON.stringify(mergedCart));
        localStorage.setItem('tributeCartVariations', JSON.stringify(mergedVariations));

        // Update global references
        cart = mergedCart;
        cartVariations = mergedVariations;
        window.cart = cart;

      }
    } catch (e) {
      console.error('Error loading cart from server:', e);
    }
  }

  // Load products and prices
  await Promise.all([loadProducts(), loadPrices()]);

  // Initialize shipping module with cart reference
  initShippingModule(cart, allProducts, getProductPrice, formatNumberRussian);

  // Initialize shipping calculation (buttons) - do this BEFORE checking cart
  // so buttons work even during loading
  initShippingCalculation();

  // Initialize form handlers
  initPersonalInfoVisibility();
  initCertificateDeliveryToggle();

  // Render cart summary
  renderCartSummary();

  // Warn if any checked items are missing variation numbers
  if (checkMissingVariations().length > 0) {
    showVariationWarningBanner();
  }

  // Auto-apply promo code from cart if available
  autoApplyPromoFromCart();

  // Check if cart is empty after rendering
  const checkedItems = Object.entries(cart).filter(([key, item]) => item.checked !== false);
  if (checkedItems.length === 0) {
    return;
  }

  // Load saved form data
  loadSavedOrderData();

  // Load saved addresses for address picker (logged-in users)
  loadSavedAddressSelector();

  // Init field blur validation
  initFieldBlurValidation();

  // Setup form submit handler
  const checkoutForm = document.getElementById('checkoutForm');
  if (checkoutForm) {
    checkoutForm.addEventListener('submit', handleOrderSubmit);
    checkoutForm.addEventListener('input', saveOrderDataToLocalStorage);
    checkoutForm.addEventListener('change', saveOrderDataToLocalStorage);
  }

  // Initialize FAQ popup
  initFAQPopup();

  // Load FAQ info boxes
  renderFaqInfoBoxes('checkout', document.getElementById('checkout-faq-info-boxes'));

}

// ============ PAGE LIFECYCLE ============

// Register cleanup function for SPA navigation
window.cleanupCheckoutPage = function() {
  const checkoutForm = document.getElementById('checkoutForm');
  if (checkoutForm) {
    checkoutForm.removeEventListener('submit', handleOrderSubmit);
    checkoutForm.removeEventListener('input', saveOrderDataToLocalStorage);
    checkoutForm.removeEventListener('change', saveOrderDataToLocalStorage);
  }
};

// Register page with router
if (typeof window.registerPage === 'function') {
  window.registerPage('/checkout', {
    init: initCheckoutPage,
    cleanup: window.cleanupCheckoutPage
  });
}

// Initialize on DOMContentLoaded or immediately if DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCheckoutPage);
} else {
  initCheckoutPage();
}

// Re-init on SPA navigation
window.addEventListener('spa:pageenter', (e) => {
  if (e.detail?.path === '/checkout') {
    initCheckoutPage();
  }
});

// Cleanup on SPA navigation
window.addEventListener('spa:pageleave', (e) => {
  if (e.detail?.path === '/checkout') {
    window.cleanupCheckoutPage?.();
  }
});

export { initCheckoutPage };
