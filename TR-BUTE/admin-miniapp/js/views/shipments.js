/**
 * views/shipments.js
 * Shipment calendar view for admin panel
 *
 * Features:
 * - Monthly calendar showing shipment dates
 * - Order counts per date
 * - Click date to show orders for that date
 * - Batch management (Ready/Not Ready toggles)
 * - Next shipment date settings
 */

import { state } from '../state.js';
import { API_BASE } from '../config.js';
import { requireAuth, formatDate, formatNumber, showToast, showModal, hideModal } from '../utils.js';
import { apiGet, apiPost } from '../utils/apiClient.js';

// ============================================================================
// STATE
// ============================================================================

let calendarState = {
  currentMonth: new Date(),
  calendarData: null,
  selectedDate: null,
  selectedOrders: [],
  nextShipmentDate: null,
  nextShipmentDateEnd: null,
  isLoading: false
};

// ============================================================================
// API FUNCTIONS
// ============================================================================

async function fetchCalendarData(month) {
  const monthStr = month.toISOString().slice(0, 7); // YYYY-MM format
  const response = await apiGet(`${API_BASE}/api/admin/shipments/calendar?month=${monthStr}`);

  if (!response.ok) {
    throw new Error('Failed to fetch calendar data');
  }

  const data = await response.json();
  return data.data;
}

async function fetchOrdersForDate(date) {
  const response = await apiGet(`${API_BASE}/api/admin/shipments/calendar?date=${date}`);

  if (!response.ok) {
    throw new Error('Failed to fetch orders for date');
  }

  const data = await response.json();
  return data.data;
}

async function updateBatchStatus(orderIds, status) {
  const response = await apiPost(`${API_BASE}/api/admin/orders/batch-status`, {
    order_ids: orderIds,
    batch_status: status
  });

  if (!response.ok) {
    throw new Error('Failed to update batch status');
  }

  return response.json();
}

async function updateNextShipmentDate(date, dateEnd = null) {
  const body = {
    next_shipment_date: date
  };

  // Only include end date if it's different from start date
  if (dateEnd && dateEnd !== date) {
    body.next_shipment_date_end = dateEnd;
  }

  const response = await apiPost(`${API_BASE}/api/admin/shipments/settings`, body);

  if (!response.ok) {
    throw new Error('Failed to update next shipment date');
  }

  return response.json();
}

// ============================================================================
// RENDER FUNCTIONS
// ============================================================================

function renderCalendar() {
  const year = calendarState.currentMonth.getFullYear();
  const month = calendarState.currentMonth.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();

  // Get start day of week (Monday = 0, Sunday = 6)
  let startDay = firstDay.getDay() - 1;
  if (startDay < 0) startDay = 6;

  const monthNames = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
  ];

  const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  let calendarHtml = `
    <div class="calendar-header">
      <button class="btn btn-secondary" data-action="prev-month">&larr;</button>
      <h3 class="calendar-title">${monthNames[month]} ${year}</h3>
      <button class="btn btn-secondary" data-action="next-month">&rarr;</button>
    </div>
    <div class="calendar-grid">
      ${dayNames.map(d => `<div class="calendar-day-header">${d}</div>`).join('')}
  `;

  // Empty cells for days before the first day of month
  for (let i = 0; i < startDay; i++) {
    calendarHtml += '<div class="calendar-day empty"></div>';
  }

  // Days of the month
  const today = new Date().toISOString().split('T')[0];
  const days = calendarState.calendarData?.days || {};

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayData = days[dateStr];
    const isToday = dateStr === today;
    const isNextShipment = dateStr === calendarState.nextShipmentDate;
    const isSelected = dateStr === calendarState.selectedDate;

    let dayClass = 'calendar-day';
    if (isToday) dayClass += ' today';
    if (isNextShipment) dayClass += ' next-shipment';
    if (isSelected) dayClass += ' selected';
    if (dayData?.total > 0) dayClass += ' has-orders';

    let badgeHtml = '';
    if (dayData?.total > 0) {
      const readyClass = dayData.ready === dayData.total ? 'all-ready' : dayData.ready > 0 ? 'partial-ready' : '';
      badgeHtml = `
        <div class="calendar-day-badge ${readyClass}">
          ${dayData.total}
          ${dayData.ready > 0 ? `<span class="ready-count">(${dayData.ready})</span>` : ''}
        </div>
      `;
    }

    calendarHtml += `
      <div class="${dayClass}" data-date="${dateStr}" data-action="select-date">
        <span class="day-number">${day}</span>
        ${badgeHtml}
        ${isNextShipment ? '<div class="next-shipment-marker">📦</div>' : ''}
      </div>
    `;
  }

  calendarHtml += '</div>';

  return calendarHtml;
}

function renderOrdersList() {
  if (!calendarState.selectedDate) {
    return '';
  }

  if (calendarState.isLoading) {
    return `
      <div class="orders-list-container">
        <h4>Заказы на ${formatDateRussian(calendarState.selectedDate)}</h4>
        <div class="loading-spinner">
          <div class="spinner"></div>
          <p>Загрузка заказов...</p>
        </div>
      </div>
    `;
  }

  const orders = calendarState.selectedOrders;

  if (!orders || orders.length === 0) {
    return `
      <div class="orders-list-container">
        <h4>Заказы на ${formatDateRussian(calendarState.selectedDate)}</h4>
        <p style="color: var(--text-secondary); text-align: center; padding: 20px;">
          Нет заказов на эту дату
        </p>
      </div>
    `;
  }

  const summary = calendarState.ordersSummary || { total: orders.length, ready: 0, not_ready: 0, pending: 0 };

  return `
    <div class="orders-list-container">
      <div class="orders-list-header">
        <h4>Заказы на ${formatDateRussian(calendarState.selectedDate)}</h4>
        <div class="orders-summary">
          <span class="summary-total">${summary.total} заказов</span>
          <span class="summary-ready">✓ ${summary.ready}</span>
          <span class="summary-not-ready">✕ ${summary.not_ready}</span>
          <span class="summary-pending">? ${summary.pending}</span>
        </div>
      </div>

      <div class="batch-actions">
        <button class="btn btn-success" data-action="batch-ready-all">
          ✓ Все готовы
        </button>
        <button class="btn btn-danger" data-action="batch-not-ready-all">
          ✕ Все не готовы
        </button>
      </div>

      <div class="orders-list">
        ${orders.map(order => `
          <div class="order-list-item ${order.batch_ready ? 'ready' : order.batch_status === 'not_ready' ? 'not-ready' : ''}" data-order-id="${order.id}">
            <div class="order-item-main">
              <div class="order-item-id">#${order.id}</div>
              <div class="order-item-customer">${order.recipient_name || order.customer_name || 'Не указан'}</div>
              <div class="order-item-address">${order.postal_index || ''} ${order.address || ''}</div>
            </div>
            <div class="order-item-meta">
              <span class="order-item-status status-${order.status}">${order.status_display}</span>
              <span class="order-item-price">${formatNumber(order.total_price + (order.delivery_cost || 0))}₽</span>
            </div>
            <div class="order-item-actions">
              <button class="btn btn-sm ${order.batch_ready ? 'btn-success active' : 'btn-secondary'}"
                      data-action="toggle-ready" data-order-id="${order.id}" data-status="ready">
                ✓
              </button>
              <button class="btn btn-sm ${order.batch_status === 'not_ready' ? 'btn-danger active' : 'btn-secondary'}"
                      data-action="toggle-ready" data-order-id="${order.id}" data-status="not_ready">
                ✕
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderSettingsSection() {
  const nextDate = calendarState.nextShipmentDate || '';
  const nextDateEnd = calendarState.nextShipmentDateEnd || '';

  // Format display text for shipment period
  let displayText = '';
  if (calendarState.nextShipmentDate) {
    if (calendarState.nextShipmentDateEnd && calendarState.nextShipmentDateEnd !== calendarState.nextShipmentDate) {
      displayText = `${formatDateRussian(calendarState.nextShipmentDate)} — ${formatDateRussian(calendarState.nextShipmentDateEnd)}`;
    } else {
      displayText = formatDateRussian(calendarState.nextShipmentDate);
    }
  }

  return `
    <div class="shipment-settings card">
      <div class="card-header">
        <h3 class="card-title">Настройки отправки</h3>
      </div>
      <div class="card-body">
        <div class="setting-row" style="flex-wrap: wrap; gap: 12px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <label for="next-shipment-date">Период отправки:</label>
            <input type="date" id="next-shipment-date" value="${nextDate}" class="form-input" style="width: auto;">
            <span style="color: var(--text-secondary);">—</span>
            <input type="date" id="next-shipment-date-end" value="${nextDateEnd || nextDate}" class="form-input" style="width: auto;">
          </div>
          <button class="btn btn-primary" data-action="save-next-date">Сохранить</button>
        </div>
        ${displayText ? `
          <p style="margin-top: 8px; color: var(--text-secondary); font-size: 0.875rem;">
            📦 Следующая отправка: ${displayText}
          </p>
        ` : ''}
      </div>
    </div>
  `;
}

function formatDateRussian(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

// ============================================================================
// MAIN RENDER
// ============================================================================

async function loadShipmentsView() {
  requireAuth();
  const content = document.getElementById('content');

  content.innerHTML = `
    <div class="page-header">
      <h2 class="page-title">Календарь отправок</h2>
      <button class="btn btn-secondary btn-sm btn-icon-only" data-action="refresh-shipments" title="Обновить">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M23 4v6h-6M1 20v-6h6"/>
          <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
        </svg>
      </button>
    </div>
    <div class="loading-spinner">
      <div class="spinner"></div>
      <p>Загрузка календаря...</p>
    </div>
  `;

  try {
    // Fetch calendar data and settings
    const calendarData = await fetchCalendarData(calendarState.currentMonth);
    calendarState.calendarData = calendarData;
    calendarState.nextShipmentDate = calendarData.next_shipment_date;
    calendarState.nextShipmentDateEnd = calendarData.next_shipment_date_end || null;

    renderShipmentsContent();
    setupShipmentsEventListeners();
  } catch (error) {
    console.error('Error loading shipments view:', error);
    content.innerHTML = `
      <div class="page-header">
        <h2 class="page-title">Календарь отправок</h2>
        <button class="btn btn-secondary btn-sm btn-icon-only" data-action="refresh-shipments" title="Обновить">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 4v6h-6M1 20v-6h6"/>
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
          </svg>
        </button>
      </div>
      <div class="empty-state">
        <h3>Ошибка загрузки</h3>
        <p>Не удалось загрузить данные календаря</p>
        <button class="btn btn-primary" data-action="reload-shipments">Повторить</button>
      </div>
    `;
    setupShipmentsEventListeners();
  }
}

function renderShipmentsContent() {
  const content = document.getElementById('content');

  content.innerHTML = `
    <div class="page-header">
      <h2 class="page-title">Календарь отправок</h2>
      <button class="btn btn-secondary btn-sm btn-icon-only" data-action="refresh-shipments" title="Обновить">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M23 4v6h-6M1 20v-6h6"/>
          <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
        </svg>
      </button>
    </div>

    ${renderSettingsSection()}

    <div class="shipments-layout">
      <div class="calendar-container card">
        ${renderCalendar()}
      </div>

      <div class="orders-container">
        ${renderOrdersList()}
      </div>
    </div>
  `;

  setupShipmentsEventListeners();
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

async function handleSelectDate(dateStr) {
  calendarState.selectedDate = dateStr;
  calendarState.isLoading = true;
  renderShipmentsContent();

  try {
    const data = await fetchOrdersForDate(dateStr);
    calendarState.selectedOrders = data.orders || [];
    calendarState.ordersSummary = data.summary || {};
  } catch (error) {
    console.error('Error loading orders for date:', error);
    calendarState.selectedOrders = [];
    showToast('Не удалось загрузить заказы', 'error');
  }

  calendarState.isLoading = false;
  renderShipmentsContent();
}

async function handleToggleReady(orderId, status) {
  try {
    await updateBatchStatus([orderId], status);

    // Update local state
    const order = calendarState.selectedOrders.find(o => o.id === orderId);
    if (order) {
      order.batch_status = status;
      order.batch_ready = status === 'ready';
    }

    // Re-render
    renderShipmentsContent();
    showToast('Статус обновлен', 'success');
  } catch (error) {
    console.error('Error updating batch status:', error);
    showToast('Не удалось обновить статус', 'error');
  }
}

async function handleBatchReadyAll() {
  const orderIds = calendarState.selectedOrders.map(o => o.id);
  if (orderIds.length === 0) return;

  try {
    await updateBatchStatus(orderIds, 'ready');

    // Update local state
    calendarState.selectedOrders.forEach(o => {
      o.batch_status = 'ready';
      o.batch_ready = true;
    });

    renderShipmentsContent();
    showToast(`${orderIds.length} заказов отмечены как готовые`, 'success');
  } catch (error) {
    console.error('Error updating batch status:', error);
    showToast('Не удалось обновить статусы', 'error');
  }
}

async function handleBatchNotReadyAll() {
  const orderIds = calendarState.selectedOrders.map(o => o.id);
  if (orderIds.length === 0) return;

  try {
    await updateBatchStatus(orderIds, 'not_ready');

    // Update local state
    calendarState.selectedOrders.forEach(o => {
      o.batch_status = 'not_ready';
      o.batch_ready = false;
    });

    renderShipmentsContent();
    showToast(`${orderIds.length} заказов отмечены как не готовые`, 'success');
  } catch (error) {
    console.error('Error updating batch status:', error);
    showToast('Не удалось обновить статусы', 'error');
  }
}

async function handleSaveNextDate() {
  const inputStart = document.getElementById('next-shipment-date');
  const inputEnd = document.getElementById('next-shipment-date-end');

  if (!inputStart || !inputStart.value) {
    showToast('Выберите дату начала', 'error');
    return;
  }

  const startDate = inputStart.value;
  const endDate = inputEnd?.value || startDate;

  // Validate end date is not before start date
  if (endDate < startDate) {
    showToast('Дата окончания не может быть раньше начала', 'error');
    return;
  }

  try {
    await updateNextShipmentDate(startDate, endDate);
    calendarState.nextShipmentDate = startDate;
    calendarState.nextShipmentDateEnd = endDate !== startDate ? endDate : null;
    renderShipmentsContent();
    showToast('Период отправки сохранён', 'success');
  } catch (error) {
    console.error('Error saving next shipment date:', error);
    showToast('Не удалось сохранить период', 'error');
  }
}

function handlePrevMonth() {
  calendarState.currentMonth = new Date(
    calendarState.currentMonth.getFullYear(),
    calendarState.currentMonth.getMonth() - 1
  );
  loadShipmentsView();
}

function handleNextMonth() {
  calendarState.currentMonth = new Date(
    calendarState.currentMonth.getFullYear(),
    calendarState.currentMonth.getMonth() + 1
  );
  loadShipmentsView();
}

/**
 * Force refresh shipments data
 */
async function refreshShipments() {
  showToast('Обновление...', 'info');
  calendarState.calendarData = null;
  calendarState.selectedOrders = [];
  await loadShipmentsView();
  showToast('Календарь обновлён', 'success');
}

// ============================================================================
// EVENT DELEGATION
// ============================================================================

function setupShipmentsEventListeners() {
  const content = document.getElementById('content');
  if (!content) return;

  // Remove old handler
  if (content._shipmentsClickHandler) {
    content.removeEventListener('click', content._shipmentsClickHandler);
  }

  const clickHandler = async (e) => {
    const target = e.target;
    const action = target.dataset.action || target.closest('[data-action]')?.dataset.action;

    if (!action) return;

    switch (action) {
      case 'select-date':
        const dateEl = target.closest('[data-date]');
        if (dateEl) {
          handleSelectDate(dateEl.dataset.date);
        }
        break;

      case 'toggle-ready':
        const orderIdEl = target.closest('[data-order-id]');
        if (orderIdEl) {
          const orderId = parseInt(orderIdEl.dataset.orderId);
          const status = target.dataset.status;
          handleToggleReady(orderId, status);
        }
        break;

      case 'batch-ready-all':
        handleBatchReadyAll();
        break;

      case 'batch-not-ready-all':
        handleBatchNotReadyAll();
        break;

      case 'save-next-date':
        handleSaveNextDate();
        break;

      case 'prev-month':
        handlePrevMonth();
        break;

      case 'next-month':
        handleNextMonth();
        break;

      case 'reload-shipments':
        loadShipmentsView();
        break;

      case 'refresh-shipments':
        refreshShipments();
        break;
    }
  };

  content._shipmentsClickHandler = clickHandler;
  content.addEventListener('click', clickHandler);
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  loadShipmentsView,
  loadShipmentsView as renderShipmentsView
};
