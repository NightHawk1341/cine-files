/**
 * Delivery estimates tracking sub-module
 */

import { apiGet, apiDelete } from '../../utils/apiClient.js';
import { showToast } from '../../utils.js';
import {
  estimatesData, setEstimatesData,
  estimatesStats, setEstimatesStats,
  estimatesCityAverages, setEstimatesCityAverages,
  estimatesPagination, setEstimatesPagination,
  setEstimatesLoaded,
  estimatesProviderFilter,
  estimatesSearchQuery
} from './state.js';

export function renderEstimatesSubtab() {
  return `
    <!-- Delivery Estimates Section -->
    <div class="card" id="estimates-section">
      <div class="card-header">
        <h3 class="card-title" style="display: flex; align-items: center; gap: var(--spacing-sm);">
          <span class="icon-wrapper" style="width: 20px; height: 20px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
            </svg>
          </span>
          История расчётов доставки
        </h3>
        <button class="btn btn-secondary btn-sm" data-action="refresh-estimates" title="Обновить">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 4v6h-6M1 20v-6h6"/>
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
          </svg>
        </button>
      </div>
      <div class="card-body" id="estimates-section-content">
        <!-- Filters -->
        <div style="display: flex; flex-wrap: wrap; gap: var(--spacing-sm); margin-bottom: var(--spacing-md); align-items: center;">
          <input
            type="text"
            id="estimates-search-input"
            class="form-input"
            placeholder="Поиск по городу..."
            value="${estimatesSearchQuery}"
            style="flex: 1; min-width: 150px; max-width: 300px;"
          />
          <div style="display: flex; gap: 4px;">
            <button class="btn btn-sm ${estimatesProviderFilter === '' ? 'btn-primary' : 'btn-secondary'}" data-action="estimates-filter-provider" data-provider="">Все</button>
            <button class="btn btn-sm ${estimatesProviderFilter === 'cdek' ? 'btn-primary' : 'btn-secondary'}" data-action="estimates-filter-provider" data-provider="cdek">СДЭК</button>
            <button class="btn btn-sm ${estimatesProviderFilter === 'pochta' ? 'btn-primary' : 'btn-secondary'}" data-action="estimates-filter-provider" data-provider="pochta">Почта</button>
          </div>
        </div>
        <div id="estimates-container">
          <div class="loading-spinner" style="padding: var(--spacing-md);">
            <div class="spinner"></div>
            <p>Загрузка данных...</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function renderEstimatesContent() {
  const container = document.getElementById('estimates-container');
  if (!container) return;

  if (!estimatesData || estimatesData.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: var(--spacing-lg); text-align: center;">
        <p style="color: var(--text-tertiary); margin-bottom: var(--spacing-md);">Нет данных о расчётах доставки</p>
        <p style="font-size: 0.813rem; color: var(--text-tertiary);">
          Данные появятся после расчёта стоимости доставки через API или вручную
        </p>
      </div>
    `;
    return;
  }

  const statsHtml = estimatesStats ? `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: var(--spacing-sm); margin-bottom: var(--spacing-md);">
      <div style="padding: var(--spacing-sm); background: var(--bg-tertiary); border-radius: var(--radius-sm); text-align: center;">
        <div style="font-size: 1.25rem; font-weight: 600; color: var(--text-primary);">${estimatesStats.total_estimates || 0}</div>
        <div style="font-size: 0.75rem; color: var(--text-tertiary);">Всего</div>
      </div>
      <div style="padding: var(--spacing-sm); background: var(--bg-tertiary); border-radius: var(--radius-sm); text-align: center;">
        <div style="font-size: 1.25rem; font-weight: 600; color: var(--success);">${estimatesStats.api_estimates || 0}</div>
        <div style="font-size: 0.75rem; color: var(--text-tertiary);">API</div>
      </div>
      <div style="padding: var(--spacing-sm); background: var(--bg-tertiary); border-radius: var(--radius-sm); text-align: center;">
        <div style="font-size: 1.25rem; font-weight: 600; color: var(--warning);">${estimatesStats.manual_estimates || 0}</div>
        <div style="font-size: 0.75rem; color: var(--text-tertiary);">Вручную</div>
      </div>
      <div style="padding: var(--spacing-sm); background: var(--bg-tertiary); border-radius: var(--radius-sm); text-align: center;">
        <div style="font-size: 1.25rem; font-weight: 600; color: var(--text-primary);">${estimatesStats.avg_price || 0}₽</div>
        <div style="font-size: 0.75rem; color: var(--text-tertiary);">Средняя</div>
      </div>
      <div style="padding: var(--spacing-sm); background: var(--bg-tertiary); border-radius: var(--radius-sm); text-align: center;">
        <div style="font-size: 1.25rem; font-weight: 600; color: var(--text-primary);">${estimatesStats.unique_cities || estimatesStats.unique_regions || 0}</div>
        <div style="font-size: 0.75rem; color: var(--text-tertiary);">Городов</div>
      </div>
    </div>
  ` : '';

  // City averages section (collapsible)
  const cityAvgHtml = estimatesCityAverages && estimatesCityAverages.length > 0 ? `
    <details style="margin-bottom: var(--spacing-md);">
      <summary style="cursor: pointer; font-size: 0.813rem; font-weight: 500; color: var(--text-secondary); padding: var(--spacing-xs) 0;">
        Средние цены по городам (${estimatesCityAverages.length})
      </summary>
      <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: var(--spacing-sm);">
        ${estimatesCityAverages.map(ca => {
          // Color-code based on data volume: green (5+), yellow (2-4), red (1)
          let bgColor, textColor, opacity;
          if (ca.estimate_count >= 5) {
            bgColor = 'var(--success-bg, rgba(76, 175, 80, 0.1))';
            textColor = 'var(--success, #4CAF50)';
            opacity = '1';
          } else if (ca.estimate_count >= 2) {
            bgColor = 'rgba(255, 193, 7, 0.12)';
            textColor = 'var(--warning, #FF9800)';
            opacity = '0.9';
          } else {
            bgColor = 'rgba(158, 158, 158, 0.1)';
            textColor = 'var(--text-tertiary)';
            opacity = '0.7';
          }
          const daysStr = ca.avg_days_min && ca.avg_days_max
            ? (ca.avg_days_min === ca.avg_days_max ? `, ~${ca.avg_days_min}дн` : `, ~${ca.avg_days_min}-${ca.avg_days_max}дн`)
            : '';
          return `<span style="display: inline-flex; align-items: center; gap: 3px; font-size: 0.7rem; padding: 3px 8px; border-radius: var(--radius-sm); background: ${bgColor}; color: ${textColor}; opacity: ${opacity}; white-space: nowrap;" title="${ca.city_display}: ~${ca.avg_price}₽${daysStr}, ${ca.estimate_count} расчётов">
            ${ca.city_display} <b>${ca.avg_price}₽</b>${daysStr} <span style="opacity: 0.6;">(${ca.estimate_count})</span>
          </span>`;
        }).join('')}
      </div>
    </details>
  ` : '';

  const tableHtml = `
    <div style="overflow-x: auto;">
      <table style="width: 100%; border-collapse: collapse; font-size: 0.813rem;">
        <thead>
          <tr style="background: var(--bg-tertiary); text-align: left;">
            <th style="padding: var(--spacing-sm); border-bottom: 1px solid var(--border-color);">Город</th>
            <th style="padding: var(--spacing-sm); border-bottom: 1px solid var(--border-color);">Тариф</th>
            <th style="padding: var(--spacing-sm); border-bottom: 1px solid var(--border-color);">Вес</th>
            <th style="padding: var(--spacing-sm); border-bottom: 1px solid var(--border-color);">Цена</th>
            <th style="padding: var(--spacing-sm); border-bottom: 1px solid var(--border-color);">Сроки</th>
            <th style="padding: var(--spacing-sm); border-bottom: 1px solid var(--border-color);">Источник</th>
            <th style="padding: var(--spacing-sm); border-bottom: 1px solid var(--border-color); width: 32px;"></th>
          </tr>
        </thead>
        <tbody>
          ${estimatesData.map(est => {
            // Find city average for this estimate
            const cityKey = est.city || est.postal_prefix;
            const cityAvg = estimatesCityAverages.find(ca => ca.city_key === cityKey);
            const avgBadge = cityAvg ? `<span style="font-size: 0.65rem; color: var(--text-tertiary); margin-left: 4px;" title="Средняя цена для города">~${cityAvg.avg_price}₽</span>` : '';
            const providerBadgeColor = est.provider === 'cdek' ? 'rgba(0, 150, 57, 0.12)' : 'rgba(0, 92, 185, 0.12)';
            const providerTextColor = est.provider === 'cdek' ? '#009639' : '#005CB9';

            return `
            <tr style="border-bottom: 1px solid var(--border-color);">
              <td style="padding: var(--spacing-sm);">
                <div style="font-weight: 500;">${est.city_display || est.postal_code}</div>
                ${est.city_display ? `<div style="font-size: 0.7rem; color: var(--text-tertiary);">${est.postal_code}</div>` : ''}
                ${avgBadge}
              </td>
              <td style="padding: var(--spacing-sm);">
                <span style="background: ${providerBadgeColor}; color: ${providerTextColor}; padding: 2px 6px; border-radius: var(--radius-sm); font-size: 0.7rem; font-weight: 500;">
                  ${est.tariff_name || est.delivery_type || 'Неизвестный'}
                </span>
              </td>
              <td style="padding: var(--spacing-sm);">${est.weight_grams}г</td>
              <td style="padding: var(--spacing-sm); font-weight: 500;">${est.total_price}₽</td>
              <td style="padding: var(--spacing-sm); font-size: 0.75rem; color: var(--text-secondary);">
                ${est.delivery_time || '—'}
              </td>
              <td style="padding: var(--spacing-sm);">
                <span style="display: inline-flex; align-items: center; gap: 4px; font-size: 0.75rem; padding: 2px 6px; border-radius: var(--radius-sm); background: ${est.source === 'api' ? 'var(--success-bg)' : 'var(--warning-bg)'}; color: ${est.source === 'api' ? 'var(--success)' : 'var(--warning)'};">
                  ${est.source === 'api' ? 'API' : 'Вручную'}
                </span>
                ${est.order_id ? `<div style="font-size: 0.7rem; color: var(--text-tertiary);">Заказ #${est.order_id}</div>` : ''}
              </td>
              <td style="padding: var(--spacing-sm); text-align: center;">
                <button class="btn btn-danger btn-xs" data-action="delete-estimate" data-estimate-id="${est.id}" title="Удалить оценку" style="padding: 2px 6px; line-height: 1;">×</button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;

  const paginationHtml = estimatesPagination.totalPages > 1 ? `
    <div style="display: flex; justify-content: center; align-items: center; gap: var(--spacing-sm); margin-top: var(--spacing-md);">
      <button class="btn btn-secondary btn-sm" data-action="estimates-prev-page" ${estimatesPagination.page <= 1 ? 'disabled' : ''}>←</button>
      <span style="font-size: 0.813rem; color: var(--text-secondary);">
        ${estimatesPagination.page} / ${estimatesPagination.totalPages}
      </span>
      <button class="btn btn-secondary btn-sm" data-action="estimates-next-page" ${estimatesPagination.page >= estimatesPagination.totalPages ? 'disabled' : ''}>→</button>
    </div>
  ` : '';

  container.innerHTML = statsHtml + cityAvgHtml + tableHtml + paginationHtml;
}

export async function deleteEstimate(id) {
  try {
    const response = await apiDelete(`/api/admin/estimates?id=${id}`);
    if (!response.ok) throw new Error('Failed to delete');
    // Remove from local cache and re-render without reloading from server
    setEstimatesData(estimatesData.filter(e => e.id !== id));
    if (estimatesStats) setEstimatesStats({ ...estimatesStats, total_estimates: Math.max(0, (estimatesStats.total_estimates || 1) - 1) });
    renderEstimatesContent();
    showToast('Оценка удалена', 'success');
  } catch (err) {
    console.error('Error deleting estimate:', err);
    showToast('Ошибка удаления', 'error');
  }
}

export async function loadEstimates(page = 1) {
  const container = document.getElementById('estimates-container');
  if (!container) return;

  container.innerHTML = `
    <div class="loading-spinner" style="padding: var(--spacing-md);">
      <div class="spinner"></div>
      <p>Загрузка данных...</p>
    </div>
  `;

  try {
    let url = `/api/admin/estimates?page=${page}&limit=50`;
    if (estimatesProviderFilter) {
      url += `&provider=${estimatesProviderFilter}`;
    }
    if (estimatesSearchQuery) {
      url += `&search=${encodeURIComponent(estimatesSearchQuery)}`;
    }
    const response = await apiGet(url);
    if (response.ok) {
      const result = await response.json();
      setEstimatesData(result.estimates || []);
      setEstimatesStats(result.stats || null);
      setEstimatesCityAverages(result.cityAverages || []);
      setEstimatesPagination(result.pagination || { page: 1, limit: 50, total: 0, totalPages: 0 });
      setEstimatesLoaded(true);
      renderEstimatesContent();
    } else {
      throw new Error('Failed to load estimates');
    }
  } catch (err) {
    console.error('Error loading estimates:', err);
    container.innerHTML = `
      <div class="empty-state" style="padding: var(--spacing-md);">
        <p style="color: var(--error);">Ошибка загрузки данных</p>
        <button class="btn btn-primary btn-sm" data-action="refresh-estimates" style="margin-top: var(--spacing-sm);">Повторить</button>
      </div>
    `;
  }
}
