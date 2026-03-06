/**
 * views/dashboard.js
 * Extracted from admin-miniapp/script.js
 */

import { state, updateState } from '../state.js';
import { API_BASE, tg, isBrowserMode } from '../config.js';
import { SVGIcons, requireAuth, formatDate, formatTime, formatPrice, formatNumber, showToast, showError, copyToClipboard } from '../utils.js';
import { apiGet } from '../utils/apiClient.js';
import { createPageHeader } from '../utils/templates.js';

// ============================================================================
// DASHBOARD VIEW
// ============================================================================

async function loadDashboard() {
  requireAuth();
  const content = document.getElementById('content');

  content.innerHTML = `
    ${createPageHeader({ title: 'Панель управления', refreshAction: 'refresh-dashboard' })}
    <div class="loading-spinner">
      <div class="spinner"></div>
      <p>Загрузка статистики...</p>
    </div>
  `;
  setupDashboardEvents();

  try {
    const analytics = await fetchAnalytics(state.selectedPeriod);
    state.analytics = analytics;

    content.innerHTML = `
      ${createPageHeader({ title: 'Панель управления', refreshAction: 'refresh-dashboard' })}

      <div class="period-selector">
        <button class="period-btn ${state.selectedPeriod === 'today' ? 'active' : ''}"
                data-action="change-period" data-period="today">
          Сегодня
        </button>
        <button class="period-btn ${state.selectedPeriod === 'week' ? 'active' : ''}"
                data-action="change-period" data-period="week">
          Неделя
        </button>
        <button class="period-btn ${state.selectedPeriod === 'month' ? 'active' : ''}"
                data-action="change-period" data-period="month">
          Месяц
        </button>
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Общая статистика</h3>
        </div>
        <div class="card-body">
          <table class="data-table">
            <tr>
              <td class="cell-label">Всего заказов</td>
              <td class="cell-value">${analytics.total_orders}</td>
            </tr>
            <tr>
              <td class="cell-label">Оплачено заказов</td>
              <td class="cell-value">${analytics.paid_orders}</td>
            </tr>
            <tr>
              <td class="cell-label">Общая выручка</td>
              <td class="cell-value accent">${formatNumber(analytics.total_revenue)}₽</td>
            </tr>
            <tr>
              <td class="cell-label">Средний чек</td>
              <td class="cell-value">${formatNumber(Math.round(analytics.avg_order_value))}₽</td>
            </tr>
            <tr>
              <td class="cell-label">Процент выплаты</td>
              <td class="cell-value">${analytics.total_orders > 0 ? Math.round((analytics.paid_orders / analytics.total_orders) * 100) : 0}%</td>
            </tr>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Статусы заказов</h3>
        </div>
        <div class="card-body">
          <table class="data-table">
            <thead>
              <tr>
                <th>Статус</th>
                <th class="text-right">Количество</th>
                <th class="text-right">Процент</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="cell-label">В ожидании</td>
                <td class="cell-value">${analytics.pending_orders}</td>
                <td class="cell-percent">${analytics.total_orders > 0 ? Math.round((analytics.pending_orders / analytics.total_orders) * 100) : 0}%</td>
              </tr>
              <tr>
                <td class="cell-label">Отправлено</td>
                <td class="cell-value">${analytics.shipped_orders}</td>
                <td class="cell-percent">${analytics.total_orders > 0 ? Math.round((analytics.shipped_orders / analytics.total_orders) * 100) : 0}%</td>
              </tr>
              <tr>
                <td class="cell-label">Завершено</td>
                <td class="cell-value">${analytics.completed_orders}</td>
                <td class="cell-percent">${analytics.total_orders > 0 ? Math.round((analytics.completed_orders / analytics.total_orders) * 100) : 0}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Отзывы</h3>
        </div>
        <div class="card-body">
          <div class="metric-grid">
            <div class="metric-item">
              <div class="metric-label">Новых отзывов</div>
              <div class="metric-value">${analytics.new_reviews}</div>
            </div>
            <div class="metric-item">
              <div class="metric-label">Средняя оценка</div>
              <div class="metric-value">${analytics.avg_rating} <span class="text-warning">★</span></div>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Пользователи</h3>
        </div>
        <div class="card-body">
          ${(() => {
            const methods = analytics.login_methods;
            const total = methods.reduce((s, m) => s + m.count, 0);
            if (!methods.length) return '<div class="text-center text-tertiary" style="padding: var(--spacing-md);">Нет данных</div>';
            const labels = { telegram: 'Telegram', yandex: 'Яндекс', vk: 'ВКонтакте' };
            const rows = methods.map(({ method, count }) => {
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return `<tr>
                <td class="cell-label">${labels[method] || method}</td>
                <td class="cell-value">${count}</td>
                <td class="cell-percent">${pct}%</td>
              </tr>`;
            }).join('');
            return `<table class="data-table">
              <thead><tr><th>Метод</th><th class="text-right">Пользователей</th><th class="text-right">Доля</th></tr></thead>
              <tbody>${rows}</tbody>
              <tfoot><tr><td class="cell-label"><strong>Всего</strong></td><td class="cell-value"><strong>${total}</strong></td><td></td></tr></tfoot>
            </table>`;
          })()}
        </div>
      </div>

      <div class="card" id="service-limits-card">
        <div class="card-header">
          <h3 class="card-title">Лимиты сервисов</h3>
        </div>
        <div class="card-body">
          <div class="text-center text-secondary" style="padding: var(--spacing-md);">Загрузка...</div>
        </div>
      </div>
    `;

    // Load service limits in background
    loadServiceLimits();
  } catch (error) {
    console.error('Error loading dashboard:', error);
    content.innerHTML = `
      ${createPageHeader({ title: 'Панель управления', refreshAction: 'refresh-dashboard' })}
      <div class="empty-state">
        <div class="empty-state-icon">${SVGIcons.alert}</div>
        <h3>Ошибка загрузки</h3>
        <p>Не удалось загрузить статистику</p>
        <button class="btn btn-primary" data-action="reload-dashboard">Повторить</button>
      </div>
    `;
  }
}

async function fetchAnalytics(period) {
  const response = await apiGet(`/api/analytics/dashboard?period=${period}&metrics=revenue,orders,customers`);
  if (!response.ok) throw new Error('Failed to fetch analytics');
  const data = await response.json();

  // Map API response to dashboard fields
  const revenue = data.revenue || {};
  const orders = data.orders || {};
  const customers = data.customers || {};
  const statusDist = orders.status_distribution || [];

  const findStatus = (s) => statusDist.find(r => r.status === s)?.count || 0;

  const paidStatuses = ['paid', 'in_work', 'parcel_pending', 'parcel_ready'];
  const paidOrders = paidStatuses.reduce((sum, s) => sum + findStatus(s), 0);
  const shippedOrders = findStatus('shipped');
  const deliveredOrders = findStatus('delivered');
  const totalOrders = orders.funnel?.total || statusDist.reduce((sum, r) => sum + r.count, 0);

  return {
    total_orders: totalOrders,
    paid_orders: paidOrders,
    pending_orders: findStatus('accepted') + findStatus('created'),
    shipped_orders: shippedOrders,
    completed_orders: deliveredOrders,
    total_revenue: revenue.total_revenue || 0,
    avg_order_value: revenue.avg_order_value || 0,
    new_reviews: customers.reviews?.total || 0,
    avg_rating: customers.reviews?.avg_rating ? customers.reviews.avg_rating.toFixed(1) : '—',
    login_methods: customers.login_methods || []
  };
}

function changePeriod(period) {
  state.selectedPeriod = period;
  loadDashboard();
}

/**
 * Force refresh dashboard data
 */
async function refreshDashboard() {
  showToast('Обновление...', 'info');
  state.analytics = null;
  await loadDashboard();
  showToast('Панель обновлена', 'success');
}

/**
 * Load service usage limits (Yandex SMTP, APIShip)
 */
async function loadServiceLimits() {
  const card = document.getElementById('service-limits-card');
  if (!card) return;
  const body = card.querySelector('.card-body');

  try {
    const response = await apiGet('/api/admin/service-stats');
    if (!response.ok) throw new Error('Failed to fetch');
    const data = await response.json();

    const emailPct = data.email.limit > 0 ? Math.round((data.email.sent / data.email.limit) * 100) : 0;
    const emailBarClass = emailPct >= 80 ? 'progress-bar-fill--error' : emailPct >= 50 ? 'progress-bar-fill--warning' : 'progress-bar-fill--ok';

    const apishipMonthlyPct = data.apiship.monthlyLimit > 0 ? Math.round((data.apiship.monthlyCalculatorCalls / data.apiship.monthlyLimit) * 100) : 0;
    const apishipBarClass = apishipMonthlyPct >= 80 ? 'progress-bar-fill--error' : apishipMonthlyPct >= 50 ? 'progress-bar-fill--warning' : 'progress-bar-fill--ok';

    body.innerHTML = `
      <table class="data-table">
        <tr>
          <td class="cell-label">
            Yandex SMTP
            <div class="text-xs text-tertiary mt-1">сегодня</div>
          </td>
          <td class="text-right">
            <div class="progress-bar-wrapper">
              <div class="progress-bar">
                <div class="progress-bar-fill ${emailBarClass}" style="width: ${emailPct}%;"></div>
              </div>
              <span class="progress-bar-value">${data.email.sent} / ${data.email.limit}</span>
            </div>
            ${data.email.failed > 0 ? `<div class="text-xs text-error text-right mt-1">${data.email.failed} ошибок</div>` : ''}
          </td>
        </tr>
        <tr>
          <td class="cell-label">
            APIShip (расчёты)
            <div class="text-xs text-tertiary mt-1">за месяц</div>
          </td>
          <td class="text-right">
            <div class="progress-bar-wrapper">
              <div class="progress-bar">
                <div class="progress-bar-fill ${apishipBarClass}" style="width: ${apishipMonthlyPct}%;"></div>
              </div>
              <span class="progress-bar-value">${formatNumber(data.apiship.monthlyCalculatorCalls)} / ${formatNumber(data.apiship.monthlyLimit)}</span>
            </div>
            <div class="text-xs text-tertiary text-right mt-1">сегодня: ${data.apiship.calculatorCalls} расчётов, ${data.apiship.cacheHits} из кэша</div>
          </td>
        </tr>
      </table>
    `;
  } catch (error) {
    console.error('Failed to load service limits:', error);
    body.innerHTML = `<div class="text-center text-tertiary" style="padding: var(--spacing-md);">Не удалось загрузить</div>`;
  }
}

// Event delegation handler
function handleDashboardClick(e) {
  const target = e.target;
  const action = target.dataset.action || target.closest('[data-action]')?.dataset.action;

  if (!action) return;

  switch (action) {
    case 'change-period':
      const period = target.dataset.period || target.closest('[data-period]')?.dataset.period;
      if (period) changePeriod(period);
      break;
    case 'reload-dashboard':
      loadDashboard();
      break;
    case 'refresh-dashboard':
      refreshDashboard();
      break;
  }
}

// Set up event delegation when view is loaded
function setupDashboardEvents() {
  const content = document.getElementById('content');

  // Remove previous handler if exists
  if (content._dashboardClickHandler) {
    content.removeEventListener('click', content._dashboardClickHandler);
  }

  // Store and attach new handler
  content._dashboardClickHandler = handleDashboardClick;
  content.addEventListener('click', handleDashboardClick);
}


// Exports
export {
  loadDashboard as renderDashboard,
  setupDashboardEvents
};
