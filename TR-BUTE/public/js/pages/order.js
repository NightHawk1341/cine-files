// ============================================================
// ORDER PAGE
// Displays detailed information for a specific order
// ============================================================

// Import auth functions
import { init as initAuth, isLoggedIn, getAccessToken } from '../core/auth.js';
import { initFAQPopup, addFAQButton } from '../modules/faq-popup.js';
// Import mobile-modal to initialize window.mobileModal for styled dialogs
import '../modules/mobile-modal.js';

import { showPageScreen } from '../modules/page-screen.js';

// Import from sub-modules
import {
  formatNumberRussian, showModal, addImageSize, formatDate,
  STATUS_NAMES, DELIVERY_TYPE_NAMES, REVIEW_ALLOWED_STATUSES,
  isPaymentStatus, isRefundableStatus, isCourierDelivery,
  getMigratedStatus
} from './order/constants.js';
import { handlePayment, confirmPaymentStatus, initSpeedPay } from './order/payment.js';
import {
  handleCancellation, handleRefundRequest, handleReceivedConfirmation,
  showContactSupport, handleReorder
} from './order/actions.js';
import { renderTrackingSection } from './order/tracking.js';
import { renderStatusTimeline } from './order/status-timeline.js';
import { renderFaqInfoBoxes } from '../modules/faq-info-boxes.js';


const CUSTOM_PRODUCT_ID = 1;

function getOrderItemTypeLabel(item) {
  if (item.product_id === CUSTOM_PRODUCT_ID) {
    return '<span class="order-item-type-label">Изображение пользователя</span>';
  }
  if (item.product_type === 'custom' || item.type === 'custom' || item.status === 'custom') {
    return '<span class="order-item-type-label">Изображение пользователя с дизайном TR/BUTE</span>';
  }
  if ((item.product_type === 'оригинал' || item.type === 'оригинал') && item.variation_num && !String(item.variation_num).startsWith('http')) {
    return `<span class="order-item-type-label">Вариант ${item.variation_num}</span>`;
  }
  return '';
}

// ============================================================
// DOM ELEMENT REFERENCES (queried in init)
// ============================================================

let orderNumberEl = null;
let orderStatusEl = null;
let orderInfoEl = null;
let orderItemsEl = null;
let orderTotalEl = null;
let orderActionsEl = null;

/**
 * Query all DOM elements (called during init)
 */
const queryOrderElements = () => {
  orderNumberEl = document.getElementById('order-number');
  orderStatusEl = document.getElementById('order-status');
  orderInfoEl = document.getElementById('order-info');
  orderItemsEl = document.getElementById('order-items');
  orderTotalEl = document.getElementById('order-total');
  orderActionsEl = document.getElementById('order-actions');
};

// ============================================================
// ORDER EDIT STATE
// ============================================================

// Existing order-level review (set before render)
let currentOrderReview = null;


// ============================================================
// ORDER DATA FETCHING
// ============================================================

/**
 * Fetch order by ID from API
 */
async function fetchOrder(orderId) {
  try {
    // Check if user is logged in
    if (!isLoggedIn()) {
      throw new Error('Требуется авторизация');
    }

    const token = getAccessToken();
    const response = await fetch(`/api/orders/get-order?id=${orderId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Заказ не найден');
      } else if (response.status === 403) {
        throw new Error('Доступ запрещен');
      } else {
        throw new Error('Ошибка загрузки заказа');
      }
    }

    const result = await response.json();

    // Response format: { success: true, order: {...} }
    return result.order;

  } catch (error) {
    console.error('Error fetching order:', error);
    throw error;
  }
}

// ============================================================
// ORDER RENDERING
// ============================================================

/**
 * Render order header (number and status)
 */
function renderOrderHeader(order) {
  // Check if order has been edited
  const hasEdits = order.items?.some(item =>
    item.admin_added || item.admin_modified || item.deleted_by_admin
  ) || order.address_edited;

  orderNumberEl.innerHTML = `#${order.id}${hasEdits ? ' <span style="color: var(--text-tertiary); font-size: 0.875rem; font-weight: normal;">(редактировано)</span>' : ''}`;

  const statusName = STATUS_NAMES[order.status] || order.status;
  orderStatusEl.textContent = statusName;
  orderStatusEl.className = `order-status ${order.status}`;
}

/**
 * Render order information (customer details and date)
 */
function renderOrderInfo(order) {
  const address = order.address;
  const date = formatDate(order.created_at);
  const deliveryType = order.delivery_type || '';
  const deliveryTypeName = DELIVERY_TYPE_NAMES[deliveryType] || deliveryType;
  const isCourier = isCourierDelivery(deliveryType);

  let html = `<div class="order-info-row">
    <span class="order-info-label">Дата заказа:</span>
    <span class="order-info-value">${date}</span>
  </div>`;

  const hasAddressContent = address && (address.surname || address.name || address.phone || address.address);

  if (hasAddressContent) {
    html += `
      <div class="order-info-row">
        <span class="order-info-label">Получатель:</span>
        <span class="order-info-value">${address.surname} ${address.name}</span>
      </div>
      <div class="order-info-row">
        <span class="order-info-label">Телефон:</span>
        <span class="order-info-value">${address.phone}</span>
      </div>
    `;

    if (deliveryType && deliveryType !== 'pdf') {
      html += `
        <div class="order-info-row">
          <span class="order-info-label">Способ доставки:</span>
          <span class="order-info-value">${deliveryTypeName}</span>
        </div>
      `;
    }

    const isPvzDelivery = deliveryType === 'cdek_pvz';
    const isPochtaDelivery = ['pochta', 'pochta_standard', 'pochta_first_class', 'pochta_courier'].includes(deliveryType);
    const isEms = deliveryType === 'courier_ems';

    if (isPvzDelivery && address.pvz_address) {
      // CDEK PVZ: show PVZ code + address, not user home address
      html += `
        <div class="order-info-row">
          <span class="order-info-label">Пункт выдачи:</span>
          <span class="order-info-value">${address.pvz_code ? address.pvz_code + ' — ' : ''}${address.pvz_address}</span>
        </div>
      `;
    } else if (isPochtaDelivery) {
      // Pochta: show postal index + address
      html += `
        <div class="order-info-row">
          <span class="order-info-label">Адрес доставки:</span>
          <span class="order-info-value">${address.postal_index ? address.postal_index + ', ' : ''}${address.address || ''}</span>
        </div>
      `;
    } else if (isEms || deliveryType === 'cdek_courier') {
      // EMS courier / CDEK courier: show address only, no index
      html += `
        <div class="order-info-row">
          <span class="order-info-label">Адрес доставки:</span>
          <span class="order-info-value">${address.address || ''}</span>
        </div>
      `;
    } else if (address.address) {
      // Fallback for other types
      html += `
        <div class="order-info-row">
          <span class="order-info-label">Адрес доставки:</span>
          <span class="order-info-value">${address.postal_index ? address.postal_index + ', ' : ''}${address.address}</span>
        </div>
      `;
    }

    if (isCourier && (address.apartment || address.floor || address.entrance)) {
      const courierParts = [];
      if (address.apartment) courierParts.push(`кв. ${address.apartment}`);
      if (address.floor) courierParts.push(`эт. ${address.floor}`);
      if (address.entrance) courierParts.push(`подъезд ${address.entrance}`);
      html += `
        <div class="order-info-row">
          <span class="order-info-label">Для курьера:</span>
          <span class="order-info-value">${courierParts.join(', ')}</span>
        </div>
      `;
    }

    if (address.comment) {
      html += `
        <div class="order-info-row">
          <span class="order-info-label">Комментарий:</span>
          <span class="order-info-value">${address.comment}</span>
        </div>
      `;
    }
  }

  // Add delivery information if available (when admin has filled it).
  // Skip for PDF cert-only orders — no physical delivery to display.
  const hasDeliveryInfo = deliveryType !== 'pdf' && (order.delivery_cost || order.delivery_type || order.delivery_timeframe || order.delivery_notes || order.shipment_date);

  if (hasDeliveryInfo) {
    html += `<div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border-color);">`;
    html += `<h3 style="margin: 0 0 12px 0; font-size: 1rem; color: var(--text-primary);">Информация о доставке</h3>`;

    if (order.delivery_type) {
      const deliveryTypeName = DELIVERY_TYPE_NAMES[order.delivery_type] || order.delivery_type;
      html += `
        <div class="order-info-row">
          <span class="order-info-label">Тип доставки:</span>
          <span class="order-info-value">${deliveryTypeName}</span>
        </div>
      `;
    }

    if (order.delivery_cost !== null && order.delivery_cost !== undefined) {
      html += `
        <div class="order-info-row">
          <span class="order-info-label">Стоимость доставки:</span>
          <span class="order-info-value">${formatNumberRussian(order.delivery_cost)} ₽</span>
        </div>
      `;
    }

    if (order.shipment_date) {
      const shipmentDate = new Date(order.shipment_date).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
      html += `
        <div class="order-info-row">
          <span class="order-info-label">Дата отправки:</span>
          <span class="order-info-value">${shipmentDate}</span>
        </div>
      `;
    }

    if (order.delivery_timeframe) {
      html += `
        <div class="order-info-row">
          <span class="order-info-label">Сроки доставки:</span>
          <span class="order-info-value">${order.delivery_timeframe}</span>
        </div>
      `;
    }

    if (order.delivery_notes) {
      html += `
        <div class="order-info-row">
          <span class="order-info-label">Примечания:</span>
          <span class="order-info-value">${order.delivery_notes}</span>
        </div>
      `;
    }

    html += `</div>`;
  }

  orderInfoEl.innerHTML = html;
}

// ============================================================
// ORDER ITEMS RENDERING
// ============================================================

/**
 * Render order items
 */
function renderOrderItems(order) {
  const items = order.items || [];

  if (items.length === 0) {
    orderItemsEl.innerHTML = '<p class="order-empty">Нет товаров в заказе</p>';
    return;
  }

  // Separate redemption items from purchasable items
  const redemptionItems = items.filter(item => item.is_redemption);
  const regularItems = items.filter(item => !item.is_redemption);

  let html = regularItems.map(item => {
    // Certificate purchases get a special simplified card
    if (item.is_certificate && !item.is_redemption) {
      const certImage = item.cert_image_url || item.image || '/images/certificate-placeholder.png';
      const certAmount = formatNumberRussian(item.price_at_purchase || 0);
      const recipientDisplay = item.cert_recipient_name ? `Для: ${item.cert_recipient_name}` : '';
      // certificate_code is null for unpaid certs (PENDING- codes are filtered by API)
      const hasCode = !!item.certificate_code;
      const hasCertImage = !!item.cert_image_url;
      const isPaid = order.status === 'paid' || order.status === 'delivered' || order.status === 'awaiting_certificate' || order.status === 'confirmed' || order.status === 'shipped' || order.status === 'on_hold';
      return `
        <div class="order-item horizontal-card order-cert-item">
          <div class="horizontal-card-top">
            <div class="horizontal-card-image-wrapper">
              <img src="${certImage}" alt="Сертификат" class="horizontal-card-image" loading="lazy">
            </div>
            <div class="horizontal-card-info">
              <div class="horizontal-card-title">${item.title || 'Подарочный сертификат'}</div>
              ${recipientDisplay ? `<div style="font-size:0.8rem;color:var(--text-tertiary);margin-top:3px;">${recipientDisplay}</div>` : ''}
            </div>
          </div>
          <div class="horizontal-card-bar">
            <div class="horizontal-card-bar-info"><span>Сертификат</span></div>
            <div class="horizontal-card-bar-price">
              <span class="horizontal-card-price">${certAmount} ₽</span>
            </div>
          </div>
          ${hasCode ? `
          <div class="order-cert-code-block">
            <span class="order-cert-code-label">Код сертификата</span>
            <div class="order-cert-code-row">
              <span class="order-cert-code">${item.certificate_code}</span>
              <button class="order-cert-code-copy" data-code="${item.certificate_code}" title="Копировать">Копировать</button>
            </div>
          </div>` : isPaid ? `
          <div class="order-cert-code-block" style="opacity:0.6;">
            <span class="order-cert-code-label">Код сертификата</span>
            <div style="font-size:0.85rem;color:var(--text-tertiary);margin-top:4px;">Код отправлен вам в уведомлении</div>
          </div>` : `
          <div class="order-cert-code-block" style="opacity:0.6;">
            <span class="order-cert-code-label">Код сертификата</span>
            <div style="font-size:0.85rem;color:var(--text-tertiary);margin-top:4px;">Будет доступен после оплаты</div>
          </div>`}
          ${hasCertImage ? `
          <div class="order-cert-image-block" style="margin-top:12px;">
            <a href="${item.cert_image_url}" target="_blank" rel="noopener noreferrer">
              <img src="${item.cert_image_url}" alt="Сертификат" style="width:100%;border-radius:8px;display:block;" loading="lazy">
            </a>
            <div class="order-cert-actions">
              <button class="order-cert-action-btn order-cert-download" data-url="${item.cert_image_url}" data-code="${item.certificate_code || 'cert'}">📥 Скачать</button>
              <button class="order-cert-action-btn order-cert-share" data-url="${item.cert_image_url}" data-code="${item.certificate_code || 'cert'}">📤 Поделиться</button>
            </div>
          </div>` : isPaid && hasCode ? `
          <div style="margin-top:12px;padding:10px 14px;border-radius:8px;background:var(--bg-tertiary);font-size:0.82rem;color:var(--text-secondary);">
            Изображение сертификата готовится и скоро будет добавлено
          </div>` : ''}
        </div>
      `;
    }
    // Check if variation_num is a URL or a number
    const isUrl = item.variation_num && (item.variation_num.startsWith('http://') || item.variation_num.startsWith('https://'));

    // Show variation or poster URL with proper label
    let variationDisplay = '';
    let customUrlDisplay = '';

    if (item.variation_num) {
      if (isUrl) {
        customUrlDisplay = `
          <p class="order-item-custom-url" style="font-size: 0.75rem; color: var(--text-tertiary); margin-top: 4px;">
            <strong>Ссылка на постер:</strong> <a href="${item.variation_num}" target="_blank" rel="noopener noreferrer" style="color: #ff6b35; text-decoration: underline;">${item.variation_num.substring(0, 50)}${item.variation_num.length > 50 ? '...' : ''}</a>
          </p>
        `;
      } else {
        variationDisplay = ` [вар. ${item.variation_num}]`;
      }
    }

    // Use custom URL as image if available for custom products
    let imageUrl;
    const posterUrl = item.custom_url || (isUrl ? item.variation_num : null);
    if (posterUrl) {
      imageUrl = addImageSize(posterUrl, '480x0');
    } else {
      imageUrl = addImageSize(item.image || '/placeholder.png', '480x0');
    }

    const currentQuantity = item.quantity;
    const itemTotal = item.price_at_purchase * currentQuantity;

    // Determine styling based on admin changes
    const isDeleted = item.deleted_by_admin;
    const isAdded = item.admin_added;
    const isModified = item.admin_modified;

    // Add classes for triptych, custom, and special products
    const isTriptych = item.triptych || (item.property && item.property.includes('триптих'));
    const isCustomProduct = item.product_type === 'custom' || item.type === 'custom' || item.custom_url || isUrl;
    const isSpecialProduct = item.product_type === 'фирменный' || item.type === 'фирменный';

    // Use horizontal-card base class for consistent styling
    const classes = ['order-item', 'horizontal-card'];
    if (isDeleted) classes.push('deleted');
    if (isTriptych) classes.push('triptych');
    if (isCustomProduct) classes.push('custom-product');
    if (isSpecialProduct) classes.push('special-product');
    const itemClass = classes.join(' ');
    const highlightStyle = (isAdded || isModified) && !isDeleted
      ? 'background: #fffbea; border-left: 3px solid #f59e0b; padding-left: 12px;'
      : '';
    const deletedStyle = isDeleted
      ? 'opacity: 0.5; text-decoration: line-through;'
      : '';

    // Build product URL for navigation
    const productUrl = `/product?id=${item.product_slug || item.product_id || ''}`;


    return `
      <div class="${itemClass}" style="${highlightStyle}${deletedStyle}" data-item-id="${item.id}">
        <div class="horizontal-card-top">
          <div class="horizontal-card-image-wrapper${isTriptych ? ' triptych' : ''}">
            <a href="${productUrl}" class="horizontal-card-image-link order-item-image-link">
              <img src="${imageUrl}" alt="${item.title}" class="horizontal-card-image" loading="lazy" style="${isDeleted ? 'opacity: 0.5;' : ''}" onerror="this.src='${addImageSize(item.image || '/placeholder.png', '480x0')}'">
            </a>
          </div>
          <div class="horizontal-card-info">
            <a href="${productUrl}" class="horizontal-card-title-link order-item-title-link">
              <div class="horizontal-card-title">${item.title}${isAdded ? ' <span style="color: #f59e0b; font-size: 0.75rem;">(добавлено)</span>' : ''}</div>
            </a>
            ${getOrderItemTypeLabel(item)}
            ${customUrlDisplay}
          </div>
        </div>
        <div class="horizontal-card-bar">
          <div class="horizontal-card-bar-info" style="${isModified ? 'color: #f59e0b;' : ''}">
            <span>${item.property}${variationDisplay}</span>
            <span class="horizontal-card-bar-qty">× ${currentQuantity}</span>
          </div>
          <div class="horizontal-card-bar-price">
            <span class="horizontal-card-price">${formatNumberRussian(itemTotal)} ₽</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Render certificate redemption items as discount rows
  if (redemptionItems.length > 0) {
    redemptionItems.forEach(item => {
      const discountAmount = formatNumberRussian(Math.abs(item.price_at_purchase || 0));
      html += `
        <div class="order-cert-discount-row">
          <span class="order-cert-discount-label">Сертификат <strong>${item.certificate_code || ''}</strong></span>
          <span class="order-cert-discount-amount">−${discountAmount} ₽</span>
        </div>
      `;
    });
  }

  orderItemsEl.innerHTML = html;

  // Copy cert code buttons
  orderItemsEl.querySelectorAll('.order-cert-code-copy').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.code);
        btn.textContent = 'Скопировано';
        setTimeout(() => { btn.textContent = 'Копировать'; }, 2000);
      } catch (err) {
        console.error('Failed to copy cert code:', err);
      }
    });
  });

  // Certificate image download
  orderItemsEl.querySelectorAll('.order-cert-download').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        const response = await fetch(btn.dataset.url);
        const blob = await response.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `certificate-${btn.dataset.code}.jpg`;
        a.click();
        URL.revokeObjectURL(a.href);
      } catch (err) {
        console.error('Failed to download certificate:', err);
      }
    });
  });

  // Certificate image share
  orderItemsEl.querySelectorAll('.order-cert-share').forEach(btn => {
    btn.addEventListener('click', async () => {
      const url = btn.dataset.url;
      const title = 'Подарочный сертификат TR/BUTE';
      if (navigator.share) {
        try {
          const response = await fetch(url);
          const blob = await response.blob();
          const file = new File([blob], `certificate-${btn.dataset.code}.jpg`, { type: blob.type });
          await navigator.share({ files: [file], title });
          return;
        } catch (e) {
          if (e.name === 'AbortError') return;
        }
      }
      if (window.sharing) {
        window.sharing.shareBrowser({ url, title });
      } else {
        try {
          await navigator.clipboard.writeText(url);
          if (window.showToast) window.showToast('Ссылка скопирована');
        } catch (e) {
          console.error('Failed to share certificate:', e);
        }
      }
    });
  });

  // Add smart navigation handlers for links
  const orderItemLinks = orderItemsEl.querySelectorAll('.order-item-image-link, .order-item-title-link');
  orderItemLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        const href = link.getAttribute('href');
        if (typeof smoothNavigate === 'function') {
          smoothNavigate(href);
        } else {
          window.location.href = href;
        }
      }
    });
  });

}


// ============================================================
// ORDER-LEVEL REVIEW
// ============================================================

/**
 * Load existing user review for this order
 */
async function loadOrderReview(orderId) {
  currentOrderReview = null;
  try {
    const token = getAccessToken();
    const response = await fetch(`/api/reviews/order/${orderId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.ok) {
      const data = await response.json();
      currentOrderReview = data.review || null;
    }
  } catch (err) {
    console.error('Error loading order review:', err);
  }
}

/**
 * Render the order-level review section (form or existing review)
 */
function renderOrderReviewSection(order) {
  const section = document.getElementById('order-review-section');
  const container = document.getElementById('order-review-form-container');
  if (!section || !container) return;

  if (!REVIEW_ALLOWED_STATUSES.includes(getMigratedStatus(order.status))) {
    section.style.display = 'none';
    return;
  }

  section.style.display = '';

  // Build poster list label
  const productItems = (order.items || []).filter(item => item.product_id && !item.deleted_by_admin && !item.is_redemption);
  const posterTitles = [...new Map(productItems.map(i => [i.product_id, i.title])).values()];
  const posterLabel = posterTitles.length > 0
    ? `<div class="order-review-posters">Постеры в заказе: <span>${posterTitles.map(t => `<span class="order-review-poster-title">${t}</span>`).join(', ')}</span></div>`
    : '';

  if (currentOrderReview) {
    const stars = '★'.repeat(currentOrderReview.rating) + '☆'.repeat(5 - currentOrderReview.rating);
    container.innerHTML = `
      ${posterLabel}
      <div class="order-existing-review">
        <div class="order-existing-review-header">
          <span class="order-existing-review-label">Ваш отзыв</span>
          <span class="order-existing-review-stars">${stars}</span>
        </div>
        <p class="order-existing-review-text">${currentOrderReview.review_text}</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    ${posterLabel}
    <div class="review-form" id="order-review-form">
      <div class="review-form-textarea-wrapper">
        <textarea class="review-form-textarea" id="order-review-textarea" placeholder="Поделитесь впечатлениями от заказа..."></textarea>
      </div>
      <div class="review-form-actions-group">
        <button class="review-form-button" id="order-review-submit-btn">Отправить отзыв</button>
        <div class="review-form-stars" id="order-review-stars">
          <button class="review-star-btn" data-rating="1">★</button>
          <button class="review-star-btn" data-rating="2">★</button>
          <button class="review-star-btn" data-rating="3">★</button>
          <button class="review-star-btn" data-rating="4">★</button>
          <button class="review-star-btn" data-rating="5">★</button>
        </div>
      </div>
    </div>
  `;

  initOrderReviewForm(order);
}

/**
 * Set up star and submit handlers for the order review form
 */
function initOrderReviewForm(order) {
  const form = document.getElementById('order-review-form');
  if (!form) return;

  const stars = form.querySelectorAll('.review-star-btn');
  const textarea = form.querySelector('#order-review-textarea');
  const submitBtn = form.querySelector('#order-review-submit-btn');
  let selectedRating = 0;

  stars.forEach(star => {
    const rating = parseInt(star.dataset.rating);
    star.addEventListener('mouseenter', () => {
      stars.forEach((s, idx) => s.classList.toggle('hovered', idx < rating));
    });
    star.addEventListener('mouseleave', () => {
      stars.forEach(s => s.classList.remove('hovered'));
    });
    star.addEventListener('click', () => {
      selectedRating = selectedRating === rating ? 0 : rating;
      stars.forEach((s, idx) => s.classList.toggle('selected', idx < selectedRating));
    });
  });

  if (textarea) {
    textarea.addEventListener('input', () => {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    });
  }

  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      if (selectedRating === 0) {
        window.showToast('Выберите оценку', 'removed');
        return;
      }
      const text = textarea?.value?.trim();
      if (!text || text.length < 10) {
        window.showToast('Отзыв должен содержать минимум 10 символов', 'removed');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Отправляем...';

      try {
        const token = getAccessToken();
        const response = await fetch('/api/reviews', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: order.id, rating: selectedRating, reviewText: text })
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || 'Не удалось отправить отзыв');
        }

        const reviewData = await response.json();
        currentOrderReview = { rating: selectedRating, review_text: text, id: reviewData.id };
        window.showToast('Отзыв отправлен! Спасибо!');
        renderOrderReviewSection(order);
      } catch (error) {
        console.error('Error submitting order review:', error);
        window.showToast(`Ошибка: ${error.message}`, 'removed');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Отправить отзыв';
      }
    });
  }
}



// ============================================================
// ORDER COMPOSITION (СОСТАВ ЗАКАЗА)
// ============================================================

/**
 * Render a compact Состав заказа summary card from order items
 */
function renderOrderComposition(order) {
  const container = document.getElementById('order-composition');
  if (!container) return;

  const items = (order.items || []).filter(item => !item.is_redemption && !item.deleted_by_admin);
  if (items.length === 0) {
    container.innerHTML = '';
    return;
  }

  // Aggregate items by property/format
  const aggregatedMap = new Map();
  items.forEach(item => {
    const label = item.property || item.title || '';
    const qty = item.quantity || 1;
    const price = (item.price_at_purchase || 0) * qty;
    const existing = aggregatedMap.get(label);
    if (existing) {
      existing.quantity += qty;
      existing.price += price;
    } else {
      aggregatedMap.set(label, { name: label, quantity: qty, price });
    }
  });
  const aggregatedItems = [...aggregatedMap.values()].sort((a, b) => b.price - a.price);

  const summaryCard = document.createElement('div');
  summaryCard.className = 'cart-order-summary order-composition-card';

  const titleEl = document.createElement('div');
  titleEl.className = 'cart-order-summary-title';
  titleEl.textContent = 'Состав заказа';
  summaryCard.appendChild(titleEl);

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
  const redemptionItems = (order.items || []).filter(item => item.is_redemption);
  redemptionItems.forEach(item => {
    const discountRow = document.createElement('div');
    discountRow.className = 'cart-summary-row cart-summary-discount-row';
    discountRow.innerHTML = `
      <span class="cart-summary-item-qty">%</span>
      <span class="cart-summary-item-name">Сертификат <strong>${item.certificate_code || ''}</strong></span>
      <span class="cart-summary-item-price-wrapper">
        <span class="cart-summary-item-price">−${formatNumberRussian(Math.abs(item.price_at_purchase || 0))} ₽</span>
      </span>
    `;
    table.appendChild(discountRow);
  });

  // Promo code discount row inside the table
  if (order.promo_code && order.discount_amount > 0) {
    const promoRow = document.createElement('div');
    promoRow.className = 'cart-summary-row cart-summary-discount-row';
    promoRow.innerHTML = `
      <span class="cart-summary-item-qty">%</span>
      <span class="cart-summary-item-name">Промокод <strong>${order.promo_code}</strong></span>
      <span class="cart-summary-item-price-wrapper">
        <span class="cart-summary-item-price">−${formatNumberRussian(Number(order.discount_amount))} ₽</span>
      </span>
    `;
    table.appendChild(promoRow);
  }

  summaryCard.appendChild(table);

  container.innerHTML = '';
  container.appendChild(summaryCard);
}

// ============================================================
// ORDER TOTAL RENDERING
// ============================================================

/**
 * Render order total (pricing breakdown)
 */
function renderOrderTotal(order) {
  const totalPrice = Number(order.total_price) || 0;
  const deliveryCost = Number(order.delivery_cost) || 0;
  const packagingCost = Number(order.packaging_cost) || 0;

  let html = `
    <div class="order-total-row">
      <span>Товары:</span>
      <span>${formatNumberRussian(totalPrice)} ₽</span>
    </div>
  `;

  if (deliveryCost > 0) {
    html += `
      <div class="order-total-row">
        <span>Доставка:</span>
        <span>${formatNumberRussian(deliveryCost)} ₽</span>
      </div>
    `;
  }

  if (packagingCost > 0) {
    html += `
      <div class="order-total-row">
        <span>Упаковка:</span>
        <span>${formatNumberRussian(packagingCost)} ₽</span>
      </div>
    `;
  }

  const grandTotal = totalPrice + deliveryCost + packagingCost;

  html += `
    <div class="order-total-row order-total-final">
      <span>Итого:</span>
      <span>${formatNumberRussian(grandTotal)} ₽</span>
    </div>
  `;

  orderTotalEl.innerHTML = html;
}

// ============================================================
// ORDER ACTIONS RENDERING
// ============================================================

/**
 * Render order actions (payment button, etc.)
 */
function renderOrderActions(order) {
  let html = '';

  if (order.status === 'created' || order.status === 'awaiting_calculation') {
    html += `
      <div style="margin-bottom: 16px; padding: 16px; background: rgba(255, 193, 7, 0.08); border: 1px solid rgba(255, 193, 7, 0.3); border-radius: 12px;">
        <p style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 0.9rem;">
          Заказ принят. Мы рассчитаем стоимость доставки и уведомим вас — после этого можно будет оплатить.
        </p>
        <button class="order-action-button order-cancel-button" id="order-cancel-button" style="background: transparent; color: #ef4444; border: 1px solid #ef4444; width: 100%;">
          Отменить заказ
        </button>
      </div>
    `;
  }

  if (isPaymentStatus(order.status)) {
    const totalAmount = (order.total_price || 0) + (order.delivery_cost || 0) + (order.packaging_cost || 0);
    html += `
      <button class="order-action-button order-pay-button" id="order-pay-button">
        Оплатить картой ${formatNumberRussian(totalAmount)} ₽
      </button>
      <div id="speedpay-container" class="speedpay-container" style="display: none;"></div>
      <button class="order-action-button order-cancel-button" id="order-cancel-button" style="background: transparent; color: #ef4444; border: 1px solid #ef4444; width: 100%; margin-top: 8px;">
        Отменить заказ
      </button>
    `;
  }

  if (order.status === 'refund_requested') {
    html += `
      <div class="refund-status-section">
        <div class="refund-status-title">Возврат средств</div>
        <div class="refund-status-info">
          Ваш запрос на возврат получен и находится на рассмотрении.${order.refund_reason ? `<br>Причина: ${order.refund_reason}` : ''}
        </div>
      </div>
    `;
  }

  if (order.status === 'refunded') {
    html += `
      <div class="refund-status-section" style="background: rgba(156, 39, 176, 0.08); border-color: rgba(156, 39, 176, 0.2);">
        <div class="refund-status-title" style="color: #9c27b0;">Возврат завершён</div>
        <div class="refund-status-info">Средства возвращены. Срок зачисления зависит от вашего банка и может занять до 5 рабочих дней.</div>
      </div>
    `;
  }

  if (isRefundableStatus(order.status)) {
    html += `
      <button class="order-action-button order-refund-button" id="order-refund-button" style="background: transparent; color: #f59e0b; border: 1px solid #f59e0b;">
        Запросить возврат
      </button>
    `;
  }

  if (order.status === 'shipped' || order.status === 'parcel_ready') {
    html += `
      <button class="order-action-button order-received-button" id="order-received-button" style="background: #10b981; color: white;">
        Получил заказ
      </button>
    `;
  }

  if (order.status === 'delivered') {
    html += `
      <div style="margin-bottom: 16px; padding: 16px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 12px;">
        <p style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 0.9rem;">
          Заказ доставлен! Если вам всё понравилось, оставьте отзыв на странице товара.
        </p>
        <button class="order-action-button order-contact-button" id="order-contact-button" style="background: transparent; color: #f59e0b; border: 1px solid #f59e0b; width: 100%;">
          Проблемы с заказом?
        </button>
      </div>
    `;
  }

  // Reorder button: show when order has non-certificate items
  const hasReorderableItems = (order.items || []).some(i => !i.is_certificate && !i.is_redemption && !i.deleted_by_admin);
  if (hasReorderableItems) {
    html += `
      <button class="order-action-button" id="order-reorder-button" style="background: transparent; color: var(--brand-primary); border: 1px solid var(--brand-primary); width: 100%; margin-top: 8px;">
        Повторить заказ
      </button>
    `;
  }

  html += `
    <a href="/profile" class="order-action-button order-back-button">
      ← Вернуться в профиль
    </a>
  `;

  orderActionsEl.innerHTML = html;

  // Reorder handler
  if (hasReorderableItems) {
    document.getElementById('order-reorder-button')?.addEventListener('click', () => handleReorder(order));
  }

  // Wire up action handlers
  if (order.status === 'created' || order.status === 'awaiting_calculation') {
    document.getElementById('order-cancel-button')?.addEventListener('click', () => handleCancellation(order));
  }

  if (isPaymentStatus(order.status)) {
    document.getElementById('order-pay-button')?.addEventListener('click', () => handlePayment(order));
    document.getElementById('order-cancel-button')?.addEventListener('click', () => handleCancellation(order));
    initSpeedPay(order);
  }

  if (isRefundableStatus(order.status)) {
    document.getElementById('order-refund-button')?.addEventListener('click', () => handleRefundRequest(order));
  }

  if (order.status === 'shipped' || order.status === 'parcel_ready') {
    document.getElementById('order-received-button')?.addEventListener('click', () => handleReceivedConfirmation(order));
  }

  if (order.status === 'delivered') {
    document.getElementById('order-contact-button')?.addEventListener('click', () => showContactSupport(order));
  }
}

// ============================================================
// RENDER COMPLETE ORDER
// ============================================================

/**
 * Render complete order
 */
function renderOrder(order) {
  renderOrderHeader(order);
  renderOrderInfo(order);
  renderOrderItems(order);
  renderOrderComposition(order);
  renderOrderReviewSection(order);
  renderOrderTotal(order);
  renderOrderActions(order);
  renderTrackingSection(order, orderInfoEl);
  // Status timeline (async, appends after order-info)
  const existingTimeline = document.querySelector('.status-timeline-section');
  if (existingTimeline) existingTimeline.remove();
  renderStatusTimeline(order, orderInfoEl.closest('.order-section'));
}

/**
 * Show error message
 */
function showError(message) {
  const container = document.querySelector('.order-page-content');
  showPageScreen(container, {
    icon: '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
    iconType: 'error',
    title: 'Ошибка',
    text: message,
    buttons: [{ label: 'На главную', href: '/' }],
  });
}

/**
 * Show loading state
 */
function showLoading() {
  orderNumberEl.textContent = '...';
  orderStatusEl.textContent = 'Загрузка...';
  orderInfoEl.innerHTML = '<div class="order-loading">Загрузка информации...</div>';
  orderItemsEl.innerHTML = '<div class="order-loading">Загрузка товаров...</div>';
  orderTotalEl.innerHTML = '<div class="order-loading">Загрузка итогов...</div>';
  orderActionsEl.innerHTML = '';
}

// ============================================================
// INITIALIZATION
// ============================================================

/**
 * Load and display order
 */
async function loadOrder(orderId, scrollToActions = false) {
  showLoading();

  try {
    const order = await fetchOrder(orderId);

    // Load existing order-level review (if any)
    await loadOrderReview(order.id);

    renderOrder(order);

    if (scrollToActions) {
      requestAnimationFrame(() => {
        const payBtn = document.getElementById('order-pay-button');
        const actionsEl = document.getElementById('order-actions');
        const target = payBtn || actionsEl;
        if (target) {
          const headerHeight = document.querySelector('.header')?.offsetHeight || 60;
          const rect = target.getBoundingClientRect();
          if (rect.bottom > window.innerHeight || rect.top < headerHeight) {
            window.scrollTo({
              top: window.pageYOffset + rect.top - headerHeight - 16,
              behavior: 'smooth'
            });
          }
        }
      });
    }
  } catch (error) {
    showError(error.message);
  }
}

// Page-level state for cleanup
let isOrderPageInitialized = false;

/**
 * Cleanup order page (called when navigating away via SPA router)
 */
function cleanupOrderPage() {
  isOrderPageInitialized = false;
}

/**
 * Initialize order page
 */
async function initOrderPage() {
  if (isOrderPageInitialized) {
    return;
  }
  isOrderPageInitialized = true;

  // Query DOM elements (required for SPA navigation)
  queryOrderElements();

  // Get order ID from URL
  const urlParams = new URLSearchParams(window.location.search);
  const orderId = urlParams.get('id');

  if (!orderId) {
    showError('Не указан ID заказа');
    return;
  }

  // Initialize auth and check if user is logged in
  await initAuth();

  if (!isLoggedIn()) {
    showError('Требуется авторизация для просмотра заказа');
    return;
  }

  // Initialize FAQ popup
  initFAQPopup('order');
  addFAQButton('.order-title');

  // Load FAQ info boxes
  renderFaqInfoBoxes('order', document.getElementById('order-faq-info-boxes'));

  // Handle return from mobile payment tab
  const paymentResult = urlParams.get('payment');
  if (paymentResult === 'success') {
    const cleanUrl = new URL(window.location);
    cleanUrl.searchParams.delete('payment');
    window.history.replaceState({}, '', cleanUrl);

    confirmPaymentStatus(orderId).then(paid => {
      if (paid) {
        showModal('Оплата прошла успешно! Спасибо за заказ.', 'success').then(() => {
          window.location.reload();
        });
      }
    });
  } else if (paymentResult === 'failed') {
    const cleanUrl = new URL(window.location);
    cleanUrl.searchParams.delete('payment');
    window.history.replaceState({}, '', cleanUrl);
  }

  // Load order; scroll to actions section if redirected from checkout
  const isNewOrder = urlParams.get('new') === '1';
  if (isNewOrder) {
    const cleanUrl = new URL(window.location);
    cleanUrl.searchParams.delete('new');
    window.history.replaceState({}, '', cleanUrl);
  }
  loadOrder(orderId, isNewOrder);
}

// Register with SPA router
if (typeof window.registerPage === 'function') {
  window.registerPage('/order', {
    init: initOrderPage,
    cleanup: cleanupOrderPage
  });
}

// Auto-initialize when script loads (for direct page visits only)
const isOrderPagePath = window.location.pathname === '/order' || window.location.pathname === '/order.html';
if (isOrderPagePath) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOrderPage);
  } else {
    initOrderPage();
  }
}
