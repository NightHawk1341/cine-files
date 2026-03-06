/**
 * orders/filters.js
 * Order filtering functionality
 */

import { state } from '../../state.js';
import { getAllStatusOptions } from '../../utils.js';

/**
 * Apply filters to orders array
 */
export function applyOrderFilters(orders, filters) {
  if (!filters || Object.keys(filters).length === 0) {
    return orders;
  }

  return orders.filter(order => {
    // Filter by date with range support
    if (filters.date || filters.dateRange) {
      const orderDate = new Date(order.created_at);
      const now = new Date();

      if (filters.dateRange === 'today') {
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (orderDate < today) return false;
      } else if (filters.dateRange === 'week') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        if (orderDate < weekAgo) return false;
      } else if (filters.dateRange === 'month') {
        const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        if (orderDate < monthAgo) return false;
      } else if (filters.date) {
        const orderDateStr = orderDate.toISOString().split('T')[0];
        if (orderDateStr !== filters.date) return false;
      }
    }

    // Filter by status
    if (filters.status && order.status !== filters.status) {
      return false;
    }

    // Filter by Notion (processed)
    if (filters.notion) {
      if (filters.notion === 'synced' && !order.processed) return false;
      if (filters.notion === 'not-synced' && order.processed) return false;
    }

    // Filter by delivery method
    if (filters.delivery && order.delivery_type !== filters.delivery) {
      return false;
    }

    // Filter by shipment date
    if (filters.shipmentDate) {
      if (!order.shipment_date) return false;
      const shipmentDate = new Date(order.shipment_date).toISOString().split('T')[0];
      if (shipmentDate !== filters.shipmentDate) return false;
    }

    // Filter by edited status
    if (filters.edited) {
      const hasEdits = order.items?.some(item =>
        item.admin_added || item.admin_modified || item.deleted_by_admin
      ) || order.address_edited;

      if (filters.edited === 'edited' && !hasEdits) return false;
      if (filters.edited === 'not-edited' && hasEdits) return false;
    }

    return true;
  });
}

/**
 * Apply filters from UI and re-render
 * @param {Function} renderOrders - Render function to call after applying filters
 */
export function applyFilters(renderOrders) {
  const dateRange = document.getElementById('filter-date-range')?.value || '';
  const customDate = document.getElementById('filter-date')?.value || '';

  // Calculate date filter based on range
  let dateFilter = '';
  if (dateRange === 'today') {
    dateFilter = new Date().toISOString().split('T')[0];
  } else if (dateRange === 'custom' && customDate) {
    dateFilter = customDate;
  }

  const filters = {
    date: dateFilter,
    dateRange: dateRange,
    status: document.getElementById('filter-status')?.value || '',
    notion: document.getElementById('filter-notion')?.value || '',
    delivery: document.getElementById('filter-delivery')?.value || '',
    shipmentDate: document.getElementById('filter-shipment-date')?.value || '',
    edited: document.getElementById('filter-edited')?.value || ''
  };

  // Remove empty filters
  Object.keys(filters).forEach(key => {
    if (!filters[key]) delete filters[key];
  });

  state.orderFilters = filters;

  // Update filter select styling to show active state
  const filterSelects = document.querySelectorAll('.filter-select');
  filterSelects.forEach(select => {
    if (select.value && select.value !== '') {
      select.setAttribute('data-active', 'true');
    } else {
      select.removeAttribute('data-active');
    }
  });

  // Re-render with filters
  const filteredOrders = applyOrderFilters(state.orders, filters);
  renderOrders(filteredOrders);
}

/**
 * Reset all filters
 * @param {Function} renderOrders - Render function to call after reset
 */
export function resetFilters(renderOrders) {
  // Clear filter inputs
  const filterIds = [
    'filter-date', 'filter-date-range', 'filter-status',
    'filter-notion', 'filter-delivery', 'filter-shipment-date', 'filter-edited'
  ];

  filterIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  // Clear state
  state.orderFilters = {};

  // Remove active state from filters
  document.querySelectorAll('.filter-select').forEach(el => {
    el.removeAttribute('data-active');
  });

  // Re-render without filters
  renderOrders(state.orders);
}

/**
 * Generate filter HTML template
 */
export function getFiltersHTML(searchQuery = '') {
  return `
    <div class="search-and-filters">
      <div class="search-box">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.35-4.35"/>
        </svg>
        <input type="text"
               class="search-input"
               placeholder="Поиск по номеру, имени, телефону..."
               id="order-search"
               value="${searchQuery}">
      </div>

      <div class="filters-container">
        <div class="filters-grid">
          <div class="filter-with-icon">
            <svg class="filter-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
            </svg>
            <select id="filter-date-range" class="filter-select">
              <option value="">Все даты</option>
              <option value="today">Сегодня</option>
              <option value="week">Эта неделя</option>
              <option value="month">Этот месяц</option>
              <option value="custom">Выбрать дату</option>
            </select>
          </div>

          <div class="filter-with-icon">
            <svg class="filter-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
            </svg>
            <select id="filter-status" class="filter-select">
              <option value="">Все статусы</option>
              ${getAllStatusOptions().map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('')}
            </select>
          </div>

          <div class="filter-with-icon">
            <svg class="filter-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M7 16V4M7 4L3 8M7 4l4 4M17 8v12M17 20l4-4M17 20l-4-4"/>
            </svg>
            <select id="filter-notion" class="filter-select">
              <option value="">Notion</option>
              <option value="synced">✓ Синхронизировано</option>
              <option value="not-synced">✗ Не синхронизировано</option>
            </select>
          </div>

          <div class="filter-with-icon">
            <svg class="filter-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M16 16h3a2 2 0 002-2V5a2 2 0 00-2-2h-7a2 2 0 00-2 2l-5 5v7a2 2 0 002 2h3"/>
              <path d="M10 10v11M10 10l5-5M10 10h11"/>
            </svg>
            <select id="filter-delivery" class="filter-select">
              <option value="">Способ доставки</option>
              <option value="pochta_standard">Почта — обычная</option>
              <option value="pochta_first_class">Почта — 1-й класс</option>
              <option value="pochta_courier">Почта — курьер</option>
              <option value="cdek_pvz">СДЭК — ПВЗ</option>
              <option value="cdek_pvz_express">СДЭК — экспресс</option>
              <option value="cdek_courier">СДЭК — курьер</option>
              <option value="international">Международная</option>
              <option value="pickup">Самовывоз</option>
            </select>
          </div>

          <div class="filter-with-icon">
            <svg class="filter-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            <select id="filter-edited" class="filter-select">
              <option value="">Редактирование</option>
              <option value="edited">Редактированные</option>
              <option value="not-edited">Оригинальные</option>
            </select>
          </div>

          <button class="btn-filter-reset" id="reset-filters-btn" data-action="reset-filters" title="Сбросить фильтры">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <input type="date" id="filter-date" class="filter-date-input" style="display: none;">
        <input type="date" id="filter-shipment-date" class="filter-date-input" placeholder="Дата отправки" style="display: none;">
      </div>
    </div>
  `;
}
