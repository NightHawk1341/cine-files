/**
 * Custom Telegram emoji settings sub-module
 */

import { apiGet, apiPost } from '../../utils/apiClient.js';
import { showToast, showError } from '../../utils.js';
import {
  emojiSettingsData, setEmojiSettingsData,
  emojiSettingsLoaded, setEmojiSettingsLoaded,
  escapeAttr
} from './state.js';

// Ordered list of emojis with their display labels and usage context
const EMOJI_DEFS = [
  { emoji: '👋', label: 'Приветствие', hint: '/start, вход нового пользователя' },
  { emoji: '🛒', label: 'Заказ создан', hint: 'order_created, order_created_cert_only, order_created_cert_mixed' },
  { emoji: '✅', label: 'Заказ подтверждён', hint: 'order_confirmed' },
  { emoji: '📦', label: 'Упаковка / Пункт выдачи', hint: 'delivery_cost_added, parcel_at_pickup_point' },
  { emoji: '💳', label: 'Оплата получена', hint: 'payment_received' },
  { emoji: '🚚', label: 'Заказ отправлен', hint: 'order_shipped' },
  { emoji: '❌', label: 'Заказ отменён', hint: 'order_cancelled' },
  { emoji: '🎉', label: 'Товар появился', hint: 'product_available' },
  { emoji: '📞', label: 'Запрос на связь', hint: 'contact_request' },
  { emoji: '💬', label: 'Ответ администратора / Поддержка', hint: 'admin_response' },
  { emoji: '💰', label: 'Возврат средств', hint: 'refund_processed' },
  { emoji: '↩️', label: 'Возврат посылки', hint: 'parcel_returned_to_sender' },
  { emoji: '⏰', label: 'Напоминание о хранении', hint: 'storage_pickup_reminder' },
  { emoji: '🎁', label: 'Сертификат доставлен', hint: 'certificate_delivered' },
  { emoji: '❓', label: 'FAQ / Помощь', hint: 'кнопка меню бота' },
  { emoji: '🔍', label: 'Поиск', hint: 'кнопка меню бота' },
  { emoji: '❤️', label: 'Избранное', hint: 'кнопка меню бота' },
  { emoji: '🎴', label: 'Подборщик', hint: 'кнопка меню бота' },
];

export function renderEmojiSubtab() {
  if (!emojiSettingsLoaded) {
    loadEmojiSettings();
    return `
      <div class="loading-spinner">
        <div class="spinner"></div>
        <p>Загрузка настроек эмодзи...</p>
      </div>
    `;
  }

  if (!emojiSettingsData) {
    return `
      <div class="empty-state">
        <h3>Ошибка загрузки</h3>
        <p>Не удалось загрузить настройки эмодзи</p>
        <button class="btn btn-primary mt-sm" data-action="reload-emoji-settings">Повторить</button>
      </div>
    `;
  }

  const rows = EMOJI_DEFS.map(({ emoji, label, hint }) => {
    const id = emojiSettingsData[emoji] || '';
    return `
      <div style="display: flex; align-items: center; gap: var(--spacing-sm); padding: var(--spacing-sm) 0; border-bottom: 1px solid var(--divider);">
        <span style="font-size: 1.75rem; min-width: 2.5rem; text-align: center; line-height: 1;">${emoji}</span>
        <div style="flex: 1; min-width: 0;">
          <div style="font-size: 0.875rem; font-weight: 500; color: var(--text-primary);">${label}</div>
          <div style="font-size: 0.75rem; color: var(--text-tertiary);">${hint}</div>
        </div>
        <input
          type="text"
          class="form-input emoji-id-input"
          data-emoji="${escapeAttr(emoji)}"
          value="${escapeAttr(id)}"
          placeholder="ID или пусто"
          style="width: 160px; flex-shrink: 0; border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-primary); color: var(--text-primary); padding: var(--spacing-xs) var(--spacing-sm); font-family: inherit; font-size: 0.8125rem;"
        >
      </div>
    `;
  }).join('');

  return `
    <div class="card" style="margin-bottom: var(--spacing-md);">
      <div class="card-header">
        <h3 class="card-title">Кастомные эмодзи Telegram</h3>
      </div>
      <div class="card-body" style="padding-top: 0;">
        <p style="font-size: 0.813rem; color: var(--text-secondary); margin: 0 0 var(--spacing-sm) 0;">
          Вставьте ID кастомного эмодзи для каждого символа. Оставьте поле пустым, чтобы использовать стандартный Unicode.
        </p>
        <div style="background: var(--bg-tertiary); border-radius: var(--radius-md); padding: var(--spacing-sm); margin-bottom: var(--spacing-md); font-size: 0.8125rem; color: var(--text-secondary); line-height: 1.5;">
          <strong style="color: var(--text-primary);">Как получить ID:</strong>
          создайте стикер-пак через @Stickers_bot → отправьте сообщение с кастомным эмодзи боту @RawDataBot → найдите <code>MessageEntity</code> с типом <code>custom_emoji</code> и скопируйте <code>custom_emoji_id</code>.
        </div>
        ${rows}
      </div>
    </div>

    <button class="btn btn-primary btn-block" style="margin-bottom: 80px;" data-action="save-emoji-settings">Сохранить</button>
  `;
}

export async function loadEmojiSettings() {
  try {
    const response = await apiGet('/api/settings/get?key=custom_emojis');
    if (response.ok) {
      const result = await response.json();
      setEmojiSettingsData(result.setting?.value || {});
    } else {
      setEmojiSettingsData({});
    }
  } catch (err) {
    console.error('Error loading emoji settings:', err);
    setEmojiSettingsData(null);
  }
  setEmojiSettingsLoaded(true);

  const subtabContent = document.getElementById('subtab-content');
  if (subtabContent) {
    subtabContent.innerHTML = renderEmojiSubtab();
  }
}

export async function saveEmojiSettings() {
  const inputs = document.querySelectorAll('.emoji-id-input');
  const ids = {};
  inputs.forEach(input => {
    const emoji = input.dataset.emoji;
    const val = input.value.trim();
    ids[emoji] = val || null;
  });

  try {
    const response = await apiPost('/api/settings/update', {
      key: 'custom_emojis',
      value: ids
    });

    if (response.ok) {
      setEmojiSettingsData(ids);
      showToast('Настройки эмодзи сохранены', 'success');
    } else {
      showError('Не удалось сохранить');
    }
  } catch (err) {
    console.error('Error saving emoji settings:', err);
    showError('Ошибка сохранения');
  }
}
