/**
 * orders/rendering.js
 * Order rendering functions for the orders list
 */

import { SVGIcons, formatDate, formatNumber, getStatusText, getStatusClass, escapeHtml, addImageSize } from '../../utils.js';

// Track selected order IDs
const selectedOrderIds = new Set();

/**
 * Get currently selected order IDs
 */
export function getSelectedOrderIds() {
  return new Set(selectedOrderIds);
}

/**
 * Clear all selections
 */
export function clearSelections() {
  selectedOrderIds.clear();
  updateBulkActionBar();
  document.querySelectorAll('.order-select-checkbox').forEach(cb => {
    cb.checked = false;
  });
  document.querySelectorAll('.order-card-new').forEach(card => {
    card.classList.remove('order-card-selected');
  });
}

/**
 * Toggle order selection
 */
export function toggleOrderSelection(orderId) {
  if (selectedOrderIds.has(orderId)) {
    selectedOrderIds.delete(orderId);
  } else {
    selectedOrderIds.add(orderId);
  }

  const card = document.querySelector(`.order-card-new[data-order-id="${orderId}"]`);
  if (card) {
    card.classList.toggle('order-card-selected', selectedOrderIds.has(orderId));
  }

  const checkbox = document.querySelector(`.order-select-checkbox[data-order-id="${orderId}"]`);
  if (checkbox) {
    checkbox.checked = selectedOrderIds.has(orderId);
  }

  updateBulkActionBar();
}

/**
 * Update bulk action bar visibility and count
 */
function updateBulkActionBar() {
  let bar = document.getElementById('bulk-action-bar');
  const count = selectedOrderIds.size;

  if (count === 0) {
    if (bar) bar.classList.remove('visible');
    return;
  }

  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'bulk-action-bar';
    bar.className = 'bulk-action-bar';
    bar.innerHTML = `
      <div class="bulk-action-bar-content">
        <span class="bulk-action-count"></span>
        <div class="bulk-action-buttons">
          <button class="btn btn-secondary btn-sm" data-action="bulk-deselect-all">Снять выбор</button>
          <button class="btn btn-primary btn-sm" data-action="bulk-export-notion">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;vertical-align:middle;margin-right:4px;">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Экспорт в Notion
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(bar);
  }

  const countEl = bar.querySelector('.bulk-action-count');
  const word = getOrderWord(count);
  countEl.textContent = `Выбрано: ${count} ${word}`;
  bar.classList.add('visible');
}

function getOrderWord(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return 'заказов';
  if (mod10 === 1) return 'заказ';
  if (mod10 >= 2 && mod10 <= 4) return 'заказа';
  return 'заказов';
}

/**
 * Render orders list
 * @param {Array} orders - Orders to render
 */
export function renderOrders(orders) {
  const container = document.getElementById('orders-list');

  if (!container) {
    console.error('Orders list container not found');
    return;
  }

  if (orders.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon" style="width: 64px; height: 64px; color: var(--text-tertiary); margin: 0 auto;">${SVGIcons.package}</div>
        <h3>Нет заказов</h3>
        <p>Заказы будут отображаться здесь</p>
      </div>
    `;
    return;
  }

  container.innerHTML = orders.map(order => renderOrderCard(order)).join('');
  updateBulkActionBar();
}

/**
 * Render a single order card
 * @param {Object} order - Order object
 */
function renderOrderCard(order) {
  // Format user name
  const userName = order.address?.surname && order.address?.name
    ? `${order.address.surname} ${order.address.name}`
    : order.user?.first_name
    ? `${order.user.first_name} ${order.user.last_name || ''}`.trim()
    : order.user?.username || 'Пользователь';
  const userPhoto = order.user?.photo_url;
  const userInitial = (userName[0] || '?').toUpperCase();

  // Calculate total items count
  const totalItems = order.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;
  const totalWithDelivery = (parseFloat(order.total_price) || 0) + (parseFloat(order.delivery_cost) || 0);

  // Group products by base product_id to identify different variations
  const productGroups = {};
  if (order.items) {
    order.items.forEach(item => {
      const key = item.product_id || item.title;
      if (!productGroups[key]) {
        productGroups[key] = [];
      }
      productGroups[key].push(item);
    });
  }

  // Build products table
  const productsTableHTML = order.items && order.items.length > 0 ? `
    <table class="order-products-table">
      <thead>
        <tr>
          <th>Название</th>
          <th style="text-align: center;">Кол-во</th>
          <th style="text-align: right;">Цена</th>
        </tr>
      </thead>
      <tbody>
        ${Object.keys(productGroups).map(key => {
          const items = productGroups[key];
          const hasMultipleVariants = items.length > 1;

          return items.map((item) => {
            const isGroupedVariant = hasMultipleVariants;
            const itemTotal = item.price_at_purchase * item.quantity;

            // Classes for highlighting
            const rowClasses = ['order-product-row'];
            if (isGroupedVariant) rowClasses.push('variant-row');
            if (item.admin_added) rowClasses.push('admin-added-row');
            if (item.admin_modified) rowClasses.push('admin-modified-row');
            if (item.deleted_by_admin) rowClasses.push('deleted-row');

            return `
              <tr class="${rowClasses.join(' ')}" data-item-id="${item.id}">
                <td class="product-name-cell" title="${item.image ? 'Наведите для просмотра изображения' : ''}">
                  ${item.image ? `<div class="product-image-preview"><img src="${addImageSize(item.image, '480x0')}" alt="${escapeHtml(item.title)}"></div>` : ''}
                  <span class="${item.admin_added ? 'highlight-yellow' : ''}${item.deleted_by_admin ? 'text-strike' : ''}">${escapeHtml(item.title)}</span>
                  ${item.property ? `<div class="product-property ${item.admin_modified ? 'highlight-yellow' : ''}">${escapeHtml(item.property)}</div>` : ''}
                </td>
                <td style="text-align: center;" class="${item.admin_modified ? 'highlight-yellow' : ''}">
                  <span class="${item.deleted_by_admin ? 'text-strike' : ''}">${item.quantity}</span>
                </td>
                <td style="text-align: right;" class="${item.deleted_by_admin ? 'text-strike' : ''}">
                  ${formatNumber(itemTotal)}₽
                </td>
              </tr>
            `;
          }).join('');
        }).join('')}
      </tbody>
    </table>
  ` : '<p class="text-sm text-secondary">Нет товаров</p>';

  const isSelected = selectedOrderIds.has(order.id);
  const cardClasses = ['order-card-new'];
  if (order.processed) cardClasses.push('order-card-processed');
  if (isSelected) cardClasses.push('order-card-selected');

  return `
  <div class="${cardClasses.join(' ')}" data-order-id="${order.id}">
    <!-- Essential Info (Always Visible) -->
    <div class="order-card-header">
      <label class="order-select-label" title="Выбрать заказ">
        <input type="checkbox" class="order-select-checkbox" data-action="toggle-order-select" data-order-id="${order.id}" ${isSelected ? 'checked' : ''}>
      </label>
      ${userPhoto ? `
        <img src="${userPhoto}" alt="${escapeHtml(userName)}" class="user-avatar" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
        <div class="user-avatar-initials" style="display:none;">${userInitial}</div>
      ` : `
        <div class="user-avatar-initials">${userInitial}</div>
      `}
      <div class="order-card-main-info">
        <div class="flex-align-center gap-sm">
          <h4 class="mb-0">Заказ #${order.id}</h4>
          ${order.edited ? '<span class="edited-badge">изменен</span>' : ''}
          ${order.processed ? '<span class="notion-badge">N</span>' : ''}
        </div>
        <div class="order-card-meta">
          <span>${formatDate(order.created_at)}</span>
          <span>•</span>
          <span>${escapeHtml(userName)}</span>
          <span>•</span>
          <span>${totalItems} шт.</span>
          <span>•</span>
          <span class="font-semibold">${formatNumber(totalWithDelivery)}₽</span>
        </div>
      </div>
      <div class="order-card-header-right">
        <span class="status-badge ${getStatusClass(order.status)}">
          ${getStatusText(order.status)}
        </span>
        <button class="collapse-toggle-btn" data-action="toggle-order-details" data-order-id="${order.id}">
          <svg class="collapse-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
        <button class="btn btn-secondary btn-xs ml-sm" data-action="view-order-details" data-order-id="${order.id}">
          Открыть полностью
        </button>
      </div>
    </div>

    <!-- Collapsible Details (Hidden by Default) -->
    <div class="order-card-details" id="order-details-${order.id}" style="display: none;">
      <div class="order-card-section">
        <h5 class="order-section-title">Товары</h5>
        ${productsTableHTML}
        ${order.discount_amount && parseFloat(order.discount_amount) > 0 ? `
          <div style="margin-top: 8px; font-size: 0.813rem; color: var(--success);">
            Скидка по промо-коду${order.promo_code ? ` <code>${escapeHtml(order.promo_code)}</code>` : ''}: -${formatNumber(parseFloat(order.discount_amount))}₽
          </div>
        ` : ''}
      </div>
    </div>
  </div>
`;
}

/**
 * Render order actions (currently empty - card is clickable)
 */
export function renderOrderActions(order) {
  return '';
}

/**
 * Update orders badge with count
 * @param {number} count - Number of new orders
 */
export function updateOrdersBadge(count) {
  const badge = document.getElementById('orders-badge');
  const headerBadge = document.getElementById('orders-badge-header');
  if (count > 0) {
    if (badge) { badge.textContent = count; badge.classList.add('show'); }
    if (headerBadge) { headerBadge.textContent = count; headerBadge.classList.add('show'); }
  } else {
    if (badge) badge.classList.remove('show');
    if (headerBadge) headerBadge.classList.remove('show');
  }
}

/**
 * Toggle order card details visibility
 * @param {number} orderId - Order ID
 */
export function toggleOrderCardDetails(orderId) {
  const detailsDiv = document.getElementById(`order-details-${orderId}`);
  const toggleBtn = document.querySelector(`[data-action="toggle-order-details"][data-order-id="${orderId}"] .collapse-arrow`);

  if (!detailsDiv) return;

  if (detailsDiv.style.display === 'none') {
    detailsDiv.style.display = 'block';
    if (toggleBtn) {
      toggleBtn.style.transform = 'rotate(180deg)';
    }
  } else {
    detailsDiv.style.display = 'none';
    if (toggleBtn) {
      toggleBtn.style.transform = 'rotate(0deg)';
    }
  }
}
