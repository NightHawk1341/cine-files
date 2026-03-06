/**
 * orders/notion-export.js
 * Bulk export orders to CSV for Notion import with column mapping
 */

import { state } from '../../state.js';
import { showModal, hideModal, showToast, escapeHtml, formatNumber } from '../../utils.js';
import { apiPost } from '../../utils/apiClient.js';

const STORAGE_KEY = 'notion-csv-mapping';

const DELIVERY_TYPE_LABELS = {
  pochta_standard: 'Почта — обычная',
  pochta_first_class: 'Почта — 1-й класс',
  pochta_courier: 'Почта — курьер',
  pochta: 'Почта',
  courier_ems: 'EMS',
  cdek_pvz: 'СДЭК — ПВЗ',
  cdek_pvz_express: 'СДЭК — экспресс',
  cdek_courier: 'СДЭК — курьер',
  international: 'Международная',
  pickup: 'Самовывоз'
};

// Available data fields that can be mapped to Notion columns
const AVAILABLE_FIELDS = [
  { key: 'order_id', label: '№ заказа', getter: (o) => o.id },
  { key: 'status', label: 'Статус', getter: (o) => o.status },
  { key: 'created_at', label: 'Дата заказа', getter: (o) => formatDateForCSV(o.created_at) },
  { key: 'customer_name', label: 'ФИО клиента', getter: (o) => [o.address?.surname, o.address?.name].filter(Boolean).join(' ') },
  { key: 'customer_surname', label: 'Фамилия', getter: (o) => o.address?.surname || '' },
  { key: 'customer_first_name', label: 'Имя', getter: (o) => o.address?.name || '' },
  { key: 'phone', label: 'Телефон', getter: (o) => o.address?.phone || '' },
  { key: 'postal_index', label: 'Индекс', getter: (o) => o.address?.postal_index || '' },
  { key: 'address', label: 'Адрес', getter: (o) => o.address?.address || '' },
  { key: 'comment', label: 'Комментарий к адресу', getter: (o) => o.address?.comment || '' },
  { key: 'items_list', label: 'Товары (список)', getter: (o) => formatItemsList(o) },
  { key: 'items_titles', label: 'Названия товаров', getter: (o) => (o.items || []).map(i => i.title).join(', ') },
  { key: 'items_count', label: 'Кол-во товаров', getter: (o) => (o.items || []).reduce((s, i) => s + i.quantity, 0) },
  { key: 'items_total', label: 'Сумма товаров', getter: (o) => (o.items || []).reduce((s, i) => s + i.price_at_purchase * i.quantity, 0) },
  { key: 'delivery_cost', label: 'Стоимость доставки', getter: (o) => parseFloat(o.delivery_cost) || 0 },
  { key: 'total_price', label: 'Итого (товары)', getter: (o) => parseFloat(o.total_price) || 0 },
  { key: 'total_with_delivery', label: 'Итого с доставкой', getter: (o) => (parseFloat(o.total_price) || 0) + (parseFloat(o.delivery_cost) || 0) },
  { key: 'delivery_type', label: 'Способ доставки', getter: (o) => DELIVERY_TYPE_LABELS[o.delivery_type] || o.delivery_type || '' },
  { key: 'shipment_date', label: 'Дата отправки', getter: (o) => o.shipment_date || '' },
  { key: 'delivery_timeframe', label: 'Сроки доставки', getter: (o) => o.delivery_timeframe || '' },
  { key: 'tracking_number', label: 'Трек-номер', getter: (o) => o.tracking_number || '' },
  { key: 'payment_id', label: 'ID оплаты', getter: (o) => o.payment_id || '' },
  { key: 'discount_amount', label: 'Скидка', getter: (o) => parseFloat(o.discount_amount) || 0 },
  { key: 'promo_code', label: 'Промо-код', getter: (o) => o.promo_code || '' },
  { key: 'delivery_notes', label: 'Заметки по доставке', getter: (o) => o.delivery_notes || '' },
  { key: 'username', label: 'Username', getter: (o) => o.user?.username || '' },
  { key: 'login_method', label: 'Способ входа', getter: (o) => o.user?.login_method || '' },
];

function formatDateForCSV(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatItemsList(order) {
  if (!order.items || order.items.length === 0) return '';
  return order.items.map(item => {
    const parts = [item.title];
    if (item.property) parts.push(item.property);
    if (item.variation_num) parts.push(`вар. ${item.variation_num}`);
    if (item.quantity > 1) parts.push(`×${item.quantity}`);
    return parts.join(' — ');
  }).join('\n');
}

/**
 * Load saved mapping from localStorage
 */
function loadMapping() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) { /* ignore */ }
  return null;
}

/**
 * Save mapping to localStorage
 */
function saveMapping(mapping) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mapping));
  } catch (e) { /* ignore */ }
}

/**
 * Show the column mapping modal
 * @param {Set<number>} selectedIds - Selected order IDs
 * @param {Function} onComplete - Callback after export + mark
 */
export function showNotionExportModal(selectedIds, onComplete) {
  const savedMapping = loadMapping() || [];
  const orderCount = selectedIds.size;
  const word = getOrderWord(orderCount);

  // Build mapping rows
  const mappingRowsHTML = buildMappingRows(savedMapping);

  const modalContent = `
    <div class="notion-export-modal">
      <p class="text-sm text-secondary mb-md">
        Настройте соответствие полей заказа столбцам Notion.
        Укажите название столбца в Notion для каждого поля, которое хотите экспортировать.
        Пустые — будут пропущены.
      </p>

      <div class="notion-mapping-list" id="notion-mapping-list">
        <div class="notion-mapping-header">
          <span>Поле заказа</span>
          <span>Столбец в Notion</span>
        </div>
        ${mappingRowsHTML}
      </div>

      <div class="notion-export-actions">
        <button class="btn btn-secondary btn-sm" data-action="notion-export-clear-mapping">Очистить</button>
        <button class="btn btn-primary" data-action="notion-export-generate" id="notion-export-generate-btn">
          Экспортировать ${orderCount} ${word}
        </button>
      </div>
    </div>
  `;

  showModal('Экспорт в Notion (CSV)', modalContent, []);

  // Attach event listeners
  requestAnimationFrame(() => {
    const modalBody = document.getElementById('modal-body');
    if (!modalBody) return;

    modalBody.addEventListener('click', (e) => {
      const action = e.target.dataset.action || e.target.closest('[data-action]')?.dataset.action;

      if (action === 'notion-export-generate') {
        generateAndDownload(selectedIds, onComplete);
      } else if (action === 'notion-export-clear-mapping') {
        document.querySelectorAll('.notion-mapping-input').forEach(input => {
          input.value = '';
        });
      }
    });
  });
}

function buildMappingRows(savedMapping) {
  const savedMap = {};
  if (savedMapping) {
    savedMapping.forEach(m => { savedMap[m.key] = m.notionColumn; });
  }

  return AVAILABLE_FIELDS.map(field => {
    const savedValue = savedMap[field.key] || '';
    return `
      <div class="notion-mapping-row">
        <label class="notion-mapping-label" title="${escapeHtml(field.key)}">${escapeHtml(field.label)}</label>
        <input type="text" class="form-input notion-mapping-input" data-field-key="${field.key}" value="${escapeHtml(savedValue)}" placeholder="Название столбца в Notion">
      </div>
    `;
  }).join('');
}

/**
 * Collect mapping from inputs, generate CSV, download, mark as processed
 */
async function generateAndDownload(selectedIds, onComplete) {
  // Collect mapping
  const inputs = document.querySelectorAll('.notion-mapping-input');
  const mapping = [];
  inputs.forEach(input => {
    const key = input.dataset.fieldKey;
    const notionColumn = input.value.trim();
    if (notionColumn) {
      mapping.push({ key, notionColumn });
    }
  });

  if (mapping.length === 0) {
    showToast('Заполните хотя бы один столбец', 'error');
    return;
  }

  // Save mapping for next time
  saveMapping(mapping);

  // Get selected orders from state
  const orders = (state.orders || []).filter(o => selectedIds.has(o.id));
  if (orders.length === 0) {
    showToast('Выбранные заказы не найдены', 'error');
    return;
  }

  // Generate CSV
  const csv = generateCSV(orders, mapping);

  // Download
  downloadCSV(csv, `notion-orders-${new Date().toISOString().slice(0, 10)}.csv`);

  // Mark orders as processed
  const btn = document.getElementById('notion-export-generate-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Отмечаем заказы...';
  }

  let markedCount = 0;
  for (const order of orders) {
    if (order.processed) {
      markedCount++;
      continue;
    }
    try {
      await apiPost('/api/orders/toggle-processed', {
        order_id: order.id,
        processed: true
      });
      order.processed = true;
      markedCount++;
    } catch (err) {
      console.error(`Failed to mark order ${order.id} as processed:`, err);
    }
  }

  hideModal();
  showToast(`CSV скачан, ${markedCount} из ${orders.length} заказов отмечены`, 'success');

  if (onComplete) onComplete();
}

/**
 * Generate CSV string from orders and mapping
 */
function generateCSV(orders, mapping) {
  const fieldMap = {};
  AVAILABLE_FIELDS.forEach(f => { fieldMap[f.key] = f; });

  // Header row
  const headers = mapping.map(m => csvEscape(m.notionColumn));

  // Data rows
  const rows = orders.map(order => {
    return mapping.map(m => {
      const field = fieldMap[m.key];
      if (!field) return '';
      const value = field.getter(order);
      return csvEscape(String(value ?? ''));
    });
  });

  // BOM for Excel/Notion UTF-8 support
  return '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

function csvEscape(value) {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

function downloadCSV(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function getOrderWord(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return 'заказов';
  if (mod10 === 1) return 'заказ';
  if (mod10 >= 2 && mod10 <= 4) return 'заказа';
  return 'заказов';
}
