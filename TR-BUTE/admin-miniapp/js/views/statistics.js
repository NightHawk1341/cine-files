/**
 * views/statistics.js
 * Comprehensive admin statistics with subtabs for better performance
 */

import { state, updateState, hasPermission, isAdmin } from '../state.js';
import { API_BASE, tg, isBrowserMode } from '../config.js';
import { SVGIcons, requireAuth, formatDate, formatTime, formatPrice, formatNumber, showToast, showError, copyToClipboard, addImageSize } from '../utils.js';
import { searchProductsRelevance } from '../utils/productSearch.js';
import { apiGet, apiPost } from '../utils/apiClient.js';
import { createPageHeader, createLoadingSpinner, createErrorState } from '../utils/templates.js';

// ============================================================================
// STATISTICS VIEW - Subtab-based for better performance
// ============================================================================

// Current state
let currentPeriod = 'month';
let currentSubtab = 'overview';

// ============================================================================
// SUBTAB PERMISSIONS
// ============================================================================

/**
 * Check if user can access a specific subtab
 */
function canAccessSubtab(subtab) {
  // Admin can access everything
  if (isAdmin()) return true;

  // Map subtabs to permission keys
  const subtabPermissions = {
    'overview': 'canAccessOverview',
    'revenue': 'canAccessRevenue',
    'orders': 'canAccessOrders',
    'shipping': 'canAccessShipping',
    'customers': 'canAccessCustomers',
    'products': 'canAccessProducts',
    'authors': 'canAccessAuthors',
    'services': 'canAccessServices'
  };

  const permKey = subtabPermissions[subtab];
  if (!permKey) return false;

  return hasPermission('statistics', permKey);
}

/**
 * Get list of accessible subtabs for current user
 */
function getAccessibleSubtabs() {
  return SUBTABS.filter(tab => canAccessSubtab(tab.id));
}

/**
 * Get first accessible subtab (for initial load)
 */
function getDefaultSubtab() {
  const accessible = getAccessibleSubtabs();
  return accessible.length > 0 ? accessible[0].id : 'overview';
}

// Cached data per subtab
let cachedData = {
  dashboard: null,
  productStats: null,
  authorStats: null,
  serviceStats: null
};

const SUBTABS = [
  { id: 'overview', label: 'Обзор', icon: SVGIcons.trendingUp },
  { id: 'revenue', label: 'Выручка', icon: SVGIcons.dollarSign },
  { id: 'orders', label: 'Заказы', icon: SVGIcons.package },
  { id: 'shipping', label: 'Доставка', icon: SVGIcons.truck },
  { id: 'customers', label: 'Клиенты', icon: SVGIcons.users },
  { id: 'products', label: 'Товары', icon: SVGIcons.shopping },
  { id: 'authors', label: 'Авторы', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' },
  { id: 'services', label: 'Сервисы', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>' }
];

const periodLabels = {
  'today': 'Сегодня',
  'week': 'Неделя',
  'month': 'Месяц',
  'year': 'Год',
  'all': 'Все время'
};

let periodPanelVisible = false;

async function loadStatistics() {
  requireAuth();

  // Ensure current subtab is accessible
  if (!canAccessSubtab(currentSubtab)) {
    currentSubtab = getDefaultSubtab();
  }

  const content = document.getElementById('content');
  periodPanelVisible = false;

  content.innerHTML = `
    ${createPageHeader({ title: 'Аналитика', refreshAction: 'refresh-statistics' })}
    ${renderSubtabNav()}
    <div id="subtab-content">
      ${createLoadingSpinner('Загрузка...')}
    </div>

    <!-- Floating period selector button -->
    <button class="fab fab-filter" data-action="toggle-period-panel" title="Период: ${periodLabels[currentPeriod]}">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
      <span class="fab-filter-label">${periodLabels[currentPeriod]}</span>
    </button>

    <!-- Period selector panel -->
    <div class="fab-filter-panel" id="period-panel" style="display: none;">
      ${['today', 'week', 'month', 'year', 'all'].map(p => `
        <button
          class="fab-filter-option ${currentPeriod === p ? 'active' : ''}"
          data-action="change-period"
          data-period="${p}"
        >${periodLabels[p]}</button>
      `).join('')}
    </div>
  `;

  setupStatisticsEvents();
  await loadSubtabContent();
}

function renderSubtabNav() {
  // Filter subtabs based on permissions
  const visibleSubtabs = getAccessibleSubtabs();

  return `
    <div class="tabs-carousel" style="margin-bottom: var(--spacing-md);">
      <div class="tabs-container">
        ${visibleSubtabs.map(tab => `
          <button class="tab-btn ${currentSubtab === tab.id ? 'active' : ''}" data-action="switch-statistics-subtab" data-subtab="${tab.id}">
            <span class="tab-icon" style="width: 18px; height: 18px;">${tab.icon}</span>
            <span class="tab-label">${tab.label}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

async function loadSubtabContent() {
  const container = document.getElementById('subtab-content');
  if (!container) return;

  container.innerHTML = createLoadingSpinner('Загрузка...');

  try {
    switch (currentSubtab) {
      case 'overview':
        await loadOverviewTab(container);
        break;
      case 'revenue':
        await loadRevenueTab(container);
        break;
      case 'orders':
        await loadOrdersTab(container);
        break;
      case 'shipping':
        await loadShippingTab(container);
        break;
      case 'customers':
        await loadCustomersTab(container);
        break;
      case 'products':
        await loadProductsTab(container);
        break;
      case 'authors':
        await loadAuthorsTab(container);
        break;
      case 'services':
        await loadServicesTab(container);
        break;
      default:
        await loadOverviewTab(container);
    }
  } catch (error) {
    console.error('Error loading subtab:', error);
    container.innerHTML = createErrorState({
      title: 'Ошибка загрузки',
      message: error.message,
      retryAction: 'reload-statistics'
    });
  }
}

// ============================================================================
// DATA FETCHING
// ============================================================================

async function fetchDashboardData(force = false) {
  if (cachedData.dashboard && !force) return cachedData.dashboard;

  const response = await apiGet(`/api/analytics/dashboard?period=${currentPeriod}`);
  if (!response.ok) throw new Error('Failed to load dashboard data');
  cachedData.dashboard = await response.json();
  return cachedData.dashboard;
}

async function fetchAuthorStats(force = false) {
  if (cachedData.authorStats && !force) return cachedData.authorStats;

  const response = await apiGet(`/api/analytics/author-stats?period=${currentPeriod}`);
  if (!response.ok) throw new Error('Failed to load author stats');
  cachedData.authorStats = await response.json();
  return cachedData.authorStats;
}

async function fetchProductStats(force = false) {
  if (cachedData.productStats && !force) return cachedData.productStats;

  const response = await apiGet(`/api/analytics/product-stats`);
  if (!response.ok) throw new Error('Failed to load product stats');
  cachedData.productStats = await response.json();
  return cachedData.productStats;
}

async function fetchServiceStats(force = false) {
  if (cachedData.serviceStats && !force) return cachedData.serviceStats;

  const response = await apiGet(`/api/admin/service-stats`);
  if (!response.ok) throw new Error('Failed to load service stats');
  cachedData.serviceStats = await response.json();
  return cachedData.serviceStats;
}

// ============================================================================
// SUBTAB RENDERERS
// ============================================================================

async function loadOverviewTab(container) {
  const data = await fetchDashboardData();
  const { revenue, orders, time } = data;

  container.innerHTML = `
    <div class="stats-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--spacing-md); margin-bottom: var(--spacing-xl);">
      <div class="stat-card">
        <div class="stat-label">Выручка</div>
        <div class="stat-value">${formatNumber(revenue?.total_revenue || 0)}₽</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Заказов</div>
        <div class="stat-value">${orders?.funnel?.total || 0}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Оплачено</div>
        <div class="stat-value">${orders?.funnel?.paid || 0}</div>
        <div class="stat-note">${orders?.conversion_rates?.payment_rate || 0}%</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Средний чек</div>
        <div class="stat-value">${formatNumber(revenue?.avg_order_value || 0)}₽</div>
      </div>
    </div>

    ${time?.weekly_comparison ? `
      <div class="card" style="margin-bottom: var(--spacing-md);">
        <h4 style="font-size: 0.875rem; font-weight: 600; margin-bottom: var(--spacing-md);">Сравнение с прошлой неделей</h4>
        <div class="stats-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--spacing-md);">
          <div class="stat-card">
            <div class="stat-label">Заказы</div>
            <div class="stat-value">${time.weekly_comparison.current.orders}</div>
            ${time.weekly_comparison.order_growth !== 0 ? `
              <div class="stat-change ${time.weekly_comparison.order_growth >= 0 ? 'positive' : 'negative'}">
                ${time.weekly_comparison.order_growth >= 0 ? '↑' : '↓'} ${Math.abs(time.weekly_comparison.order_growth)}%
              </div>
            ` : ''}
          </div>
          <div class="stat-card">
            <div class="stat-label">Выручка</div>
            <div class="stat-value">${formatNumber(time.weekly_comparison.current.revenue)}₽</div>
            ${time.weekly_comparison.revenue_growth !== 0 ? `
              <div class="stat-change ${time.weekly_comparison.revenue_growth >= 0 ? 'positive' : 'negative'}">
                ${time.weekly_comparison.revenue_growth >= 0 ? '↑' : '↓'} ${Math.abs(time.weekly_comparison.revenue_growth)}%
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    ` : ''}

    ${time?.peak_hours?.length > 0 ? `
      <div class="card">
        <h4 style="font-size: 0.875rem; font-weight: 600; margin-bottom: var(--spacing-sm);">Пиковые часы</h4>
        <div style="display: flex; gap: var(--spacing-lg);">
          ${time.peak_hours.map((h, i) => `
            <div style="text-align: center;">
              <div style="font-size: 0.75rem; color: var(--text-tertiary);">#${i + 1}</div>
              <div style="font-size: 1.25rem; font-weight: 600;">${h.hour}:00</div>
              <div style="font-size: 0.75rem; color: var(--text-secondary);">${h.count} заказов</div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
  `;
}

async function loadRevenueTab(container) {
  const data = await fetchDashboardData();
  const { revenue } = data;

  container.innerHTML = `
    <div class="stats-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--spacing-md); margin-bottom: var(--spacing-xl);">
      <div class="stat-card">
        <div class="stat-label">Общая выручка</div>
        <div class="stat-value">${formatNumber(revenue?.total_revenue || 0)}₽</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Чистая выручка</div>
        <div class="stat-value">${formatNumber(revenue?.net_revenue || 0)}₽</div>
        <div class="stat-note">после возвратов</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Средний чек</div>
        <div class="stat-value">${formatNumber(revenue?.avg_order_value || 0)}₽</div>
        ${revenue?.avg_order_change ? `
          <div class="stat-change ${parseFloat(revenue.avg_order_change) >= 0 ? 'positive' : 'negative'}">
            ${parseFloat(revenue.avg_order_change) >= 0 ? '↑' : '↓'} ${Math.abs(revenue.avg_order_change)}%
          </div>
        ` : ''}
      </div>
      <div class="stat-card">
        <div class="stat-label">Возвраты</div>
        <div class="stat-value">${formatNumber(revenue?.refunded_amount || 0)}₽</div>
        <div class="stat-note">${revenue?.refund_count || 0} заказов (${revenue?.refund_rate || 0}%)</div>
      </div>
    </div>

    ${revenue?.daily_revenue?.length > 0 ? `
      <div class="card">
        <h4 style="font-size: 0.875rem; font-weight: 600; margin-bottom: var(--spacing-sm);">Выручка по дням</h4>
        <div class="mini-chart" style="display: flex; align-items: flex-end; gap: 2px; height: 80px;">
          ${renderMiniBarChart(revenue.daily_revenue.map(d => d.revenue))}
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-tertiary); margin-top: var(--spacing-xs);">
          <span>${revenue.daily_revenue[0]?.date || ''}</span>
          <span>${revenue.daily_revenue[revenue.daily_revenue.length - 1]?.date || ''}</span>
        </div>
      </div>
    ` : ''}
  `;
}

async function loadOrdersTab(container) {
  const data = await fetchDashboardData();
  const { orders } = data;

  container.innerHTML = `
    <div class="stats-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: var(--spacing-md); margin-bottom: var(--spacing-xl);">
      <div class="stat-card">
        <div class="stat-label">Всего</div>
        <div class="stat-value">${orders?.funnel?.total || 0}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Оплачено</div>
        <div class="stat-value">${orders?.funnel?.paid || 0}</div>
        <div class="stat-note">${orders?.conversion_rates?.payment_rate || 0}%</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Отправлено</div>
        <div class="stat-value">${orders?.funnel?.shipped || 0}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Доставлено</div>
        <div class="stat-value">${orders?.funnel?.delivered || 0}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Отменено</div>
        <div class="stat-value" style="color: var(--error);">${orders?.funnel?.cancelled || 0}</div>
        <div class="stat-note">${orders?.conversion_rates?.cancellation_rate || 0}%</div>
      </div>
    </div>

    <div class="card" style="margin-bottom: var(--spacing-md);">
      <h4 style="font-size: 0.875rem; font-weight: 600; margin-bottom: var(--spacing-md);">Воронка заказов</h4>
      ${renderOrderFunnel(orders?.funnel, orders?.conversion_rates)}
    </div>

    ${orders?.orders_by_day_of_week?.length > 0 ? `
      <div class="card">
        <h4 style="font-size: 0.875rem; font-weight: 600; margin-bottom: var(--spacing-sm);">Заказы по дням недели</h4>
        <div style="display: flex; justify-content: space-around; text-align: center;">
          ${orders.orders_by_day_of_week.map(d => `
            <div>
              <div style="font-size: 1.25rem; font-weight: 600;">${d.count}</div>
              <div style="font-size: 0.75rem; color: var(--text-secondary);">${d.day}</div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
  `;
}

async function loadShippingTab(container) {
  const data = await fetchDashboardData();
  const { shipping } = data;

  container.innerHTML = `
    <div class="stats-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--spacing-md); margin-bottom: var(--spacing-xl);">
      <div class="stat-card">
        <div class="stat-label">Ср. время доставки</div>
        <div class="stat-value">${(shipping?.avg_days_to_delivery || 0).toFixed(1)} дн.</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">После оплаты</div>
        <div class="stat-value">${(shipping?.avg_days_after_payment || 0).toFixed(1)} дн.</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Подтверждено</div>
        <div class="stat-value">${shipping?.user_confirmation_rate || 0}%</div>
      </div>
    </div>

    ${shipping?.by_delivery_type?.length > 0 ? `
      <div class="card">
        <h4 style="font-size: 0.875rem; font-weight: 600; margin-bottom: var(--spacing-md);">По типу доставки</h4>
        ${shipping.by_delivery_type.map(dt => `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: var(--spacing-sm) 0; border-bottom: 1px solid var(--border-color);">
            <span>${dt.display_name}</span>
            <span style="color: var(--text-secondary);">${dt.count} заказов • ~${formatNumber(dt.avg_cost)}₽</span>
          </div>
        `).join('')}
      </div>
    ` : '<div class="card"><p style="color: var(--text-secondary);">Нет данных о доставке</p></div>'}
  `;
}

async function loadCustomersTab(container) {
  const data = await fetchDashboardData();
  const { customers } = data;

  container.innerHTML = `
    <div class="stats-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: var(--spacing-md); margin-bottom: var(--spacing-xl);">
      <div class="stat-card">
        <div class="stat-label">Всего клиентов</div>
        <div class="stat-value">${customers?.total_customers || 0}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Повторные</div>
        <div class="stat-value">${customers?.repeat_customers || 0}</div>
        <div class="stat-note">${customers?.repeat_rate || 0}%</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Ср. заказов/клиент</div>
        <div class="stat-value">${(customers?.avg_orders_per_customer || 1).toFixed(1)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Ср. LTV</div>
        <div class="stat-value">${formatNumber(customers?.avg_customer_lifetime_value || 0)}₽</div>
      </div>
    </div>

    ${customers?.reviews ? `
      <div class="card">
        <h4 style="font-size: 0.875rem; font-weight: 600; margin-bottom: var(--spacing-md);">Отзывы</h4>
        <div style="display: flex; gap: var(--spacing-lg); flex-wrap: wrap;">
          <div>
            <span style="font-size: 1.5rem; font-weight: 600;">${customers.reviews.total}</span>
            <span style="color: var(--text-secondary);"> всего</span>
          </div>
          <div>
            <span style="font-size: 1.5rem; font-weight: 600;">${(customers.reviews.avg_rating || 0).toFixed(1)}</span>
            <span style="color: var(--text-secondary);"> ср. оценка</span>
          </div>
          <div>
            <span style="font-size: 1.5rem; font-weight: 600;">${customers.reviews.verified}</span>
            <span style="color: var(--text-secondary);"> подтверждённых</span>
          </div>
        </div>
      </div>
    ` : ''}
  `;
}

async function loadProductsTab(container) {
  const data = await fetchDashboardData();
  const productStats = await fetchProductStats();
  const { products } = data;

  container.innerHTML = `
    <div class="card" style="margin-bottom: var(--spacing-md);">
      <h4 style="font-size: 0.875rem; font-weight: 600; margin-bottom: var(--spacing-md);">Топ по выручке</h4>
      ${renderTopProducts(products?.top_by_revenue || [])}
    </div>

    ${products?.popular_options?.length > 0 ? `
      <div class="card" style="margin-bottom: var(--spacing-md);">
        <h4 style="font-size: 0.875rem; font-weight: 600; margin-bottom: var(--spacing-md);">Популярные форматы</h4>
        ${renderPopularOptions(products.popular_options)}
      </div>
    ` : ''}

    ${products?.by_status?.length > 0 ? `
      <div class="card" style="margin-bottom: var(--spacing-md);">
        <h4 style="font-size: 0.875rem; font-weight: 600; margin-bottom: var(--spacing-md);">Товары по статусу</h4>
        <div style="display: flex; gap: var(--spacing-md); flex-wrap: wrap;">
          ${products.by_status.map(s => `
            <div class="stat-mini">
              <span style="font-weight: 600;">${s.count}</span>
              <span style="color: var(--text-secondary); font-size: 0.875rem;"> ${getProductStatusLabel(s.status)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    <div class="card">
      <h4 style="font-size: 0.875rem; font-weight: 600; margin-bottom: var(--spacing-md);">Поиск товара</h4>
      <div style="position: relative;">
        <input
          type="text"
          id="product-stats-search"
          placeholder="Поиск по названию..."
          style="width: 100%; padding: var(--spacing-sm); border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-primary); color: var(--text-primary);"
        >
        <div id="product-stats-autocomplete" style="position: absolute; top: 100%; left: 0; right: 0; max-height: 300px; overflow-y: auto; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); margin-top: 4px; display: none; z-index: 10;"></div>
      </div>
      <div id="product-stats-detail" style="margin-top: var(--spacing-lg);"></div>
    </div>
  `;

  setupProductSearch();
}

async function loadAuthorsTab(container) {
  const authorStats = await fetchAuthorStats();

  if (!authorStats?.authors?.length) {
    container.innerHTML = `
      <div class="card">
        <p style="color: var(--text-secondary); text-align: center; padding: var(--spacing-xl);">Нет данных по авторам за выбранный период</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="card">
      <h4 style="font-size: 0.875rem; font-weight: 600; margin-bottom: var(--spacing-md);">
        Статистика по авторам (${authorStats.authors.length})
      </h4>
      ${renderAuthorStats(authorStats.authors)}
    </div>
  `;
}

async function loadServicesTab(container) {
  const data = await fetchServiceStats();

  const emailPct = data.email.limit > 0 ? Math.round((data.email.sent / data.email.limit) * 100) : 0;
  const emailBarColor = emailPct >= 80 ? 'var(--danger, #ef4444)' : emailPct >= 50 ? 'var(--warning, #f59e0b)' : 'var(--primary)';

  const apishipMonthlyPct = data.apiship.monthlyLimit > 0 ? Math.round((data.apiship.monthlyCalculatorCalls / data.apiship.monthlyLimit) * 100) : 0;
  const apishipBarColor = apishipMonthlyPct >= 80 ? 'var(--danger, #ef4444)' : apishipMonthlyPct >= 50 ? 'var(--warning, #f59e0b)' : 'var(--primary)';

  container.innerHTML = `
    <div class="card" style="margin-bottom: var(--spacing-md);">
      <h4 style="font-size: 0.875rem; font-weight: 600; margin-bottom: var(--spacing-md);">Yandex SMTP (email)</h4>
      <div style="margin-bottom: var(--spacing-md);">
        <div style="display: flex; justify-content: space-between; margin-bottom: var(--spacing-xs);">
          <span>Отправлено сегодня</span>
          <span style="font-weight: 600;">${data.email.sent} / ${data.email.limit}</span>
        </div>
        <div style="height: 8px; background: var(--bg-secondary); border-radius: 4px; overflow: hidden;">
          <div style="height: 100%; background: ${emailBarColor}; width: ${emailPct}%;"></div>
        </div>
      </div>
      ${data.email.failed > 0 ? `
        <div style="color: var(--danger); font-size: 0.875rem;">
          Ошибок отправки: ${data.email.failed}
        </div>
      ` : ''}
      <div style="color: var(--text-tertiary); font-size: 0.75rem; margin-top: var(--spacing-sm);">
        Лимит: 500 писем/день на один почтовый ящик Yandex
      </div>
    </div>

    <div class="card">
      <h4 style="font-size: 0.875rem; font-weight: 600; margin-bottom: var(--spacing-md);">APIShip (расчёт доставки)</h4>
      <div style="margin-bottom: var(--spacing-md);">
        <div style="display: flex; justify-content: space-between; margin-bottom: var(--spacing-xs);">
          <span>Расчётов за месяц</span>
          <span style="font-weight: 600;">${formatNumber(data.apiship.monthlyCalculatorCalls)} / ${formatNumber(data.apiship.monthlyLimit)}</span>
        </div>
        <div style="height: 8px; background: var(--bg-secondary); border-radius: 4px; overflow: hidden;">
          <div style="height: 100%; background: ${apishipBarColor}; width: ${apishipMonthlyPct}%;"></div>
        </div>
      </div>
      <div class="stats-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--spacing-md);">
        <div>
          <div style="color: var(--text-secondary); font-size: 0.75rem;">Сегодня расчётов</div>
          <div style="font-weight: 600;">${data.apiship.calculatorCalls}</div>
        </div>
        <div>
          <div style="color: var(--text-secondary); font-size: 0.75rem;">Из кэша</div>
          <div style="font-weight: 600;">${data.apiship.cacheHits}</div>
        </div>
        <div>
          <div style="color: var(--text-secondary); font-size: 0.75rem;">Всего запросов</div>
          <div style="font-weight: 600;">${data.apiship.totalCalls}</div>
        </div>
      </div>
      <div style="color: var(--text-tertiary); font-size: 0.75rem; margin-top: var(--spacing-md);">
        Лимит: 10,000 расчётов/месяц (бесплатный тариф APIShip)
      </div>
    </div>
  `;
}

// ============================================================================
// HELPER RENDERERS
// ============================================================================

function renderMiniBarChart(values) {
  if (!values || values.length === 0) return '';
  const max = Math.max(...values.map(v => parseFloat(v) || 0));
  if (max === 0) return '<div style="color: var(--text-secondary);">Нет данных</div>';

  return values.map(v => {
    const height = max > 0 ? (parseFloat(v) / max) * 100 : 0;
    return `<div style="flex: 1; background: var(--primary); border-radius: 2px; min-height: 2px; height: ${Math.max(height, 2)}%;"></div>`;
  }).join('');
}

function renderOrderFunnel(funnel, rates) {
  if (!funnel) return '<div style="color: var(--text-secondary);">Нет данных</div>';

  const stages = [
    { key: 'total', label: 'Всего заказов', value: funnel.total, rate: '100%' },
    { key: 'paid', label: 'Оплачено', value: funnel.paid, rate: rates?.payment_rate + '%' },
    { key: 'shipped', label: 'Отправлено', value: funnel.shipped, rate: rates?.shipping_rate + '%' },
    { key: 'delivered', label: 'Доставлено', value: funnel.delivered, rate: rates?.delivery_rate + '%' }
  ];

  const maxValue = funnel.total || 1;

  return stages.map(stage => {
    const width = maxValue > 0 ? (stage.value / maxValue) * 100 : 0;
    return `
      <div style="margin-bottom: var(--spacing-sm);">
        <div style="display: flex; justify-content: space-between; font-size: 0.875rem; margin-bottom: 2px;">
          <span>${stage.label}</span>
          <span style="color: var(--text-secondary);">${stage.value} (${stage.rate})</span>
        </div>
        <div style="height: 8px; background: var(--bg-secondary); border-radius: 4px; overflow: hidden;">
          <div style="height: 100%; background: linear-gradient(90deg, var(--primary), var(--primary-hover)); width: ${width}%; transition: width 0.3s;"></div>
        </div>
      </div>
    `;
  }).join('');
}

function renderTopProducts(products) {
  if (!products || products.length === 0) {
    return '<p style="color: var(--text-secondary);">Нет данных</p>';
  }

  const maxRevenue = Math.max(...products.map(p => parseFloat(p.total_revenue)));

  return products.map((product, index) => {
    const revenue = parseFloat(product.total_revenue);
    const percentage = (revenue / maxRevenue) * 100;

    return `
      <div style="margin-bottom: var(--spacing-md);">
        <div style="display: flex; align-items: center; gap: var(--spacing-sm); margin-bottom: var(--spacing-xs);">
          <span style="font-weight: 600; color: var(--text-tertiary); min-width: 24px;">#${index + 1}</span>
          ${product.image ? `<img src="${addImageSize(product.image, '480x0')}" style="width: 40px; height: 40px; border-radius: var(--radius-sm); object-fit: cover;">` : ''}
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${product.title}</div>
            <div style="font-size: 0.875rem; color: var(--text-secondary);">
              ${product.order_count} заказов • ${product.total_quantity} шт • ${formatNumber(revenue)}₽
            </div>
          </div>
        </div>
        <div style="height: 4px; background: var(--bg-secondary); border-radius: 2px; overflow: hidden; margin-left: 32px;">
          <div style="height: 100%; background: linear-gradient(90deg, var(--primary), var(--primary-hover)); width: ${percentage}%;"></div>
        </div>
      </div>
    `;
  }).join('');
}

function renderPopularOptions(options) {
  if (!options || options.length === 0) {
    return '<p style="color: var(--text-secondary);">Нет данных</p>';
  }

  const maxCount = Math.max(...options.map(o => parseInt(o.order_count)));

  return options.map(option => {
    const count = parseInt(option.order_count);
    const percentage = (count / maxCount) * 100;

    return `
      <div style="margin-bottom: var(--spacing-md);">
        <div style="display: flex; justify-content: space-between; margin-bottom: var(--spacing-xs);">
          <span style="font-weight: 500;">${option.option_name}</span>
          <span style="color: var(--text-secondary);">${count} заказов • ${option.total_quantity} шт</span>
        </div>
        <div style="height: 6px; background: var(--bg-secondary); border-radius: 3px; overflow: hidden;">
          <div style="height: 100%; background: linear-gradient(90deg, var(--primary), var(--primary-hover)); width: ${percentage}%;"></div>
        </div>
      </div>
    `;
  }).join('');
}

function renderAuthorStats(authors) {
  if (!authors || authors.length === 0) {
    return '<p style="color: var(--text-secondary);">Нет данных по авторам</p>';
  }

  const maxRevenue = Math.max(...authors.map(a => parseFloat(a.total_revenue) || 0));

  return `
    <div style="max-height: 500px; overflow-y: auto;">
      ${authors.map(author => {
        const revenue = parseFloat(author.total_revenue) || 0;
        const percentage = maxRevenue > 0 ? (revenue / maxRevenue) * 100 : 0;

        return `
          <div style="margin-bottom: var(--spacing-md); padding-bottom: var(--spacing-md); border-bottom: 1px solid var(--border-color);">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: var(--spacing-xs);">
              <div style="flex: 1;">
                <div style="font-weight: 500; margin-bottom: 2px;">${author.author}</div>
                <div style="color: var(--text-secondary); font-size: 0.75rem;">
                  ${author.product_count} ${author.product_count === 1 ? 'товар' : author.product_count < 5 ? 'товара' : 'товаров'}
                </div>
              </div>
              <div style="text-align: right;">
                <div style="font-weight: 600; color: var(--text-primary);">${formatNumber(revenue)}₽</div>
                <div style="color: var(--text-secondary); font-size: 0.75rem;">
                  ${author.order_count} ${author.order_count === 1 ? 'заказ' : author.order_count < 5 ? 'заказа' : 'заказов'} • ${author.total_quantity} шт
                </div>
              </div>
            </div>
            ${revenue > 0 ? `
              <div style="height: 4px; background: var(--bg-secondary); border-radius: 2px; overflow: hidden;">
                <div style="height: 100%; background: linear-gradient(90deg, var(--primary), var(--primary-hover)); width: ${percentage}%;"></div>
              </div>
            ` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function getProductStatusLabel(status) {
  const labels = {
    'available': 'Доступно',
    'coming_soon': 'Скоро',
    'not_for_sale': 'Не в продаже',
    'test': 'Тест'
  };
  return labels[status] || status;
}

// ============================================================================
// PRODUCT SEARCH
// ============================================================================

let productSearchDebounceTimer = null;
let cachedProductList = null;

function setupProductSearch() {
  const searchInput = document.getElementById('product-stats-search');
  const autocompleteDiv = document.getElementById('product-stats-autocomplete');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      clearTimeout(productSearchDebounceTimer);
      productSearchDebounceTimer = setTimeout(() => {
        searchProductsForStats(e.target.value);
      }, 300);
    });

    document.addEventListener('click', (e) => {
      if (!searchInput.contains(e.target) && !autocompleteDiv?.contains(e.target)) {
        if (autocompleteDiv) autocompleteDiv.style.display = 'none';
      }
    });
  }
}

async function searchProductsForStats(query) {
  if (!query || query.length < 2) {
    document.getElementById('product-stats-autocomplete').style.display = 'none';
    return;
  }

  try {
    // Cache product list to avoid fetching the full catalog on every keystroke
    if (!cachedProductList) {
      const response = await apiGet(`/products?all=true`);
      cachedProductList = await response.json();
    }
    const filtered = searchProductsRelevance(cachedProductList, query, 10);
    const autocompleteDiv = document.getElementById('product-stats-autocomplete');

    if (filtered.length === 0) {
      autocompleteDiv.innerHTML = '<div style="padding: var(--spacing-sm); color: var(--text-secondary);">Ничего не найдено</div>';
      autocompleteDiv.style.display = 'block';
      return;
    }

    autocompleteDiv.innerHTML = filtered.map(product => `
      <div
        class="product-autocomplete-item"
        data-product-id="${product.id}"
        style="padding: var(--spacing-sm); cursor: pointer; border-bottom: 1px solid var(--border-color);"
      >
        <div style="display: flex; align-items: center; gap: var(--spacing-sm);">
          ${product.images && product.images.length > 0 ? `<img src="${addImageSize(product.images[0], '480x0')}" style="width: 30px; height: 30px; border-radius: var(--radius-sm); object-fit: cover;">` : ''}
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${product.title}</div>
          </div>
        </div>
      </div>
    `).join('');

    autocompleteDiv.style.display = 'block';

    document.querySelectorAll('.product-autocomplete-item').forEach(item => {
      item.addEventListener('click', () => {
        const productId = item.dataset.productId;
        document.getElementById('product-stats-search').value = '';
        autocompleteDiv.style.display = 'none';
        loadProductStatistics(productId);
      });
    });

  } catch (error) {
    console.error('Error searching products:', error);
  }
}

async function loadProductStatistics(productId) {
  const detailContainer = document.getElementById('product-stats-detail');
  detailContainer.innerHTML = createLoadingSpinner('Загрузка...');

  try {
    const response = await apiGet(`/api/analytics/product-stats?product_id=${productId}`);
    if (!response.ok) throw new Error('Failed to load product stats');
    const data = await response.json();

    if (!data.statistics) {
      detailContainer.innerHTML = '<p style="color: var(--text-secondary);">Нет данных по этому товару</p>';
      return;
    }

    const stats = data.statistics;
    detailContainer.innerHTML = `
      <div class="card">
        <h4 style="font-weight: 600; margin-bottom: var(--spacing-md);">${stats.product_title || 'Товар'}</h4>
        <div class="stats-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: var(--spacing-md);">
          <div class="stat-card">
            <div class="stat-label">Заказов</div>
            <div class="stat-value">${stats.order_count || 0}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Продано шт</div>
            <div class="stat-value">${stats.total_quantity || 0}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Выручка</div>
            <div class="stat-value">${formatNumber(stats.total_revenue || 0)}₽</div>
          </div>
        </div>
      </div>
    `;
  } catch (error) {
    console.error('Error loading product stats:', error);
    detailContainer.innerHTML = '<p style="color: var(--error);">Ошибка загрузки</p>';
  }
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function handleStatisticsClick(e) {
  const target = e.target;
  const action = target.dataset.action || target.closest('[data-action]')?.dataset.action;
  if (!action) return;

  switch (action) {
    case 'refresh-statistics':
      cachedData = { dashboard: null, productStats: null, authorStats: null, serviceStats: null };
      loadStatistics();
      break;

    case 'reload-statistics':
      loadStatistics();
      break;

    case 'toggle-period-panel': {
      periodPanelVisible = !periodPanelVisible;
      const panel = document.getElementById('period-panel');
      if (panel) {
        panel.style.display = periodPanelVisible ? 'flex' : 'none';
      }
      break;
    }

    case 'change-period': {
      const newPeriod = target.dataset.period || target.closest('[data-period]')?.dataset.period;
      if (newPeriod && newPeriod !== currentPeriod) {
        currentPeriod = newPeriod;
        cachedData.dashboard = null;
        cachedData.authorStats = null;
        // Hide the panel
        periodPanelVisible = false;
        const periodPanel = document.getElementById('period-panel');
        if (periodPanel) periodPanel.style.display = 'none';
        // Update FAB label
        const fabBtn = document.querySelector('.fab-filter');
        if (fabBtn) {
          const fabLabel = fabBtn.querySelector('.fab-filter-label');
          if (fabLabel) fabLabel.textContent = periodLabels[currentPeriod];
          fabBtn.title = `Период: ${periodLabels[currentPeriod]}`;
        }
        // Update active state in panel options
        document.querySelectorAll('.fab-filter-option').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.period === currentPeriod);
        });
        // Reload content
        loadSubtabContent();
      } else {
        // Same period clicked - just close panel
        periodPanelVisible = false;
        const periodPanel = document.getElementById('period-panel');
        if (periodPanel) periodPanel.style.display = 'none';
      }
      break;
    }

    case 'switch-statistics-subtab':
      const newSubtab = target.dataset.subtab || target.closest('[data-subtab]')?.dataset.subtab;
      if (newSubtab && newSubtab !== currentSubtab) {
        // Check permission before switching
        if (!canAccessSubtab(newSubtab)) {
          showToast('Доступ к этому разделу ограничен', 'error');
          return;
        }
        currentSubtab = newSubtab;
        // Update nav
        document.querySelectorAll('[data-action="switch-statistics-subtab"]').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.subtab === newSubtab);
        });
        loadSubtabContent();
      }
      break;
  }
}

function setupStatisticsEvents() {
  const content = document.getElementById('content');
  if (content._statisticsClickHandler) {
    content.removeEventListener('click', content._statisticsClickHandler);
  }
  content._statisticsClickHandler = handleStatisticsClick;
  content.addEventListener('click', handleStatisticsClick);
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  loadStatistics,
  loadStatistics as renderStatisticsView,
  loadProductStatistics,
  setupStatisticsEvents
};
