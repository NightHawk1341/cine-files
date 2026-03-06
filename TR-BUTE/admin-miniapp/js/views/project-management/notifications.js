/**
 * Notification templates management sub-module
 */

import { apiGet, apiPut, apiPost, apiPatch } from '../../utils/apiClient.js';
import { showToast, showError } from '../../utils.js';
import {
  notificationTemplatesData, setNotificationTemplatesData,
  notificationTemplatesLoaded, setNotificationTemplatesLoaded,
  notifActiveChannel,
  currentSubtab,
  escapeHtml, escapeAttr
} from './state.js';

export function renderNotificationsSubtab() {
  if (!notificationTemplatesLoaded) {
    loadNotificationTemplates();
    return `
      <div class="loading-spinner">
        <div class="spinner"></div>
        <p>Загрузка шаблонов уведомлений...</p>
      </div>
    `;
  }

  if (!notificationTemplatesData) {
    return `
      <div class="empty-state">
        <h3>Ошибка загрузки</h3>
        <p>Не удалось загрузить шаблоны уведомлений</p>
        <button class="btn btn-primary mt-sm" data-action="reload-notifications">Повторить</button>
      </div>
    `;
  }

  const { groups } = notificationTemplatesData;

  return `
    <!-- Template Groups -->
    ${groups.map(group => `
      <div class="card" style="margin-bottom: var(--spacing-md);">
        <div class="card-header">
          <h3 class="card-title" style="display: flex; align-items: center; gap: var(--spacing-sm);">
            <span class="icon-wrapper" style="width: 20px; height: 20px;">
              ${getGroupIcon(group.key)}
            </span>
            ${group.label}
          </h3>
        </div>
        <div class="card-body" style="padding: 0;">
          ${group.types.map(typeInfo => renderNotificationTypeCard(typeInfo)).join('')}
        </div>
      </div>
    `).join('')}

    <!-- Info Card -->
    <div class="card" style="background: var(--bg-tertiary); border: 1px solid var(--border-color); margin-bottom: 80px;">
      <div class="card-body" style="padding: var(--spacing-md);">
        <h4 style="margin: 0 0 var(--spacing-sm) 0; font-size: 0.875rem;">Как это работает</h4>
        <ul style="margin: 0; padding-left: var(--spacing-lg); font-size: 0.813rem; color: var(--text-secondary);">
          <li>Текст в фигурных скобках <code style="background: var(--bg-secondary); padding: 1px 4px; border-radius: 3px;">{переменная}</code> — динамические данные, они подставляются автоматически</li>
          <li>Изменённые шаблоны отмечены оранжевой точкой — их можно сбросить к оригиналу</li>
          <li>Структурные элементы (таблицы, стили email) не редактируются — меняется только текст</li>
          <li>Если в будущем появятся новые уведомления, они автоматически появятся здесь с текстом по умолчанию</li>
        </ul>
      </div>
    </div>

    <!-- Floating channel switch button -->
    <button class="fab fab-filter" data-action="toggle-notif-channel-panel" title="Канал: ${notifActiveChannel === 'telegram' ? 'Telegram бот' : notifActiveChannel === 'vk' ? 'VK Мини-апп' : notifActiveChannel === 'max' ? 'MAX' : 'Email'}">
      ${notifActiveChannel === 'telegram'
        ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>'
        : notifActiveChannel === 'vk'
        ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0077FF" stroke-width="2"><path d="M2 12C2 6.48 6.48 2 12 2s10 4.48 10 10-4.48 10-10 10S2 17.52 2 12z"/><path d="M7 10h2c0 2 .5 4 2 4 0-1.5 0-4 2-4h2c0 0-1 5-4 5S7 10 7 10z" fill="#0077FF" stroke="none"/></svg>'
        : notifActiveChannel === 'max'
        ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FF5500" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 15V9l4 4 4-4v6" stroke="#FF5500" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>'}
      <span class="fab-filter-label">${notifActiveChannel === 'telegram' ? 'Telegram' : notifActiveChannel === 'vk' ? 'VK Мини-апп' : notifActiveChannel === 'max' ? 'MAX' : 'Email'}</span>
    </button>

    <!-- Channel selector panel -->
    <div class="fab-filter-panel" id="notif-channel-panel" style="display: none;">
      <button class="fab-filter-option ${notifActiveChannel === 'telegram' ? 'active' : ''}" data-action="notif-switch-channel" data-channel="telegram">
        Telegram бот
      </button>
      <button class="fab-filter-option ${notifActiveChannel === 'vk' ? 'active' : ''}" data-action="notif-switch-channel" data-channel="vk">
        VK Мини-приложение
      </button>
      <button class="fab-filter-option ${notifActiveChannel === 'max' ? 'active' : ''}" data-action="notif-switch-channel" data-channel="max">
        MAX
      </button>
      <button class="fab-filter-option ${notifActiveChannel === 'email' ? 'active' : ''}" data-action="notif-switch-channel" data-channel="email">
        Email
      </button>
    </div>
  `;
}

function getGroupIcon(groupKey) {
  const icons = {
    orders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18"/></svg>',
    payment: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>',
    shipping: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
    cancellation: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    products: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 11-8 0"/></svg>',
    support: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>'
  };
  return icons[groupKey] || icons.orders;
}

function renderNotificationTypeCard(typeInfo) {
  const channel = notifActiveChannel;
  const channelInfo = typeInfo[channel];
  if (!channelInfo || !channelInfo.fields) return '';

  const isOverridden = channel === 'telegram' ? typeInfo.telegramOverridden
    : channel === 'vk' ? typeInfo.vkOverridden
    : channel === 'max' ? typeInfo.maxOverridden
    : typeInfo.emailOverridden;
  const isDisabled = channel === 'telegram' ? typeInfo.telegramDisabled
    : channel === 'vk' ? typeInfo.vkDisabled
    : channel === 'max' ? typeInfo.maxDisabled
    : typeInfo.emailDisabled;
  const overrides = typeInfo.overrides?.[channel] || {};

  return `
    <div class="notif-type-card" style="padding: var(--spacing-md); border-bottom: 1px solid var(--border-color);${isDisabled ? ' opacity: 0.55;' : ''}">
      <!-- Header -->
      <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: var(--spacing-sm);">
        <div style="flex: 1; min-width: 0;">
          <div style="display: flex; align-items: center; gap: var(--spacing-xs);">
            <span style="font-weight: 600; font-size: 0.875rem;">${typeInfo.label}</span>
            ${isOverridden ? '<span style="width: 8px; height: 8px; border-radius: 50%; background: var(--primary); display: inline-block;" title="Изменено"></span>' : ''}
          </div>
          <div style="font-size: 0.75rem; color: var(--text-tertiary); margin-top: 2px;">${typeInfo.description}</div>
        </div>
        <div style="display: flex; align-items: center; gap: var(--spacing-sm); flex-shrink: 0; margin-left: var(--spacing-sm);">
          ${isOverridden ? `
            <button class="btn btn-secondary btn-xs" data-action="notif-reset" data-type="${typeInfo.type}" data-channel="${channel}"
                    style="white-space: nowrap; font-size: 0.688rem;" title="Сбросить к оригиналу">
              Сбросить
            </button>
          ` : ''}
          <label class="toggle-switch" title="${isDisabled ? 'Включить уведомление' : 'Отключить уведомление'}" style="flex-shrink: 0;">
            <input type="checkbox" ${isDisabled ? '' : 'checked'}
                   data-action="notif-toggle" data-type="${typeInfo.type}" data-channel="${channel}">
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <!-- Variables hint -->
      ${typeInfo.variables && typeInfo.variables.length > 0 ? `
        <div style="margin-bottom: var(--spacing-sm); display: flex; flex-wrap: wrap; gap: 4px;">
          ${typeInfo.variables.map(v => {
            const vLabel = typeInfo.variableLabels?.[v] || v;
            return `<span style="font-size: 0.688rem; background: var(--bg-tertiary); color: var(--text-secondary); padding: 2px 6px; border-radius: 3px; border: 1px solid var(--border-color);" title="${vLabel}">{${v}}</span>`;
          }).join('')}
        </div>
      ` : ''}

      <!-- Editable Fields -->
      ${Object.entries(channelInfo.fields).map(([fieldName, fieldInfo]) => {
        const currentValue = overrides[fieldName] || fieldInfo.default;
        const isFieldOverridden = overrides[fieldName] !== undefined;
        const isMultiline = currentValue.includes('\\n') || currentValue.length > 80;

        return `
          <div class="form-group" style="margin-bottom: var(--spacing-sm);">
            <label class="form-label" style="font-size: 0.75rem; display: flex; align-items: center; gap: 4px;">
              ${fieldInfo.label}
              ${isFieldOverridden ? '<span style="color: var(--primary); font-size: 0.625rem;">(изменено)</span>' : ''}
            </label>
            ${isMultiline ? `
              <textarea class="form-input notif-field-input"
                        data-type="${typeInfo.type}" data-channel="${channel}" data-field="${fieldName}"
                        rows="3"
                        style="font-size: 0.813rem; font-family: inherit;"
                        placeholder="${fieldInfo.default}">${escapeHtml(currentValue)}</textarea>
            ` : `
              <input type="text" class="form-input notif-field-input"
                     data-type="${typeInfo.type}" data-channel="${channel}" data-field="${fieldName}"
                     value="${escapeAttr(currentValue)}"
                     placeholder="${escapeAttr(fieldInfo.default)}"
                     style="font-size: 0.813rem;">
            `}
          </div>
        `;
      }).join('')}

      <!-- Save button for this type -->
      <div style="text-align: right; margin-top: var(--spacing-xs);">
        <button class="btn btn-primary btn-xs" data-action="notif-save" data-type="${typeInfo.type}" data-channel="${channel}">
          Сохранить
        </button>
      </div>
    </div>
  `;
}

export async function loadNotificationTemplates() {
  try {
    const response = await apiGet('/api/admin/notification-templates');
    if (response.ok) {
      const result = await response.json();
      setNotificationTemplatesData(result);
      setNotificationTemplatesLoaded(true);
      // Re-render
      const subtabContent = document.getElementById('subtab-content');
      if (subtabContent && currentSubtab === 'notifications') {
        subtabContent.innerHTML = renderNotificationsSubtab();
      }
    } else {
      setNotificationTemplatesLoaded(true);
      setNotificationTemplatesData(null);
      const subtabContent = document.getElementById('subtab-content');
      if (subtabContent && currentSubtab === 'notifications') {
        subtabContent.innerHTML = renderNotificationsSubtab();
      }
    }
  } catch (err) {
    console.error('Error loading notification templates:', err);
    setNotificationTemplatesLoaded(true);
    setNotificationTemplatesData(null);
    const subtabContent = document.getElementById('subtab-content');
    if (subtabContent && currentSubtab === 'notifications') {
      subtabContent.innerHTML = `
        <div class="empty-state">
          <h3>Ошибка загрузки</h3>
          <p>${err.message || 'Не удалось загрузить шаблоны уведомлений'}</p>
          <button class="btn btn-primary mt-sm" data-action="reload-notifications">Повторить</button>
        </div>
      `;
    }
  }
}

export async function saveNotificationTemplate(type, channel) {
  // Collect field values from DOM
  const fields = {};
  const inputs = document.querySelectorAll(`.notif-field-input[data-type="${type}"][data-channel="${channel}"]`);
  inputs.forEach(input => {
    const fieldName = input.dataset.field;
    fields[fieldName] = input.value;
  });

  try {
    const putResponse = await apiPut('/api/admin/notification-templates', { type, channel, fields });

    if (putResponse.ok) {
      const result = await putResponse.json();
      // Update local data with new overrides
      if (notificationTemplatesData) {
        notificationTemplatesData.overrides = result.overrides;
        // Update group type overrides
        for (const group of notificationTemplatesData.groups) {
          for (const typeInfo of group.types) {
            if (typeInfo.type === type) {
              typeInfo.overrides = result.overrides[type] || {};
              typeInfo.telegramOverridden = typeInfo.overrides.telegram ? Object.keys(typeInfo.overrides.telegram).length > 0 : false;
              typeInfo.vkOverridden = typeInfo.overrides.vk ? Object.keys(typeInfo.overrides.vk).length > 0 : false;
              typeInfo.maxOverridden = typeInfo.overrides.max ? Object.keys(typeInfo.overrides.max).length > 0 : false;
              typeInfo.emailOverridden = typeInfo.overrides.email ? Object.keys(typeInfo.overrides.email).length > 0 : false;
            }
          }
        }
      }
      showToast('Шаблон сохранён', 'success');
      // Re-render to update override indicators
      const subtabContent = document.getElementById('subtab-content');
      if (subtabContent && currentSubtab === 'notifications') {
        subtabContent.innerHTML = renderNotificationsSubtab();
      }
    } else {
      const err = await putResponse.json();
      showError(err.error || 'Ошибка сохранения');
    }
  } catch (err) {
    console.error('Error saving notification template:', err);
    showError('Ошибка сохранения шаблона');
  }
}

export async function resetNotificationTemplate(type, channel) {
  try {
    const response = await apiPost('/api/admin/notification-templates/reset', { type, channel });

    if (response.ok) {
      const result = await response.json();
      // Update local data
      if (notificationTemplatesData) {
        notificationTemplatesData.overrides = result.overrides;
        for (const group of notificationTemplatesData.groups) {
          for (const typeInfo of group.types) {
            if (typeInfo.type === type) {
              typeInfo.overrides = result.overrides[type] || {};
              typeInfo.telegramOverridden = typeInfo.overrides.telegram ? Object.keys(typeInfo.overrides.telegram).length > 0 : false;
              typeInfo.vkOverridden = typeInfo.overrides.vk ? Object.keys(typeInfo.overrides.vk).length > 0 : false;
              typeInfo.maxOverridden = typeInfo.overrides.max ? Object.keys(typeInfo.overrides.max).length > 0 : false;
              typeInfo.emailOverridden = typeInfo.overrides.email ? Object.keys(typeInfo.overrides.email).length > 0 : false;
              const disabled = typeInfo.overrides._disabled || {};
              typeInfo.telegramDisabled = disabled.telegram === true;
              typeInfo.emailDisabled = disabled.email === true;
              typeInfo.vkDisabled = disabled.vk === true;
              typeInfo.maxDisabled = disabled.max === true;
            }
          }
        }
      }
      showToast('Шаблон сброшен к оригиналу', 'success');
      // Re-render
      const subtabContent = document.getElementById('subtab-content');
      if (subtabContent && currentSubtab === 'notifications') {
        subtabContent.innerHTML = renderNotificationsSubtab();
      }
    } else {
      const err = await response.json();
      showError(err.error || 'Ошибка сброса');
    }
  } catch (err) {
    console.error('Error resetting notification template:', err);
    showError('Ошибка сброса шаблона');
  }
}

export async function toggleNotificationEnabled(type, channel, disabled) {
  try {
    const response = await apiPatch('/api/admin/notification-templates/toggle', { type, channel, disabled });

    if (response.ok) {
      const result = await response.json();
      if (notificationTemplatesData) {
        notificationTemplatesData.overrides = result.overrides;
        for (const group of notificationTemplatesData.groups) {
          for (const typeInfo of group.types) {
            if (typeInfo.type === type) {
              typeInfo.overrides = result.overrides[type] || {};
              const dis = typeInfo.overrides._disabled || {};
              typeInfo.telegramDisabled = dis.telegram === true;
              typeInfo.emailDisabled = dis.email === true;
              typeInfo.vkDisabled = dis.vk === true;
              typeInfo.maxDisabled = dis.max === true;
            }
          }
        }
      }
      // Re-render to update opacity
      const subtabContent = document.getElementById('subtab-content');
      if (subtabContent && currentSubtab === 'notifications') {
        subtabContent.innerHTML = renderNotificationsSubtab();
      }
    } else {
      const err = await response.json();
      showError(err.error || 'Ошибка изменения настройки');
    }
  } catch (err) {
    console.error('Error toggling notification:', err);
    showError('Ошибка изменения настройки');
  }
}
