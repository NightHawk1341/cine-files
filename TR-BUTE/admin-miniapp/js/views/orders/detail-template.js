/**
 * orders/detail-template.js
 * HTML template builders for the order detail modal.
 * Pure rendering functions — no side effects, no direct API calls.
 */

import { escapeHtml, formatDate, formatNumber, getAllStatusOptions, addImageSize, PAYMENT_PROVIDER_LABEL } from '../../utils.js';

const LOGIN_METHOD_LABELS = {
  telegram: { label: 'Telegram', icon: '✈️' },
  yandex:   { label: 'Яндекс',   icon: '📧' },
  vk:       { label: 'ВКонтакте', icon: '💬' }
};

const NOTIFICATION_CHANNEL_LABELS = {
  telegram: 'в Telegram',
  yandex:   'на email',
  vk:       'во ВКонтакте'
};

export function getLoginMethodBadge(loginMethod) {
  const info = LOGIN_METHOD_LABELS[loginMethod];
  if (!info) return '';
  return `<span class="login-method-badge">${info.icon} ${info.label}</span>`;
}

export function getNotificationChannelLabel(loginMethod) {
  return NOTIFICATION_CHANNEL_LABELS[loginMethod] || 'в Telegram';
}

// Delivery types where the destination is a pickup point, not a home address
const PVZ_DELIVERY_TYPES = new Set(['cdek_pvz']);
// Delivery types where postal index is relevant (Pochta-family + EMS)
const POCHTA_DELIVERY_TYPES = new Set(['pochta', 'pochta_standard', 'pochta_first_class', 'pochta_courier', 'courier_ems']);

export function buildAddressHTML(order, surname, name, phone, postalIndex, address, comment, pvzCode, pvzAddress, deliveryType) {
  if (!order.address) return '<p>Нет адреса</p>';

  const dt = deliveryType || order.delivery_type || '';
  const isPvz = PVZ_DELIVERY_TYPES.has(dt);
  const isPochta = POCHTA_DELIVERY_TYPES.has(dt);
  const isCdekCourier = dt === 'cdek_courier';

  const copyIconSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  </svg>`;

  // Label shown when a field is visible to the user on the order page
  const visibleBadge = '<span class="user-visible-hint" title="Видно пользователю в заказе">ℹ</span>';

  // Determine labels and visibility based on delivery type
  const indexLabel = isPvz ? 'Индекс (домашний)' : 'Индекс';
  const indexVisible = isPochta; // index shown to user only for Pochta/EMS
  const addressLabel = isPvz ? 'Адрес (домашний, не ПВЗ)' : 'Адрес';
  const addressVisible = !isPvz; // home address shown to user for non-PVZ

  // pvz_address label depends on delivery type
  const pvzAddressLabel = isPochta ? 'Адрес отделения' : isCdekCourier ? 'Адрес ПВЗ (доп.)' : 'Адрес ПВЗ';
  const pvzCodeLabel = isPochta ? 'Код отделения' : isCdekCourier ? 'Номер ПВЗ (доп.)' : 'Номер ПВЗ';
  const pvzVisible = isPvz; // PVZ address shown to user only for PVZ delivery

  return `
    <div class="info-box">
      <div class="mb-sm address-field-group">
        <label class="address-subtle-label">Фамилия Имя ${visibleBadge}</label>
        <div class="flex gap-xs">
          <div class="input-with-icon-wrapper flex-1">
            <input type="text" id="address-surname-${order.id}" value="${escapeHtml(surname)}" class="form-input address-subtle-input input-with-copy" data-field-name="address-surname-${order.id}" placeholder="Фамилия">
            <button class="input-icon-btn" data-action="copy-field" data-copy-text="${escapeHtml(surname)}" title="Копировать">${copyIconSVG}</button>
          </div>
          <div class="input-with-icon-wrapper flex-1">
            <input type="text" id="address-name-${order.id}" value="${escapeHtml(name)}" class="form-input address-subtle-input input-with-copy" data-field-name="address-name-${order.id}" placeholder="Имя">
            <button class="input-icon-btn" data-action="copy-field" data-copy-text="${escapeHtml(name)}" title="Копировать">${copyIconSVG}</button>
          </div>
        </div>
      </div>
      <div class="mb-xs address-field-group">
        <label class="address-subtle-label">Телефон ${visibleBadge}</label>
        <div class="input-with-icon-wrapper">
          <input type="text" id="address-phone-${order.id}" value="${escapeHtml(phone)}" class="form-input address-subtle-input input-with-copy" data-field-name="address-phone-${order.id}" placeholder="+7 (999) 123-45-67">
          <button class="input-icon-btn" data-action="copy-field" data-copy-text="${escapeHtml(phone)}" title="Копировать">${copyIconSVG}</button>
        </div>
      </div>
      ${isPvz ? `
      <div class="mb-xs address-field-group">
        <label class="address-subtle-label">${escapeHtml(pvzCodeLabel)} ${visibleBadge}</label>
        <div class="input-with-icon-wrapper">
          <input type="text" id="address-pvz-code-${order.id}" value="${escapeHtml(pvzCode)}" class="form-input address-subtle-input input-with-copy" data-field-name="address-pvz-code-${order.id}" placeholder="Номер ПВЗ">
          <button class="input-icon-btn" data-action="copy-field" data-copy-text="${escapeHtml(pvzCode)}" title="Копировать">${copyIconSVG}</button>
        </div>
      </div>
      <div class="mb-xs address-field-group">
        <label class="address-subtle-label">${escapeHtml(pvzAddressLabel)} ${visibleBadge}</label>
        <div class="input-with-icon-wrapper">
          <textarea id="address-pvz-address-${order.id}" class="form-textarea address-subtle-input input-with-copy" data-field-name="address-pvz-address-${order.id}" rows="2" placeholder="Адрес пункта выдачи">${escapeHtml(pvzAddress)}</textarea>
          <button class="input-icon-btn" data-action="copy-field" data-copy-text="${escapeHtml(pvzAddress)}" title="Копировать">${copyIconSVG}</button>
        </div>
      </div>
      ` : ''}
      <div class="mb-xs address-field-group">
        <label class="address-subtle-label">${escapeHtml(indexLabel)}${indexVisible ? ` ${visibleBadge}` : ''}</label>
        <div class="input-with-icon-wrapper">
          <input type="text" id="address-postal-index-${order.id}" value="${escapeHtml(postalIndex)}" class="form-input address-subtle-input input-with-copy${isPvz ? ' text-tertiary' : ''}" data-field-name="address-postal-index-${order.id}" placeholder="123456">
          <button class="input-icon-btn" data-action="copy-field" data-copy-text="${escapeHtml(postalIndex)}" title="Копировать">${copyIconSVG}</button>
        </div>
      </div>
      <div class="mb-xs address-field-group">
        <label class="address-subtle-label">${escapeHtml(addressLabel)}${addressVisible ? ` ${visibleBadge}` : ''}</label>
        <div class="input-with-icon-wrapper">
          <textarea id="address-address-${order.id}" class="form-textarea address-subtle-input input-with-copy${isPvz ? ' text-tertiary' : ''}" data-field-name="address-address-${order.id}" rows="2" placeholder="Город, улица, дом, квартира">${escapeHtml(address)}</textarea>
          <button class="input-icon-btn" data-action="copy-field" data-copy-text="${escapeHtml(address)}" title="Копировать">${copyIconSVG}</button>
        </div>
      </div>
      ${!isPvz && (pvzCode || pvzAddress || isPochta || isCdekCourier) ? `
      <div class="mb-xs address-field-group">
        <label class="address-subtle-label">${escapeHtml(pvzCodeLabel)}</label>
        <div class="input-with-icon-wrapper">
          <input type="text" id="address-pvz-code-${order.id}" value="${escapeHtml(pvzCode)}" class="form-input address-subtle-input input-with-copy" data-field-name="address-pvz-code-${order.id}" placeholder="${isPochta ? 'Код отделения' : 'Номер ПВЗ'}">
          <button class="input-icon-btn" data-action="copy-field" data-copy-text="${escapeHtml(pvzCode)}" title="Копировать">${copyIconSVG}</button>
        </div>
      </div>
      <div class="mb-xs address-field-group">
        <label class="address-subtle-label">${escapeHtml(pvzAddressLabel)}</label>
        <div class="input-with-icon-wrapper">
          <textarea id="address-pvz-address-${order.id}" class="form-textarea address-subtle-input input-with-copy" data-field-name="address-pvz-address-${order.id}" rows="2" placeholder="${isPochta ? 'Адрес отделения Почты' : 'Адрес ПВЗ'}">${escapeHtml(pvzAddress)}</textarea>
          <button class="input-icon-btn" data-action="copy-field" data-copy-text="${escapeHtml(pvzAddress)}" title="Копировать">${copyIconSVG}</button>
        </div>
      </div>
      ` : ''}
      ${order.address.comment !== null ? `
      <div class="address-field-group">
        <label class="address-subtle-label">Комментарий ${visibleBadge}</label>
        <div class="input-with-icon-wrapper">
          <textarea id="address-comment-${order.id}" class="form-textarea address-subtle-input text-italic input-with-copy" data-field-name="address-comment-${order.id}" rows="2" placeholder="Комментарий к доставке">${escapeHtml(comment)}</textarea>
          <button class="input-icon-btn" data-action="copy-field" data-copy-text="${escapeHtml(comment)}" title="Копировать">${copyIconSVG}</button>
        </div>
      </div>
      ` : ''}
    </div>
  `;
}

export function buildModalContent(order, orderId, itemsHTML, addressHTML, addProductSearchHTML,
  deliveryType, deliveryProvider, deliverySubtype, deliveryCost, shipmentDate, deliveryTimeframe, deliveryNotes,
  hasCustomProducts, customProductItems, calculatedTotalPrice, manager, allItems) {

  const CURRENT_STATUSES = ['created', 'awaiting_payment', 'paid', 'confirmed', 'shipped', 'delivered', 'on_hold', 'refund_requested', 'refunded', 'cancelled'];
  const statusOptions = (() => {
    let options = '';
    if (!CURRENT_STATUSES.includes(order.status)) {
      options += `<option value="${order.status}" selected disabled>${escapeHtml(order.status)} (устар.)</option>`;
    }
    options += getAllStatusOptions().map(opt =>
      `<option value="${opt.value}" ${order.status === opt.value ? 'selected' : ''}>${opt.label}</option>`
    ).join('');
    return options;
  })();

  const userName = order.address?.surname && order.address?.name
    ? `${order.address.surname} ${order.address.name}`
    : order.user?.first_name
    ? `${order.user.first_name} ${order.user.last_name || ''}`.trim()
    : order.user?.username || 'Пользователь';
  const userPhoto = order.user?.photo_url;
  const userInitial = (userName[0] || '?').toUpperCase();

  return `
    <div class="modal-two-column">
      <div class="modal-column-left">
        <div class="mb-lg">
          <div class="flex-between mb-md">
            <div class="flex-align-center gap-sm">
              ${userPhoto ? `
                <img src="${userPhoto}" alt="${escapeHtml(userName)}" class="user-avatar user-avatar--md" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
                <div class="user-avatar-initials user-avatar-initials--md" style="display:none;">${userInitial}</div>
              ` : `
                <div class="user-avatar-initials user-avatar-initials--md">${userInitial}</div>
              `}
              <div>
                <h4 class="mb-0">Заказ #${order.id}</h4>
                <div class="text-sm text-secondary">${escapeHtml(userName)}${getLoginMethodBadge(order.user?.login_method)}</div>
              </div>
              ${order.edited ? '<span class="edited-badge">изменен</span>' : ''}
            </div>
            <span class="text-sm text-secondary">${formatDate(order.created_at)}</span>
          </div>
          ${order.tracking_number ? `<div class="info-box-tertiary mb-md"><strong>Трек-номер:</strong> ${order.tracking_number}</div>` : ''}
        </div>

        <h4 class="mb-md">Товары</h4>
        ${itemsHTML}
        ${addProductSearchHTML}

        <h4 class="section-header">
          Адрес доставки
          ${order.address_edited ? '<span class="edited-badge ml-sm">Изменен</span>' : ''}
        </h4>
        ${addressHTML}
      </div>

      <div class="modal-column-right">
        <h4 class="section-header">Статус заказа</h4>
        <div class="info-box">
          <div class="flex-between mb-md">
            <label class="form-label-block mb-0">Статус</label>
            <label class="notion-checkbox-label">
              <input type="checkbox" id="notion-processed-${order.id}" ${manager.getFieldValue(`notion-processed-${order.id}`, order.processed) ? 'checked' : ''} data-field-name="notion-processed-${order.id}">
              <span>Notion</span>
            </label>
          </div>
          <select id="order-status-${order.id}" class="form-input w-full" data-field-name="order-status-${order.id}">
            ${statusOptions}
          </select>
        </div>

        <h4 class="section-header">Управление доставкой <span class="user-visible-hint" title="Поля со значком ℹ видны пользователю в заказе">ℹ = видно пользователю</span></h4>
        <div class="info-box">
          <div class="mb-md">
            <label class="form-label-block mb-xs">Способ доставки <span class="user-visible-hint" title="Видно пользователю в заказе">ℹ</span></label>
            <select id="delivery-provider-${order.id}" class="form-input w-full mb-xs">
              <option value="pochta" ${deliveryProvider === 'pochta' ? 'selected' : ''}>Почта</option>
              <option value="cdek" ${deliveryProvider === 'cdek' ? 'selected' : ''}>СДЭК</option>
              <option value="international" ${deliveryProvider === 'international' ? 'selected' : ''}>Международная</option>
              <option value="pickup" ${deliveryProvider === 'pickup' ? 'selected' : ''}>Самовывоз</option>
            </select>
            <select id="delivery-subtype-${order.id}" class="form-input w-full" ${(deliveryProvider === 'international' || deliveryProvider === 'pickup') ? 'style="display:none"' : ''}>
              <option value="standard" ${deliverySubtype === 'standard' ? 'selected' : ''}>Обычная</option>
              <option value="express" ${deliverySubtype === 'express' ? 'selected' : ''}>Экспресс</option>
              <option value="courier" ${deliverySubtype === 'courier' ? 'selected' : ''}>Курьер</option>
            </select>
            <input type="hidden" id="delivery-type-${order.id}" value="${deliveryType}">
          </div>
          <div class="mb-md">
            <div class="flex-between mb-xs">
              <label class="form-label-block mb-0">Стоимость доставки (₽) <span class="user-visible-hint" title="Видно пользователю в заказе">ℹ</span></label>
              <button class="btn btn-secondary btn-xxs" data-action="calculate-parcels" data-order-id="${order.id}">Вес / посылки</button>
            </div>
            <input type="number" id="delivery-cost-${order.id}" value="${deliveryCost}" class="form-input w-full" min="0" data-field-name="delivery-cost-${order.id}">
          </div>
          <div class="mb-md">
            <label class="form-label-block">Дата отправки <span class="user-visible-hint" title="Видно пользователю в заказе">ℹ</span></label>
            <input type="date" id="shipment-date-${order.id}" value="${shipmentDate}" class="form-input w-full" data-field-name="shipment-date-${order.id}">
            <div class="text-sm text-tertiary mt-xs">Устанавливается из глобальной даты отправки; можно изменить вручную</div>
          </div>
          <div class="mb-md">
            <label class="form-label-block">Сроки доставки <span class="user-visible-hint" title="Видно пользователю в заказе">ℹ</span></label>
            <input type="text" id="delivery-timeframe-${order.id}" value="${escapeHtml(deliveryTimeframe)}" placeholder="5-6, 7-10, или просто 5" class="form-input w-full" data-field-name="delivery-timeframe-${order.id}">
          </div>
          <div class="mb-md">
            <label class="form-label-block">Заметки по доставке <span class="user-visible-hint" title="Видно пользователю в заказе">ℹ</span></label>
            <textarea id="delivery-notes-${order.id}" class="form-textarea w-full" data-field-name="delivery-notes-${order.id}">${escapeHtml(deliveryNotes)}</textarea>
          </div>
          ${order.delivery_type_note ? `<div class="text-sm text-tertiary mb-md text-italic">Примечание: ${order.delivery_type_note}</div>` : ''}
        </div>

        ${buildReceiptSection(order, orderId)}
        ${buildParcelsSection(order, orderId)}
        ${buildRefundSection(order, orderId, deliveryNotes)}
        ${buildCustomProductSection(order, orderId, hasCustomProducts, customProductItems)}
        ${buildTotalsSection(orderId, calculatedTotalPrice, deliveryCost, manager, order)}
      </div>
    </div>
  `;
}

export function buildReceiptSection(order, orderId) {
  return '';
}

export function buildParcelsSection(order, orderId) {
  if (!['paid', 'confirmed', 'shipped', 'delivered', 'on_hold'].includes(order.status)) return '';

  return `
    <h4 class="section-header">Трек-номер</h4>
    <div class="info-box">
      <div class="flex gap-sm">
        <input type="text" id="tracking-number-${orderId}" value="${order.tracking_number || ''}" placeholder="Введите трек-номер" class="form-input flex-1" data-field-name="tracking-number-${orderId}">
        <button class="btn btn-secondary" data-action="save-tracking" data-order-id="${orderId}" title="Сохранить трек-номер">
          Сохранить
        </button>
      </div>
    </div>
    ${buildTrackingHistorySection(order)}
    ${buildStorageSection(order)}
  `;
}

function buildTrackingHistorySection(order) {
  if (!order.last_tracking_status && !order.tracking_history?.length) return '';

  const history = Array.isArray(order.tracking_history) ? order.tracking_history : [];
  const historyHTML = history.slice(0, 8).map(event => {
    const dateStr = event.date
      ? new Date(event.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : '';
    const location = event.city || event.location || '';
    return `
      <div class="tracking-history-row">
        <span class="tracking-history-date">${escapeHtml(dateStr)}</span>
        <span>${escapeHtml(event.status || '')}${location ? ` · ${escapeHtml(location)}` : ''}</span>
      </div>
    `;
  }).join('');

  return `
    <h4 class="section-header">История трекинга</h4>
    <div class="info-box">
      ${order.last_tracking_status ? `<div class="mb-xs"><strong>Статус:</strong> ${escapeHtml(order.last_tracking_status)}</div>` : ''}
      ${order.last_tracking_update ? `<div class="text-sm text-tertiary mb-sm">Обновлено: ${new Date(order.last_tracking_update).toLocaleDateString('ru-RU')}</div>` : ''}
      ${historyHTML || '<p class="text-sm text-tertiary">Нет данных о движении посылки</p>'}
    </div>
  `;
}

function buildStorageSection(order) {
  if (!order.storage_deadline && !order.arrived_at_point_at && !order.returned_to_sender_at) return '';

  let rows = '';

  if (order.arrived_at_point_at) {
    rows += `<div class="mb-xs"><strong>Прибыл в ПВЗ:</strong> ${new Date(order.arrived_at_point_at).toLocaleDateString('ru-RU')}</div>`;
  }

  if (order.storage_deadline) {
    const deadline = new Date(order.storage_deadline);
    const daysLeft = Math.ceil((deadline - Date.now()) / 86400000);
    const color = daysLeft <= 2 ? 'var(--status-error)' : daysLeft <= 5 ? 'var(--status-warning)' : 'var(--status-success)';
    rows += `
      <div class="mb-xs">
        <strong>Срок хранения:</strong> ${deadline.toLocaleDateString('ru-RU')}
        <span style="color: ${color}; font-weight: 600; margin-left: 6px;">${daysLeft > 0 ? `ещё ${daysLeft} дн.` : 'срок истёк'}</span>
      </div>`;
  }

  if (order.returned_to_sender_at) {
    rows += `<div class="mb-xs" style="color: var(--status-error);"><strong>Возврат отправителю:</strong> ${new Date(order.returned_to_sender_at).toLocaleDateString('ru-RU')}</div>`;
  }

  if (order.return_action) {
    const labels = { retry_delivery: 'Повторная доставка', cancel_refund: 'Отмена и возврат средств' };
    rows += `<div class="mb-xs"><strong>Решение клиента:</strong> ${escapeHtml(labels[order.return_action] || order.return_action)}</div>`;
  }

  if (!rows) return '';

  return `
    <h4 class="section-header">Хранение и возврат</h4>
    <div class="info-box">${rows}</div>
  `;
}

export function buildRefundSection(order, orderId, deliveryNotes) {
  const hasRefundRequest = order.status === 'refund_requested' ||
    (['paid', 'in_work', 'shipped'].includes(order.status) &&
     order.payment_id &&
     deliveryNotes && deliveryNotes.includes('ЗАПРОС НА ВОЗВРАТ'));

  if (!hasRefundRequest) return '';

  return `
    <h4 class="section-header">Возврат средств</h4>
    <div class="info-box">
      <div class="warning-notice-box">
        <strong>Клиент запросил возврат</strong>
        ${order.refund_reason ? `<p>Причина: ${escapeHtml(order.refund_reason)}</p>` : `<p>Проверьте причину возврата в примечаниях ниже</p>`}
      </div>
      <div class="notice-actions">
        <button class="btn btn-success" data-action="approve-refund" data-order-id="${orderId}">
          ✓ Одобрить возврат
        </button>
        <button class="btn btn-danger" data-action="deny-refund" data-order-id="${orderId}">
          ✕ Отклонить возврат
        </button>
      </div>
      <div class="notice-footer">
        Возврат будет обработан через ${PAYMENT_PROVIDER_LABEL}
      </div>
    </div>
  `;
}

export function buildCustomProductSection(order, orderId, hasCustomProducts, customProductItems) {
  if (!hasCustomProducts) return '';

  if (order.custom_product_approved === null) {
    return `
      <div class="pt-md mt-md border-top custom-product-approval-section">
        <h4 class="section-header">Утверждение кастомного постера</h4>
        <div class="warning-notice-box">
          <p>Заказ содержит кастомный постер. Проверьте изображение и подтвердите возможность выполнения:</p>
          ${customProductItems.map(item => `
            <div class="custom-product-item">
              <strong>${escapeHtml(item.title)}</strong>
              ${item.custom_url ? `<img src="${item.custom_url}" onerror="this.style.display='none'" alt="">` : ''}
            </div>
          `).join('')}
        </div>
        <div class="notice-actions">
          <button class="btn btn-success" data-action="approve-custom-product" data-order-id="${orderId}">
            ✓ Да, возможно
          </button>
          <button class="btn btn-danger" data-action="reject-custom-product" data-order-id="${orderId}">
            ✕ Нет, невозможно
          </button>
        </div>
      </div>
    `;
  } else if (order.custom_product_approved === true) {
    return `
      <div class="pt-md mt-md border-top">
        <div class="success-notice-box">
          <strong>✓ Кастомный постер утвержден</strong>
        </div>
      </div>
    `;
  } else {
    return `
      <div class="pt-md mt-md border-top">
        <div class="error-notice-box">
          <strong>✕ Кастомный постер отклонен</strong>
          <p>Заказ приостановлен до решения с клиентом</p>
        </div>
      </div>
    `;
  }
}

export function buildTotalsSection(orderId, calculatedTotalPrice, deliveryCost, manager, order) {
  const deliveryCostNum = parseFloat(deliveryCost) || 0;

  return `
    <div class="pt-lg mt-lg border-top">
      <div class="flex-between mb-sm">
        <span class="text-secondary">Товары:</span>
        <span class="font-semibold" id="order-total-price-${orderId}">${formatNumber(calculatedTotalPrice)}₽</span>
      </div>
      ${order.delivery_cost ? `
        <div class="flex-between mb-sm">
          <span class="text-secondary">Доставка:</span>
          <span class="font-semibold">${formatNumber(deliveryCostNum)}₽</span>
        </div>
      ` : ''}
      <div class="flex-between pt-sm border-top">
        <span class="order-total-label">Итого:</span>
        <span class="order-total-value" id="order-grand-total-${orderId}">${formatNumber(calculatedTotalPrice + deliveryCostNum)}₽</span>
      </div>
    </div>

    ${manager.hasUnsavedChanges() ? `
      <div class="changes-actions">
        <button class="btn btn-save-all" data-action="save-all-changes" data-order-id="${order.id}">
          Сохранить все изменения
        </button>
        <button class="btn btn-discard" data-action="discard-changes" data-order-id="${order.id}">
          Отменить
        </button>
      </div>
    ` : ''}
  `;
}
