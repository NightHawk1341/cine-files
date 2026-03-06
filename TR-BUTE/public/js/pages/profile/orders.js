// ============================================================
// PROFILE ORDERS MODULE
// Orders loading, filtering, pagination, and rendering
// ============================================================

import { isLoggedIn, getCurrentUser, getAccessToken } from '../../core/auth.js';
import { showSkeletonLoaders } from '../../modules/skeleton-loader.js';
import { escapeHtml } from '../../core/formatters.js';
import { formatNumberRussian, addImageSize } from './utils.js';

// ============================================================
// ORDER GRID SCRUB TOOLTIPS (mobile)
// Shared singleton tooltip shown while finger scrubs order item grid.
// Desktop hover is handled automatically by tooltip.js via [data-tooltip].
// ============================================================

let orderScrubTooltipEl = null;

function showOrderScrubTooltip(text, anchorEl) {
  if (!text || !anchorEl) { hideOrderScrubTooltip(); return; }

  if (!orderScrubTooltipEl) {
    orderScrubTooltipEl = document.createElement('div');
    orderScrubTooltipEl.className = 'tooltip';
    document.body.appendChild(orderScrubTooltipEl);
  }

  if (orderScrubTooltipEl.textContent !== text) orderScrubTooltipEl.textContent = text;

  const rect = anchorEl.getBoundingClientRect();
  const ttRect = orderScrubTooltipEl.getBoundingClientRect();
  const vw = window.innerWidth;
  const GAP = 8, ARROW = 6, PAD = 8;
  const placement = rect.top >= ttRect.height + GAP + ARROW ? 'top' : 'bottom';
  orderScrubTooltipEl.dataset.placement = placement;

  const top = placement === 'top'
    ? rect.top - ttRect.height - GAP - ARROW
    : rect.bottom + GAP + ARROW;
  const cx = rect.left + rect.width / 2;
  let left = cx - ttRect.width / 2;
  left = Math.max(PAD, Math.min(left, vw - ttRect.width - PAD));
  const arrowOffset = Math.max(10, Math.min(cx - left, ttRect.width - 10));

  orderScrubTooltipEl.style.left = `${left}px`;
  orderScrubTooltipEl.style.top = `${top}px`;
  orderScrubTooltipEl.style.setProperty('--arrow-offset', `${arrowOffset}px`);
  orderScrubTooltipEl.classList.add('visible');
}

function hideOrderScrubTooltip() {
  if (orderScrubTooltipEl) {
    orderScrubTooltipEl.remove();
    orderScrubTooltipEl = null;
  }
}

function setupOrderGridScrub(container) {
  if (container._scrubCleanup) {
    container._scrubCleanup();
    container._scrubCleanup = null;
  }

  let startX = 0, startY = 0, directionLocked = null;

  const getItemAtPoint = (x, y) => {
    const items = container.querySelectorAll('.order-card-grid-item');
    for (const item of items) {
      const r = item.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return item;
    }
    return null;
  };

  const onTouchStart = (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    directionLocked = null;
    const item = getItemAtPoint(startX, startY);
    if (item && item.dataset.tooltip) showOrderScrubTooltip(item.dataset.tooltip, item);
  };

  const onTouchMove = (e) => {
    const { clientX, clientY } = e.touches[0];
    if (!directionLocked) {
      const dx = Math.abs(clientX - startX);
      const dy = Math.abs(clientY - startY);
      if (dx > 5 || dy > 5) directionLocked = dx >= dy ? 'horizontal' : 'vertical';
    }
    if (directionLocked === 'horizontal') e.preventDefault();
    const item = getItemAtPoint(clientX, clientY);
    if (item && item.dataset.tooltip) showOrderScrubTooltip(item.dataset.tooltip, item);
    else hideOrderScrubTooltip();
  };

  const onTouchEnd = () => {
    hideOrderScrubTooltip();
    directionLocked = null;
  };

  container.addEventListener('touchstart', onTouchStart, { passive: true });
  container.addEventListener('touchmove', onTouchMove, { passive: false });
  container.addEventListener('touchend', onTouchEnd, { passive: true });
  container.addEventListener('touchcancel', onTouchEnd, { passive: true });

  container._scrubCleanup = () => {
    container.removeEventListener('touchstart', onTouchStart);
    container.removeEventListener('touchmove', onTouchMove);
    container.removeEventListener('touchend', onTouchEnd);
    container.removeEventListener('touchcancel', onTouchEnd);
    hideOrderScrubTooltip();
  };
}

// ============================================================
// ORDERS PAGINATION AND FILTERING STATE
// ============================================================

let allOrders = [];
let currentOrdersPage = 1;
const ordersPerPage = 5;
let currentDateFilter = 'all';
let currentOrdersSearch = '';
let filtersExpanded = false;

// ============================================================
// DATE FILTERING
// ============================================================

/**
 * Get date filter boundaries
 */
function getDateFilterBounds(filter) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (filter) {
    case 'today':
      return { start: today, end: new Date(today.getTime() + 24 * 60 * 60 * 1000) };
    case 'yesterday':
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      return { start: yesterday, end: today };
    case 'week':
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { start: weekAgo, end: new Date(now.getTime() + 24 * 60 * 60 * 1000) };
    case 'month':
      const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { start: monthAgo, end: new Date(now.getTime() + 24 * 60 * 60 * 1000) };
    default:
      return null;
  }
}

/**
 * Filter orders by date
 */
function filterOrdersByDate(orders, filter) {
  if (filter === 'all') return orders;

  // Handle custom date range
  if (filter.startsWith('custom:')) {
    const dateStr = filter.replace('custom:', '');
    const selectedDate = new Date(dateStr);
    const nextDay = new Date(selectedDate.getTime() + 24 * 60 * 60 * 1000);
    return orders.filter(order => {
      const orderDate = new Date(order.created_at);
      return orderDate >= selectedDate && orderDate < nextDay;
    });
  }

  const bounds = getDateFilterBounds(filter);
  if (!bounds) return orders;

  return orders.filter(order => {
    const orderDate = new Date(order.created_at);
    return orderDate >= bounds.start && orderDate < bounds.end;
  });
}

/**
 * Filter orders by search query (matches product title, alt, keywords, order id)
 */
function filterOrdersBySearch(orders, query) {
  if (!query || !query.trim()) return orders;
  const q = query.trim().toLowerCase();
  return orders.filter(order => {
    // Match order ID
    if (String(order.id).includes(q)) return true;
    // Match any item title
    const items = order.items || [];
    return items.some(item => {
      const title = (item.title || '').toLowerCase();
      const alt = (item.alt || '').toLowerCase();
      const keywords = (item.keywords || '').toLowerCase();
      return title.includes(q) || alt.includes(q) || keywords.includes(q);
    });
  });
}

// ============================================================
// ORDER CARD RENDERING
// ============================================================

/**
 * Render order card
 */
function renderOrderCard(order) {
  // Validate order object
  if (!order || !order.id) {
    throw new Error('Invalid order object: missing id');
  }

  const statusNames = {
    'awaiting_calculation': 'Ожидает расчёт',
    'awaiting_payment': 'Ожидает оплаты',
    'paid': 'Оплачен',
    'awaiting_certificate': 'Ожидает сертификат',
    'shipped': 'В пути',
    'delivered': 'Доставлен',
    'on_hold': 'Требуется связь с поддержкой',
    'refund_requested': 'Запрос возврата',
    'refunded': 'Возвращён',
    'cancelled': 'Отменён',
    // Legacy
    'created': 'Оформлен',
    'confirmed': 'Подтверждён',
    'new': 'Расчёт доставки',
    'evaluation': 'Расчёт доставки',
    'reviewed': 'Проверен',
    'accepted': 'Ожидает оплаты',
    'in_work': 'Готовится',
    'parcel_pending': 'Готовится к отправке',
    'parcel_ready': 'Передан в доставку',
    'completed': 'Завершён',
    'suggested': 'Предложение'
  };

  const statusName = statusNames[order.status] || order.status || 'Неизвестен';
  // Convert status from underscore to hyphen for CSS class
  const statusClass = order.status ? order.status.replace(/_/g, '-') : 'unknown';
  const date = order.created_at ? new Date(order.created_at).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }) : 'Неизвестная дата';

  // Calculate total with delivery (fallback if not provided)
  const totalPrice = Number(order.total_price) || 0;
  const deliveryCost = Number(order.delivery_cost) || 0;
  const totalWithDelivery = order.total_with_delivery || (totalPrice + deliveryCost);

  // Render items as image grid (square images with quantity badge)
  const items = order.items || [];
  const itemsHTML = items.map(item => {
    const imageUrl = addImageSize(item.image || '/placeholder.png', '480x0');
    const qtyBadge = item.quantity > 1
      ? `<span class="order-card-item-qty">${item.quantity}</span>`
      : '';
    const tooltipText = item.property
      ? `${item.title} · ${item.property}`
      : item.title;

    return `
      <div class="order-card-grid-item" data-tooltip="${escapeHtml(tooltipText)}">
        <img src="${imageUrl}" alt="${escapeHtml(item.title)}" loading="lazy">
        ${qtyBadge}
      </div>
    `;
  }).join('');

  // Tracking info
  const trackingHTML = order.tracking_number ? `
    <div class="order-card-tracking">
      <div class="order-card-tracking-label">Трек-номер:</div>
      <div class="order-card-tracking-number">${order.tracking_number}</div>
    </div>
  ` : '';


  return `
    <a href="/order?id=${order.id}" class="order-card">
      <div class="order-card-header">
        <div class="order-card-number" onclick="event.preventDefault();event.stopPropagation();navigator.clipboard.writeText('${order.id}');if(window.showToast)showToast('Номер скопирован','info',1500);" title="Скопировать номер заказа">
          #${order.id}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        </div>
        <div class="order-card-status ${statusClass}">${statusName}</div>
      </div>
      <div class="order-card-grid">
        ${itemsHTML}
      </div>
      <div class="order-card-footer">
        <div class="order-card-date">${date}</div>
        <div class="order-card-price">${formatNumberRussian(totalWithDelivery)} \u20BD</div>
      </div>
      ${trackingHTML}
    </a>
  `;
}

// ============================================================
// PAGINATION
// ============================================================

/**
 * Render orders with pagination
 */
function renderOrdersPage() {
  const ordersContainer = document.getElementById('profile-orders-list');
  const ordersCounter = document.getElementById('profile-orders-counter-inline');

  if (!ordersContainer) return;

  // Filter orders by date, then by search
  let filteredOrders = filterOrdersByDate(allOrders, currentDateFilter);
  filteredOrders = filterOrdersBySearch(filteredOrders, currentOrdersSearch);

  // Update counter to show filtered count
  if (ordersCounter) {
    ordersCounter.textContent = filteredOrders.length > 0 ? filteredOrders.length : '';
  }

  if (filteredOrders.length === 0) {
    const noResultsMsg = currentOrdersSearch
      ? 'Ничего не найдено'
      : (currentDateFilter === 'all' ? 'У вас пока нет заказов' : 'Нет заказов за выбранный период');
    ordersContainer.innerHTML = `
      <div class="orders-empty-state">
        <p>${noResultsMsg}</p>
      </div>
    `;
    // Hide pagination if no orders
    const paginationContainer = document.getElementById('orders-pagination');
    if (paginationContainer) {
      paginationContainer.style.display = 'none';
    }
    return;
  }

  // Calculate pagination
  const totalPages = Math.ceil(filteredOrders.length / ordersPerPage);
  currentOrdersPage = Math.min(currentOrdersPage, totalPages);
  const startIndex = (currentOrdersPage - 1) * ordersPerPage;
  const endIndex = startIndex + ordersPerPage;
  const pageOrders = filteredOrders.slice(startIndex, endIndex);

  // Render orders
  ordersContainer.innerHTML = pageOrders.map(order => {
    try {
      return renderOrderCard(order);
    } catch (renderError) {
      console.error('Error rendering order card:', {
        orderId: order?.id,
        error: renderError.message,
        order: order
      });
      return `<div style="padding: 20px; border: 1px solid var(--status-error, #f44336); border-radius: 8px; color: var(--status-error, #f44336); margin-bottom: 10px;">
        Ошибка отображения заказа #${order?.id || 'unknown'}
      </div>`;
    }
  }).join('');

  // Set up mobile scrub tooltips for each order item grid
  ordersContainer.querySelectorAll('.order-card-grid').forEach(setupOrderGridScrub);

  // Render pagination
  renderOrdersPagination(totalPages, filteredOrders.length);
}

/**
 * Render pagination controls
 */
function renderOrdersPagination(totalPages, totalOrders) {
  let paginationContainer = document.getElementById('orders-pagination');

  // Create pagination container if it doesn't exist
  if (!paginationContainer) {
    paginationContainer = document.createElement('div');
    paginationContainer.id = 'orders-pagination';
    paginationContainer.className = 'orders-pagination';
    const ordersContainer = document.getElementById('profile-orders-list');
    if (ordersContainer && ordersContainer.parentNode) {
      ordersContainer.parentNode.insertBefore(paginationContainer, ordersContainer.nextSibling);
    }
  }

  if (totalPages <= 1) {
    paginationContainer.style.display = 'none';
    return;
  }

  paginationContainer.style.display = 'flex';

  // Generate page buttons
  let pagesHtml = '';
  const maxVisiblePages = 5;
  let startPage = Math.max(1, currentOrdersPage - Math.floor(maxVisiblePages / 2));
  let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

  if (endPage - startPage + 1 < maxVisiblePages) {
    startPage = Math.max(1, endPage - maxVisiblePages + 1);
  }

  if (startPage > 1) {
    pagesHtml += `<button class="pagination-btn" data-page="1">1</button>`;
    if (startPage > 2) {
      pagesHtml += `<span class="pagination-ellipsis">...</span>`;
    }
  }

  for (let i = startPage; i <= endPage; i++) {
    pagesHtml += `<button class="pagination-btn ${i === currentOrdersPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      pagesHtml += `<span class="pagination-ellipsis">...</span>`;
    }
    pagesHtml += `<button class="pagination-btn" data-page="${totalPages}">${totalPages}</button>`;
  }

  paginationContainer.innerHTML = `
    <button class="pagination-btn pagination-prev" ${currentOrdersPage <= 1 ? 'disabled' : ''}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="15,18 9,12 15,6"></polyline>
      </svg>
    </button>
    <div class="pagination-pages">${pagesHtml}</div>
    <button class="pagination-btn pagination-next" ${currentOrdersPage >= totalPages ? 'disabled' : ''}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="9,6 15,12 9,18"></polyline>
      </svg>
    </button>
  `;

  // Add click handlers
  paginationContainer.querySelectorAll('.pagination-btn[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentOrdersPage = parseInt(btn.dataset.page);
      renderOrdersPage();
    });
  });

  const prevBtn = paginationContainer.querySelector('.pagination-prev');
  const nextBtn = paginationContainer.querySelector('.pagination-next');

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (currentOrdersPage > 1) {
        currentOrdersPage--;
        renderOrdersPage();
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (currentOrdersPage < totalPages) {
        currentOrdersPage++;
        renderOrdersPage();
      }
    });
  }
}

// ============================================================
// DATE FILTER UI
// ============================================================

/**
 * Show date picker for custom date
 */
function showDatePicker() {
  const existingPicker = document.getElementById('custom-date-modal');
  if (existingPicker) existingPicker.remove();

  const modal = document.createElement('div');
  modal.id = 'custom-date-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: var(--bg-overlay, rgba(0, 0, 0, 0.8));
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;

  const today = new Date().toISOString().split('T')[0];

  modal.innerHTML = `
    <div style="
      background: var(--bg-secondary, #1a1a1a);
      border: 1px solid var(--border-color, rgba(65, 65, 65, 0.5));
      border-radius: 16px;
      padding: 24px;
      max-width: 320px;
      text-align: center;
      color: var(--text-primary, #E0E0E0);
    ">
      <h3 style="margin: 0 0 16px 0; font-size: 16px;">Выберите дату</h3>
      <input type="date" id="custom-date-input" max="${today}" value="${today}" style="
        width: 100%;
        padding: 12px;
        border: 1px solid var(--border-color, rgba(65, 65, 65, 0.5));
        border-radius: 8px;
        background: var(--bg-tertiary, #2b2b2b);
        color: var(--text-primary, #E0E0E0);
        font-size: 14px;
        margin-bottom: 16px;
        box-sizing: border-box;
      ">
      <div style="display: flex; gap: 10px; justify-content: center;">
        <button class="date-cancel-btn" style="
          padding: 10px 20px;
          background: transparent;
          border: 1px solid var(--border-color, rgba(65, 65, 65, 0.5));
          color: var(--text-primary, #E0E0E0);
          border-radius: 8px;
          cursor: pointer;
        ">Отмена</button>
        <button class="date-confirm-btn" style="
          padding: 10px 20px;
          background: var(--status-info, #066fa3);
          border: none;
          color: white;
          border-radius: 8px;
          cursor: pointer;
        ">Применить</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector('.date-cancel-btn').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });

  modal.querySelector('.date-confirm-btn').addEventListener('click', () => {
    const dateInput = document.getElementById('custom-date-input');
    const selectedDate = dateInput.value;

    if (selectedDate) {
      currentDateFilter = `custom:${selectedDate}`;
      currentOrdersPage = 1;

      // Update active state
      const filterContainer = document.getElementById('orders-date-filter');
      if (filterContainer) {
        filterContainer.querySelectorAll('.date-filter-btn').forEach(b => b.classList.remove('active'));
        const customBtn = filterContainer.querySelector('[data-filter="custom"]');
        if (customBtn) {
          customBtn.classList.add('active');
          customBtn.textContent = new Date(selectedDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
        }
      }

      renderOrdersPage();
    }

    modal.remove();
  });
}

/**
 * Initialize date filter UI and search
 */
function initDateFilter() {
  const filterContainer = document.getElementById('orders-date-filter');
  if (!filterContainer) return;

  // Setup search input
  const searchInput = document.getElementById('orders-search-input');
  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        currentOrdersSearch = searchInput.value;
        currentOrdersPage = 1;
        renderOrdersPage();
      }, 250);
    });
  }

  // Setup filter toggle button
  const filterToggle = document.getElementById('orders-filter-toggle');
  const filterButtons = document.getElementById('orders-filter-buttons');
  if (filterToggle && filterButtons) {
    filterToggle.addEventListener('click', () => {
      filtersExpanded = !filtersExpanded;
      filterButtons.classList.toggle('expanded', filtersExpanded);
      filterToggle.classList.toggle('active', filtersExpanded);
    });
  }

  // Add click handlers for filter buttons
  filterContainer.querySelectorAll('.date-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const filter = btn.dataset.filter;

      // Handle custom date
      if (filter === 'custom') {
        showDatePicker();
        return;
      }

      // Update active state
      filterContainer.querySelectorAll('.date-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      currentDateFilter = filter;
      currentOrdersPage = 1;
      renderOrdersPage();
    });
  });
}

// ============================================================
// ORDERS LOADING
// ============================================================

/**
 * Load user orders
 */
export async function loadUserOrders() {
  const currentUser = getCurrentUser();
  if (!isLoggedIn() || !currentUser) {
    return;
  }

  // Orders displayed in left column
  const ordersContainer = document.getElementById('profile-orders-list');
  const ordersCounter = document.getElementById('profile-orders-counter-inline');

  if (!ordersContainer) return;

  // Show skeleton while loading
  showSkeletonLoaders(ordersContainer, 'order', 3);

  try {
    const response = await fetch(`/api/orders/get-user-orders?user_id=${currentUser.id}`, {
      headers: {
        'Authorization': `Bearer ${getAccessToken()}`
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error('Failed to load orders:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData
      });
      throw new Error(`Failed to load orders: ${response.status} - ${errorData.error || response.statusText}`);
    }

    const result = await response.json();

    // Validate response structure
    if (!result || !result.orders) {
      console.error('Invalid response structure:', result);
      throw new Error('Invalid response structure from server');
    }

    // Store all orders for pagination/filtering
    allOrders = result.orders || [];

    // Reset to first page when loading orders
    currentOrdersPage = 1;
    currentDateFilter = 'all';

    // Initialize date filter UI
    initDateFilter();

    // Render orders with pagination
    renderOrdersPage();

    // Mark orders as seen to clear the updates indicator
    if (typeof window.markOrdersAsSeen === 'function') {
      window.markOrdersAsSeen();
    }

  } catch (error) {
    console.error('Error loading orders:', error);
    ordersContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--status-error, #f44336);">Ошибка загрузки заказов</div>';
  }
}
