// ============================================================
// ORDER STATUS TIMELINE
// Shows chronological history of status changes
// ============================================================

import { getAccessToken } from '../../core/auth.js';
import { STATUS_NAMES, getMigratedStatus, formatDate } from './constants.js';

/**
 * Status order for the standard flow.
 * Used to build the expected progression and detect non-linear transitions.
 */
const STATUS_FLOW = [
  'awaiting_calculation', 'awaiting_payment', 'paid', 'shipped', 'delivered'
];

/**
 * CSS color tokens per status (matches order.css badge colors)
 */
const STATUS_TIMELINE_COLORS = {
  awaiting_calculation: '#ffc107',
  awaiting_payment: '#ff9800',
  paid: '#81c784',
  awaiting_certificate: '#64b5f6',
  shipped: '#2196f3',
  delivered: '#4caf50',
  on_hold: '#9e9e9e',
  refund_requested: '#ce93d8',
  refunded: '#9c27b0',
  cancelled: '#f44336',
  // Legacy
  created: '#ffc107',
  confirmed: '#64b5f6',
};

/**
 * Fetch status history from API
 */
async function fetchStatusHistory(orderId) {
  try {
    const token = getAccessToken();
    const response = await fetch(`/api/orders/status-history?order_id=${orderId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) return [];
    const data = await response.json();
    return data.history || [];
  } catch {
    return [];
  }
}

/**
 * Build timeline entries from history + current order state.
 * If no history exists (table not yet created), falls back to
 * showing just the creation date and the current status.
 */
function buildTimelineEntries(order, history) {
  if (history.length > 0) {
    return history.map(entry => ({
      status: getMigratedStatus(entry.new_status),
      date: entry.changed_at,
    }));
  }

  // Fallback: no history table yet — show creation + current
  const entries = [{ status: getMigratedStatus('created'), date: order.created_at }];
  const current = getMigratedStatus(order.status);
  if (current !== 'awaiting_calculation' && current !== 'awaiting_payment') {
    entries.push({ status: current, date: order.updated_at });
  }
  return entries;
}

/**
 * Render the status timeline section and insert it into the DOM.
 */
export async function renderStatusTimeline(order, containerEl) {
  if (!containerEl) return;

  const history = await fetchStatusHistory(order.id);
  const entries = buildTimelineEntries(order, history);

  if (entries.length === 0) return;

  const currentStatus = getMigratedStatus(order.status);

  const timelineHTML = entries.map((entry, idx) => {
    const isLast = idx === entries.length - 1;
    const color = STATUS_TIMELINE_COLORS[entry.status] || '#9e9e9e';
    const label = STATUS_NAMES[entry.status] || entry.status;
    const dateStr = formatDate(entry.date);

    return `
      <div class="status-timeline-item${isLast ? ' current' : ''}">
        <div class="status-timeline-marker" style="--marker-color: ${color};">
          <span class="status-timeline-dot"></span>
          ${!isLast ? '<span class="status-timeline-line"></span>' : ''}
        </div>
        <div class="status-timeline-content">
          <span class="status-timeline-label" style="color: ${color};">${label}</span>
          <span class="status-timeline-date">${dateStr}</span>
        </div>
      </div>
    `;
  }).join('');

  const section = document.createElement('div');
  section.className = 'status-timeline-section';
  section.innerHTML = `
    <h3 class="status-timeline-title">История статусов</h3>
    <div class="status-timeline">${timelineHTML}</div>
  `;

  // Insert after the order info section
  containerEl.after(section);
}
