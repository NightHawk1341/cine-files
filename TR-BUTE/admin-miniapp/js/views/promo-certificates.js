/**
 * views/promo-certificates.js
 * Promo codes & certificates management tab
 */

import { state, isAdmin } from '../state.js';
import { SVGIcons, requireAuth, showToast, showError, showModal, hideModal, formatDate } from '../utils.js';
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/apiClient.js';

// Subtab state
let currentSubtab = 'promo-codes'; // 'promo-codes' | 'certificates' | 'templates'

// Promo codes state
let promoCodes = [];
let promoCodesLoaded = false;

// Certificates state
let certificates = [];
let certificatesLoaded = false;
let certificatesFilter = ''; // status filter

// Templates state
let templates = [];
let templatesLoaded = false;

// ============================================================================
// MAIN RENDER
// ============================================================================

async function loadPromoCertificates() {
  requireAuth();
  const content = document.getElementById('content');

  content.innerHTML = `
    <div class="loading-spinner">
      <div class="spinner"></div>
      <p>Загрузка...</p>
    </div>
  `;

  setupPromoCertificatesEvents();
  renderPromoCertificatesContent();
}

function renderPromoCertificatesContent() {
  const content = document.getElementById('content');

  content.innerHTML = `
    <div class="page-header">
      <h2 class="page-title">Промо-коды и сертификаты</h2>
      <button class="btn btn-secondary btn-sm btn-icon-only" data-action="refresh-promo-certs" title="Обновить">
        ${SVGIcons.refresh}
      </button>
    </div>

    ${getPromoCertificatesInnerHTML()}
  `;
}

/**
 * Returns the inner HTML for promo/certificates subtabs.
 * Used both by standalone view and embedded in orders tab.
 */
function getPromoCertificatesInnerHTML() {
  return `
    <!-- Subtabs -->
    <div class="tabs-carousel" style="margin-bottom: var(--spacing-md);">
      <div class="tabs-container">
        <button class="tab-btn ${currentSubtab === 'promo-codes' ? 'active' : ''}" data-action="switch-promo-subtab" data-subtab="promo-codes">
          <span class="tab-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M20 12V8H6a2 2 0 01-2-2c0-1.1.9-2 2-2h12v4"/><path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/><path d="M18 12a2 2 0 00-2 2c0 1.1.9 2 2 2h4v-4h-4z"/></svg></span>
          <span class="tab-label">Промо-коды</span>
        </button>
        <button class="tab-btn ${currentSubtab === 'certificates' ? 'active' : ''}" data-action="switch-promo-subtab" data-subtab="certificates">
          <span class="tab-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M12 17v4m-4 0h8"/></svg></span>
          <span class="tab-label">Сертификаты</span>
        </button>
        <button class="tab-btn ${currentSubtab === 'templates' ? 'active' : ''}" data-action="switch-promo-subtab" data-subtab="templates">
          <span class="tab-icon">${SVGIcons.image}</span>
          <span class="tab-label">Шаблоны</span>
        </button>
      </div>
    </div>

    <div id="promo-subtab-content">
      ${renderPromoSubtabContent()}
    </div>
  `;
}

/**
 * Render promo/certificates content into a given container element.
 * Used when embedded within orders tab.
 * @param {HTMLElement} container - Target container
 * @param {string} [initialSubtab] - Optional initial subtab to show ('promo-codes', 'certificates', 'templates')
 * @param {boolean} [skipTabs=false] - If true, skip rendering the inner tab navigation (parent handles it)
 */
function renderPromoCertificatesEmbedded(container, initialSubtab, skipTabs = false) {
  if (!container) return;
  if (initialSubtab) {
    currentSubtab = initialSubtab;
  }
  // Reset loaded state to ensure fresh data
  promoCodesLoaded = false;
  certificatesLoaded = false;
  templatesLoaded = false;
  if (skipTabs) {
    // Render only the subtab content without the tab navigation (parent view provides tabs)
    container.innerHTML = `
      <div id="promo-subtab-content">
        ${renderPromoSubtabContent()}
      </div>
    `;
  } else {
    container.innerHTML = getPromoCertificatesInnerHTML();
  }
  // Don't set up separate events - parent view handles delegation via handlePromoCertificatesClick
}

function renderPromoSubtabContent() {
  switch (currentSubtab) {
    case 'promo-codes':
      return renderPromoCodesSubtab();
    case 'certificates':
      return renderCertificatesSubtab();
    case 'templates':
      return renderTemplatesSubtab();
    default:
      return renderPromoCodesSubtab();
  }
}

// ============================================================================
// PROMO CODES SUBTAB
// ============================================================================

function renderPromoCodesSubtab() {
  if (!promoCodesLoaded) {
    loadPromoCodes();
    return `
      <div class="loading-spinner">
        <div class="spinner"></div>
        <p>Загрузка промо-кодов...</p>
      </div>
    `;
  }

  return `
    <div class="section-toolbar">
      <button class="btn btn-primary btn-sm" data-action="create-promo-code">+ Создать промо-код</button>
    </div>

    ${promoCodes.length === 0 ? `
      <div class="empty-state">
        <h3>Нет промо-кодов</h3>
        <p>Создайте первый промо-код для скидок</p>
      </div>
    ` : `
      <div class="card-list">
        ${promoCodes.map(pc => renderPromoCodeCard(pc)).join('')}
      </div>
    `}
  `;
}

function renderPromoCodeCard(pc) {
  const isExpired = pc.valid_until && new Date(pc.valid_until) < new Date();
  const isMaxedOut = pc.max_uses && pc.uses_count >= pc.max_uses;
  const statusLabel = !pc.is_active ? 'Выключен' : isExpired ? 'Истёк' : isMaxedOut ? 'Исчерпан' : 'Активен';
  const pillClass = (!pc.is_active || isExpired || isMaxedOut) ? 'status-pill--inactive' : 'status-pill--active';

  const valueDisplay = pc.type === 'percent' ? `${pc.value}%` : `${Number(pc.value).toLocaleString('ru-RU')}₽`;

  return `
    <div class="list-card">
      <div class="list-card-row">
        <div class="list-card-info">
          <div class="list-card-header">
            <code class="code-value">${escapeHtml(pc.code)}</code>
            <span class="status-pill ${pillClass}">${statusLabel}</span>
          </div>
          <div class="list-card-meta">
            Скидка: <strong>${valueDisplay}</strong>
            ${pc.min_order_amount > 0 ? ` &middot; от ${Number(pc.min_order_amount).toLocaleString('ru-RU')}₽` : ''}
            ${pc.max_uses ? ` &middot; ${pc.uses_count}/${pc.max_uses} исп.` : ` &middot; ${pc.uses_count} исп.`}
          </div>
          ${pc.valid_from || pc.valid_until ? `
            <div class="list-card-detail">
              ${pc.valid_from ? `С ${formatDateShort(pc.valid_from)}` : ''}
              ${pc.valid_until ? `${pc.valid_from ? ' — ' : 'До '}${formatDateShort(pc.valid_until)}` : ''}
            </div>
          ` : ''}
        </div>
        <div class="list-card-actions">
          <button class="btn btn-secondary btn-sm btn-icon-only" data-action="edit-promo-code" data-id="${pc.id}" title="Изменить">
            ${SVGIcons.edit}
          </button>
          <button class="btn btn-secondary btn-sm btn-icon-only btn-danger-ghost" data-action="delete-promo-code" data-id="${pc.id}" data-code="${escapeHtml(pc.code)}" title="Удалить">
            ${SVGIcons.trash}
          </button>
        </div>
      </div>
    </div>
  `;
}

async function loadPromoCodes() {
  try {
    const response = await apiGet('/api/admin/promo-codes');
    if (response.ok) {
      const data = await response.json();
      promoCodes = data.promo_codes || [];
      promoCodesLoaded = true;
      const subtabContent = document.getElementById('promo-subtab-content');
      if (subtabContent && currentSubtab === 'promo-codes') {
        subtabContent.innerHTML = renderPromoCodesSubtab();
      }
    } else {
      showError('Не удалось загрузить промо-коды');
    }
  } catch (err) {
    console.error('Error loading promo codes:', err);
    showError('Ошибка загрузки промо-кодов');
  }
}

function showPromoCodeModal(existing = null) {
  const isEdit = !!existing;
  const title = isEdit ? 'Редактировать промо-код' : 'Создать промо-код';

  showModal(title, `
    <div class="modal-form">
      <div>
        <label class="modal-form-label">Код</label>
        <input type="text" id="promo-code-input" value="${escapeHtml(existing?.code || '')}" placeholder="SUMMER2026" class="form-input" style="text-transform: uppercase;" />
      </div>
      <div class="modal-form-row">
        <div>
          <label class="modal-form-label">Тип</label>
          <select id="promo-type-input" class="form-input">
            <option value="fixed" ${(!existing || existing.type === 'fixed') ? 'selected' : ''}>Фиксированная (₽)</option>
            <option value="percent" ${existing?.type === 'percent' ? 'selected' : ''}>Процент (%)</option>
          </select>
        </div>
        <div>
          <label class="modal-form-label">Значение</label>
          <input type="number" id="promo-value-input" value="${existing?.value || ''}" placeholder="500" class="form-input" min="1" />
        </div>
      </div>
      <div class="modal-form-row">
        <div>
          <label class="modal-form-label">Мин. сумма заказа</label>
          <input type="number" id="promo-min-amount-input" value="${existing?.min_order_amount || '0'}" placeholder="0" class="form-input" min="0" />
        </div>
        <div>
          <label class="modal-form-label">Макс. использований</label>
          <input type="number" id="promo-max-uses-input" value="${existing?.max_uses || ''}" placeholder="Без лимита" class="form-input" min="1" />
        </div>
      </div>
      <div class="modal-form-row">
        <div>
          <label class="modal-form-label">Действует с</label>
          <input type="date" id="promo-valid-from-input" value="${existing?.valid_from ? existing.valid_from.split('T')[0] : ''}" class="form-input" />
        </div>
        <div>
          <label class="modal-form-label">Действует до</label>
          <input type="date" id="promo-valid-until-input" value="${existing?.valid_until ? existing.valid_until.split('T')[0] : ''}" class="form-input" />
        </div>
      </div>
      <div class="modal-form-checkbox">
        <input type="checkbox" id="promo-active-input" ${(!existing || existing.is_active) ? 'checked' : ''} />
        <label for="promo-active-input">Активен</label>
      </div>
    </div>
  `, [
    { text: 'Отмена', className: 'btn btn-secondary', onClick: hideModal },
    { text: isEdit ? 'Сохранить' : 'Создать', className: 'btn btn-primary', onClick: () => savePromoCode(isEdit ? existing.id : null) }
  ]);
}

async function savePromoCode(id = null) {
  const code = document.getElementById('promo-code-input')?.value?.trim();
  const type = document.getElementById('promo-type-input')?.value;
  const value = parseFloat(document.getElementById('promo-value-input')?.value);
  const min_order_amount = parseFloat(document.getElementById('promo-min-amount-input')?.value) || 0;
  const max_uses_raw = document.getElementById('promo-max-uses-input')?.value;
  const max_uses = max_uses_raw ? parseInt(max_uses_raw) : null;
  const valid_from = document.getElementById('promo-valid-from-input')?.value || null;
  const valid_until = document.getElementById('promo-valid-until-input')?.value || null;
  const is_active = document.getElementById('promo-active-input')?.checked ?? true;

  if (!code || !value) {
    showToast('Заполните код и значение', 'error');
    return;
  }

  try {
    let response;
    if (id) {
      response = await apiPut('/api/admin/promo-codes', { id, code, type, value, min_order_amount, max_uses, valid_from, valid_until, is_active });
    } else {
      response = await apiPost('/api/admin/promo-codes', { code, type, value, min_order_amount, max_uses, valid_from, valid_until, is_active });
    }

    const data = await response.json();
    if (response.ok) {
      hideModal();
      showToast(id ? 'Промо-код обновлён' : 'Промо-код создан');
      promoCodesLoaded = false;
      loadPromoCodes();
    } else {
      showToast(data.error || 'Ошибка сохранения', 'error');
    }
  } catch (err) {
    console.error('Error saving promo code:', err);
    showToast('Ошибка сохранения', 'error');
  }
}

async function deletePromoCode(id, code) {
  if (!confirm(`Удалить промо-код ${code}?`)) return;

  try {
    const response = await apiDelete(`/api/admin/promo-codes?id=${id}`);
    if (response.ok) {
      showToast('Промо-код удалён');
      promoCodesLoaded = false;
      loadPromoCodes();
    } else {
      const data = await response.json();
      showToast(data.error || 'Ошибка удаления', 'error');
    }
  } catch (err) {
    console.error('Error deleting promo code:', err);
    showToast('Ошибка удаления', 'error');
  }
}

// ============================================================================
// CERTIFICATES SUBTAB
// ============================================================================

function renderCertificatesSubtab() {
  if (!certificatesLoaded) {
    loadCertificates();
    return `
      <div class="loading-spinner">
        <div class="spinner"></div>
        <p>Загрузка сертификатов...</p>
      </div>
    `;
  }

  const statusOptions = [
    { value: '', label: 'Все' },
    { value: 'pending', label: 'Ожидают' },
    { value: 'paid', label: 'Оплачены' },
    { value: 'delivered', label: 'Доставлены' },
    { value: 'redeemed', label: 'Использованы' }
  ];

  const filtered = certificatesFilter
    ? certificates.filter(c => c.status === certificatesFilter)
    : certificates;

  return `
    <div class="section-toolbar section-toolbar--between">
      <div class="btn-group">
        ${statusOptions.map(opt => `
          <button class="btn btn-sm ${certificatesFilter === opt.value ? 'btn-primary' : 'btn-secondary'}"
                  data-action="filter-certificates" data-status="${opt.value}">
            ${opt.label}
          </button>
        `).join('')}
      </div>
      <button class="btn btn-primary btn-sm" data-action="create-certificate">+ Создать сертификат</button>
    </div>

    ${filtered.length === 0 ? `
      <div class="empty-state">
        <h3>Нет сертификатов</h3>
        <p>${certificatesFilter ? 'Нет сертификатов с таким статусом' : 'Сертификаты ещё не выпускались'}</p>
      </div>
    ` : `
      <div class="card-list">
        ${filtered.map(cert => renderCertificateCard(cert)).join('')}
      </div>
    `}
  `;
}

function getCertImageSource(url) {
  if (!url) return null;
  if (/vk\.com|vkuser|vk-cdn|sun\d+-/.test(url)) return 'VK CDN';
  if (url.includes('yandexcloud.net') || url.includes('storage.yandex')) return 'Yandex S3';
  if (url.includes('vercel-storage.com') || url.includes('blob.vercel')) return 'Vercel Blob';
  if (url.includes('supabase.co')) return 'Supabase';
  return 'Внешний URL';
}

function renderCertificateCard(cert) {
  const statusLabels = {
    pending: 'Ожидает',
    paid: 'Оплачен',
    delivered: 'Доставлен',
    redeemed: 'Использован'
  };
  const pillClasses = {
    pending: 'status-pill--warning',
    paid: 'status-pill--active',
    delivered: 'status-pill--info',
    redeemed: 'status-pill--inactive'
  };

  const statusLabel = statusLabels[cert.status] || cert.status;
  const pillClass = pillClasses[cert.status] || 'status-pill--inactive';

  return `
    <div class="list-card">
      <div class="list-card-row">
        <div class="list-card-info">
          <div class="list-card-header">
            <code class="code-value">${escapeHtml(cert.certificate_code)}</code>
            <button class="btn btn-secondary btn-sm btn-icon-only btn-xs" data-action="copy-cert-code" data-code="${escapeHtml(cert.certificate_code)}" title="Копировать код">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            </button>
            <span class="status-pill ${pillClass}">${statusLabel}</span>
          </div>
          <div class="list-card-meta">
            <strong>${Number(cert.amount).toLocaleString('ru-RU')}₽</strong> &middot; ${escapeHtml(cert.recipient_name)}
            ${cert.template_title ? ` &middot; ${escapeHtml(cert.template_title)}` : ''}
            ${cert.min_cart_amount > 0 ? ` &middot; <span title="Минимальная сумма корзины">от ${Number(cert.min_cart_amount).toLocaleString('ru-RU')}₽</span>` : ''}
          </div>
          <div class="list-card-detail">
            ${cert.purchase_order_id ? `Заказ: <a href="javascript:void(0)" class="link-info" data-action="view-cert-order" data-order-id="${cert.purchase_order_id}">#${cert.purchase_order_id}</a>` : ''}
            ${cert.purchaser_name ? ` &middot; ${escapeHtml(cert.purchaser_name)}` : ''}
            ${cert.created_at ? ` &middot; ${formatDateShort(cert.created_at)}` : ''}
          </div>
          ${cert.redeemed_at || cert.redeemed_by_name ? `
            <div class="list-card-detail">
              ${cert.redeemed_at ? `Исп.: ${formatDateShort(cert.redeemed_at)}` : ''}
              ${cert.redeemed_by_name ? ` (${escapeHtml(cert.redeemed_by_name)})` : ''}
              ${cert.redeemed_in_order_id ? ` &middot; Заказ: <a href="javascript:void(0)" class="link-info" data-action="view-cert-order" data-order-id="${cert.redeemed_in_order_id}">#${cert.redeemed_in_order_id}</a>` : ''}
            </div>
          ` : ''}
          ${cert.delivery_type === 'pdf' ? `
            <div class="list-card-detail">
              Изображение: ${cert.cert_image_url ? `<span class="status-pill ${getCertImageSource(cert.cert_image_url) === 'VK CDN' ? 'status-pill--active' : 'status-pill--warning'}">${getCertImageSource(cert.cert_image_url)}</span>` : '<span class="status-pill status-pill--inactive">не сгенерировано</span>'}
            </div>
          ` : ''}
        </div>
        <div class="list-card-actions">
          ${cert.delivery_type === 'pdf' ? `
            ${cert.cert_image_url ? `
              <button class="btn btn-secondary btn-sm btn-icon-only" data-action="download-cert-image" data-url="${cert.cert_image_url}" data-code="${escapeHtml(cert.certificate_code)}" title="Скачать изображение (${getCertImageSource(cert.cert_image_url)})">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              </button>
            ` : ''}
            <button class="btn btn-secondary btn-sm btn-icon-only" data-action="upload-cert-image" data-cert-id="${cert.id}" title="${cert.cert_image_url ? `Заменить ссылку на изображение (сейчас: ${getCertImageSource(cert.cert_image_url)})` : 'Вставить ссылку на изображение'}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
            </button>
          ` : ''}
          <button class="btn btn-secondary btn-sm btn-icon-only" data-action="edit-certificate" data-id="${cert.id}" title="Изменить">
            ${SVGIcons.edit}
          </button>
          <button class="btn btn-secondary btn-sm btn-icon-only btn-danger-ghost" data-action="delete-certificate" data-id="${cert.id}" data-code="${escapeHtml(cert.certificate_code)}" title="Удалить">
            ${SVGIcons.trash}
          </button>
        </div>
      </div>
    </div>
  `;
}

async function loadCertificates() {
  try {
    // Also load templates if not loaded (needed for create certificate modal)
    if (!templatesLoaded) {
      loadTemplates();
    }

    const params = certificatesFilter ? `?status=${certificatesFilter}` : '';
    const response = await apiGet(`/api/admin/certificates${params}`);
    if (response.ok) {
      const data = await response.json();
      certificates = data.certificates || [];
      certificatesLoaded = true;
      const subtabContent = document.getElementById('promo-subtab-content');
      if (subtabContent && currentSubtab === 'certificates') {
        subtabContent.innerHTML = renderCertificatesSubtab();
      }
    } else {
      showError('Не удалось загрузить сертификаты');
    }
  } catch (err) {
    console.error('Error loading certificates:', err);
    showError('Ошибка загрузки сертификатов');
  }
}

// ============================================================================
// MANUAL CERTIFICATE CREATION
// ============================================================================

function showCreateCertificateModal() {
  const templateOptions = templates.length > 0
    ? templates.filter(t => t.is_active).map(t => `<option value="${t.id}">${escapeHtml(t.title)}</option>`).join('')
    : '';

  showModal('Создать сертификат', `
    <div class="form-group">
      <label>Имя получателя</label>
      <input type="text" id="cert-recipient-name" class="form-control" placeholder="Не обязательно (для розыгрышей можно оставить пустым)">
      <small class="modal-form-hint">
        Можно оставить пустым для розыгрышей или сертификатов по коду
      </small>
    </div>
    <div class="form-group">
      <label>Сумма (₽) *</label>
      <input type="number" id="cert-amount" class="form-control" placeholder="1000" min="10" max="50000">
    </div>
    <div class="form-group">
      <label>Мин. сумма корзины (₽)</label>
      <input type="number" id="cert-min-cart-amount" class="form-control" placeholder="0" min="0" value="0">
      <small class="modal-form-hint">
        Пользователь сможет применить сертификат только если товаров в корзине на эту сумму
      </small>
    </div>
    ${templateOptions ? `
      <div class="form-group">
        <label>Шаблон</label>
        <select id="cert-template-id" class="form-control">
          <option value="">Без шаблона</option>
          ${templateOptions}
        </select>
      </div>
    ` : ''}
    <div class="form-group">
      <label>Тип доставки</label>
      <select id="cert-delivery-type" class="form-control">
        <option value="code" selected>Код сертификата</option>
        <option value="pdf">Изображение</option>
        <option value="physical">Физический</option>
      </select>
    </div>
    <div class="form-group">
      <label>Статус</label>
      <select id="cert-status" class="form-control">
        <option value="paid">Оплачен</option>
        <option value="delivered">Доставлен</option>
        <option value="pending">Ожидает</option>
      </select>
    </div>
  `, [
    { text: 'Отмена', className: 'btn btn-secondary', onClick: hideModal },
    { text: 'Создать', className: 'btn btn-primary', onClick: saveNewCertificate }
  ]);
}

async function saveNewCertificate() {
  const recipientName = document.getElementById('cert-recipient-name')?.value?.trim() || '';
  const amount = parseFloat(document.getElementById('cert-amount')?.value);
  const minCartAmount = parseFloat(document.getElementById('cert-min-cart-amount')?.value) || 0;
  const templateId = document.getElementById('cert-template-id')?.value || null;
  const deliveryType = document.getElementById('cert-delivery-type')?.value || 'code';
  const status = document.getElementById('cert-status')?.value || 'paid';

  if (!amount || amount < 10 || amount > 50000) {
    showToast('Сумма должна быть от 10 до 50 000₽', 'error');
    return;
  }

  try {
    const response = await apiPost('/api/admin/certificates', {
      recipient_name: recipientName,
      amount,
      min_cart_amount: minCartAmount,
      template_id: templateId ? parseInt(templateId) : null,
      delivery_type: deliveryType,
      status
    });

    if (response.ok) {
      const data = await response.json();
      showToast(`Сертификат ${data.certificate.certificate_code} создан`);
      hideModal();
      certificatesLoaded = false;
      loadCertificates();
    } else {
      const data = await response.json();
      showToast(data.error || 'Ошибка создания сертификата', 'error');
    }
  } catch (err) {
    console.error('Error creating certificate:', err);
    showToast('Ошибка создания сертификата', 'error');
  }
}

// ============================================================================
// EDIT / DELETE CERTIFICATES
// ============================================================================

function showEditCertificateModal(certId) {
  const cert = certificates.find(c => c.id === certId);
  if (!cert) return;

  showModal(`Сертификат ${escapeHtml(cert.certificate_code)}`, `
    <div class="form-group">
      <label>Статус</label>
      <select id="edit-cert-status" class="form-control">
        <option value="pending" ${cert.status === 'pending' ? 'selected' : ''}>Ожидает</option>
        <option value="paid" ${cert.status === 'paid' ? 'selected' : ''}>Оплачен</option>
        <option value="delivered" ${cert.status === 'delivered' ? 'selected' : ''}>Доставлен</option>
        <option value="redeemed" ${cert.status === 'redeemed' ? 'selected' : ''}>Использован</option>
      </select>
    </div>
    <div class="form-group">
      <label>Имя получателя</label>
      <input type="text" id="edit-cert-recipient" class="form-control" value="${escapeHtml(cert.recipient_name || '')}">
    </div>
    <div class="form-group">
      <label>Сумма (₽)</label>
      <input type="number" id="edit-cert-amount" class="form-control" value="${cert.amount}" min="10" max="50000">
    </div>
    <div class="form-group">
      <label>Мин. сумма корзины (₽)</label>
      <input type="number" id="edit-cert-min-cart" class="form-control" value="${cert.min_cart_amount || 0}" min="0">
    </div>
    <div class="form-group">
      <label>Тип доставки</label>
      <select id="edit-cert-delivery" class="form-control">
        <option value="code" ${cert.delivery_type === 'code' ? 'selected' : ''}>Код</option>
        <option value="pdf" ${cert.delivery_type === 'pdf' ? 'selected' : ''}>Изображение</option>
        <option value="physical" ${cert.delivery_type === 'physical' ? 'selected' : ''}>Физический</option>
      </select>
    </div>
    <input type="hidden" id="edit-cert-id" value="${cert.id}">
  `, [
    { text: 'Отмена', className: 'btn btn-secondary', onClick: hideModal },
    { text: 'Сохранить', className: 'btn btn-primary', onClick: saveEditedCertificate }
  ]);
}

async function saveEditedCertificate() {
  const certId = parseInt(document.getElementById('edit-cert-id')?.value);
  const status = document.getElementById('edit-cert-status')?.value;
  const recipientName = document.getElementById('edit-cert-recipient')?.value?.trim();
  const amount = parseFloat(document.getElementById('edit-cert-amount')?.value);
  const minCartAmount = parseFloat(document.getElementById('edit-cert-min-cart')?.value) || 0;
  const deliveryType = document.getElementById('edit-cert-delivery')?.value;

  if (!amount || amount < 10 || amount > 50000) {
    showToast('Сумма должна быть от 10 до 50 000₽', 'error');
    return;
  }

  try {
    const response = await apiPut(`/api/admin/certificates/${certId}`, {
      status,
      recipient_name: recipientName,
      amount,
      min_cart_amount: minCartAmount,
      delivery_type: deliveryType
    });

    if (response.ok) {
      showToast('Сертификат обновлён');
      hideModal();
      certificatesLoaded = false;
      loadCertificates();
    } else {
      const data = await response.json();
      showToast(data.error || 'Ошибка сохранения', 'error');
    }
  } catch (err) {
    console.error('Error updating certificate:', err);
    showToast('Ошибка сохранения', 'error');
  }
}

async function deleteCertificateById(id, code) {
  if (!confirm(`Удалить сертификат ${code}?`)) return;

  try {
    const response = await apiDelete(`/api/admin/certificates/${id}`);
    if (response.ok) {
      showToast(`Сертификат ${code} удалён`);
      certificatesLoaded = false;
      loadCertificates();
    } else {
      const data = await response.json();
      showToast(data.error || 'Ошибка удаления', 'error');
    }
  } catch (err) {
    console.error('Error deleting certificate:', err);
    showToast('Ошибка удаления', 'error');
  }
}

// ============================================================================
// IMAGE UPLOAD FOR CERTIFICATES
// ============================================================================

function showUploadImageModal(certId) {
  showModal('Загрузить изображение', `
    <div class="form-group">
      <label>URL изображения *</label>
      <input type="url" id="cert-image-url" class="form-control" placeholder="https://...">
      <small class="modal-form-hint">
        Вставьте ссылку на загруженное изображение сертификата
      </small>
    </div>
    <input type="hidden" id="cert-image-id" value="${certId}">
  `, [
    { text: 'Отмена', className: 'btn btn-secondary', onClick: hideModal },
    { text: 'Сохранить', className: 'btn btn-primary', onClick: saveCertificateImage }
  ]);
}

async function saveCertificateImage() {
  const imageUrl = document.getElementById('cert-image-url')?.value?.trim();
  const certId = parseInt(document.getElementById('cert-image-id')?.value);

  if (!imageUrl) {
    showToast('Введите URL изображения', 'error');
    return;
  }

  try {
    const response = await apiPut('/api/admin/certificates/image', {
      id: certId,
      cert_image_url: imageUrl
    });

    if (response.ok) {
      showToast('Изображение сохранено');
      hideModal();
      certificatesLoaded = false;
      loadCertificates();
    } else {
      const data = await response.json();
      showToast(data.error || 'Ошибка сохранения изображения', 'error');
    }
  } catch (err) {
    console.error('Error saving certificate image:', err);
    showToast('Ошибка сохранения изображения', 'error');
  }
}

// ============================================================================
// TEMPLATES SUBTAB
// ============================================================================

function renderTemplatesSubtab() {
  if (!templatesLoaded) {
    loadTemplates();
    return `
      <div class="loading-spinner">
        <div class="spinner"></div>
        <p>Загрузка шаблонов...</p>
      </div>
    `;
  }

  return `
    <div class="section-toolbar">
      <button class="btn btn-primary btn-sm" data-action="create-template">+ Создать шаблон</button>
    </div>

    ${templates.length === 0 ? `
      <div class="empty-state">
        <h3>Нет шаблонов</h3>
        <p>Создайте первый шаблон сертификата</p>
      </div>
    ` : `
      <div class="card-list">
        ${templates.map(t => renderTemplateCard(t)).join('')}
      </div>
    `}
  `;
}

function renderTemplateCard(t) {
  const activeLabel = t.is_active ? 'Активен' : 'Скрыт';
  const pillClass = t.is_active ? 'status-pill--active' : 'status-pill--inactive';

  return `
    <div class="list-card">
      <div class="list-card-row" style="align-items: center;">
        ${t.image_url ? `<img src="${t.image_url}" alt="${escapeHtml(t.title)}" class="template-thumbnail" />` : ''}
        <div class="list-card-info">
          <div class="list-card-header">
            <strong>${escapeHtml(t.title)}</strong>
            <span class="status-pill ${pillClass}">${activeLabel}</span>
          </div>
          <div class="list-card-detail">
            ID: ${t.id} &middot; Порядок: ${t.sort_order} &middot; Сертификатов: ${t.certificate_count || 0}
          </div>
          <div class="list-card-detail" style="font-size:0.75rem;color:var(--text-tertiary);margin-top:2px;">
            Фон: <code>assets/certificate-backgrounds/${t.id}.jpg</code>
          </div>
        </div>
        <div class="list-card-actions">
          <button class="btn btn-secondary btn-sm btn-icon-only" data-action="toggle-template" data-id="${t.id}" data-active="${t.is_active}" title="${t.is_active ? 'Скрыть' : 'Показать'}">
            ${t.is_active ? SVGIcons.eyeOff : SVGIcons.eye}
          </button>
          <button class="btn btn-secondary btn-sm btn-icon-only" data-action="edit-template" data-id="${t.id}" title="Изменить">
            ${SVGIcons.edit}
          </button>
          <button class="btn btn-secondary btn-sm btn-icon-only btn-danger-ghost" data-action="delete-template" data-id="${t.id}" data-title="${escapeHtml(t.title)}" title="Удалить">
            ${SVGIcons.trash}
          </button>
        </div>
      </div>
    </div>
  `;
}

async function loadTemplates() {
  try {
    const response = await apiGet('/api/admin/certificates/templates');
    if (response.ok) {
      const data = await response.json();
      templates = data.templates || [];
      templatesLoaded = true;
      const subtabContent = document.getElementById('promo-subtab-content');
      if (subtabContent && currentSubtab === 'templates') {
        subtabContent.innerHTML = renderTemplatesSubtab();
      }
    } else {
      showError('Не удалось загрузить шаблоны');
    }
  } catch (err) {
    console.error('Error loading templates:', err);
    showError('Ошибка загрузки шаблонов');
  }
}

function showTemplateModal(existing = null) {
  const isEdit = !!existing;
  const title = isEdit ? 'Редактировать шаблон' : 'Создать шаблон';

  showModal(title, `
    <div class="modal-form">
      <div>
        <label class="modal-form-label">Название</label>
        <input type="text" id="template-title-input" value="${escapeHtml(existing?.title || '')}" placeholder="Подарочный сертификат" class="form-input" />
      </div>
      <div>
        <label class="modal-form-label">URL изображения</label>
        <input type="text" id="template-image-input" value="${escapeHtml(existing?.image_url || '')}" placeholder="https://..." class="form-input" />
      </div>
      <div>
        <label class="modal-form-label">Порядок сортировки</label>
        <input type="number" id="template-sort-input" value="${existing?.sort_order || 0}" class="form-input" min="0" />
      </div>
      <div class="modal-form-checkbox">
        <input type="checkbox" id="template-active-input" ${(!existing || existing.is_active) ? 'checked' : ''} />
        <label for="template-active-input">Активен</label>
      </div>
    </div>
  `, [
    { text: 'Отмена', className: 'btn btn-secondary', onClick: hideModal },
    { text: isEdit ? 'Сохранить' : 'Создать', className: 'btn btn-primary', onClick: () => saveTemplate(isEdit ? existing.id : null) }
  ]);
}

async function saveTemplate(id = null) {
  const title = document.getElementById('template-title-input')?.value?.trim();
  const image_url = document.getElementById('template-image-input')?.value?.trim();
  const sort_order = parseInt(document.getElementById('template-sort-input')?.value) || 0;
  const is_active = document.getElementById('template-active-input')?.checked ?? true;

  if (!title || !image_url) {
    showToast('Заполните название и URL изображения', 'error');
    return;
  }

  try {
    let response;
    if (id) {
      response = await apiPut('/api/admin/certificates/templates', { id, title, image_url, sort_order, is_active });
    } else {
      response = await apiPost('/api/admin/certificates/templates', { title, image_url, sort_order, is_active });
    }

    const data = await response.json();
    if (response.ok) {
      hideModal();
      showToast(id ? 'Шаблон обновлён' : 'Шаблон создан');
      templatesLoaded = false;
      loadTemplates();
    } else {
      showToast(data.error || 'Ошибка сохранения', 'error');
    }
  } catch (err) {
    console.error('Error saving template:', err);
    showToast('Ошибка сохранения', 'error');
  }
}

async function deleteTemplate(id, title) {
  if (!confirm(`Удалить шаблон "${title}"?`)) return;

  try {
    const response = await apiDelete(`/api/admin/certificates/templates?id=${id}`);
    if (response.ok) {
      showToast('Шаблон удалён');
      templatesLoaded = false;
      loadTemplates();
    } else {
      const data = await response.json();
      showToast(data.error || 'Ошибка удаления', 'error');
    }
  } catch (err) {
    console.error('Error deleting template:', err);
    showToast('Ошибка удаления', 'error');
  }
}

async function toggleTemplate(id, currentActive) {
  try {
    const response = await apiPut('/api/admin/certificates/templates', { id, is_active: !currentActive });
    if (response.ok) {
      showToast(currentActive ? 'Шаблон скрыт' : 'Шаблон активирован');
      templatesLoaded = false;
      loadTemplates();
    }
  } catch (err) {
    console.error('Error toggling template:', err);
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ============================================================================
// EVENT HANDLING
// ============================================================================

function handlePromoCertificatesClick(e) {
  const target = e.target.closest('[data-action]');
  if (!target) return;

  const action = target.dataset.action;

  switch (action) {
    case 'switch-promo-subtab': {
      const subtab = target.dataset.subtab;
      if (subtab && subtab !== currentSubtab) {
        currentSubtab = subtab;
        // Update only the subtab content and tab active states instead of full re-render
        const subtabContainer = document.getElementById('promo-subtab-content');
        if (subtabContainer) {
          subtabContainer.innerHTML = renderPromoSubtabContent();
          // Update active tab buttons
          document.querySelectorAll('[data-action="switch-promo-subtab"]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.subtab === currentSubtab);
          });
        } else {
          renderPromoCertificatesContent();
        }
      }
      break;
    }

    case 'refresh-promo-certs':
      promoCodesLoaded = false;
      certificatesLoaded = false;
      templatesLoaded = false;
      // Try to update in-place first, fall back to full re-render
      const subtabEl = document.getElementById('promo-subtab-content');
      if (subtabEl) {
        subtabEl.innerHTML = renderPromoSubtabContent();
      } else {
        renderPromoCertificatesContent();
      }
      break;

    case 'create-promo-code':
      showPromoCodeModal();
      break;

    case 'edit-promo-code': {
      const id = parseInt(target.dataset.id);
      const pc = promoCodes.find(p => p.id === id);
      if (pc) showPromoCodeModal(pc);
      break;
    }

    case 'delete-promo-code': {
      const id = parseInt(target.dataset.id);
      const code = target.dataset.code;
      deletePromoCode(id, code);
      break;
    }

    case 'save-new-promo-code':
      savePromoCode();
      break;

    case 'filter-certificates': {
      certificatesFilter = target.dataset.status || '';
      certificatesLoaded = false;
      loadCertificates();
      // Update filter button states
      document.querySelectorAll('[data-action="filter-certificates"]').forEach(btn => {
        btn.classList.toggle('btn-primary', btn.dataset.status === certificatesFilter);
        btn.classList.toggle('btn-secondary', btn.dataset.status !== certificatesFilter);
      });
      break;
    }

    case 'create-certificate':
      showCreateCertificateModal();
      break;

    case 'save-new-certificate':
      saveNewCertificate();
      break;

    case 'edit-certificate': {
      const certId = parseInt(target.dataset.id);
      showEditCertificateModal(certId);
      break;
    }

    case 'delete-certificate': {
      const certId = parseInt(target.dataset.id);
      const code = target.dataset.code;
      deleteCertificateById(certId, code);
      break;
    }

    case 'download-cert-image': {
      const url  = target.dataset.url;
      const code = target.dataset.code;
      if (!url) break;
      target.disabled = true;
      fetch(url)
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.blob(); })
        .then(blob => {
          const ext = url.split('?')[0].split('.').pop() || 'jpg';
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `cert-${code}.${ext}`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 10000);
        })
        .catch(() => showToast('Не удалось скачать изображение', 'error'))
        .finally(() => { target.disabled = false; });
      break;
    }

    case 'upload-cert-image': {
      const certId = parseInt(target.dataset.certId);
      showUploadImageModal(certId);
      break;
    }

    case 'save-cert-image':
      saveCertificateImage();
      break;

    case 'copy-cert-code': {
      const code = target.dataset.code;
      if (code) {
        navigator.clipboard.writeText(code).then(() => {
          showToast('Код скопирован');
        }).catch(() => {
          showToast('Не удалось скопировать код', 'error');
        });
      }
      break;
    }

    case 'view-cert-order': {
      const orderId = target.dataset.orderId;
      if (orderId) {
        // Navigate to orders tab and show order details
        import('./orders.js').then(module => {
          if (module.viewOrderDetails) {
            module.viewOrderDetails(orderId);
          }
        }).catch(() => {
          showToast(`Заказ #${orderId}`, 'info');
        });
      }
      break;
    }

    case 'create-template':
      showTemplateModal();
      break;

    case 'edit-template': {
      const id = parseInt(target.dataset.id);
      const t = templates.find(tmpl => tmpl.id === id);
      if (t) showTemplateModal(t);
      break;
    }

    case 'delete-template': {
      const id = parseInt(target.dataset.id);
      const title = target.dataset.title;
      deleteTemplate(id, title);
      break;
    }

    case 'toggle-template': {
      const id = parseInt(target.dataset.id);
      const currentActive = target.dataset.active === 'true';
      toggleTemplate(id, currentActive);
      break;
    }

    case 'save-new-template':
      saveTemplate();
      break;

    case 'close':
      hideModal();
      break;

    default: {
      // Handle dynamic save actions like save-promo-code-123, save-template-456
      if (action.startsWith('save-promo-code-')) {
        const id = parseInt(action.replace('save-promo-code-', ''));
        savePromoCode(id);
      } else if (action.startsWith('save-template-')) {
        const id = parseInt(action.replace('save-template-', ''));
        saveTemplate(id);
      }
      break;
    }
  }
}

function setupPromoCertificatesEvents(target = null) {
  const content = target || document.getElementById('content');

  if (content._promoCertsClickHandler) {
    content.removeEventListener('click', content._promoCertsClickHandler);
  }

  content._promoCertsClickHandler = handlePromoCertificatesClick;
  content.addEventListener('click', handlePromoCertificatesClick);
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  loadPromoCertificates as renderPromoCertificatesView,
  renderPromoCertificatesEmbedded,
  handlePromoCertificatesClick
};
