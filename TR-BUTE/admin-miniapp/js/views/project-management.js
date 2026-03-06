/**
 * views/project-management.js
 * Project management tab for admin settings and toggles
 */

import { state, updateState, isAdmin, isEditor, hasPermission } from '../state.js';
import { API_BASE, tg, isBrowserMode } from '../config.js';
import { SVGIcons, requireAuth, showToast, showError, showModal, hideModal, formatNumber, formatDate } from '../utils.js';
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/apiClient.js';
import { createPageHeader } from '../utils/templates.js';
import { loadStatistics } from './statistics.js';
import {
  renderModerationSubtab, loadModerationData, toggleModerationEnabled,
  toggleModerationType, handleModerationSearch, showAddWordModal,
  showBulkImportModal, showEditWordModal, deleteWord, toggleWordActive,
  testModeration
} from './project-management/moderation.js';
import {
  renderBotsSubtab, saveBotGreetings, updateVkProductDescriptions
} from './project-management/bots.js';
import {
  setBotGreetingsData, setBotGreetingsLoaded, setVkProductDescCommunity,
  notificationTemplatesLoaded, setNotificationTemplatesLoaded,
  notificationTemplatesData, setNotificationTemplatesData,
  notifActiveChannel, setNotifActiveChannel,
  giveawaysLoaded, setShowGiveawayForm,
  storiesData, storiesLoaded, setStoriesLoaded,
  estimatesLoaded, setEstimatesLoaded,
  estimatesPagination, estimatesProviderFilter, setEstimatesProviderFilter,
  estimatesSearchTimeout, setEstimatesSearchTimeout, setEstimatesSearchQuery,
  faqLoaded,
  showConfirmDialog
} from './project-management/state.js';
import {
  renderNotificationsSubtab, loadNotificationTemplates,
  saveNotificationTemplate, resetNotificationTemplate, toggleNotificationEnabled
} from './project-management/notifications.js';
import {
  renderGiveawaySubtab, loadGiveaways, submitCreateGiveaway,
  pickGiveawayWinners, cancelGiveaway, saveGiveawayChannels
} from './project-management/giveaways.js';
import {
  renderStoriesSubtab, renderStoriesContent, loadStories,
  initStoriesSortable, openStoryModal, closeStoryModal,
  saveStoryFromModal, deleteStory
} from './project-management/stories.js';
import {
  renderEstimatesSubtab, renderEstimatesContent, deleteEstimate, loadEstimates
} from './project-management/estimates.js';
import {
  renderFaqSubtab, loadFaqInline, renderFaqInline, initFaqSortable
} from './project-management/faq.js';

// Channel post state
let channelSectionExpanded = false;
let channelShopButtonEnabled = true;
let channelButtonCounter = 0;
let channelPostParseMode = 'HTML';
let channelPostSilent = false;
let channelPostNoPreview = false;
let channelPostChannels = null;      // loaded from giveaway_channels setting
let channelPostSelectedChannelId = null;

// Subtab state
let currentSubtab = 'orders'; // 'orders', 'estimates', 'faq', 'stories', 'post', 'site', 'bots'


// IP rights state
let ipRightsData = null;
let ipRightsLoaded = false;
let ipRightsShowManualForm = false;

// Helper function for Russian date formatting
function formatDateRussian(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

// ============================================================================
// PROJECT MANAGEMENT VIEW
// ============================================================================

// Local state for settings
let settings = {
  emergency_mode: {
    enabled: false,
    hide_images: true,
    replace_titles: true,
    activated_at: null
  },
  order_submission: {
    enabled: true,
    disabled_message: 'Оформление заказов временно недоступно'
  },
  delivery_methods: {
    pochta: { enabled: true, name: 'Почта России', manual_mode: false },
    pochta_standard: { enabled: true, name: 'До отделения' },
    pochta_courier: { enabled: true, name: 'Курьер Почты' },
    pochta_first_class: { enabled: true, name: '1 класс' },
    courier_ems: { enabled: true, name: 'EMS (курьер)' },
    cdek: { enabled: true, name: 'СДЭК' },
    cdek_pvz: { enabled: true, name: 'До ПВЗ' },
    cdek_pvz_express: { enabled: true, name: 'До ПВЗ Экспресс' },
    cdek_courier: { enabled: true, name: 'Курьер СДЭК' },
    international: { enabled: true, name: 'Международная доставка' }
  },
  delivery_rounding: {
    small_order_threshold: 1500,
    small_order_step: 50,
    big_order_step: 50,
    high_ratio_threshold: 0.5,
    high_ratio_step: 100,
    very_high_ratio_threshold: 0.7,
    very_high_ratio_step: 200
  },
  next_shipment_date: null,
  next_shipment_date_end: null,
  cart_limits: {
    max_cart_total: 45000
  },
  announcement_bar: {
    enabled: false,
    text: ''
  }
};

// Packaging configuration state
let packagingConfig = {
  packaging: [],
  weights: [],
  capacityLimits: {
    tube_a3: { a3: 5, a2: 0, a1: 0 },
    tube_a2: { a3: 5, a2: 5, a1: 0 },
    tube_a1: { a3: 5, a2: 5, a1: 5 },
    half_carton: { a3Framed: 2, a2Framed: 0, a3Frameless: 3 },
    full_carton: { a3Framed: 5, a2Framed: 5, a3Frameless: 5 }
  }
};
let packagingLoaded = false;
let packagingSectionExpanded = false;

async function loadProjectManagement() {
  requireAuth();
  const content = document.getElementById('content');

  content.innerHTML = `
    <div class="loading-spinner">
      <div class="spinner"></div>
      <p>Загрузка настроек...</p>
    </div>
  `;

  try {
    // Fetch current settings from API
    const [settingsResponse, shipmentResponse] = await Promise.all([
      apiGet('/api/settings/get?keys=emergency_mode,order_submission,delivery_methods,delivery_rounding,cart_limits,announcement_bar'),
      apiGet('/api/admin/shipments/settings')
    ]);
    if (settingsResponse.ok) {
      const result = await settingsResponse.json();
      if (result.settings) {
        if (result.settings.emergency_mode?.value) {
          settings.emergency_mode = result.settings.emergency_mode.value;
        }
        if (result.settings.order_submission?.value) {
          settings.order_submission = result.settings.order_submission.value;
        }
        if (result.settings.delivery_methods?.value) {
          // Merge loaded values with defaults so new sub-keys always exist
          settings.delivery_methods = {
            ...settings.delivery_methods,
            ...result.settings.delivery_methods.value
          };
        }
        if (result.settings.delivery_rounding?.value) {
          settings.delivery_rounding = result.settings.delivery_rounding.value;
        }
        if (result.settings.cart_limits?.value) {
          settings.cart_limits = {
            ...settings.cart_limits,
            ...result.settings.cart_limits.value
          };
        }
        if (result.settings.announcement_bar?.value) {
          settings.announcement_bar = {
            ...settings.announcement_bar,
            ...result.settings.announcement_bar.value
          };
        }
      }
    }
    if (shipmentResponse.ok) {
      const shipmentResult = await shipmentResponse.json();
      if (shipmentResult.settings) {
        settings.next_shipment_date = shipmentResult.settings.next_shipment_date || null;
        settings.next_shipment_date_end = shipmentResult.settings.next_shipment_date_end || null;
      }
    }

    // Set up event delegation
    setupProjectManagementEvents();

    renderProjectManagementContent();
  } catch (error) {
    console.error('Error loading project management:', error);
    content.innerHTML = `
      <div class="empty-state">
        <h3>Ошибка загрузки</h3>
        <p>Не удалось загрузить настройки</p>
        <button class="btn btn-primary" data-action="reload-settings">Повторить</button>
      </div>
    `;
  }
}

// Returns true if the current user can access a projectManagement subtab.
// Admins always can. Editors need projectManagement.enabled and the specific
// sub-permission not explicitly set to false (undefined → allowed by default).
function pmSubtabAllowed(permKey) {
  if (isAdmin()) return true;
  const pm = state.editorPermissions?.projectManagement;
  if (!pm?.enabled) return false;
  return pm[permKey] !== false;
}

function renderProjectManagementContent() {
  const content = document.getElementById('content');

  content.innerHTML = `
    ${createPageHeader({ title: 'Управление проектом', refreshAction: 'refresh-settings' })}

    <!-- Subtabs Navigation -->
    <div class="tabs-carousel" style="margin-bottom: var(--spacing-md);">
      <div class="tabs-container">
        ${pmSubtabAllowed('canAccessOrders') ? `<button class="tab-btn ${currentSubtab === 'orders' ? 'active' : ''}" data-action="switch-pm-subtab" data-subtab="orders">
          <span class="tab-icon">${SVGIcons.cart}</span>
          <span class="tab-label">Заказы</span>
        </button>` : ''}
        ${pmSubtabAllowed('canAccessEstimates') ? `<button class="tab-btn ${currentSubtab === 'estimates' ? 'active' : ''}" data-action="switch-pm-subtab" data-subtab="estimates">
          <span class="tab-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg></span>
          <span class="tab-label">Оценки</span>
        </button>` : ''}
        ${pmSubtabAllowed('canAccessFaq') ? `<button class="tab-btn ${currentSubtab === 'faq' ? 'active' : ''}" data-action="switch-pm-subtab" data-subtab="faq">
          <span class="tab-icon">${SVGIcons.helpCircle}</span>
          <span class="tab-label">FAQ</span>
        </button>` : ''}
        ${pmSubtabAllowed('canAccessStories') ? `<button class="tab-btn ${currentSubtab === 'stories' ? 'active' : ''}" data-action="switch-pm-subtab" data-subtab="stories">
          <span class="tab-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg></span>
          <span class="tab-label">Stories</span>
        </button>` : ''}
        ${pmSubtabAllowed('canAccessPost') ? `<button class="tab-btn ${currentSubtab === 'post' ? 'active' : ''}" data-action="switch-pm-subtab" data-subtab="post">
          <span class="tab-icon">${SVGIcons.send || '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>'}</span>
          <span class="tab-label">Пост</span>
        </button>` : ''}
        ${pmSubtabAllowed('canAccessNotifications') ? `<button class="tab-btn ${currentSubtab === 'notifications' ? 'active' : ''}" data-action="switch-pm-subtab" data-subtab="notifications">
          <span class="tab-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg></span>
          <span class="tab-label">Уведомления</span>
        </button>` : ''}
        ${pmSubtabAllowed('canAccessBots') ? `<button class="tab-btn ${currentSubtab === 'bots' ? 'active' : ''}" data-action="switch-pm-subtab" data-subtab="bots">
          <span class="tab-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="9" cy="16" r="1"/><circle cx="15" cy="16" r="1"/><path d="M12 2v4M8 7h8a2 2 0 012 2v2H6V9a2 2 0 012-2z"/></svg></span>
          <span class="tab-label">Боты</span>
        </button>` : ''}
        ${pmSubtabAllowed('canAccessGiveaway') ? `<button class="tab-btn ${currentSubtab === 'giveaway' ? 'active' : ''}" data-action="switch-pm-subtab" data-subtab="giveaway">
          <span class="tab-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/></svg></span>
          <span class="tab-label">Розыгрыш</span>
        </button>` : ''}
        ${pmSubtabAllowed('canAccessSite') ? `<button class="tab-btn ${currentSubtab === 'site' ? 'active' : ''}" data-action="switch-pm-subtab" data-subtab="site">
          <span class="tab-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg></span>
          <span class="tab-label">Сайт</span>
        </button>` : ''}
        ${pmSubtabAllowed('canAccessIpRights') ? `<button class="tab-btn ${currentSubtab === 'ip-rights' ? 'active' : ''}" data-action="switch-pm-subtab" data-subtab="ip-rights">
          <span class="tab-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></span>
          <span class="tab-label">IP-права</span>
        </button>` : ''}
        ${pmSubtabAllowed('canAccessDeliveryStorage') ? `<button class="tab-btn ${currentSubtab === 'delivery-storage' ? 'active' : ''}" data-action="switch-pm-subtab" data-subtab="delivery-storage">
          <span class="tab-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg></span>
          <span class="tab-label">Хранение</span>
        </button>` : ''}
        ${pmSubtabAllowed('canAccessModeration') ? `<button class="tab-btn ${currentSubtab === 'moderation' ? 'active' : ''}" data-action="switch-pm-subtab" data-subtab="moderation">
          <span class="tab-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg></span>
          <span class="tab-label">Модерация</span>
        </button>` : ''}
        ${isAdmin() ? `
        <button class="tab-btn ${currentSubtab === 'editor' ? 'active' : ''}" data-action="switch-pm-subtab" data-subtab="editor">
          <span class="tab-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg></span>
          <span class="tab-label">Редактор</span>
        </button>
        ` : ''}
      </div>
    </div>

    <!-- Subtab Content -->
    <div id="subtab-content">
      ${renderSubtabContent()}
    </div>
  `;
}

function renderSubtabContent() {
  // Map subtab keys to their permission keys and render functions
  const subtabMap = {
    orders: ['canAccessOrders', renderOrdersSubtab],
    estimates: ['canAccessEstimates', renderEstimatesSubtab],
    faq: ['canAccessFaq', renderFaqSubtab],
    stories: ['canAccessStories', renderStoriesSubtab],
    post: ['canAccessPost', renderPostSubtab],
    notifications: ['canAccessNotifications', renderNotificationsSubtab],
    bots: ['canAccessBots', renderBotsSubtab],
    giveaway: ['canAccessGiveaway', renderGiveawaySubtab],
    site: ['canAccessSite', renderSiteSubtab],
    'ip-rights': ['canAccessIpRights', renderIpRightsSubtab],
    'delivery-storage': ['canAccessDeliveryStorage', renderDeliveryStorageSubtab],
    moderation: ['canAccessModeration', renderModerationSubtab],
  };

  if (currentSubtab === 'editor') {
    return isAdmin() ? renderEditorSubtab() : renderOrdersSubtab();
  }

  const entry = subtabMap[currentSubtab];
  if (entry) {
    const [permKey, renderFn] = entry;
    return pmSubtabAllowed(permKey) ? renderFn() : renderOrdersSubtab();
  }

  return renderOrdersSubtab();
}

// ============================================================================
// DELIVERY STORAGE SUBTAB
// ============================================================================

let deliveryStorageSettings = null;
let deliveryStorageLoaded = false;

function renderDeliveryStorageSubtab() {
  if (!deliveryStorageLoaded) {
    loadDeliveryStorageSettings();
    return `
      <div class="loading-spinner">
        <div class="spinner"></div>
        <p>Загрузка настроек...</p>
      </div>
    `;
  }

  const s = deliveryStorageSettings || { cdek: { pvz: 7, courier: 3 }, pochta: { standard: 30, express: 15, courier: 7 } };

  return `
    <div class="card" style="margin-bottom: var(--spacing-md);">
      <div class="card-header">
        <h3 class="card-title">Сроки хранения посылок</h3>
      </div>
      <div class="card-body">
        <p style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: var(--spacing-md);">
          Когда посылка прибывает в пункт выдачи, пользователь получает уведомление и на странице заказа запускается таймер.
          Каждые 5 дней отправляется напоминание, пока заказ не будет получен или не истечёт срок хранения.
        </p>

        <!-- CDEK -->
        <div style="margin-bottom: var(--spacing-lg);">
          <h4 style="margin: 0 0 var(--spacing-sm) 0; font-size: 0.9375rem; display: flex; align-items: center; gap: var(--spacing-sm);">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
            СДЭК
          </h4>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--spacing-sm);">
            <div class="form-group">
              <label class="form-label">ПВЗ / Постамат (дней)</label>
              <input type="number" id="storage-cdek-pvz" class="form-input" value="${s.cdek?.pvz ?? 7}" min="1" max="180">
            </div>
            <div class="form-group">
              <label class="form-label">Курьер (дней)</label>
              <input type="number" id="storage-cdek-courier" class="form-input" value="${s.cdek?.courier ?? 3}" min="1" max="180">
            </div>
          </div>
        </div>

        <!-- Pochta -->
        <div style="margin-bottom: var(--spacing-lg);">
          <h4 style="margin: 0 0 var(--spacing-sm) 0; font-size: 0.9375rem; display: flex; align-items: center; gap: var(--spacing-sm);">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            Почта России
          </h4>
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: var(--spacing-sm);">
            <div class="form-group">
              <label class="form-label">Обычная (дней)</label>
              <input type="number" id="storage-pochta-standard" class="form-input" value="${s.pochta?.standard ?? 30}" min="1" max="180">
            </div>
            <div class="form-group">
              <label class="form-label">1 класс / EMS (дней)</label>
              <input type="number" id="storage-pochta-express" class="form-input" value="${s.pochta?.express ?? 15}" min="1" max="180">
            </div>
            <div class="form-group">
              <label class="form-label">Курьер (дней)</label>
              <input type="number" id="storage-pochta-courier" class="form-input" value="${s.pochta?.courier ?? 7}" min="1" max="180">
            </div>
          </div>
        </div>

        <button class="btn btn-primary" data-action="save-storage-settings">
          Сохранить
        </button>
      </div>
    </div>

    <div class="card" style="background: var(--bg-tertiary); border: 1px solid var(--border-color); margin-bottom: 80px;">
      <div class="card-body" style="padding: var(--spacing-md);">
        <h4 style="margin: 0 0 var(--spacing-sm) 0; font-size: 0.875rem;">Что происходит при возврате посылки</h4>
        <ul style="margin: 0; padding-left: var(--spacing-lg); font-size: 0.813rem; color: var(--text-secondary);">
          <li>Пользователь получает уведомление о возврате</li>
          <li>На странице заказа появляются два варианта: повторная доставка (2× цена) или отмена с возвратом за товары</li>
          <li>Выбор пользователя отображается в деталях заказа — обработайте его вручную</li>
          <li>Для повторной доставки создайте новое отправление через обычный рабочий процесс</li>
        </ul>
      </div>
    </div>
  `;
}

async function loadDeliveryStorageSettings() {
  try {
    const { apiGet } = await import('./utils/apiClient.js');
    const response = await apiGet('/api/admin/parcel-storage-settings');
    if (response.ok) {
      const result = await response.json();
      deliveryStorageSettings = result.settings;
    }
  } catch (err) {
    console.error('Error loading storage settings:', err);
  } finally {
    deliveryStorageLoaded = true;
    const subtabContent = document.getElementById('subtab-content');
    if (subtabContent && currentSubtab === 'delivery-storage') {
      subtabContent.innerHTML = renderDeliveryStorageSubtab();
    }
  }
}

async function saveDeliveryStorageSettings() {
  const getValue = (id, fallback) => {
    const el = document.getElementById(id);
    return el ? parseInt(el.value) || fallback : fallback;
  };

  const settings = {
    cdek: {
      pvz: getValue('storage-cdek-pvz', 7),
      courier: getValue('storage-cdek-courier', 3)
    },
    pochta: {
      standard: getValue('storage-pochta-standard', 30),
      express: getValue('storage-pochta-express', 15),
      courier: getValue('storage-pochta-courier', 7)
    }
  };

  try {
    const { apiPut } = await import('./utils/apiClient.js');
    const { showToast } = await import('./utils.js');
    const response = await apiPut('/api/admin/parcel-storage-settings', settings);
    if (response.ok) {
      const result = await response.json();
      deliveryStorageSettings = result.settings;
      showToast('Настройки сохранены', 'success');
    } else {
      const err = await response.json();
      showToast(err.error || 'Ошибка сохранения', 'error');
    }
  } catch (err) {
    console.error('Error saving storage settings:', err);
    const { showToast } = await import('./utils.js');
    showToast('Ошибка сохранения', 'error');
  }
}

// ============ IP RIGHTS SUBTAB ============

function renderIpRightsSubtab() {
  if (!ipRightsLoaded) {
    loadIpRights();
    return `<div class="loading-spinner"><div class="spinner"></div></div>`;
  }

  const pending   = ipRightsData?.pending   || [];
  const confirmed = ipRightsData?.confirmed || [];
  const dismissed = ipRightsData?.dismissed || [];
  const manual    = ipRightsData?.manual    || [];
  const scan      = ipRightsData?.scanStatus || null;

  const STALE_MS = 35 * 60 * 1000;
  const lastUpdate = scan?.last_update || scan?.started_at;
  const isStale = scan?.running && lastUpdate && (Date.now() - new Date(lastUpdate).getTime()) > STALE_MS;
  const isRunning = scan?.running === true && !isStale;

  // Progress bar / status block
  let scanStatusHtml = '';
  if (isStale) {
    const staleAt = lastUpdate ? new Date(lastUpdate).toLocaleString('ru-RU') : '?';
    scanStatusHtml = `
      <div style="margin-top:10px;padding:10px 14px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--border-color)">
        <div style="font-size:13px;color:var(--text-secondary)">Проверка зависла (последнее обновление: ${staleAt}). Нажмите «Сбросить» — потом можно запустить заново.</div>
      </div>`;
  } else if (isRunning) {
    const done  = scan.terms_done  || 0;
    const total = scan.terms_total || '?';
    const pct   = total > 0 ? Math.round(done / total * 100) : 0;
    const found = scan.new_findings || 0;
    const doneTerms = scan.searched_terms || [];
    const termResults = scan.term_results || [];
    const trMap = new Map(termResults.map(r => [r.term, r]));
    const currentTerm = scan.current_term || null;
    const pendingCount = typeof total === 'number'
      ? Math.max(0, total - doneTerms.length - (currentTerm ? 1 : 0))
      : null;
    const doneLines = doneTerms.map(t => {
      const r = trMap.get(t);
      if (r?.error) return `<div style="color:var(--status-error)">✕ ${escHtml(t)} — ошибка: ${escHtml(r.error)}</div>`;
      const badge = r ? ` <span style="color:var(--text-tertiary)">(ФИПС: ${r.hits}${r.new ? `, новых: ${r.new}` : ''})</span>` : '';
      return `<div style="color:var(--status-success)">✓ ${escHtml(t)}${badge}</div>`;
    }).join('');
    const currentLine = currentTerm
      ? `<div style="font-weight:600">▶ ${escHtml(currentTerm)}</div>`
      : '';
    const pendingLine = pendingCount
      ? `<div style="color:var(--text-tertiary)">○ ещё ${pendingCount} терм.</div>`
      : '';
    scanStatusHtml = `
      <div style="margin-top:10px;padding:10px 14px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--border-color)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-size:13px">
          <span>Проверяется… <strong>${done}</strong> / ${total} терминов</span>
          <span style="color:var(--text-secondary)">Найдено: ${found}</span>
        </div>
        <div style="height:6px;background:var(--border-color);border-radius:3px;overflow:hidden;margin-bottom:8px">
          <div style="height:100%;width:${pct}%;background:var(--accent);border-radius:3px;transition:width .4s"></div>
        </div>
        <div style="font-size:12px;line-height:1.8;max-height:200px;overflow-y:auto;word-break:break-word">${doneLines}${currentLine}${pendingLine}</div>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:6px">Страница обновляется каждые 10 секунд. Можно закрыть браузер — проверка продолжится.</div>
      </div>`;
  } else if (scan?.last_completed) {
    const completedAt = new Date(scan.last_completed).toLocaleString('ru-RU');
    const cancelNote = scan.cancelled ? ' (остановлена)' : '';
    const errNote = scan.error ? ` — ошибка: ${escHtml(scan.error)}` : '';
    const foundNote = scan.new_findings != null ? `. Найдено: ${scan.new_findings}` : '';
    const termsCount = scan.terms_done != null ? `. Проверено: ${scan.terms_done}` : '';
    const completedTermResults = scan.term_results || [];
    const completedTrMap = new Map(completedTermResults.map(r => [r.term, r]));
    const termsList = (scan.searched_terms && scan.searched_terms.length) ? `
      <div style="font-size:12px;line-height:1.8;margin-top:6px;max-height:200px;overflow-y:auto;word-break:break-word">
        ${scan.searched_terms.map(t => {
          const r = completedTrMap.get(t);
          if (r?.error) return `<div style="color:var(--status-error)">✕ ${escHtml(t)} — ${escHtml(r.error)}</div>`;
          const badge = r ? ` <span style="color:var(--text-tertiary)">(ФИПС: ${r.hits}${r.new ? `, новых: ${r.new}` : ''})</span>` : '';
          return `<div style="color:var(--text-secondary)">✓ ${escHtml(t)}${badge}</div>`;
        }).join('')}
      </div>` : '';
    scanStatusHtml = `
      <div style="margin-top:10px;padding:10px 14px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--border-color)">
        <div style="font-size:12px;color:var(--text-secondary)">Последняя проверка: ${completedAt}${cancelNote}${foundNote}${termsCount}${errNote}</div>
        ${termsList}
      </div>`;
  }

  const pendingBadge = pending.length
    ? `<span class="badge badge-danger" style="margin-left:6px">${pending.length}</span>`
    : '';

  const pendingHtml = pending.length ? `
    <div class="card">
      <div class="card-header"><strong>Ожидают проверки${pendingBadge}</strong></div>
      <div class="card-body" style="padding:0">
        ${pending.map(c => `
          <div class="ip-rights-row" style="padding:12px 16px;border-bottom:1px solid var(--border-color)">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
              <div style="flex:1;min-width:0">
                <div style="font-weight:600;word-break:break-word">${escHtml(c.trademark_name || c.search_term)}</div>
                ${c.holder_name ? `<div style="font-size:13px;color:var(--text-secondary);margin-top:2px">Правообладатель: ${escHtml(c.holder_name)}</div>` : ''}
                ${c.goods_classes && c.goods_classes.length ? `<div style="font-size:12px;color:var(--text-secondary)">Классы МКТУ: ${c.goods_classes.join(', ')}</div>` : ''}
                <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">Поисковый термин: <em>${escHtml(c.search_term)}</em></div>
                <div style="font-size:12px;margin-top:4px">
                  <a href="${escHtml(c.fips_url || '')}" target="_blank" rel="noopener" style="color:var(--accent)">Открыть на ФИПС ↗</a>
                </div>
              </div>
              <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
                <button class="btn btn-sm btn-danger" data-action="ip-rights-dismiss" data-id="${escHtml(c.id)}">Отклонить</button>
                <button class="btn btn-sm btn-primary" data-action="ip-rights-confirm" data-id="${escHtml(c.id)}">Подтвердить</button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  ` : `<div class="card"><div class="card-body" style="color:var(--text-secondary)">Новых совпадений нет.</div></div>`;

  const confirmedHtml = confirmed.length ? `
    <details style="margin-top:12px">
      <summary style="cursor:pointer;font-weight:600;padding:8px 0">Подтверждённые риски (${confirmed.length})</summary>
      <div class="card" style="margin-top:8px">
        ${confirmed.map(c => `
          <div style="padding:10px 16px;border-bottom:1px solid var(--border-color)">
            <strong>${escHtml(c.trademark_name || c.search_term)}</strong>
            ${c.holder_name ? ` — ${escHtml(c.holder_name)}` : ''}
            ${c.notes ? `<div style="font-size:12px;color:var(--text-secondary)">${escHtml(c.notes)}</div>` : ''}
            <div style="font-size:12px"><a href="${escHtml(c.fips_url || '')}" target="_blank" rel="noopener" style="color:var(--accent)">ФИПС ↗</a></div>
          </div>
        `).join('')}
      </div>
    </details>
  ` : '';

  const dismissedHtml = dismissed.length ? `
    <details style="margin-top:8px">
      <summary style="cursor:pointer;font-weight:600;padding:8px 0;color:var(--text-secondary)">Отклонённые / ложные срабатывания (${dismissed.length})</summary>
      <div class="card" style="margin-top:8px">
        ${dismissed.map(c => `
          <div style="padding:8px 16px;border-bottom:1px solid var(--border-color);font-size:13px;color:var(--text-secondary)">
            ${escHtml(c.trademark_name || c.search_term)}
            ${c.holder_name ? ` — ${escHtml(c.holder_name)}` : ''}
            ${c.dismissed_by ? ` <span style="opacity:.6">(отклонил: ${escHtml(c.dismissed_by)})</span>` : ''}
          </div>
        `).join('')}
      </div>
    </details>
  ` : '';

  const manualFormHtml = ipRightsShowManualForm ? `
    <div class="card" style="margin-top:12px">
      <div class="card-header"><strong>Добавить запись</strong></div>
      <div class="card-body">
        <div class="form-group">
          <label>Название IP</label>
          <input type="text" id="ip-manual-name" class="form-control" placeholder="Например: Наруто">
        </div>
        <div class="form-group">
          <label>Правообладатель</label>
          <input type="text" id="ip-manual-holder" class="form-control" placeholder="ООО Пример">
        </div>
        <div class="form-group">
          <label>Источник (URL)</label>
          <input type="text" id="ip-manual-url" class="form-control" placeholder="https://fips.ru/...">
        </div>
        <div class="form-group">
          <label>Заметки</label>
          <textarea id="ip-manual-notes" class="form-control" rows="2" placeholder="Необязательно"></textarea>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary" data-action="ip-manual-save">Сохранить</button>
          <button class="btn btn-secondary" data-action="ip-manual-form-hide">Отмена</button>
        </div>
      </div>
    </div>
  ` : '';

  const manualListHtml = manual.length ? `
    <div class="card" style="margin-top:8px">
      ${manual.map(m => `
        <div style="padding:10px 16px;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
          <div style="flex:1">
            <strong>${escHtml(m.ip_name)}</strong>
            <span style="color:var(--text-secondary)"> — ${escHtml(m.holder_name)}</span>
            ${m.source_url ? `<div style="font-size:12px"><a href="${escHtml(m.source_url)}" target="_blank" rel="noopener" style="color:var(--accent)">Источник ↗</a></div>` : ''}
            ${m.notes ? `<div style="font-size:12px;color:var(--text-secondary)">${escHtml(m.notes)}</div>` : ''}
          </div>
          <button class="btn btn-sm btn-secondary" data-action="ip-manual-delete" data-id="${escHtml(m.id)}">Удалить</button>
        </div>
      `).join('')}
    </div>
  ` : `<div style="font-size:13px;color:var(--text-secondary);margin-top:8px">Записей нет.</div>`;

  return `
    <!-- Run check -->
    <div class="card">
      <div class="card-body" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        ${isRunning
          ? `<button class="btn btn-danger" data-action="ip-rights-cancel">Остановить</button>`
          : isStale
            ? `<button class="btn btn-secondary" data-action="ip-rights-cancel">Сбросить</button>`
            : `
              <button class="btn btn-primary" data-action="ip-rights-run-check">Запустить проверку ФИПС</button>
              ${scan?.searched_terms?.length ? `<button class="btn btn-secondary" data-action="ip-rights-run-partial-check" title="Пропустить уже проверенные термины (${scan.searched_terms.length} шт.)">Проверить новые</button>` : ''}
            `
        }
        ${!isRunning && !isStale ? `<span style="font-size:13px;color:var(--text-secondary)">Запрос на каждый термин с задержкой 5 с. Можно закрыть страницу.</span>` : ''}
        <button class="btn btn-sm btn-secondary" data-action="ip-rights-reload" style="margin-left:auto">Обновить</button>
      </div>
      ${scanStatusHtml}
    </div>

    <!-- Pending matches -->
    <div style="margin-top:12px">
      ${pendingHtml}
    </div>

    ${confirmedHtml}
    ${dismissedHtml}

    <!-- Manual list -->
    <div style="margin-top:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <strong>Ручной список правообладателей</strong>
        ${!ipRightsShowManualForm ? `<button class="btn btn-sm btn-secondary" data-action="ip-manual-form-show">+ Добавить</button>` : ''}
      </div>
      ${manualFormHtml}
      ${manualListHtml}
    </div>
  `;
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let ipRightsPollTimer = null;

async function loadIpRights() {
  try {
    const resp = await apiGet('/api/admin/ip-rights');
    if (resp.ok) {
      ipRightsData = await resp.json();
    } else {
      ipRightsData = { checks: [], pending: [], confirmed: [], dismissed: [], falsePositives: [], manual: [], scanStatus: null };
    }
  } catch (err) {
    console.error('loadIpRights error:', err);
    ipRightsData = { checks: [], pending: [], confirmed: [], dismissed: [], falsePositives: [], manual: [], scanStatus: null };
  }
  ipRightsLoaded = true;

  const subtabContent = document.getElementById('subtab-content');
  if (subtabContent && currentSubtab === 'ip-rights') {
    subtabContent.innerHTML = renderIpRightsSubtab();
  }

  // Auto-poll while a scan is running
  const isRunning = ipRightsData?.scanStatus?.running === true;
  if (isRunning && !ipRightsPollTimer) {
    ipRightsPollTimer = setInterval(() => {
      if (currentSubtab !== 'ip-rights') {
        clearInterval(ipRightsPollTimer);
        ipRightsPollTimer = null;
        return;
      }
      ipRightsLoaded = false;
      loadIpRights();
    }, 10000);
  } else if (!isRunning && ipRightsPollTimer) {
    clearInterval(ipRightsPollTimer);
    ipRightsPollTimer = null;
  }
}

async function runIpRightsCheck(partial = false) {
  try {
    const url = partial ? '/api/cron/check-ip-rights?partial=true' : '/api/cron/check-ip-rights';
    const resp = await apiGet(url);
    if (resp.ok) {
      const data = await resp.json();
      if (data.status === 'already_running') {
        showToast('Проверка уже идёт', 'info');
      } else {
        showToast('Проверка запущена', 'success');
      }
      // Reload to pick up scan status and start polling
      ipRightsLoaded = false;
      await loadIpRights();
    } else {
      showError('Ошибка при запуске проверки');
    }
  } catch (err) {
    showError('Ошибка запроса');
  }
}

async function cancelIpRightsScan() {
  try {
    const resp = await apiPost('/api/admin/ip-rights/scan-cancel', {});
    if (resp.ok) {
      ipRightsLoaded = false;
      await loadIpRights();
    } else {
      showError('Не удалось остановить проверку');
    }
  } catch (err) {
    showError('Ошибка запроса');
  }
}

async function dismissIpCheck(id) {
  try {
    const resp = await apiPost('/api/admin/ip-rights/dismiss', { id });
    if (resp.ok) {
      ipRightsLoaded = false;
      await loadIpRights();
    } else {
      showError('Не удалось отклонить');
    }
  } catch (err) {
    showError('Ошибка запроса');
  }
}

async function confirmIpCheck(id) {
  try {
    const resp = await apiPost('/api/admin/ip-rights/confirm', { id });
    if (resp.ok) {
      ipRightsLoaded = false;
      await loadIpRights();
    } else {
      showError('Не удалось подтвердить');
    }
  } catch (err) {
    showError('Ошибка запроса');
  }
}

async function saveIpManual() {
  const ipName  = document.getElementById('ip-manual-name')?.value?.trim();
  const holder  = document.getElementById('ip-manual-holder')?.value?.trim();
  const url     = document.getElementById('ip-manual-url')?.value?.trim();
  const notes   = document.getElementById('ip-manual-notes')?.value?.trim();

  if (!ipName || !holder) {
    showError('Укажите название IP и правообладателя');
    return;
  }

  try {
    const resp = await apiPost('/api/admin/ip-rights/manual', {
      ip_name: ipName,
      holder_name: holder,
      source_url: url || null,
      notes: notes || null,
    });
    if (resp.ok) {
      ipRightsShowManualForm = false;
      ipRightsLoaded = false;
      await loadIpRights();
    } else {
      showError('Ошибка сохранения');
    }
  } catch (err) {
    showError('Ошибка запроса');
  }
}

async function deleteIpManual(id) {
  try {
    const resp = await apiPost('/api/admin/ip-rights/manual/delete', { id });
    if (resp.ok) {
      ipRightsLoaded = false;
      await loadIpRights();
    } else {
      showError('Не удалось удалить');
    }
  } catch (err) {
    showError('Ошибка запроса');
  }
}

// ============ END IP RIGHTS ============

function renderSiteSubtab() {
  return `
    <!-- Announcement Bar Section -->
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Announcement Bar</h3>
      </div>
      <div class="card-body">
        <div class="toggle-row">
          <div class="toggle-label">
            <span class="toggle-title">Показывать строку объявлений</span>
            <span class="toggle-subtitle">${settings.announcement_bar.enabled ? 'Активна' : 'Скрыта'}</span>
          </div>
          <label class="toggle-switch">
            <input type="checkbox"
                   id="announcement-bar-toggle"
                   ${settings.announcement_bar.enabled ? 'checked' : ''}
                   data-action="toggle-announcement-bar">
            <span class="toggle-slider"></span>
          </label>
        </div>

        <div style="margin-top: var(--spacing-md);">
          <label style="font-size: 0.813rem; color: var(--text-secondary); display: block; margin-bottom: var(--spacing-xs);">Текст объявления</label>
          <textarea id="announcement-bar-text"
                    rows="4"
                    style="width: 100%; padding: var(--spacing-sm); background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text-primary); font-size: 0.875rem; resize: vertical; font-family: inherit;"
                    placeholder="Текст объявления...">${settings.announcement_bar.text || ''}</textarea>
        </div>

        <div style="margin-top: var(--spacing-sm);">
          <button class="btn btn-primary" data-action="save-announcement-bar" style="width: 100%;">Сохранить</button>
        </div>
      </div>
    </div>

    <!-- Emergency Mode Section -->
    <div class="card ${settings.emergency_mode.enabled ? 'emergency-active' : ''}">
      <div class="card-header">
        <h3 class="card-title" style="display: flex; align-items: center; gap: var(--spacing-sm);">
          <span class="icon-wrapper" style="width: 20px; height: 20px; color: var(--error);">${SVGIcons.emergency}</span>
          Режим экстренного скрытия
        </h3>
      </div>
      <div class="card-body">
        <div class="toggle-row">
          <div class="toggle-label">
            <span class="toggle-title">Экстренный режим</span>
            <span class="toggle-subtitle ${settings.emergency_mode.enabled ? 'text-danger' : ''}">
              ${settings.emergency_mode.enabled ? 'АКТИВЕН' : 'Выключен'}
            </span>
          </div>
          <label class="toggle-switch">
            <input type="checkbox"
                   id="emergency-mode-toggle"
                   ${settings.emergency_mode.enabled ? 'checked' : ''}
                   data-action="toggle-emergency">
            <span class="toggle-slider ${settings.emergency_mode.enabled ? 'danger' : ''}"></span>
          </label>
        </div>

        ${settings.emergency_mode.enabled && settings.emergency_mode.activated_at ? `
          <div style="margin-top: var(--spacing-sm); padding: var(--spacing-sm); background: var(--error-bg); border-radius: var(--radius-sm); font-size: 0.75rem; color: var(--error);">
            Активирован: ${new Date(settings.emergency_mode.activated_at).toLocaleString('ru-RU')}
          </div>
        ` : ''}

        <div style="margin-top: var(--spacing-md); padding: var(--spacing-sm); background: var(--bg-tertiary); border-radius: var(--radius-sm); font-size: 0.813rem; color: var(--text-secondary);">
          <p style="margin: 0;">При включении экстренного режима:</p>
          <ul style="margin: var(--spacing-xs) 0 0 var(--spacing-md); padding: 0;">
            <li>Все изображения товаров будут скрыты</li>
            <li>Названия товаров будут заменены</li>
            <li>Эффект виден всем пользователям</li>
          </ul>
        </div>
      </div>
    </div>
  `;
}

// Editor permissions state
let editorPermissionsState = null;
let editorPermissionsLoaded = false;

function renderEditorSubtab() {
  // Load editor permissions if not loaded
  if (!editorPermissionsLoaded) {
    loadEditorPermissions();
    return `
      <div class="loading-spinner">
        <div class="spinner"></div>
        <p>Загрузка настроек редактора...</p>
      </div>
    `;
  }

  const perms = editorPermissionsState || {};

  // Define all tabs with their subtabs
  const tabsConfig = [
    {
      key: 'feed',
      title: 'Лента',
      subtitle: 'Просмотр ленты активности',
      icon: '<path d="M4 6h16M4 12h16M4 18h16"/>',
      warning: '⚠️ Редактор НЕ видит заказы в ленте (отзывы, комментарии, предложения)',
      subtabs: null // No subtabs, just toggle
    },
    {
      key: 'orders',
      title: 'Заказы',
      subtitle: 'Управление заказами',
      icon: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/>',
      warning: null,
      subtabs: [
        { key: 'canAccessOrders', label: 'Заказы' },
        { key: 'canAccessCertificates', label: 'Сертификаты' },
        { key: 'canAccessPromos', label: 'Промо-коды' },
        { key: 'canAccessTemplates', label: 'Шаблоны' }
      ]
    },
    {
      key: 'products',
      title: 'Товары',
      subtitle: 'Управление товарами',
      icon: '<path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 11-8 0"/>',
      warning: '⚠️ Редактор НЕ может удалять товары (ставить статус "Не в продаже")',
      subtabs: [
        { key: 'canAccessProducts', label: 'Товары' },
        { key: 'canAccessCatalogs', label: 'Каталоги' },
        { key: 'canAccessTemplates', label: 'Шаблоны' }
      ]
    },
    {
      key: 'statistics',
      title: 'Статистика',
      subtitle: 'Просмотр аналитики',
      icon: '<path d="M18 20V10M12 20V4M6 20v-6"/>',
      warning: null,
      subtabs: [
        { key: 'canAccessOverview', label: 'Обзор' },
        { key: 'canAccessRevenue', label: 'Выручка' },
        { key: 'canAccessOrders', label: 'Заказы' },
        { key: 'canAccessShipping', label: 'Доставка' },
        { key: 'canAccessCustomers', label: 'Клиенты' },
        { key: 'canAccessProducts', label: 'Товары' },
        { key: 'canAccessAuthors', label: 'Авторы' },
        { key: 'canAccessServices', label: 'Сервисы' }
      ]
    },
    {
      key: 'projectManagement',
      title: 'Управление проектом',
      subtitle: 'Настройки и конфигурация',
      icon: '<circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 6v6m5.196-15.928l-4.24 4.24m0 5.656l4.24 4.24M23 12h-6m-6 0H1m15.928-5.196l-4.24 4.24m0 0l-4.24 4.24M18.364 5.636l-4.24 4.24m-5.656 0l-4.24-4.24"/>',
      warning: '⚠️ Редакторы НЕ могут управлять настройками редактора (всегда только админ)',
      subtabs: [
        { key: 'canAccessOrders', label: 'Настройки заказов' },
        { key: 'canAccessEstimates', label: 'Оценки' },
        { key: 'canAccessFaq', label: 'FAQ' },
        { key: 'canAccessStories', label: 'Stories' },
        { key: 'canAccessPost', label: 'Публикация в канале' },
        { key: 'canAccessNotifications', label: 'Уведомления' },
        { key: 'canAccessBots', label: 'Боты' },
        { key: 'canAccessGiveaway', label: 'Розыгрыш' },
        { key: 'canAccessSite', label: 'Настройки сайта' },
        { key: 'canAccessIpRights', label: 'IP-права' },
        { key: 'canAccessDeliveryStorage', label: 'Хранение' },
        { key: 'canAccessModeration', label: 'Модерация' }
        // Note: canAccessEditor is intentionally excluded - always false for editors
      ]
    }
  ];

  // Helper function to render a tab card
  const renderTabCard = (config) => {
    const tabPerms = perms[config.key] || {};
    const isEnabled = tabPerms.enabled || false;

    return `
      <div class="card" style="margin-bottom: var(--spacing-md); background: var(--bg-tertiary);">
        <div class="card-body" style="padding: var(--spacing-md);">
          <!-- Main toggle -->
          <div class="toggle-row" style="margin-bottom: ${config.warning || config.subtabs ? 'var(--spacing-sm)' : '0'};">
            <div class="toggle-label">
              <span class="toggle-title">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" style="display: inline-block; vertical-align: middle; margin-right: 6px;">
                  ${config.icon}
                </svg>
                ${config.title}
              </span>
              <span class="toggle-subtitle">${config.subtitle}</span>
            </div>
            <label class="toggle-switch">
              <input type="checkbox"
                     id="editor-perm-${config.key}"
                     ${isEnabled ? 'checked' : ''}
                     data-action="toggle-editor-perm"
                     data-perm-key="${config.key}">
              <span class="toggle-slider"></span>
            </label>
          </div>

          <!-- Subtabs (if any) - always shown for configuration -->
          ${config.subtabs ? `
            <div style="margin-top: var(--spacing-md); padding-left: var(--spacing-md); border-left: 2px solid var(--border-color); ${!isEnabled ? 'opacity: 0.5;' : ''}">
              <div style="font-size: 0.8125rem; font-weight: 500; color: var(--text-secondary); margin-bottom: var(--spacing-xs);">
                Доступные подразделы:
                ${!isEnabled ? '<span style="color: var(--warning); font-weight: 400; margin-left: 8px;">(включите основной раздел для активации)</span>' : ''}
              </div>
              ${config.subtabs.map(subtab => `
                <label style="display: flex; align-items: center; gap: var(--spacing-xs); margin-bottom: var(--spacing-xs); cursor: pointer;">
                  <input type="checkbox"
                         ${tabPerms[subtab.key] !== false ? 'checked' : ''}
                         ${!isEnabled ? 'disabled' : ''}
                         data-action="toggle-editor-subperm"
                         data-perm-key="${config.key}"
                         data-subperm-key="${subtab.key}"
                         style="cursor: ${!isEnabled ? 'not-allowed' : 'pointer'};">
                  <span style="font-size: 0.8125rem; color: var(--text-secondary);">${subtab.label}</span>
                </label>
              `).join('')}
            </div>
          ` : ''}

          <!-- Warning (if any) -->
          ${config.warning ? `
            <div style="font-size: 0.75rem; color: var(--text-tertiary); padding-left: var(--spacing-md); margin-top: var(--spacing-sm);">
              <span style="color: var(--warning);">${config.warning}</span>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  };

  return `
    <!-- Editor Permissions Section -->
    <div class="card">
      <div class="card-header">
        <h3 class="card-title" style="display: flex; align-items: center; gap: var(--spacing-sm);">
          <span class="icon-wrapper" style="width: 20px; height: 20px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
            </svg>
          </span>
          Настройки роли Редактора
        </h3>
      </div>
      <div class="card-body">
        <p style="color: var(--text-secondary); margin-bottom: var(--spacing-md); font-size: 0.875rem;">
          Выберите, какие разделы и функции доступны для пользователя с ролью "Редактор".
          Редактор входит через отдельный логин/пароль (EDITOR_USERNAME / EDITOR_PASSWORD).
        </p>

        <!-- Render all tabs -->
        ${tabsConfig.map(renderTabCard).join('')}

        <!-- Save Button -->
        <div style="margin-top: var(--spacing-lg); text-align: right;">
          <button class="btn btn-primary" data-action="save-editor-permissions">
            Сохранить настройки
          </button>
        </div>
      </div>
    </div>

    <!-- Info Card -->
    <div class="card" style="background: var(--bg-tertiary); border: 1px solid var(--border-color);">
      <div class="card-body" style="padding: var(--spacing-md);">
        <h4 style="margin: 0 0 var(--spacing-sm) 0; font-size: 0.875rem;">Ограничения для редактора:</h4>
        <ul style="margin: 0; padding-left: var(--spacing-lg); font-size: 0.813rem; color: var(--text-secondary);">
          <li>Не может получить доступ к функциям без явного разрешения</li>
          <li>Не может удалять товары (устанавливать статус "Не в продаже")</li>
          <li>Не может просматривать раздел "Управление проектом"</li>
          <li>Доступ к подразделам настраивается отдельно для каждого раздела</li>
        </ul>
      </div>
    </div>
  `;
}

async function loadEditorPermissions() {
  try {
    const response = await apiGet('/api/admin/editor/settings');
    if (response.ok) {
      const result = await response.json();
      editorPermissionsState = result.permissions;
      editorPermissionsLoaded = true;
      // Re-render the subtab
      const subtabContent = document.getElementById('subtab-content');
      if (subtabContent && currentSubtab === 'editor') {
        subtabContent.innerHTML = renderEditorSubtab();
      }
    } else {
      // API returned an error
      editorPermissionsLoaded = true; // Mark as loaded to show error state
      editorPermissionsState = null;
      const subtabContent = document.getElementById('subtab-content');
      if (subtabContent && currentSubtab === 'editor') {
        subtabContent.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">${SVGIcons.alert}</div>
            <h3>Ошибка загрузки</h3>
            <p>Не удалось загрузить настройки редактора</p>
            <button class="btn btn-primary mt-sm" data-action="reload-editor-settings">Повторить</button>
          </div>
        `;
      }
    }
  } catch (error) {
    console.error('Error loading editor permissions:', error);
    editorPermissionsLoaded = true; // Mark as loaded to show error state
    const subtabContent = document.getElementById('subtab-content');
    if (subtabContent && currentSubtab === 'editor') {
      subtabContent.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">${SVGIcons.alert}</div>
          <h3>Ошибка загрузки</h3>
          <p>${error.message || 'Не удалось загрузить настройки редактора'}</p>
          <button class="btn btn-primary mt-sm" data-action="reload-editor-settings">Повторить</button>
        </div>
      `;
    }
  }
}

async function saveEditorPermissions() {
  try {
    // Helper to get checkbox value
    const getCheckboxValue = (selector) => {
      const elem = document.querySelector(selector);
      return elem ? elem.checked : false;
    };

    // Collect permission states from checkboxes
    const permissions = {
      feed: {
        enabled: document.getElementById('editor-perm-feed')?.checked || false,
        showOrders: false // Editor can never see orders
      },

      orders: {
        enabled: document.getElementById('editor-perm-orders')?.checked || false,
        canAccessOrders: getCheckboxValue('[data-perm-key="orders"][data-subperm-key="canAccessOrders"]'),
        canAccessCertificates: getCheckboxValue('[data-perm-key="orders"][data-subperm-key="canAccessCertificates"]'),
        canAccessPromos: getCheckboxValue('[data-perm-key="orders"][data-subperm-key="canAccessPromos"]'),
        canAccessTemplates: getCheckboxValue('[data-perm-key="orders"][data-subperm-key="canAccessTemplates"]')
      },

      products: {
        enabled: document.getElementById('editor-perm-products')?.checked || false,
        canDelete: false, // Editor can never delete
        canAccessProducts: getCheckboxValue('[data-perm-key="products"][data-subperm-key="canAccessProducts"]'),
        canAccessCatalogs: getCheckboxValue('[data-perm-key="products"][data-subperm-key="canAccessCatalogs"]'),
        canAccessTemplates: getCheckboxValue('[data-perm-key="products"][data-subperm-key="canAccessTemplates"]')
      },

      statistics: {
        enabled: document.getElementById('editor-perm-statistics')?.checked || false,
        canAccessOverview: getCheckboxValue('[data-perm-key="statistics"][data-subperm-key="canAccessOverview"]'),
        canAccessRevenue: getCheckboxValue('[data-perm-key="statistics"][data-subperm-key="canAccessRevenue"]'),
        canAccessOrders: getCheckboxValue('[data-perm-key="statistics"][data-subperm-key="canAccessOrders"]'),
        canAccessShipping: getCheckboxValue('[data-perm-key="statistics"][data-subperm-key="canAccessShipping"]'),
        canAccessCustomers: getCheckboxValue('[data-perm-key="statistics"][data-subperm-key="canAccessCustomers"]'),
        canAccessProducts: getCheckboxValue('[data-perm-key="statistics"][data-subperm-key="canAccessProducts"]'),
        canAccessAuthors: getCheckboxValue('[data-perm-key="statistics"][data-subperm-key="canAccessAuthors"]'),
        canAccessServices: getCheckboxValue('[data-perm-key="statistics"][data-subperm-key="canAccessServices"]')
      },

      projectManagement: {
        enabled: document.getElementById('editor-perm-projectManagement')?.checked || false,
        canAccessOrders: getCheckboxValue('[data-perm-key="projectManagement"][data-subperm-key="canAccessOrders"]'),
        canAccessEstimates: getCheckboxValue('[data-perm-key="projectManagement"][data-subperm-key="canAccessEstimates"]'),
        canAccessFaq: getCheckboxValue('[data-perm-key="projectManagement"][data-subperm-key="canAccessFaq"]'),
        canAccessStories: getCheckboxValue('[data-perm-key="projectManagement"][data-subperm-key="canAccessStories"]'),
        canAccessPost: getCheckboxValue('[data-perm-key="projectManagement"][data-subperm-key="canAccessPost"]'),
        canAccessNotifications: getCheckboxValue('[data-perm-key="projectManagement"][data-subperm-key="canAccessNotifications"]'),
        canAccessBots: getCheckboxValue('[data-perm-key="projectManagement"][data-subperm-key="canAccessBots"]'),
        canAccessGiveaway: getCheckboxValue('[data-perm-key="projectManagement"][data-subperm-key="canAccessGiveaway"]'),
        canAccessSite: getCheckboxValue('[data-perm-key="projectManagement"][data-subperm-key="canAccessSite"]'),
        canAccessIpRights: getCheckboxValue('[data-perm-key="projectManagement"][data-subperm-key="canAccessIpRights"]'),
        canAccessDeliveryStorage: getCheckboxValue('[data-perm-key="projectManagement"][data-subperm-key="canAccessDeliveryStorage"]'),
        canAccessModeration: getCheckboxValue('[data-perm-key="projectManagement"][data-subperm-key="canAccessModeration"]'),
        canAccessEditor: false // Always false - admin only
      }
    };

    const response = await apiPost('/api/admin/editor/settings', { permissions });

    if (response.ok) {
      const result = await response.json();
      editorPermissionsState = result.permissions;
      showToast('Настройки редактора сохранены', 'success');
    } else {
      const errorData = await response.json();
      showError(errorData.message || 'Ошибка сохранения');
    }
  } catch (error) {
    console.error('Error saving editor permissions:', error);
    showError('Ошибка сохранения настроек редактора');
  }
}

function renderDeliveryProviderGroup({ providerKey, providerMethod, services, deliveryMethods, showManualMode = false }) {
  const providerEnabled = providerMethod?.enabled !== false;
  return `
    <div style="border-bottom: 1px solid var(--border-color);">
      <div class="toggle-row" style="padding: var(--spacing-sm) var(--spacing-md);">
        <div class="toggle-label">
          <span class="toggle-title">${providerMethod?.name || providerKey}</span>
          <span class="toggle-subtitle ${providerEnabled ? 'text-success' : 'text-warning'}">
            ${providerEnabled ? 'Доступен' : 'Недоступен'}
          </span>
        </div>
        <label class="toggle-switch">
          <input type="checkbox"
                 ${providerEnabled ? 'checked' : ''}
                 data-action="toggle-delivery"
                 data-delivery-key="${providerKey}">
          <span class="toggle-slider"></span>
        </label>
      </div>
      ${showManualMode ? `
      <div class="toggle-row" style="padding: var(--spacing-xs) var(--spacing-md) var(--spacing-xs) calc(var(--spacing-md) + var(--spacing-lg)); background: var(--bg-tertiary);">
        <div class="toggle-label">
          <span class="toggle-title" style="font-size: 0.875rem;">Ручной расчёт</span>
          <span class="toggle-subtitle ${providerMethod?.manual_mode ? 'text-warning' : 'text-success'}" style="font-size: 0.75rem;">
            ${providerMethod?.manual_mode ? 'Включён (API отключён)' : 'Выключен (используется API)'}
          </span>
        </div>
        <label class="toggle-switch">
          <input type="checkbox"
                 ${providerMethod?.manual_mode ? 'checked' : ''}
                 data-action="toggle-pochta-manual"
                 id="pochta-manual-toggle">
          <span class="toggle-slider"></span>
        </label>
      </div>
      ${providerMethod?.manual_mode ? `
      <div style="padding: var(--spacing-xs) var(--spacing-md); background: var(--bg-tertiary); font-size: 0.75rem; color: var(--status-warning);">
        ⚠️ API расчёта Почты отключён. Стоимость нужно вводить вручную в каждом заказе.
      </div>
      ` : ''}
      ` : ''}
      ${services.map(svc => {
        const svcEnabled = deliveryMethods[svc.key]?.enabled !== false;
        return `
        <div class="toggle-row" style="padding: var(--spacing-xs) var(--spacing-md) var(--spacing-xs) calc(var(--spacing-md) + var(--spacing-lg)); background: var(--bg-tertiary); border-top: 1px solid var(--divider);">
          <div class="toggle-label">
            <span class="toggle-title" style="font-size: 0.875rem;">${svc.label}</span>
            <span class="toggle-subtitle ${svcEnabled ? 'text-success' : 'text-warning'}" style="font-size: 0.75rem;">
              ${svcEnabled ? 'Вкл' : 'Откл'}
            </span>
          </div>
          <label class="toggle-switch" style="transform: scale(0.85); transform-origin: right center;">
            <input type="checkbox"
                   ${svcEnabled ? 'checked' : ''}
                   data-action="toggle-delivery"
                   data-delivery-key="${svc.key}">
            <span class="toggle-slider"></span>
          </label>
        </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderOrdersSubtab() {
  return `
    <!-- Order Submission Section -->
    <div class="card">
      <div class="card-header">
        <h3 class="card-title" style="display: flex; align-items: center; gap: var(--spacing-sm);">
          <span class="icon-wrapper" style="width: 20px; height: 20px;">${SVGIcons.cart}</span>
          Оформление заказов
        </h3>
      </div>
      <div class="card-body">
        <div class="toggle-row">
          <div class="toggle-label">
            <span class="toggle-title">Прием заказов</span>
            <span class="toggle-subtitle ${settings.order_submission.enabled ? 'text-success' : 'text-warning'}">
              ${settings.order_submission.enabled ? 'Включен' : 'Отключен'}
            </span>
          </div>
          <label class="toggle-switch">
            <input type="checkbox"
                   id="order-submission-toggle"
                   ${settings.order_submission.enabled ? 'checked' : ''}
                   data-action="toggle-order-submission">
            <span class="toggle-slider"></span>
          </label>
        </div>

        <div class="form-group" style="margin-top: var(--spacing-md);">
          <label class="form-label" style="font-size: 0.813rem;">Сообщение при отключении:</label>
          <textarea id="order-disabled-message"
                    class="form-input"
                    rows="2"
                    style="font-size: 0.875rem;"
                    placeholder="Причина отключения заказов...">${settings.order_submission.disabled_message || ''}</textarea>
          <button class="btn btn-secondary btn-sm" style="margin-top: var(--spacing-sm);" data-action="save-order-message">
            Сохранить сообщение
          </button>
        </div>
      </div>
    </div>

    <!-- Cart Limits Section -->
    <div class="card">
      <div class="card-header">
        <h3 class="card-title" style="display: flex; align-items: center; gap: var(--spacing-sm);">
          <span class="icon-wrapper" style="width: 20px; height: 20px;">${SVGIcons.cart}</span>
          Лимит суммы корзины
        </h3>
      </div>
      <div class="card-body">
        <p style="color: var(--text-secondary); margin-bottom: var(--spacing-md); font-size: 0.875rem;">
          Покупатель не сможет добавить товар, если сумма корзины превысит указанный лимит.
        </p>
        <div class="form-group">
          <label class="form-label" style="font-size: 0.813rem;">Макс. сумма корзины (₽)</label>
          <input type="number" id="cart-limit-total-price" class="form-input"
                 min="0" step="1000"
                 value="${settings.cart_limits.max_cart_total}"
                 style="font-size: 0.875rem;">
        </div>
        <button class="btn btn-primary" data-action="save-cart-limits" style="margin-top: var(--spacing-md); width: 100%;">
          Сохранить лимит
        </button>
      </div>
    </div>

    <!-- Delivery Methods Section -->
    <div class="card">
      <div class="card-header">
        <h3 class="card-title" style="display: flex; align-items: center; gap: var(--spacing-sm);">
          <span class="icon-wrapper" style="width: 20px; height: 20px;">${SVGIcons.truck}</span>
          Способы доставки
        </h3>
      </div>
      <div class="card-body" style="padding: 0;">

        ${/* CDEK provider */ ''}
        ${renderDeliveryProviderGroup({
          providerKey: 'cdek',
          providerMethod: settings.delivery_methods.cdek,
          services: [
            { key: 'cdek_pvz', label: 'До ПВЗ' },
            { key: 'cdek_pvz_express', label: 'До ПВЗ Экспресс' },
            { key: 'cdek_courier', label: 'Курьер' }
          ],
          deliveryMethods: settings.delivery_methods
        })}

        ${/* Pochta provider */ ''}
        ${renderDeliveryProviderGroup({
          providerKey: 'pochta',
          providerMethod: settings.delivery_methods.pochta,
          services: [
            { key: 'pochta_standard', label: 'До отделения' },
            { key: 'pochta_courier', label: 'Курьер Почты' },
            { key: 'pochta_first_class', label: '1 класс' },
            { key: 'courier_ems', label: 'EMS (курьер)' }
          ],
          deliveryMethods: settings.delivery_methods,
          showManualMode: true
        })}

        ${/* International */ ''}
        <div class="toggle-row" style="padding: var(--spacing-sm) var(--spacing-md); border-bottom: 1px solid var(--border-color);">
          <div class="toggle-label">
            <span class="toggle-title">Международная доставка</span>
            <span class="toggle-subtitle ${settings.delivery_methods.international?.enabled !== false ? 'text-success' : 'text-warning'}">
              ${settings.delivery_methods.international?.enabled !== false ? 'Доступна' : 'Недоступна'}
            </span>
          </div>
          <label class="toggle-switch">
            <input type="checkbox"
                   ${settings.delivery_methods.international?.enabled !== false ? 'checked' : ''}
                   data-action="toggle-delivery"
                   data-delivery-key="international">
            <span class="toggle-slider"></span>
          </label>
        </div>

      </div>
    </div>

    <!-- Delivery Rounding Settings Section -->
    <div class="card">
      <div class="card-header">
        <h3 class="card-title" style="display: flex; align-items: center; gap: var(--spacing-sm);">
          <span class="icon-wrapper" style="width: 20px; height: 20px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v6l4 2"/>
            </svg>
          </span>
          Округление стоимости доставки
        </h3>
      </div>
      <div class="card-body">
        <p style="color: var(--text-secondary); margin-bottom: var(--spacing-md); font-size: 0.875rem;">
          Настройка округления для удобных цен. Маленькие заказы округляются вниз (в пользу клиента).
        </p>

        <div style="display: grid; gap: var(--spacing-md);">
          <div class="form-group">
            <label class="form-label" style="font-size: 0.813rem;">Порог маленького заказа (₽)</label>
            <div style="display: flex; gap: var(--spacing-sm); align-items: center;">
              <input type="number" id="rounding-small-threshold" class="form-input"
                     value="${settings.delivery_rounding.small_order_threshold}"
                     min="0" step="100" style="width: 120px;">
              <span style="font-size: 0.75rem; color: var(--text-tertiary);">
                Заказы меньше этой суммы — округление вниз
              </span>
            </div>
          </div>

          <div style="background: var(--bg-tertiary); border-radius: var(--radius-md); padding: var(--spacing-md);">
            <div style="font-size: 0.813rem; font-weight: 600; margin-bottom: var(--spacing-sm);">Шаги округления</div>
            <div style="display: grid; grid-template-columns: 1fr auto; gap: var(--spacing-xs); font-size: 0.813rem;">
              <span style="color: var(--text-secondary);">Маленькие заказы (round):</span>
              <div style="display: flex; align-items: center; gap: 4px;">
                <input type="number" id="rounding-small-step" class="form-input"
                       value="${settings.delivery_rounding.small_order_step}"
                       min="10" step="10" style="width: 60px; padding: 4px 8px; font-size: 0.813rem;">
                <span>₽</span>
              </div>

              <span style="color: var(--text-secondary);">Большие заказы (ceil):</span>
              <div style="display: flex; align-items: center; gap: 4px;">
                <input type="number" id="rounding-big-step" class="form-input"
                       value="${settings.delivery_rounding.big_order_step}"
                       min="10" step="10" style="width: 60px; padding: 4px 8px; font-size: 0.813rem;">
                <span>₽</span>
              </div>
            </div>
          </div>

          <div style="background: var(--bg-tertiary); border-radius: var(--radius-md); padding: var(--spacing-md);">
            <div style="font-size: 0.813rem; font-weight: 600; margin-bottom: var(--spacing-sm);">Дорогая доставка (для маленьких заказов)</div>
            <p style="font-size: 0.75rem; color: var(--text-tertiary); margin-bottom: var(--spacing-sm);">
              Когда доставка дороже X% от заказа — округляем вниз агрессивнее
            </p>
            <div style="display: grid; grid-template-columns: 1fr auto; gap: var(--spacing-xs); font-size: 0.813rem;">
              <span style="color: var(--text-secondary);">Порог &gt;${Math.round(settings.delivery_rounding.high_ratio_threshold * 100)}% (floor):</span>
              <div style="display: flex; align-items: center; gap: 4px;">
                <input type="number" id="rounding-ratio-threshold" class="form-input"
                       value="${Math.round(settings.delivery_rounding.high_ratio_threshold * 100)}"
                       min="10" max="100" step="5" style="width: 50px; padding: 4px 8px; font-size: 0.813rem;">
                <span>%</span>
                <span style="margin: 0 4px;">→</span>
                <input type="number" id="rounding-ratio-step" class="form-input"
                       value="${settings.delivery_rounding.high_ratio_step}"
                       min="50" step="50" style="width: 60px; padding: 4px 8px; font-size: 0.813rem;">
                <span>₽</span>
              </div>

              <span style="color: var(--text-secondary);">Порог &gt;${Math.round(settings.delivery_rounding.very_high_ratio_threshold * 100)}% (floor):</span>
              <div style="display: flex; align-items: center; gap: 4px;">
                <input type="number" id="rounding-very-high-threshold" class="form-input"
                       value="${Math.round(settings.delivery_rounding.very_high_ratio_threshold * 100)}"
                       min="10" max="100" step="5" style="width: 50px; padding: 4px 8px; font-size: 0.813rem;">
                <span>%</span>
                <span style="margin: 0 4px;">→</span>
                <input type="number" id="rounding-very-high-step" class="form-input"
                       value="${settings.delivery_rounding.very_high_ratio_step}"
                       min="50" step="50" style="width: 60px; padding: 4px 8px; font-size: 0.813rem;">
                <span>₽</span>
              </div>
            </div>
          </div>

          <button class="btn btn-primary" data-action="save-rounding-settings" style="width: 100%;">
            Сохранить настройки округления
          </button>
        </div>
      </div>
    </div>

    <!-- Next Shipment Date Section -->
    <div class="card">
      <div class="card-header">
        <h3 class="card-title" style="display: flex; align-items: center; gap: var(--spacing-sm);">
          <span class="icon-wrapper" style="width: 20px; height: 20px;">${SVGIcons.calendar || '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'}</span>
          Следующая отправка
        </h3>
      </div>
      <div class="card-body">
        <p style="color: var(--text-secondary); margin-bottom: var(--spacing-md); font-size: 0.875rem;">
          Дата или период следующей отправки заказов. Отображается в панели заказов.
        </p>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--spacing-sm); margin-bottom: var(--spacing-sm);">
          <div class="form-group" style="margin: 0;">
            <label class="form-label" style="font-size: 0.75rem;">С</label>
            <input type="date"
                   id="next-shipment-date-input"
                   class="form-input"
                   value="${settings.next_shipment_date || ''}">
          </div>
          <div class="form-group" style="margin: 0;">
            <label class="form-label" style="font-size: 0.75rem;">По (необязательно)</label>
            <input type="date"
                   id="next-shipment-date-end-input"
                   class="form-input"
                   value="${settings.next_shipment_date_end || ''}">
          </div>
        </div>
        <button class="btn btn-primary" data-action="save-shipment-date">
          Сохранить
        </button>
        ${settings.next_shipment_date ? `
          <p style="margin-top: var(--spacing-sm); color: var(--text-secondary); font-size: 0.813rem;">
            📦 ${settings.next_shipment_date_end && settings.next_shipment_date_end !== settings.next_shipment_date
              ? `${formatDateRussian(settings.next_shipment_date)} — ${formatDateRussian(settings.next_shipment_date_end)}`
              : formatDateRussian(settings.next_shipment_date)}
          </p>
        ` : `
          <p style="margin-top: var(--spacing-sm); color: var(--status-warning); font-size: 0.813rem;">
            ⚠️ Дата отправки не установлена
          </p>
        `}
      </div>
    </div>

    <!-- Packaging Configuration Section -->
    <div class="card">
      <div class="card-header" style="cursor: pointer;" data-action="toggle-packaging-section">
        <h3 class="card-title" style="display: flex; align-items: center; gap: var(--spacing-sm);">
          <span class="icon-wrapper" style="width: 20px; height: 20px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
              <line x1="12" y1="22.08" x2="12" y2="12"/>
            </svg>
          </span>
          Упаковка и вес товаров
          <span id="packaging-section-chevron" style="margin-left: auto; transition: transform 0.2s; ${packagingSectionExpanded ? 'transform: rotate(180deg);' : ''}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </span>
        </h3>
      </div>
      <div class="card-body" id="packaging-section-content" style="display: ${packagingSectionExpanded ? 'block' : 'none'};">
        <div id="packaging-inline-container">
          ${packagingLoaded ? renderPackagingContent() : `
            <div class="loading-spinner" style="padding: var(--spacing-md);">
              <div class="spinner"></div>
              <p>Загрузка конфигурации...</p>
            </div>
          `}
        </div>
      </div>
    </div>
  `;
}

function renderPackagingContent() {
  const { packaging, weights, capacityLimits } = packagingConfig;

  // Separate tubes and cartons for display
  const tubes = packaging.filter(p => !p.is_carton);
  const cartons = packaging.filter(p => p.is_carton);

  // Group weights by format
  const framelessWeights = weights.filter(w => w.frame_type === 'no_frame');
  const framedWeights = weights.filter(w => w.frame_type !== 'no_frame');

  return `
    <p style="color: var(--text-secondary); margin-bottom: var(--spacing-md); font-size: 0.875rem;">
      Настройка параметров упаковки, веса товаров и вместимости для расчёта доставки.
    </p>

    <!-- Packaging Types -->
    <div style="background: var(--bg-tertiary); border-radius: var(--radius-md); padding: var(--spacing-md); margin-bottom: var(--spacing-md);">
      <div style="font-size: 0.875rem; font-weight: 600; margin-bottom: var(--spacing-sm); display: flex; align-items: center; gap: var(--spacing-xs);">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
        </svg>
        Типы упаковки
      </div>

      <!-- Tubes -->
      <div style="font-size: 0.813rem; font-weight: 500; color: var(--text-secondary); margin: var(--spacing-sm) 0;">Тубусы</div>
      <div style="display: grid; gap: var(--spacing-sm);">
        ${tubes.map(pkg => renderPackagingRow(pkg)).join('')}
      </div>

      <!-- Cartons -->
      <div style="font-size: 0.813rem; font-weight: 500; color: var(--text-secondary); margin: var(--spacing-md) 0 var(--spacing-sm);">Картонные коробки</div>
      <div style="display: grid; gap: var(--spacing-sm);">
        ${cartons.map(pkg => renderPackagingRow(pkg)).join('')}
      </div>
    </div>

    <!-- Product Weights -->
    <div style="background: var(--bg-tertiary); border-radius: var(--radius-md); padding: var(--spacing-md); margin-bottom: var(--spacing-md);">
      <div style="font-size: 0.875rem; font-weight: 600; margin-bottom: var(--spacing-sm); display: flex; align-items: center; gap: var(--spacing-xs);">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M8 12h8M12 8v8"/>
        </svg>
        Вес товаров (граммы)
      </div>

      <div style="font-size: 0.813rem; font-weight: 500; color: var(--text-secondary); margin-bottom: var(--spacing-xs);">Без рамки</div>
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: var(--spacing-sm); margin-bottom: var(--spacing-md);">
        ${framelessWeights.map(w => renderWeightInput(w)).join('')}
      </div>

      <div style="font-size: 0.813rem; font-weight: 500; color: var(--text-secondary); margin-bottom: var(--spacing-xs);">В рамке</div>
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: var(--spacing-sm);">
        ${framedWeights.map(w => renderWeightInput(w)).join('')}
      </div>
    </div>

    <!-- Capacity Limits -->
    <div style="background: var(--bg-tertiary); border-radius: var(--radius-md); padding: var(--spacing-md); margin-bottom: var(--spacing-md);">
      <div style="font-size: 0.875rem; font-weight: 600; margin-bottom: var(--spacing-sm); display: flex; align-items: center; gap: var(--spacing-xs);">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <path d="M3 9h18M9 21V9"/>
        </svg>
        Вместимость упаковки (макс. штук)
      </div>
      <p style="font-size: 0.75rem; color: var(--text-tertiary); margin-bottom: var(--spacing-sm);">
        Максимальное количество товаров каждого формата в одной упаковке.
      </p>
      ${renderCapacityLimits(capacityLimits)}
    </div>

    <button class="btn btn-primary" data-action="save-packaging-config" style="width: 100%;">
      Сохранить настройки упаковки
    </button>
  `;
}

function renderPackagingRow(pkg) {
  return `
    <div style="display: grid; grid-template-columns: 1fr auto auto auto; gap: var(--spacing-sm); align-items: center; padding: var(--spacing-xs) 0; border-bottom: 1px solid var(--border-color);" data-packaging-code="${pkg.code}">
      <div>
        <span style="font-size: 0.813rem; font-weight: 500;">${pkg.display_name}</span>
        <span style="font-size: 0.688rem; color: var(--text-tertiary); margin-left: 4px;">(${pkg.code})</span>
      </div>
      <div style="display: flex; align-items: center; gap: 4px;">
        <input type="number" class="form-input packaging-cost-input"
               value="${pkg.cost}"
               min="0" step="10"
               data-code="${pkg.code}"
               style="width: 70px; padding: 4px 6px; font-size: 0.813rem;">
        <span style="font-size: 0.75rem; color: var(--text-tertiary);">₽</span>
      </div>
      <div style="display: flex; align-items: center; gap: 4px;">
        <input type="number" class="form-input packaging-weight-input"
               value="${pkg.weight_grams}"
               min="0" step="10"
               data-code="${pkg.code}"
               style="width: 70px; padding: 4px 6px; font-size: 0.813rem;">
        <span style="font-size: 0.75rem; color: var(--text-tertiary);">г</span>
      </div>
      <div style="display: flex; align-items: center; gap: 4px; font-size: 0.75rem; color: var(--text-tertiary);">
        ${pkg.dimensions_length_cm || 0}×${pkg.dimensions_width_cm || 0}×${pkg.dimensions_height_cm || 0}см
      </div>
    </div>
  `;
}

function renderWeightInput(weight) {
  const formatLabel = weight.format || 'A3';
  const frameLabel = weight.frame_type === 'no_frame' ? '' :
    weight.frame_type === 'white_frame' ? ' (бел.)' :
    weight.frame_type === 'black_frame' ? ' (черн.)' :
    weight.frame_type === 'natural_frame' ? ' (натур.)' : '';

  return `
    <div style="display: flex; flex-direction: column; gap: 2px;">
      <label style="font-size: 0.75rem; color: var(--text-secondary);">${formatLabel}${frameLabel}</label>
      <div style="display: flex; align-items: center; gap: 4px;">
        <input type="number" class="form-input product-weight-input"
               value="${weight.weight_grams || 0}"
               min="0" step="10"
               data-id="${weight.id}"
               style="width: 80px; padding: 4px 6px; font-size: 0.813rem;">
        <span style="font-size: 0.75rem; color: var(--text-tertiary);">г</span>
      </div>
    </div>
  `;
}

function renderCapacityLimits(limits) {
  const tubeTypes = ['tube_a3', 'tube_a2', 'tube_a1'];
  const cartonTypes = ['half_carton', 'full_carton'];

  const tubeLabels = {
    tube_a3: 'Тубус А3',
    tube_a2: 'Тубус А2',
    tube_a1: 'Тубус А1'
  };

  const cartonLabels = {
    half_carton: 'Полукартон',
    full_carton: 'Картон'
  };

  return `
    <div style="font-size: 0.813rem; margin-bottom: var(--spacing-sm);">
      <strong>Тубусы</strong>
      <table style="width: 100%; margin-top: var(--spacing-xs); border-collapse: collapse; font-size: 0.75rem;">
        <tr style="color: var(--text-tertiary);">
          <th style="text-align: left; padding: 4px;">Тип</th>
          <th style="text-align: center; padding: 4px;">A3</th>
          <th style="text-align: center; padding: 4px;">A2</th>
          <th style="text-align: center; padding: 4px;">A1</th>
        </tr>
        ${tubeTypes.map(type => {
          const limit = limits[type] || { a3: 0, a2: 0, a1: 0 };
          return `
            <tr>
              <td style="padding: 4px;">${tubeLabels[type]}</td>
              <td style="text-align: center; padding: 4px;">
                <input type="number" class="form-input capacity-input"
                       value="${limit.a3 || 0}" min="0" max="20"
                       data-type="${type}" data-format="a3"
                       style="width: 50px; padding: 2px 4px; font-size: 0.75rem; text-align: center;">
              </td>
              <td style="text-align: center; padding: 4px;">
                <input type="number" class="form-input capacity-input"
                       value="${limit.a2 || 0}" min="0" max="20"
                       data-type="${type}" data-format="a2"
                       style="width: 50px; padding: 2px 4px; font-size: 0.75rem; text-align: center;">
              </td>
              <td style="text-align: center; padding: 4px;">
                <input type="number" class="form-input capacity-input"
                       value="${limit.a1 || 0}" min="0" max="20"
                       data-type="${type}" data-format="a1"
                       style="width: 50px; padding: 2px 4px; font-size: 0.75rem; text-align: center;">
              </td>
            </tr>
          `;
        }).join('')}
      </table>
    </div>

    <div style="font-size: 0.813rem;">
      <strong>Картоны</strong>
      <table style="width: 100%; margin-top: var(--spacing-xs); border-collapse: collapse; font-size: 0.75rem;">
        <tr style="color: var(--text-tertiary);">
          <th style="text-align: left; padding: 4px;">Тип</th>
          <th style="text-align: center; padding: 4px;">A3 рамка</th>
          <th style="text-align: center; padding: 4px;">A2 рамка</th>
          <th style="text-align: center; padding: 4px;">A3 без</th>
        </tr>
        ${cartonTypes.map(type => {
          const limit = limits[type] || { a3Framed: 0, a2Framed: 0, a3Frameless: 0 };
          return `
            <tr>
              <td style="padding: 4px;">${cartonLabels[type]}</td>
              <td style="text-align: center; padding: 4px;">
                <input type="number" class="form-input capacity-input"
                       value="${limit.a3Framed || 0}" min="0" max="20"
                       data-type="${type}" data-format="a3Framed"
                       style="width: 50px; padding: 2px 4px; font-size: 0.75rem; text-align: center;">
              </td>
              <td style="text-align: center; padding: 4px;">
                <input type="number" class="form-input capacity-input"
                       value="${limit.a2Framed || 0}" min="0" max="20"
                       data-type="${type}" data-format="a2Framed"
                       style="width: 50px; padding: 2px 4px; font-size: 0.75rem; text-align: center;">
              </td>
              <td style="text-align: center; padding: 4px;">
                <input type="number" class="form-input capacity-input"
                       value="${limit.a3Frameless || 0}" min="0" max="20"
                       data-type="${type}" data-format="a3Frameless"
                       style="width: 50px; padding: 2px 4px; font-size: 0.75rem; text-align: center;">
              </td>
            </tr>
          `;
        }).join('')}
      </table>
    </div>
  `;
}

function renderPostSubtab() {
  const channelOptions = (channelPostChannels || []).map(ch =>
    `<option value="${ch.id}" ${channelPostSelectedChannelId === ch.id ? 'selected' : ''}>${ch.name || ch.id}</option>`
  ).join('');

  return `
    <!-- Channel Post Section -->
    <div class="card" id="channel-post-section">
      <div class="card-header">
        <h3 class="card-title" style="display: flex; align-items: center; gap: var(--spacing-sm);">
          <span class="icon-wrapper" style="width: 20px; height: 20px;">${SVGIcons.send || '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>'}</span>
          Отправить в канал
        </h3>
      </div>
      <div class="card-body" id="channel-section-content">

        ${channelOptions ? `
        <!-- Channel selector -->
        <div class="form-group">
          <label class="form-label">Канал</label>
          <select id="channel-post-channel-select" class="form-input">
            ${channelOptions}
          </select>
        </div>
        ` : `
        <div style="margin-bottom: var(--spacing-md); padding: var(--spacing-sm); background: var(--bg-tertiary); border-radius: var(--radius-sm); font-size: 0.875rem; color: var(--text-secondary);">
          Канал не настроен. Добавьте канал в разделе «Розыгрыш».
        </div>
        `}

        <!-- Parse mode selector -->
        <div class="form-group">
          <label class="form-label">Форматирование</label>
          <div style="display: flex; gap: var(--spacing-xs);">
            <button class="btn btn-sm ${channelPostParseMode === 'HTML' ? 'btn-primary' : 'btn-secondary'}" data-action="channel-set-parse-mode" data-mode="HTML">HTML</button>
            <button class="btn btn-sm ${channelPostParseMode === 'Markdown' ? 'btn-primary' : 'btn-secondary'}" data-action="channel-set-parse-mode" data-mode="Markdown">Markdown</button>
            <button class="btn btn-sm ${channelPostParseMode === 'MarkdownV2' ? 'btn-primary' : 'btn-secondary'}" data-action="channel-set-parse-mode" data-mode="MarkdownV2">MarkdownV2</button>
            <button class="btn btn-sm ${channelPostParseMode === '' ? 'btn-primary' : 'btn-secondary'}" data-action="channel-set-parse-mode" data-mode="">Без разметки</button>
          </div>
          ${channelPostParseMode === 'HTML' ? `<p style="font-size: 0.75rem; color: var(--text-tertiary); margin-top: 4px;">Поддерживаются: &lt;b&gt; &lt;i&gt; &lt;u&gt; &lt;s&gt; &lt;code&gt; &lt;pre&gt; &lt;a href="..."&gt;</p>` : ''}
          ${channelPostParseMode === 'Markdown' ? `<p style="font-size: 0.75rem; color: var(--text-tertiary); margin-top: 4px;">*жирный* _курсив_ \`код\` [текст](url)</p>` : ''}
          ${channelPostParseMode === 'MarkdownV2' ? `<p style="font-size: 0.75rem; color: var(--text-tertiary); margin-top: 4px;">Спецсимволы ( _ * [ ] ( ) ~ \` > # + - = | { } . ! ) нужно экранировать \\</p>` : ''}
        </div>

        <!-- Text input -->
        <div class="form-group">
          <label class="form-label">Текст</label>
          <textarea
            id="channel-message"
            class="form-textarea"
            placeholder="${channelPostParseMode === 'HTML' ? '<b>Жирный</b> текст, <i>курсив</i>, <a href="https://...">ссылка</a>' : channelPostParseMode === 'Markdown' ? '*жирный* _курсив_ [ссылка](https://...)' : 'Текст сообщения...'}"
            style="min-height: 150px; width: 100%; border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-primary); color: var(--text-primary); padding: var(--spacing-sm); font-family: ${channelPostParseMode !== '' ? 'monospace' : 'inherit'}; resize: vertical; font-size: 0.875rem;"
          ></textarea>
        </div>

        <!-- Options row -->
        <div style="display: flex; flex-wrap: wrap; gap: var(--spacing-md); margin-bottom: var(--spacing-md);">
          <label style="display: flex; align-items: center; gap: var(--spacing-xs); cursor: pointer; font-size: 0.875rem; user-select: none;">
            <input type="checkbox" id="channel-silent" ${channelPostSilent ? 'checked' : ''} data-action="channel-toggle-silent">
            <span>Без звука</span>
          </label>
          <label style="display: flex; align-items: center; gap: var(--spacing-xs); cursor: pointer; font-size: 0.875rem; user-select: none;">
            <input type="checkbox" id="channel-no-preview" ${channelPostNoPreview ? 'checked' : ''} data-action="channel-toggle-no-preview">
            <span>Без превью ссылок</span>
          </label>
        </div>

        <!-- Action buttons row -->
        <div style="display: flex; gap: var(--spacing-sm); margin-bottom: var(--spacing-md);">
          <button class="btn btn-secondary btn-sm channel-action-btn" data-action="channel-trigger-image" title="Добавить изображение">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <circle cx="8.5" cy="8.5" r="1.5"></circle>
              <polyline points="21 15 16 10 5 21"></polyline>
            </svg>
          </button>
          <input type="file" id="channel-image" accept="image/*" style="display: none;">

          <button class="btn btn-secondary btn-sm channel-action-btn" data-action="channel-toggle-schedule" title="Запланировать публикацию">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
          </button>
        </div>

        <!-- Image preview -->
        <div id="channel-image-preview" style="margin-bottom: var(--spacing-md);"></div>

        <!-- Schedule input -->
        <div id="channel-schedule-input" style="display: none; margin-bottom: var(--spacing-md);">
          <div style="display: flex; align-items: center; gap: var(--spacing-sm);">
            <input type="datetime-local" id="channel-schedule-time" class="form-input" style="flex: 1;">
            <button class="btn btn-secondary btn-xs" data-action="channel-clear-schedule" title="Отменить">×</button>
          </div>
        </div>

        <div id="channel-schedule-display" style="display: none; margin-bottom: var(--spacing-md); padding: var(--spacing-sm); background: var(--bg-tertiary); border-radius: var(--radius-sm); font-size: 0.875rem; color: var(--text-secondary);"></div>

        <!-- Buttons section -->
        <div style="margin-bottom: var(--spacing-md);">
          <div style="font-size: 0.875rem; font-weight: 600; color: var(--text-secondary); margin-bottom: var(--spacing-sm);">Кнопки</div>

          <div id="channel-shop-button-container" style="${channelShopButtonEnabled ? '' : 'display: none;'}">
            <div class="channel-button-item" style="display: flex; align-items: center; gap: var(--spacing-sm); padding: var(--spacing-sm); background: var(--bg-secondary); border-radius: var(--radius-sm); margin-bottom: var(--spacing-xs);">
              <span style="flex: 1; font-size: 0.875rem;">Открыть магазин</span>
              <button class="btn btn-secondary btn-xs" data-action="channel-remove-shop-button" title="Удалить">×</button>
            </div>
          </div>

          <div id="channel-custom-buttons"></div>

          <button class="btn btn-secondary btn-sm" data-action="channel-add-button" style="width: 100%; margin-top: var(--spacing-sm);">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px;">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Добавить кнопку
          </button>
        </div>

        <!-- Send button -->
        <button class="btn btn-primary btn-block" data-action="channel-send-post">Отправить в канал</button>
      </div>
    </div>
  `;
}

function switchSubtab(subtab) {
  currentSubtab = subtab;

  // Update subtab content
  const subtabContent = document.getElementById('subtab-content');
  if (subtabContent) {
    subtabContent.innerHTML = renderSubtabContent();
  }

  // Update tab button states
  document.querySelectorAll('[data-action="switch-pm-subtab"]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.subtab === subtab);
  });

  // Handle FAQ tab - load FAQ if switching to it
  if (subtab === 'faq' && !faqLoaded) {
    loadFaqInline();
  } else if (subtab === 'faq' && faqLoaded) {
    renderFaqInline();
    initFaqSortable();
  }

  // Handle Post tab - load channels and setup image listener
  if (subtab === 'post') {
    if (channelPostChannels === null) {
      loadChannelPostChannels().then(() => {
        const subtabEl = document.getElementById('subtab-content');
        if (subtabEl && currentSubtab === 'post') subtabEl.innerHTML = renderPostSubtab();
        setupChannelImageListener();
      });
    } else {
      setupChannelImageListener();
    }
  }

  // Handle Estimates tab - load estimates if switching to it
  if (subtab === 'estimates') {
    if (!estimatesLoaded) {
      loadEstimates();
    } else {
      renderEstimatesContent();
    }
    // Set up search input listener
    setTimeout(() => {
      const searchInput = document.getElementById('estimates-search-input');
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          clearTimeout(estimatesSearchTimeout);
          setEstimatesSearchTimeout(setTimeout(() => {
            setEstimatesSearchQuery(e.target.value.trim());
            loadEstimates(1);
          }, 400));
        });
      }
    }, 50);
  }

  // Handle Stories tab - load stories if switching to it
  if (subtab === 'stories' && !storiesLoaded) {
    loadStories();
  } else if (subtab === 'stories' && storiesLoaded) {
    renderStoriesContent();
    initStoriesSortable();
  }

  // Handle Notifications tab - load templates if switching to it
  if (subtab === 'notifications' && !notificationTemplatesLoaded) {
    loadNotificationTemplates();
  }

  // Handle Giveaway tab
  if (subtab === 'giveaway' && !giveawaysLoaded) {
    loadGiveaways();
  }

  // Handle Delivery Storage tab
  if (subtab === 'delivery-storage' && !deliveryStorageLoaded) {
    loadDeliveryStorageSettings();
  }

  // Handle Moderation tab
  if (subtab === 'moderation') {
    // Set up search input listener
    setTimeout(() => {
      const searchInput = document.getElementById('moderation-search');
      if (searchInput) {
        searchInput.addEventListener('input', () => handleModerationSearch());
      }
    }, 50);
  }
}

async function updateSetting(key, value) {
  try {
    const response = await apiPost('/api/settings/update', { key, value });

    if (!response.ok) {
      throw new Error('Failed to update setting');
    }

    return true;
  } catch (error) {
    console.error('Error updating setting:', error);
    showToast('Ошибка сохранения настройки', 'error');
    return false;
  }
}

async function toggleAnnouncementBar(enabled) {
  settings.announcement_bar.enabled = enabled;
  const success = await updateSetting('announcement_bar', settings.announcement_bar);
  if (success) {
    const subtitle = document.querySelector('#announcement-bar-toggle')
      ?.closest('.toggle-row')
      ?.querySelector('.toggle-subtitle');
    if (subtitle) subtitle.textContent = enabled ? 'Активна' : 'Скрыта';
    showToast(enabled ? 'Announcement bar включена' : 'Announcement bar скрыта', 'success');
  } else {
    // Revert checkbox
    const toggle = document.getElementById('announcement-bar-toggle');
    if (toggle) toggle.checked = !enabled;
    settings.announcement_bar.enabled = !enabled;
  }
}

async function saveAnnouncementBar() {
  const textarea = document.getElementById('announcement-bar-text');
  if (!textarea) return;
  settings.announcement_bar.text = textarea.value.trim();
  const success = await updateSetting('announcement_bar', settings.announcement_bar);
  if (success) {
    showToast('Текст объявления сохранён', 'success');
  }
}

async function toggleEmergencyMode(enabled) {
  // Show confirmation dialog for enabling
  if (enabled) {
    const confirmed = await showConfirmDialog(
      'Включить экстренный режим?',
      'Это скроет все изображения товаров и заменит их названия для всех пользователей. Вы уверены?',
      'Включить',
      true
    );

    if (!confirmed) {
      // Reset checkbox
      const toggle = document.getElementById('emergency-mode-toggle');
      if (toggle) toggle.checked = false;
      return;
    }
  }

  settings.emergency_mode.enabled = enabled;
  settings.emergency_mode.activated_at = enabled ? new Date().toISOString() : null;

  const success = await updateSetting('emergency_mode', settings.emergency_mode);

  if (success) {
    showToast(enabled ? 'Экстренный режим включен' : 'Экстренный режим выключен', enabled ? 'warning' : 'success');
    renderProjectManagementContent();
  } else {
    // Revert on failure
    settings.emergency_mode.enabled = !enabled;
    const toggle = document.getElementById('emergency-mode-toggle');
    if (toggle) toggle.checked = !enabled;
  }
}

async function toggleOrderSubmission(enabled) {
  settings.order_submission.enabled = enabled;

  const success = await updateSetting('order_submission', settings.order_submission);

  if (success) {
    showToast(enabled ? 'Прием заказов включен' : 'Прием заказов отключен', 'success');
    renderProjectManagementContent();
  } else {
    // Revert on failure
    settings.order_submission.enabled = !enabled;
    const toggle = document.getElementById('order-submission-toggle');
    if (toggle) toggle.checked = !enabled;
  }
}

async function saveOrderMessage() {
  const messageInput = document.getElementById('order-disabled-message');
  if (!messageInput) return;

  settings.order_submission.disabled_message = messageInput.value.trim();

  const success = await updateSetting('order_submission', settings.order_submission);

  if (success) {
    showToast('Сообщение сохранено', 'success');
  }
}

async function toggleDeliveryMethod(key, enabled) {
  if (!settings.delivery_methods[key]) return;

  settings.delivery_methods[key].enabled = enabled;

  const success = await updateSetting('delivery_methods', settings.delivery_methods);

  if (success) {
    const methodName = settings.delivery_methods[key].name;
    showToast(`${methodName}: ${enabled ? 'включен' : 'отключен'}`, 'success');
    renderProjectManagementContent();
  } else {
    // Revert on failure
    settings.delivery_methods[key].enabled = !enabled;
    renderProjectManagementContent();
  }
}

async function togglePochtaManualMode(enabled) {
  if (!settings.delivery_methods.pochta) return;

  // Show confirmation dialog when enabling
  if (enabled) {
    const confirmed = await showConfirmDialog(
      'Включить ручной расчёт?',
      'API расчёта стоимости доставки Почтой России будет отключён. Вам нужно будет вручную указывать стоимость доставки в каждом заказе. Включить?',
      'Включить',
      false
    );

    if (!confirmed) {
      const toggle = document.getElementById('pochta-manual-toggle');
      if (toggle) toggle.checked = false;
      return;
    }
  }

  settings.delivery_methods.pochta.manual_mode = enabled;

  const success = await updateSetting('delivery_methods', settings.delivery_methods);

  if (success) {
    showToast(
      enabled
        ? 'Ручной режим Почты включён'
        : 'API расчёта Почты включён',
      enabled ? 'warning' : 'success'
    );
    renderProjectManagementContent();
  } else {
    // Revert on failure
    settings.delivery_methods.pochta.manual_mode = !enabled;
    const toggle = document.getElementById('pochta-manual-toggle');
    if (toggle) toggle.checked = !enabled;
  }
}

async function saveRoundingSettings() {
  const smallThreshold = parseInt(document.getElementById('rounding-small-threshold')?.value) || 1500;
  const smallStep = parseInt(document.getElementById('rounding-small-step')?.value) || 50;
  const bigStep = parseInt(document.getElementById('rounding-big-step')?.value) || 50;
  const ratioThreshold = (parseInt(document.getElementById('rounding-ratio-threshold')?.value) || 50) / 100;
  const ratioStep = parseInt(document.getElementById('rounding-ratio-step')?.value) || 100;
  const veryHighThreshold = (parseInt(document.getElementById('rounding-very-high-threshold')?.value) || 70) / 100;
  const veryHighStep = parseInt(document.getElementById('rounding-very-high-step')?.value) || 200;

  settings.delivery_rounding = {
    small_order_threshold: smallThreshold,
    small_order_step: smallStep,
    big_order_step: bigStep,
    high_ratio_threshold: ratioThreshold,
    high_ratio_step: ratioStep,
    very_high_ratio_threshold: veryHighThreshold,
    very_high_ratio_step: veryHighStep
  };

  const success = await updateSetting('delivery_rounding', settings.delivery_rounding);

  if (success) {
    showToast('Настройки округления сохранены', 'success');
  } else {
    showToast('Ошибка сохранения', 'error');
  }
}

async function saveCartLimits() {
  const maxTotal = parseInt(document.getElementById('cart-limit-total-price')?.value) || 0;

  settings.cart_limits = {
    max_cart_total: Math.max(0, maxTotal)
  };

  const success = await updateSetting('cart_limits', settings.cart_limits);

  if (success) {
    showToast('Лимит суммы корзины сохранён', 'success');
  } else {
    showToast('Ошибка сохранения', 'error');
  }
}

async function saveShipmentDate() {
  const dateInput = document.getElementById('next-shipment-date-input');
  if (!dateInput) return;

  const newDate = dateInput.value || null;
  if (!newDate) {
    showToast('Укажите дату отправки', 'error');
    return;
  }

  const endDateInput = document.getElementById('next-shipment-date-end-input');
  const newEndDate = endDateInput?.value || null;

  try {
    const body = { next_shipment_date: newDate };
    if (newEndDate && newEndDate !== newDate) {
      body.next_shipment_date_end = newEndDate;
    }
    const response = await apiPost('/api/admin/shipments/settings', body);
    if (!response.ok) {
      const err = await response.json();
      showToast(err.error || 'Ошибка сохранения даты', 'error');
      return;
    }
    const result = await response.json();
    settings.next_shipment_date = result.settings?.next_shipment_date || newDate;
    settings.next_shipment_date_end = result.settings?.next_shipment_date_end || null;
    const label = newEndDate && newEndDate !== newDate
      ? `${formatDateRussian(newDate)} — ${formatDateRussian(newEndDate)}`
      : formatDateRussian(newDate);
    showToast(`Дата отправки: ${label}`, 'success');
    renderProjectManagementContent();
  } catch (err) {
    console.error('Error saving shipment date:', err);
    showToast('Ошибка сохранения даты', 'error');
  }
}

// ============================================================================
// PACKAGING CONFIGURATION FUNCTIONS
// ============================================================================

async function togglePackagingSection() {
  const content = document.getElementById('packaging-section-content');
  const chevron = document.getElementById('packaging-section-chevron');

  if (!content || !chevron) return;

  packagingSectionExpanded = !packagingSectionExpanded;

  if (packagingSectionExpanded) {
    content.style.display = 'block';
    chevron.style.transform = 'rotate(180deg)';

    // Load packaging config if not already loaded
    if (!packagingLoaded) {
      await loadPackagingConfig();
    }
  } else {
    content.style.display = 'none';
    chevron.style.transform = 'rotate(0deg)';
  }
}

async function loadPackagingConfig() {
  const container = document.getElementById('packaging-inline-container');
  if (!container) return;

  container.innerHTML = `
    <div class="loading-spinner" style="padding: var(--spacing-md);">
      <div class="spinner"></div>
      <p>Загрузка конфигурации...</p>
    </div>
  `;

  try {
    const response = await apiGet('/api/shipping/packaging-config');
    if (!response.ok) {
      throw new Error('Failed to fetch packaging config');
    }

    const result = await response.json();
    packagingConfig.packaging = result.packaging || [];
    packagingConfig.weights = result.weights || [];
    packagingConfig.capacityLimits = result.capacityLimits || packagingConfig.capacityLimits;

    packagingLoaded = true;
    container.innerHTML = renderPackagingContent();
  } catch (err) {
    console.error('Error loading packaging config:', err);
    container.innerHTML = `
      <div class="empty-state" style="padding: var(--spacing-md);">
        <p style="color: var(--error);">Не удалось загрузить конфигурацию</p>
        <button class="btn btn-primary btn-sm" data-action="toggle-packaging-section">Повторить</button>
      </div>
    `;
  }
}

async function savePackagingConfig() {
  // Collect packaging data from inputs
  const packagingUpdates = [];
  document.querySelectorAll('[data-packaging-code]').forEach(row => {
    const code = row.dataset.packagingCode;
    const costInput = row.querySelector('.packaging-cost-input');
    const weightInput = row.querySelector('.packaging-weight-input');

    if (costInput && weightInput) {
      packagingUpdates.push({
        code,
        cost: parseFloat(costInput.value) || 0,
        weight_grams: parseInt(weightInput.value) || 0
      });
    }
  });

  // Collect weight data from inputs
  const weightsUpdates = [];
  document.querySelectorAll('.product-weight-input').forEach(input => {
    const id = parseInt(input.dataset.id);
    if (id) {
      weightsUpdates.push({
        id,
        weight_grams: parseInt(input.value) || 0
      });
    }
  });

  // Collect capacity limits from inputs
  const capacityLimits = {};
  document.querySelectorAll('.capacity-input').forEach(input => {
    const type = input.dataset.type;
    const format = input.dataset.format;
    const value = parseInt(input.value) || 0;

    if (!capacityLimits[type]) {
      capacityLimits[type] = {};
    }
    capacityLimits[type][format] = value;
  });

  try {
    const response = await apiPost('/api/shipping/packaging-config', {
      packaging: packagingUpdates,
      weights: weightsUpdates,
      capacityLimits
    });

    if (!response.ok) {
      throw new Error('Failed to save packaging config');
    }

    // Update local state
    packagingConfig.capacityLimits = capacityLimits;

    showToast('Настройки упаковки сохранены', 'success');
  } catch (err) {
    console.error('Error saving packaging config:', err);
    showToast('Ошибка сохранения настроек упаковки', 'error');
  }
}

// ============================================================================
// CHANNEL POST FUNCTIONS
// ============================================================================

function toggleChannelSection() {
  const content = document.getElementById('channel-section-content');
  const chevron = document.getElementById('channel-section-chevron');

  if (!content || !chevron) return;

  channelSectionExpanded = !channelSectionExpanded;

  if (channelSectionExpanded) {
    content.style.display = 'block';
    chevron.style.transform = 'rotate(180deg)';
    setupChannelImageListener();
  } else {
    content.style.display = 'none';
    chevron.style.transform = 'rotate(0deg)';
  }
}

function setupChannelImageListener() {
  const imageInput = document.getElementById('channel-image');
  const imagePreview = document.getElementById('channel-image-preview');

  if (imageInput && imagePreview && !imageInput._hasListener) {
    imageInput._hasListener = true;
    imageInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          imagePreview.innerHTML = `
            <div style="display: flex; align-items: center; gap: var(--spacing-sm); padding: var(--spacing-sm); background: var(--bg-secondary); border-radius: var(--radius-md);">
              <img src="${ev.target.result}" style="width: 60px; height: 60px; object-fit: cover; border-radius: var(--radius-sm);">
              <span style="flex: 1; font-size: 0.875rem; color: var(--text-secondary);">${file.name}</span>
              <button class="btn btn-secondary btn-xs" data-action="channel-clear-image" title="Удалить">×</button>
            </div>
          `;
        };
        reader.readAsDataURL(file);
      } else {
        imagePreview.innerHTML = '';
      }
    });
  }

  // Schedule time listener
  const scheduleTime = document.getElementById('channel-schedule-time');
  const scheduleDisplay = document.getElementById('channel-schedule-display');

  if (scheduleTime && scheduleDisplay && !scheduleTime._hasListener) {
    scheduleTime._hasListener = true;
    scheduleTime.addEventListener('change', (e) => {
      if (e.target.value) {
        const date = new Date(e.target.value);
        scheduleDisplay.innerHTML = `📅 Запланировано на: ${date.toLocaleString('ru-RU')}`;
        scheduleDisplay.style.display = 'block';
      } else {
        scheduleDisplay.style.display = 'none';
      }
    });
  }
}

function toggleChannelScheduleInput() {
  const scheduleInput = document.getElementById('channel-schedule-input');
  if (scheduleInput) {
    scheduleInput.style.display = scheduleInput.style.display === 'none' ? 'block' : 'none';
  }
}

function clearChannelSchedule() {
  const scheduleTime = document.getElementById('channel-schedule-time');
  const scheduleDisplay = document.getElementById('channel-schedule-display');
  const scheduleInput = document.getElementById('channel-schedule-input');

  if (scheduleTime) scheduleTime.value = '';
  if (scheduleDisplay) scheduleDisplay.style.display = 'none';
  if (scheduleInput) scheduleInput.style.display = 'none';
}

function clearChannelImage() {
  const imageInput = document.getElementById('channel-image');
  const imagePreview = document.getElementById('channel-image-preview');

  if (imageInput) imageInput.value = '';
  if (imagePreview) imagePreview.innerHTML = '';
}

function removeChannelShopButton() {
  const container = document.getElementById('channel-shop-button-container');
  if (container) container.style.display = 'none';
  channelShopButtonEnabled = false;
}

function addChannelButton() {
  const container = document.getElementById('channel-custom-buttons');
  if (!container) return;

  const buttonId = `channel-btn-${channelButtonCounter++}`;

  const buttonHTML = `
    <div class="channel-button-item" id="${buttonId}" style="display: flex; flex-direction: column; gap: var(--spacing-xs); padding: var(--spacing-sm); background: var(--bg-secondary); border-radius: var(--radius-sm); margin-bottom: var(--spacing-xs);">
      <div style="display: flex; gap: var(--spacing-xs);">
        <input type="text" placeholder="Название кнопки" class="button-text" style="flex: 1; padding: 6px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-primary); color: var(--text-primary); font-size: 0.875rem;">
        <button class="btn btn-secondary btn-xs" data-action="channel-remove-button" data-button-id="${buttonId}" title="Удалить">×</button>
      </div>
      <input type="url" placeholder="https://example.com" class="button-url" style="width: 100%; padding: 6px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-primary); color: var(--text-primary); font-size: 0.875rem;">
    </div>
  `;

  container.insertAdjacentHTML('beforeend', buttonHTML);
}

async function loadChannelPostChannels() {
  try {
    const response = await apiGet('/api/settings/get?key=giveaway_channels');
    if (response.ok) {
      const result = await response.json();
      const channels = result.setting?.value;
      channelPostChannels = Array.isArray(channels) ? channels : [];
      if (channelPostChannels.length > 0 && !channelPostSelectedChannelId) {
        channelPostSelectedChannelId = channelPostChannels[0].id;
      }
    }
  } catch (err) {
    channelPostChannels = [];
  }
}

async function sendChannelPost() {
  const message = document.getElementById('channel-message')?.value.trim();

  if (!message) {
    showToast('Введите текст сообщения', 'error');
    return;
  }

  // Resolve selected channel
  const channelSelect = document.getElementById('channel-post-channel-select');
  const selectedChannelId = channelSelect?.value || channelPostSelectedChannelId || null;
  if (!selectedChannelId) {
    showToast('Канал не настроен. Добавьте канал в разделе «Розыгрыш».', 'error');
    return;
  }

  // Check scheduled time
  const scheduleTime = document.getElementById('channel-schedule-time');
  let scheduledAt = null;
  if (scheduleTime && scheduleTime.value) {
    scheduledAt = new Date(scheduleTime.value).toISOString();
    if (new Date(scheduledAt) <= new Date()) {
      showToast('Время публикации должно быть в будущем', 'error');
      return;
    }
  }

  // Collect buttons
  const buttons = [];
  const shopContainer = document.getElementById('channel-shop-button-container');
  if (channelShopButtonEnabled && shopContainer && shopContainer.style.display !== 'none') {
    buttons.push({ text: 'Открыть магазин', url: window.location.origin });
  }
  document.querySelectorAll('#channel-custom-buttons .channel-button-item').forEach(item => {
    const text = item.querySelector('.button-text')?.value.trim();
    const url = item.querySelector('.button-url')?.value.trim();
    if (text && url) buttons.push({ text, url });
  });

  // Handle image
  const imageInput = document.getElementById('channel-image');
  let imageBase64 = null;
  if (imageInput && imageInput.files.length > 0) {
    const file = imageInput.files[0];
    imageBase64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  try {
    const payload = {
      action: 'post_to_channel',
      channel_id: selectedChannelId,
      message,
      parse_mode: channelPostParseMode || undefined,
      buttons: buttons.length > 0 ? buttons : null,
      image: imageBase64,
      scheduled_at: scheduledAt,
      disable_notification: channelPostSilent || undefined,
      disable_web_page_preview: channelPostNoPreview || undefined
    };

    const response = await apiPost('/api/webhooks/admin-bot', payload);

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      showToast(err.error || 'Ошибка при отправке сообщения', 'error');
      return;
    }

    showToast(scheduledAt ? 'Сообщение запланировано' : 'Сообщение отправлено в канал', 'success');

    // Clear form
    const messageInput = document.getElementById('channel-message');
    if (messageInput) messageInput.value = '';
    const customButtons = document.getElementById('channel-custom-buttons');
    if (customButtons) customButtons.innerHTML = '';
    clearChannelImage();
    clearChannelSchedule();
    const shopBtnContainer = document.getElementById('channel-shop-button-container');
    if (shopBtnContainer) shopBtnContainer.style.display = '';
    channelShopButtonEnabled = true;
    channelButtonCounter = 0;
  } catch (error) {
    console.error('Error sending channel post:', error);
    showToast('Ошибка при отправке сообщения', 'error');
  }
}

// Event delegation handler
function handleProjectManagementClick(e) {
  const target = e.target;
  const action = target.dataset.action || target.closest('[data-action]')?.dataset.action;

  if (!action) return;

  switch (action) {
    case 'toggle-announcement-bar': {
      const abToggle = document.getElementById('announcement-bar-toggle');
      if (abToggle) toggleAnnouncementBar(abToggle.checked);
      break;
    }

    case 'save-announcement-bar':
      saveAnnouncementBar();
      break;

    case 'toggle-emergency':
      const emergencyToggle = document.getElementById('emergency-mode-toggle');
      if (emergencyToggle) toggleEmergencyMode(emergencyToggle.checked);
      break;

    case 'toggle-order-submission':
      const orderToggle = document.getElementById('order-submission-toggle');
      if (orderToggle) toggleOrderSubmission(orderToggle.checked);
      break;

    case 'save-order-message':
      saveOrderMessage();
      break;

    case 'save-shipment-date':
      saveShipmentDate();
      break;

    case 'toggle-delivery':
      const deliveryKey = target.dataset.deliveryKey || target.closest('[data-delivery-key]')?.dataset.deliveryKey;
      if (deliveryKey) {
        const checkbox = target.type === 'checkbox' ? target : target.querySelector('input[type="checkbox"]');
        if (checkbox) toggleDeliveryMethod(deliveryKey, checkbox.checked);
      }
      break;

    case 'toggle-pochta-manual':
      const manualCheckbox = document.getElementById('pochta-manual-toggle');
      if (manualCheckbox) togglePochtaManualMode(manualCheckbox.checked);
      break;

    case 'save-cart-limits':
      saveCartLimits();
      break;

    case 'save-rounding-settings':
      saveRoundingSettings();
      break;

    case 'refresh-settings':
    case 'reload-settings':
      loadProjectManagement();
      break;

    // Subtab switching
    case 'switch-pm-subtab':
      const subtab = target.dataset.subtab || target.closest('[data-subtab]')?.dataset.subtab;
      if (subtab) switchSubtab(subtab);
      break;

    // Channel post actions
    case 'channel-trigger-image':
      document.getElementById('channel-image')?.click();
      break;

    case 'channel-toggle-schedule':
      toggleChannelScheduleInput();
      break;

    case 'channel-clear-schedule':
      clearChannelSchedule();
      break;

    case 'channel-clear-image':
      clearChannelImage();
      break;

    case 'channel-remove-shop-button':
      removeChannelShopButton();
      break;

    case 'channel-add-button':
      addChannelButton();
      break;

    case 'channel-remove-button':
      const buttonId = target.dataset.buttonId || target.closest('[data-button-id]')?.dataset.buttonId;
      if (buttonId) document.getElementById(buttonId)?.remove();
      break;

    case 'channel-send-post':
      sendChannelPost();
      break;

    case 'channel-set-parse-mode': {
      const mode = target.dataset.mode;
      if (mode !== undefined) {
        channelPostParseMode = mode;
        document.getElementById('subtab-content').innerHTML = renderPostSubtab();
      }
      break;
    }

    case 'channel-toggle-silent':
      channelPostSilent = document.getElementById('channel-silent')?.checked || false;
      break;

    case 'channel-toggle-no-preview':
      channelPostNoPreview = document.getElementById('channel-no-preview')?.checked || false;
      break;

    // Estimates actions
    case 'refresh-estimates':
      setEstimatesLoaded(false);
      loadEstimates();
      break;

    case 'estimates-prev-page':
      if (estimatesPagination.page > 1) {
        loadEstimates(estimatesPagination.page - 1);
      }
      break;

    case 'estimates-next-page':
      if (estimatesPagination.page < estimatesPagination.totalPages) {
        loadEstimates(estimatesPagination.page + 1);
      }
      break;

    case 'estimates-filter-provider': {
      const providerVal = target.closest('[data-provider]')?.dataset?.provider || '';
      if (estimatesProviderFilter !== providerVal) {
        setEstimatesProviderFilter(providerVal);
        // Re-render the filter buttons to update active state
        const filterContainer = document.querySelector('#estimates-section-content');
        if (filterContainer) {
          const buttons = filterContainer.querySelectorAll('[data-action="estimates-filter-provider"]');
          buttons.forEach(btn => {
            const btnProvider = btn.dataset.provider || '';
            if (btnProvider === providerVal) {
              btn.className = 'btn btn-sm btn-primary';
            } else {
              btn.className = 'btn btn-sm btn-secondary';
            }
          });
        }
        loadEstimates(1);
      }
      break;
    }

    case 'delete-estimate': {
      const estimateId = parseInt(target.dataset.estimateId || target.closest('[data-estimate-id]')?.dataset.estimateId);
      if (estimateId) deleteEstimate(estimateId);
      break;
    }

    // Stories actions
    case 'refresh-stories':
      setStoriesLoaded(false);
      loadStories();
      break;

    case 'add-story':
      openStoryModal(null);
      break;

    case 'edit-story':
      const editStoryId = parseInt(target.dataset.storyId || target.closest('[data-story-id]')?.dataset.storyId);
      if (editStoryId) {
        const storyToEdit = storiesData.find(s => s.id === editStoryId);
        if (storyToEdit) {
          openStoryModal(storyToEdit);
        }
      }
      break;

    case 'close-story-modal':
      closeStoryModal();
      break;

    case 'save-story-modal':
      saveStoryFromModal();
      break;

    case 'delete-story':
      const deleteStoryId = parseInt(target.dataset.storyId || target.closest('[data-story-id]')?.dataset.storyId);
      if (deleteStoryId) deleteStory(deleteStoryId);
      break;

    // Packaging configuration actions
    case 'toggle-packaging-section':
      togglePackagingSection();
      break;

    case 'save-packaging-config':
      savePackagingConfig();
      break;

    // Editor permissions actions
    case 'save-editor-permissions':
      saveEditorPermissions();
      break;

    case 'reload-editor-settings':
      editorPermissionsLoaded = false;
      editorPermissionsState = null;
      switchSubtab('editor');
      break;

    case 'toggle-editor-perm': {
      // Update state with new checkbox value
      const permKey = target.dataset.permKey || target.closest('[data-perm-key]')?.dataset.permKey;
      if (permKey && editorPermissionsState) {
        if (!editorPermissionsState[permKey]) {
          editorPermissionsState[permKey] = {};
        }
        editorPermissionsState[permKey].enabled = target.checked;
      }

      // Re-render the editor subtab to show/hide sub-permissions
      const subtabContent = document.getElementById('subtab-content');
      if (subtabContent && currentSubtab === 'editor') {
        subtabContent.innerHTML = renderEditorSubtab();
      }
      break;
    }

    case 'toggle-editor-subperm': {
      // Update state with new checkbox value
      const permKey = target.dataset.permKey || target.closest('[data-perm-key]')?.dataset.permKey;
      const subPermKey = target.dataset.subpermKey || target.closest('[data-subperm-key]')?.dataset.subpermKey;
      if (permKey && subPermKey && editorPermissionsState) {
        if (!editorPermissionsState[permKey]) {
          editorPermissionsState[permKey] = {};
        }
        editorPermissionsState[permKey][subPermKey] = target.checked;
      }
      break;
    }

    // Notification template actions
    case 'reload-notifications':
      setNotificationTemplatesLoaded(false);
      setNotificationTemplatesData(null);
      switchSubtab('notifications');
      break;

    case 'toggle-notif-channel-panel': {
      const notifPanel = document.getElementById('notif-channel-panel');
      if (notifPanel) {
        notifPanel.style.display = notifPanel.style.display === 'none' ? 'flex' : 'none';
      }
      break;
    }

    case 'notif-switch-channel': {
      const ch = target.dataset.channel || target.closest('[data-channel]')?.dataset.channel;
      if (ch && ['telegram', 'email', 'vk', 'max'].includes(ch)) {
        setNotifActiveChannel(ch);
        // Hide channel panel
        const notifPanel = document.getElementById('notif-channel-panel');
        if (notifPanel) notifPanel.style.display = 'none';
        // Re-render notifications subtab
        const subtabContent = document.getElementById('subtab-content');
        if (subtabContent && currentSubtab === 'notifications') {
          subtabContent.innerHTML = renderNotificationsSubtab();
        }
      }
      break;
    }

    case 'notif-toggle': {
      const el = target.closest('[data-type]') || target;
      const nType = el.dataset.type;
      const nChannel = el.dataset.channel;
      if (nType && nChannel) {
        const disabled = !target.checked;
        toggleNotificationEnabled(nType, nChannel, disabled);
      }
      break;
    }

    case 'notif-save': {
      const el = target.closest('[data-type]') || target;
      const nType = el.dataset.type;
      const nChannel = el.dataset.channel;
      if (nType && nChannel) {
        saveNotificationTemplate(nType, nChannel);
      }
      break;
    }

    case 'notif-reset': {
      const el2 = target.closest('[data-type]') || target;
      const rType = el2.dataset.type;
      const rChannel = el2.dataset.channel;
      if (rType && rChannel) {
        resetNotificationTemplate(rType, rChannel);
      }
      break;
    }

    case 'save-storage-settings':
      saveDeliveryStorageSettings();
      break;

    // Bot greetings actions
    case 'save-bot-greetings':
      saveBotGreetings();
      break;

    case 'reload-bot-greetings':
      setBotGreetingsLoaded(false);
      setBotGreetingsData(null);
      switchSubtab('bots');
      break;

    case 'vk-community-select': {
      const communityNum = parseInt(target.dataset.community, 10);
      if (communityNum === 1 || communityNum === 2) {
        setVkProductDescCommunity(communityNum);
        const subtabContent = document.getElementById('subtab-content');
        if (subtabContent) {
          const desc = document.getElementById('vk-product-desc')?.value || '';
          subtabContent.innerHTML = renderBotsSubtab();
          const newDesc = document.getElementById('vk-product-desc');
          if (newDesc) newDesc.value = desc;
        }
      }
      break;
    }

    case 'update-vk-products':
      updateVkProductDescriptions();
      break;

    case 'giveaway-form-show':
      setShowGiveawayForm(true);
      document.getElementById('subtab-content').innerHTML = renderGiveawaySubtab();
      break;

    case 'giveaway-form-hide':
      setShowGiveawayForm(false);
      document.getElementById('subtab-content').innerHTML = renderGiveawaySubtab();
      break;

    case 'giveaway-submit':
      submitCreateGiveaway();
      break;

    case 'giveaway-pick-winners':
      pickGiveawayWinners(target.dataset.id);
      break;

    case 'giveaway-cancel':
      cancelGiveaway(target.dataset.id);
      break;

    case 'giveaway-channel-add': {
      const list = document.getElementById('giveaway-channels-list');
      if (list) {
        const inputStyle = 'border:1px solid var(--border-color);border-radius:var(--radius-md);background:var(--bg-primary);color:var(--text-primary);padding:var(--spacing-sm);font-size:0.875rem;';
        const idx = list.querySelectorAll('.giveaway-channel-row').length;
        const row = document.createElement('div');
        row.className = 'giveaway-channel-row';
        row.style.cssText = 'display:flex;gap:var(--spacing-xs);margin-bottom:var(--spacing-xs);align-items:center;';
        row.innerHTML = `
          <input class="form-input giveaway-channel-id" placeholder="ID канала" style="flex:1;${inputStyle}">
          <input class="form-input giveaway-channel-name" placeholder="Название" style="flex:1;${inputStyle}">
          <button class="btn btn-secondary" data-action="giveaway-channel-remove" data-index="${idx}" style="padding:var(--spacing-xs) var(--spacing-sm);flex-shrink:0;">✕</button>
        `;
        list.appendChild(row);
        row.querySelector('.giveaway-channel-id').focus();
      }
      break;
    }

    case 'giveaway-channel-remove':
      target.closest('.giveaway-channel-row')?.remove();
      break;

    case 'giveaway-channels-save':
      saveGiveawayChannels();
      break;

    // IP rights actions
    case 'ip-rights-run-check':
      runIpRightsCheck();
      break;

    case 'ip-rights-run-partial-check':
      runIpRightsCheck(true);
      break;

    case 'ip-rights-cancel':
      cancelIpRightsScan();
      break;

    case 'ip-rights-reload':
      ipRightsLoaded = false;
      loadIpRights();
      break;

    case 'ip-rights-dismiss': {
      const checkId = target.dataset.id || target.closest('[data-id]')?.dataset.id;
      if (checkId) dismissIpCheck(checkId);
      break;
    }

    case 'ip-rights-confirm': {
      const checkId = target.dataset.id || target.closest('[data-id]')?.dataset.id;
      if (checkId) confirmIpCheck(checkId);
      break;
    }

    case 'ip-manual-form-show':
      ipRightsShowManualForm = true;
      document.getElementById('subtab-content').innerHTML = renderIpRightsSubtab();
      break;

    case 'ip-manual-form-hide':
      ipRightsShowManualForm = false;
      document.getElementById('subtab-content').innerHTML = renderIpRightsSubtab();
      break;

    case 'ip-manual-save':
      saveIpManual();
      break;

    case 'ip-manual-delete': {
      const manualId = target.dataset.id || target.closest('[data-id]')?.dataset.id;
      if (manualId) deleteIpManual(manualId);
      break;
    }

    // Moderation actions
    case 'toggle-moderation-enabled':
      toggleModerationEnabled();
      break;

    case 'toggle-moderation-type': {
      const modType = target.dataset.type;
      if (modType) toggleModerationType(modType);
      break;
    }

    case 'add-moderation-word':
      showAddWordModal();
      break;

    case 'bulk-import-moderation':
      showBulkImportModal();
      break;

    case 'reload-moderation':
      loadModerationData();
      break;

    case 'edit-moderation-word': {
      const wordId = target.dataset.id || target.closest('[data-id]')?.dataset.id;
      if (wordId) showEditWordModal(wordId);
      break;
    }

    case 'delete-moderation-word': {
      const wordId = target.dataset.id || target.closest('[data-id]')?.dataset.id;
      if (wordId) deleteWord(wordId);
      break;
    }

    case 'toggle-moderation-word-active': {
      const wordId = target.dataset.id || target.closest('[data-id]')?.dataset.id;
      const isActive = target.dataset.active || target.closest('[data-active]')?.dataset.active;
      if (wordId) toggleWordActive(wordId, isActive);
      break;
    }

    case 'test-moderation':
      testModeration();
      break;
  }
}

// Set up event delegation when view is loaded
function setupProjectManagementEvents() {
  const content = document.getElementById('content');

  // Remove previous handler if exists
  if (content._projectManagementClickHandler) {
    content.removeEventListener('click', content._projectManagementClickHandler);
    content.removeEventListener('change', content._projectManagementChangeHandler);
  }

  // Click handler
  content._projectManagementClickHandler = handleProjectManagementClick;
  content.addEventListener('click', handleProjectManagementClick);

  // Change handler for checkboxes
  const changeHandler = (e) => {
    if (e.target.type === 'checkbox') {
      handleProjectManagementClick(e);
    }
  };
  content._projectManagementChangeHandler = changeHandler;
  content.addEventListener('change', changeHandler);
}

// Exports
export {
  loadProjectManagement as renderProjectManagement,
  setupProjectManagementEvents,
  settings as projectSettings
};
