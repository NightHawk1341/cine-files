// ============================================================
// ORDER PAGE - Tracking Section
// Displays tracking number, history timeline, and storage info
// ============================================================

import { detectTrackingProvider, getTrackingUrlForProvider } from './constants.js';
import { getAccessToken } from '../../core/auth.js';

/**
 * Format a date string for tracking display (short form)
 */
function formatTrackingDate(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Render tracking history timeline from stored data
 */
function renderTrackingHistory(history) {
  if (!history || history.length === 0) return '';

  const items = history.slice(0, 8).map((entry, i) => {
    const isCurrent = i === 0;
    const date = formatTrackingDate(entry.date);
    const location = entry.location || entry.city || '';

    return `
      <div class="tracking-timeline-item${isCurrent ? ' current' : ''}">
        <div class="tracking-timeline-marker">
          <div class="tracking-timeline-dot"></div>
          ${i < history.length - 1 && i < 7 ? '<div class="tracking-timeline-line"></div>' : ''}
        </div>
        <div class="tracking-timeline-content">
          <div class="tracking-timeline-status">${entry.status || ''}</div>
          <div class="tracking-timeline-meta">
            ${date ? `<span>${date}</span>` : ''}
            ${location ? `<span>${location}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="tracking-history">
      <div class="tracking-history-title">История отслеживания</div>
      <div class="tracking-timeline">${items}</div>
    </div>
  `;
}

/**
 * Render storage/pickup info section
 */
function renderStorageInfo(order) {
  const parts = [];

  if (order.arrived_at_point_at) {
    const arrivedDate = new Date(order.arrived_at_point_at).toLocaleDateString('ru-RU', {
      day: 'numeric', month: 'long'
    });
    parts.push(`<div class="tracking-storage-row"><span>Прибыл в пункт выдачи:</span><span>${arrivedDate}</span></div>`);
  }

  if (order.storage_deadline) {
    const deadline = new Date(order.storage_deadline);
    const now = new Date();
    const daysLeft = Math.max(0, Math.ceil((deadline - now) / (24 * 60 * 60 * 1000)));
    const deadlineStr = deadline.toLocaleDateString('ru-RU', {
      day: 'numeric', month: 'long'
    });

    const urgencyClass = daysLeft <= 2 ? 'urgent' : daysLeft <= 5 ? 'warning' : '';
    parts.push(`<div class="tracking-storage-row"><span>Хранится до:</span><span class="tracking-deadline ${urgencyClass}">${deadlineStr} (${daysLeft} дн.)</span></div>`);
  }

  if (order.returned_to_sender_at) {
    parts.push(`<div class="tracking-storage-row tracking-returned"><span>Возвращён отправителю</span></div>`);
  }

  if (parts.length === 0) return '';

  return `<div class="tracking-storage-info">${parts.join('')}</div>`;
}

/**
 * Fetch live tracking data from the API
 */
async function fetchTrackingData(orderId) {
  try {
    const token = getAccessToken();
    if (!token) return null;

    const response = await fetch(`/api/orders/tracking?order_id=${orderId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) return null;
    const data = await response.json();
    return data.data || data;
  } catch (err) {
    console.error('Failed to fetch tracking:', err);
    return null;
  }
}

/**
 * Render tracking section for shipped/delivered orders.
 * Shows tracking number, copy button, link to carrier website,
 * tracking history timeline, and storage/pickup info.
 */
export function renderTrackingSection(order, orderInfoEl) {
  const trackingStatuses = ['shipped', 'parcel_ready', 'delivered'];
  if (!trackingStatuses.includes(order.status) && !order.tracking_number) {
    return;
  }

  let trackingSectionEl = document.getElementById('order-tracking-section');
  if (!trackingSectionEl) {
    trackingSectionEl = document.createElement('div');
    trackingSectionEl.id = 'order-tracking-section';
    trackingSectionEl.className = 'order-section';
    const orderInfoSection = orderInfoEl?.closest('.order-section');
    if (orderInfoSection) {
      orderInfoSection.after(trackingSectionEl);
    }
  }

  if (!order.tracking_number) {
    trackingSectionEl.innerHTML = `
      <h2>Отслеживание посылки</h2>
      <div class="order-info">
        <p style="color: var(--text-tertiary); text-align: center; padding: 16px;">
          Трек-номер пока не добавлен. Вы получите уведомление, когда посылка будет отправлена.
        </p>
      </div>
    `;
    return;
  }

  const trackingProvider = detectTrackingProvider(order.delivery_type, order.tracking_number);
  const trackingUrl = getTrackingUrlForProvider(trackingProvider, order.tracking_number);
  const providerName = trackingProvider === 'cdek' ? 'СДЭК' : trackingProvider === 'pochta' ? 'Почта России' : '';

  // Build tracking status line from stored data
  const currentStatus = order.last_tracking_status || '';
  const lastUpdate = order.last_tracking_update
    ? formatTrackingDate(order.last_tracking_update)
    : '';

  // Build history from stored tracking_history
  const history = order.tracking_history || [];
  const historyHtml = renderTrackingHistory(history);

  // Storage/pickup info
  const storageHtml = renderStorageInfo(order);

  trackingSectionEl.innerHTML = `
    <h2>Отслеживание посылки</h2>
    <div class="order-info">
      <div class="order-info-row order-tracking-row">
        <span class="order-info-label">Трек-номер:</span>
        <span class="order-info-value order-tracking-number">
          ${order.tracking_number}
          <button id="copy-tracking" class="tracking-copy-btn" title="Копировать">Копировать</button>
        </span>
      </div>

      ${providerName ? `
        <div class="order-info-row">
          <span class="order-info-label">Служба доставки:</span>
          <span class="order-info-value">${providerName}</span>
        </div>
      ` : ''}

      ${currentStatus ? `
        <div class="order-info-row">
          <span class="order-info-label">Текущий статус:</span>
          <span class="order-info-value">${currentStatus}${lastUpdate ? ` <span class="tracking-update-time">(${lastUpdate})</span>` : ''}</span>
        </div>
      ` : ''}

      ${trackingUrl ? `
        <div style="padding: 12px 16px;">
          <a href="${trackingUrl}" target="_blank" rel="noopener noreferrer" class="tracking-external-link">
            Отследить на сайте ${providerName || 'перевозчика'} ↗
          </a>
        </div>
      ` : ''}
    </div>

    ${storageHtml}
    ${historyHtml}

    <button id="refresh-tracking" class="tracking-refresh-btn">Обновить статус</button>
  `;

  // Copy button handler
  const copyBtn = document.getElementById('copy-tracking');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(order.tracking_number);
        copyBtn.textContent = 'Скопировано';
        setTimeout(() => { copyBtn.textContent = 'Копировать'; }, 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    });
  }

  // Refresh tracking button handler
  const refreshBtn = document.getElementById('refresh-tracking');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      refreshBtn.textContent = 'Обновление...';

      const data = await fetchTrackingData(order.id);
      if (data && data.has_tracking) {
        // Update order object with fresh data and re-render
        order.last_tracking_status = data.current_status;
        order.last_tracking_update = data.last_updated;
        order.tracking_history = data.history || [];
        order.arrived_at_point_at = data.arrived_at_point_at;
        order.storage_deadline = data.storage_deadline;
        order.returned_to_sender_at = data.returned_to_sender_at;
        renderTrackingSection(order, orderInfoEl);
      } else {
        refreshBtn.textContent = 'Нет обновлений';
        setTimeout(() => {
          refreshBtn.disabled = false;
          refreshBtn.textContent = 'Обновить статус';
        }, 3000);
      }
    });
  }
}
