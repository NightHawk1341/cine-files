/**
 * Bot greetings management sub-module
 */

import { apiGet, apiPost } from '../../utils/apiClient.js';
import { showToast, showError } from '../../utils.js';
import {
  botGreetingsData, setBotGreetingsData,
  botGreetingsLoaded, setBotGreetingsLoaded,
  currentSubtab,
  vkProductDescCommunity,
  escapeHtml,
  escapeAttr
} from './state.js';

export function renderBotsSubtab() {
  if (!botGreetingsLoaded) {
    loadBotGreetings();
    return `
      <div class="loading-spinner">
        <div class="spinner"></div>
        <p>Загрузка настроек ботов...</p>
      </div>
    `;
  }

  if (!botGreetingsData) {
    return `
      <div class="empty-state">
        <h3>Ошибка загрузки</h3>
        <p>Не удалось загрузить настройки ботов</p>
        <button class="btn btn-primary mt-sm" data-action="reload-bot-greetings">Повторить</button>
      </div>
    `;
  }

  const greetAllTelegram = !!botGreetingsData.greet_all_telegram;
  const greetAllVk = !!botGreetingsData.greet_all_vk;
  const telegramEnabled = botGreetingsData.telegram_greeting_enabled !== false;
  const vkEnabled = botGreetingsData.vk_greeting_enabled !== false;

  return `
    <div class="card" style="margin-bottom: var(--spacing-md);">
      <div class="card-header" style="padding-bottom: 0;">
        <div class="toggle-row" style="padding: 0;">
          <div class="toggle-label">
            <span class="toggle-title">Приветствие Telegram</span>
            <span class="toggle-subtitle">${telegramEnabled ? 'Приветствие отправляется' : 'Приветствие отключено'}</span>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="telegram-greeting-enabled" ${telegramEnabled ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom: var(--spacing-md);">
      <div class="card-header">
        <h3 class="card-title" style="display: flex; align-items: center; gap: var(--spacing-sm);">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
          Telegram — личные сообщения
        </h3>
      </div>
      <div class="card-body">
        <p style="font-size: 0.813rem; color: var(--text-secondary); margin: 0 0 var(--spacing-sm) 0;">Приветствие при /start в личном чате с ботом</p>
        <textarea
          id="bot-greeting-tg-private"
          class="form-textarea"
          style="min-height: 100px; width: 100%; border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-primary); color: var(--text-primary); padding: var(--spacing-sm); font-family: inherit; resize: vertical; font-size: 0.875rem;"
        >${escapeHtml(botGreetingsData.telegram_private || '')}</textarea>
      </div>
    </div>

    <div class="card" style="margin-bottom: var(--spacing-md);">
      <div class="card-header">
        <h3 class="card-title" style="display: flex; align-items: center; gap: var(--spacing-sm);">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
          Telegram — группы и каналы
        </h3>
      </div>
      <div class="card-body">
        <p style="font-size: 0.813rem; color: var(--text-secondary); margin: 0 0 var(--spacing-sm) 0;">Приветствие в группах, каналах и обсуждениях</p>
        <textarea
          id="bot-greeting-tg-group"
          class="form-textarea"
          style="min-height: 80px; width: 100%; border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-primary); color: var(--text-primary); padding: var(--spacing-sm); font-family: inherit; resize: vertical; font-size: 0.875rem;"
        >${escapeHtml(botGreetingsData.telegram_group || '')}</textarea>
      </div>
    </div>

    <div class="card" style="margin-bottom: var(--spacing-md);">
      <div class="card-header" style="padding-bottom: 0;">
        <div class="toggle-row" style="padding: 0;">
          <div class="toggle-label">
            <span class="toggle-title">Для всех в Telegram</span>
            <span class="toggle-subtitle">${greetAllTelegram ? 'При сохранении все получат обновлённое приветствие' : 'Только новые пользователи получат приветствие'}</span>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="greet-all-telegram" ${greetAllTelegram ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom: var(--spacing-md);">
      <div class="card-header" style="padding-bottom: 0;">
        <div class="toggle-row" style="padding: 0;">
          <div class="toggle-label">
            <span class="toggle-title">Приветствие VK</span>
            <span class="toggle-subtitle">${vkEnabled ? 'Приветствие отправляется' : 'Приветствие отключено'}</span>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="vk-greeting-enabled" ${vkEnabled ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom: var(--spacing-md);">
      <div class="card-header">
        <h3 class="card-title" style="display: flex; align-items: center; gap: var(--spacing-sm);">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
          VK — ссылка в кнопке
        </h3>
      </div>
      <div class="card-body">
        <p style="font-size: 0.813rem; color: var(--text-secondary); margin: 0 0 var(--spacing-sm) 0;">URL кнопки «Открыть магазин» в приветствии (для всех сообществ)</p>
        <input
          type="url"
          id="bot-vk-button-url"
          class="form-input"
          placeholder="https://buy-tribute.com"
          value="${escapeAttr(botGreetingsData.vk_button_url || '')}"
          style="width: 100%; border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-primary); color: var(--text-primary); padding: var(--spacing-sm); font-family: inherit; font-size: 0.875rem;"
        >
      </div>
    </div>

    <div class="card" style="margin-bottom: var(--spacing-md);">
      <div class="card-header">
        <h3 class="card-title" style="display: flex; align-items: center; gap: var(--spacing-sm);">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>
          VK — сообщество 1
        </h3>
      </div>
      <div class="card-body">
        <p style="font-size: 0.813rem; color: var(--text-secondary); margin: 0 0 var(--spacing-xs) 0; font-weight: 500;">Приветствие (сообщение)</p>
        <p style="font-size: 0.75rem; color: var(--text-tertiary); margin: 0 0 var(--spacing-sm) 0;">Отправляется при первом сообщении пользователя</p>
        <textarea
          id="bot-greeting-vk-1-message"
          class="form-textarea"
          style="min-height: 80px; width: 100%; border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-primary); color: var(--text-primary); padding: var(--spacing-sm); font-family: inherit; resize: vertical; font-size: 0.875rem;"
        >${escapeHtml(botGreetingsData.vk_1_message || botGreetingsData.vk_1 || botGreetingsData.vk || '')}</textarea>
        <p style="font-size: 0.813rem; color: var(--text-secondary); margin: var(--spacing-md) 0 var(--spacing-xs) 0; font-weight: 500;">Приветствие (заказ VK Market)</p>
        <p style="font-size: 0.75rem; color: var(--text-tertiary); margin: 0 0 var(--spacing-sm) 0;">Отправляется при первой покупке через VK Market</p>
        <textarea
          id="bot-greeting-vk-1-market"
          class="form-textarea"
          style="min-height: 80px; width: 100%; border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-primary); color: var(--text-primary); padding: var(--spacing-sm); font-family: inherit; resize: vertical; font-size: 0.875rem;"
        >${escapeHtml(botGreetingsData.vk_1_market_order || '')}</textarea>
      </div>
    </div>

    <div class="card" style="margin-bottom: var(--spacing-md);">
      <div class="card-header">
        <h3 class="card-title" style="display: flex; align-items: center; gap: var(--spacing-sm);">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>
          VK — сообщество 2
        </h3>
      </div>
      <div class="card-body">
        <p style="font-size: 0.813rem; color: var(--text-secondary); margin: 0 0 var(--spacing-xs) 0; font-weight: 500;">Приветствие (сообщение)</p>
        <p style="font-size: 0.75rem; color: var(--text-tertiary); margin: 0 0 var(--spacing-sm) 0;">Отправляется при первом сообщении пользователя</p>
        <textarea
          id="bot-greeting-vk-2-message"
          class="form-textarea"
          style="min-height: 80px; width: 100%; border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-primary); color: var(--text-primary); padding: var(--spacing-sm); font-family: inherit; resize: vertical; font-size: 0.875rem;"
        >${escapeHtml(botGreetingsData.vk_2_message || botGreetingsData.vk_2 || botGreetingsData.vk || '')}</textarea>
        <p style="font-size: 0.813rem; color: var(--text-secondary); margin: var(--spacing-md) 0 var(--spacing-xs) 0; font-weight: 500;">Приветствие (заказ VK Market)</p>
        <p style="font-size: 0.75rem; color: var(--text-tertiary); margin: 0 0 var(--spacing-sm) 0;">Отправляется при первой покупке через VK Market</p>
        <textarea
          id="bot-greeting-vk-2-market"
          class="form-textarea"
          style="min-height: 80px; width: 100%; border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-primary); color: var(--text-primary); padding: var(--spacing-sm); font-family: inherit; resize: vertical; font-size: 0.875rem;"
        >${escapeHtml(botGreetingsData.vk_2_market_order || '')}</textarea>
      </div>
    </div>

    <div class="card" style="margin-bottom: var(--spacing-md);">
      <div class="card-header" style="padding-bottom: 0;">
        <div class="toggle-row" style="padding: 0;">
          <div class="toggle-label">
            <span class="toggle-title">Для всех в VK</span>
            <span class="toggle-subtitle">${greetAllVk ? 'При сохранении все получат обновлённое приветствие' : 'Только новые пользователи получат приветствие'}</span>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="greet-all-vk" ${greetAllVk ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    </div>

    <button class="btn btn-primary btn-block" data-action="save-bot-greetings">Сохранить</button>

    <div class="card" style="margin-top: var(--spacing-lg); margin-bottom: 80px;">
      <div class="card-header">
        <h3 class="card-title" style="display: flex; align-items: center; gap: var(--spacing-sm);">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
          VK — описания товаров
        </h3>
      </div>
      <div class="card-body">
        <p style="font-size: 0.813rem; color: var(--text-secondary); margin: 0 0 var(--spacing-sm) 0;">Обновить описание всех товаров в магазине сообщества. Токен сообщества должен иметь права <code>market</code>.</p>
        <div style="display: flex; gap: var(--spacing-sm); margin-bottom: var(--spacing-sm);">
          <button
            class="btn ${vkProductDescCommunity === 1 ? 'btn-primary' : 'btn-secondary'}"
            data-action="vk-community-select"
            data-community="1"
            style="flex: 1;"
          >TR/BUTE</button>
          <button
            class="btn ${vkProductDescCommunity === 2 ? 'btn-primary' : 'btn-secondary'}"
            data-action="vk-community-select"
            data-community="2"
            style="flex: 1;"
          >Cinema Critique</button>
        </div>
        <textarea
          id="vk-product-desc"
          class="form-textarea"
          placeholder="Описание товара..."
          style="min-height: 100px; width: 100%; border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-primary); color: var(--text-primary); padding: var(--spacing-sm); font-family: inherit; resize: vertical; font-size: 0.875rem; margin-bottom: var(--spacing-sm);"
        ></textarea>
        <div id="vk-products-result" style="font-size: 0.813rem; color: var(--text-secondary); margin-bottom: var(--spacing-sm); min-height: 1.2em;"></div>
        <button class="btn btn-primary btn-block" data-action="update-vk-products">Обновить описания товаров</button>
      </div>
    </div>
  `;
}

export async function updateVkProductDescriptions() {
  const description = document.getElementById('vk-product-desc')?.value?.trim();
  const resultEl = document.getElementById('vk-products-result');
  const btn = document.querySelector('[data-action="update-vk-products"]');

  if (!description) {
    if (resultEl) resultEl.textContent = 'Введите описание.';
    return;
  }

  if (btn) btn.disabled = true;
  if (resultEl) resultEl.textContent = 'Загрузка товаров и обновление...';

  try {
    const response = await apiPost('/api/admin/vk/update-products', {
      community: vkProductDescCommunity,
      description
    }, { noRetry: true });

    let data;
    try {
      data = await response.json();
    } catch {
      const msg = 'Нет ответа от сервера (таймаут или сетевая ошибка).';
      if (resultEl) resultEl.textContent = msg;
      showError(msg);
      return;
    }

    if (response.ok) {
      if (data.total === 0) {
        const msg = data.message || 'Товары не найдены в сообществе.';
        if (resultEl) resultEl.textContent = msg;
        showToast(msg, 'warning');
      } else {
        const msg = `Обновлено: ${data.updated} из ${data.total}${data.errors > 0 ? `, ошибок: ${data.errors}` : ''}.`;
        if (resultEl) resultEl.textContent = msg;
        if (data.errors === 0) {
          showToast(msg, 'success');
        } else {
          showToast(msg, 'warning');
        }
      }
    } else {
      const errMsg = data.vk_error ? `Ошибка VK: ${data.vk_error}` : (data.error || 'Ошибка обновления');
      if (resultEl) resultEl.textContent = errMsg;
      showError(errMsg);
    }
  } catch (err) {
    console.error('VK product update error:', err);
    if (resultEl) resultEl.textContent = 'Ошибка запроса.';
    showError('Ошибка запроса');
  } finally {
    if (btn) btn.disabled = false;
  }
}

export async function loadBotGreetings() {
  try {
    const response = await apiGet('/api/settings/get?key=bot_greetings');
    if (response.ok) {
      const result = await response.json();
      if (result.setting?.value) {
        setBotGreetingsData(result.setting.value);
      } else {
        setBotGreetingsData({
          telegram_greeting_enabled: true,
          telegram_private: '\u{1F44B} Добро пожаловать в TR/BUTE!\n\nЯ помогу вам:\n\u2022 Найти нужный постер по названию\n\u2022 Отследить ваши заказы\n\u2022 Ответить на частые вопросы\n\nВыберите действие из меню ниже:',
          telegram_group: '\u{1F44B} Добро пожаловать в TR/BUTE!\n\nОткройте наш магазин, чтобы посмотреть каталог и сделать заказ.\n\nhttps://buy-tribute.vercel.app',
          vk_greeting_enabled: true,
          vk_1: '\u{1F44B} Добро пожаловать в TR/BUTE!\n\nМы создаём авторские постеры. Откройте наш магазин, чтобы посмотреть каталог и сделать заказ.\n\nhttps://buy-tribute.com',
          vk_2: '\u{1F44B} Добро пожаловать в TR/BUTE!\n\nМы создаём авторские постеры. Откройте наш магазин, чтобы посмотреть каталог и сделать заказ.\n\nhttps://buy-tribute.com',
          vk_button_url: 'https://buy-tribute.com'
        });
      }
    }
  } catch (err) {
    console.error('Error loading bot greetings:', err);
    setBotGreetingsData(null);
  }
  setBotGreetingsLoaded(true);

  const subtabContent = document.getElementById('subtab-content');
  if (subtabContent && currentSubtab === 'bots') {
    subtabContent.innerHTML = renderBotsSubtab();
  }
}

export async function saveBotGreetings() {
  const tgPrivate = document.getElementById('bot-greeting-tg-private')?.value || '';
  const tgGroup = document.getElementById('bot-greeting-tg-group')?.value || '';
  const vk1Message = document.getElementById('bot-greeting-vk-1-message')?.value || '';
  const vk1Market = document.getElementById('bot-greeting-vk-1-market')?.value || '';
  const vk2Message = document.getElementById('bot-greeting-vk-2-message')?.value || '';
  const vk2Market = document.getElementById('bot-greeting-vk-2-market')?.value || '';
  const vkButtonUrl = document.getElementById('bot-vk-button-url')?.value.trim() || '';
  const greetAllTelegram = !!document.getElementById('greet-all-telegram')?.checked;
  const greetAllVk = !!document.getElementById('greet-all-vk')?.checked;
  const telegramGreetingEnabled = !!document.getElementById('telegram-greeting-enabled')?.checked;
  const vkGreetingEnabled = !!document.getElementById('vk-greeting-enabled')?.checked;

  // Build reset list from toggles that are ON
  const resetPlatforms = [];
  if (greetAllTelegram) resetPlatforms.push('telegram');
  if (greetAllVk) resetPlatforms.push('vk');

  try {
    const body = {
      key: 'bot_greetings',
      value: {
        telegram_greeting_enabled: telegramGreetingEnabled,
        telegram_private: tgPrivate,
        telegram_group: tgGroup,
        vk_greeting_enabled: vkGreetingEnabled,
        vk_1_message: vk1Message,
        vk_1_market_order: vk1Market,
        vk_2_message: vk2Message,
        vk_2_market_order: vk2Market,
        vk_button_url: vkButtonUrl,
        greet_all_telegram: greetAllTelegram,
        greet_all_vk: greetAllVk
      }
    };
    if (resetPlatforms.length > 0) {
      body.reset_greeted = resetPlatforms;
    }

    const response = await apiPost('/api/settings/update', body);

    if (response.ok) {
      setBotGreetingsData(body.value);
      showToast('Приветствия ботов сохранены', 'success');
    } else {
      showError('Не удалось сохранить');
    }
  } catch (err) {
    console.error('Error saving bot greetings:', err);
    showError('Ошибка сохранения');
  }
}
