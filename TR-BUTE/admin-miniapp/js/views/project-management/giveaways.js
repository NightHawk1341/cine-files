/**
 * Giveaway management sub-module
 */

import { apiGet, apiPost } from '../../utils/apiClient.js';
import { showToast, showError } from '../../utils.js';
import {
  giveawaysData, setGiveawaysData,
  giveawaysLoaded, setGiveawaysLoaded,
  showGiveawayForm, setShowGiveawayForm,
  currentSubtab,
  escapeHtml
} from './state.js';

export function renderGiveawaySubtab() {
  if (!giveawaysLoaded) {
    loadGiveaways();
    return `
      <div class="loading-spinner">
        <div class="spinner"></div>
        <p>Загрузка розыгрышей...</p>
      </div>
    `;
  }

  const channels = giveawaysData?.channels || [];
  const giveaways = giveawaysData?.giveaways || [];
  const active = giveaways.filter(g => g.status === 'active');
  const past = giveaways.filter(g => g.status !== 'active');

  const inputStyle = 'border:1px solid var(--border-color);border-radius:var(--radius-md);background:var(--bg-primary);color:var(--text-primary);padding:var(--spacing-sm);font-size:0.875rem;';

  function timeLeft(endTime) {
    const diff = new Date(endTime) - Date.now();
    if (diff <= 0) return 'истёк';
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    if (h > 48) return `${Math.floor(h / 24)} дн.`;
    if (h > 0) return `${h} ч ${m} мин`;
    return `${m} мин`;
  }

  function winnerName(w) {
    return w.username ? `@${w.username}` : (w.first_name || `ID ${w.user_id}`);
  }

  const channelLabels = Object.fromEntries(channels.map(c => [c.id, c.name]));

  const activeHtml = active.length === 0
    ? `<p style="color:var(--text-secondary);font-size:0.875rem;">Нет активных розыгрышей.</p>`
    : active.map(g => `
    <div class="card" style="margin-bottom:var(--spacing-md);">
      <div class="card-header">
        <h3 class="card-title">${escapeHtml(g.title)}</h3>
      </div>
      <div class="card-body" style="font-size:0.875rem;">
        ${g.description ? `<p style="margin:0 0 var(--spacing-xs) 0;color:var(--text-secondary);">${escapeHtml(g.description)}</p>` : ''}
        ${g.prizes ? `<p style="margin:0 0 var(--spacing-xs) 0;">🏆 ${escapeHtml(g.prizes)}</p>` : ''}
        <p style="margin:0 0 var(--spacing-xs) 0;">👥 Участников: <b>${g.participant_count}</b> &nbsp; Победителей: ${g.winner_count}</p>
        <p style="margin:0 0 var(--spacing-xs) 0;">⏰ Осталось: ${timeLeft(g.end_time)}</p>
        <p style="margin:0 0 var(--spacing-md) 0;color:var(--text-secondary);">Каналы: ${g.channel_ids.map(id => escapeHtml(channelLabels[id] || id)).join(', ')}</p>
        <div style="display:flex;gap:var(--spacing-sm);">
          <button class="btn btn-primary" style="flex:1;" data-action="giveaway-pick-winners" data-id="${g.id}">Выбрать победителей</button>
          <button class="btn btn-secondary" data-action="giveaway-cancel" data-id="${g.id}">Отменить</button>
        </div>
      </div>
    </div>
  `).join('');

  const pastHtml = past.length === 0 ? '' : `
    <h4 style="color:var(--text-secondary);font-size:0.813rem;margin:var(--spacing-lg) 0 var(--spacing-sm) 0;text-transform:uppercase;letter-spacing:0.05em;">Завершённые</h4>
    ${past.map(g => `
      <div class="card" style="margin-bottom:var(--spacing-sm);opacity:0.8;">
        <div class="card-body" style="font-size:0.875rem;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--spacing-xs);">
            <b>${escapeHtml(g.title)}</b>
            <span style="font-size:0.75rem;color:var(--text-secondary);">${g.status === 'cancelled' ? 'Отменён' : 'Завершён'}</span>
          </div>
          ${g.winners?.length ? `<p style="margin:0;color:var(--text-secondary);">Победители: ${g.winners.map(winnerName).join(', ')}</p>` : `<p style="margin:0;color:var(--text-secondary);">Участников: ${g.participant_count}</p>`}
        </div>
      </div>
    `).join('')}
  `;

  const formHtml = showGiveawayForm ? `
    <div class="card" style="margin-bottom:var(--spacing-md);">
      <div class="card-header">
        <h3 class="card-title">Новый розыгрыш</h3>
      </div>
      <div class="card-body">
        <input id="giveaway-title" class="form-input" placeholder="Название *" style="width:100%;margin-bottom:var(--spacing-sm);${inputStyle}">
        <textarea id="giveaway-desc" class="form-textarea" placeholder="Описание" style="width:100%;min-height:70px;margin-bottom:var(--spacing-sm);${inputStyle}resize:vertical;"></textarea>
        <input id="giveaway-prizes" class="form-input" placeholder="Призы" style="width:100%;margin-bottom:var(--spacing-sm);${inputStyle}">
        <div style="display:flex;gap:var(--spacing-md);align-items:center;margin-bottom:var(--spacing-sm);">
          <label style="font-size:0.875rem;color:var(--text-secondary);">Победителей:</label>
          <input id="giveaway-winners" type="number" min="1" value="1" class="form-input" style="width:80px;${inputStyle}">
        </div>
        ${channels.length === 0
          ? `<p style="color:var(--warning);font-size:0.875rem;margin-bottom:var(--spacing-sm);">Сначала добавьте каналы в настройках ниже.</p>`
          : `<div style="margin-bottom:var(--spacing-sm);">
              <p style="font-size:0.813rem;color:var(--text-secondary);margin:0 0 var(--spacing-xs) 0;">Каналы:</p>
              ${channels.map(c => `
                <label style="display:flex;align-items:center;gap:var(--spacing-xs);margin-bottom:4px;font-size:0.875rem;cursor:pointer;">
                  <input type="checkbox" class="giveaway-channel-check" value="${escapeHtml(c.id)}" checked>
                  ${escapeHtml(c.name)}
                </label>
              `).join('')}
            </div>`
        }
        <div style="margin-bottom:var(--spacing-md);">
          <label style="font-size:0.813rem;color:var(--text-secondary);display:block;margin-bottom:4px;">Дата и время окончания *</label>
          <input id="giveaway-endtime" type="datetime-local" class="form-input" style="width:100%;${inputStyle}">
        </div>
        <div style="display:flex;gap:var(--spacing-sm);">
          <button class="btn btn-primary" style="flex:1;" data-action="giveaway-submit">Создать и опубликовать</button>
          <button class="btn btn-secondary" data-action="giveaway-form-hide">Отмена</button>
        </div>
      </div>
    </div>
  ` : `
    <button class="btn btn-primary btn-block" style="margin-bottom:var(--spacing-md);" data-action="giveaway-form-show">+ Создать розыгрыш</button>
  `;

  const timingNoteHtml = `
    <p style="font-size:0.813rem;color:var(--text-secondary);margin:0 0 var(--spacing-md) 0;padding:var(--spacing-sm);background:var(--bg-secondary);border-radius:var(--radius-md);">
      ⏰ Победители выбираются автоматически в полночь UTC или при открытии этой вкладки — смотря что наступит раньше. Если розыгрыш заканчивается не в полночь, поставьте напоминание.
    </p>
  `;

  const channelsSettingsHtml = `
    <div class="card" style="margin-top:var(--spacing-lg);margin-bottom:var(--spacing-md);">
      <div class="card-header">
        <h3 class="card-title">Каналы для розыгрышей</h3>
      </div>
      <div class="card-body">
        <p style="font-size:0.813rem;color:var(--text-secondary);margin:0 0 var(--spacing-sm) 0;">Telegram ID канала (числовой, например <code>-1001234567890</code>) и название для отображения в интерфейсе.</p>
        <div id="giveaway-channels-list">
          ${channels.map((c, i) => `
            <div class="giveaway-channel-row" style="display:flex;gap:var(--spacing-xs);margin-bottom:var(--spacing-xs);align-items:center;">
              <input class="form-input giveaway-channel-id" value="${escapeHtml(c.id)}" placeholder="ID канала" style="flex:1;${inputStyle}">
              <input class="form-input giveaway-channel-name" value="${escapeHtml(c.name)}" placeholder="Название" style="flex:1;${inputStyle}">
              <button class="btn btn-secondary" data-action="giveaway-channel-remove" data-index="${i}" style="padding:var(--spacing-xs) var(--spacing-sm);flex-shrink:0;">✕</button>
            </div>
          `).join('')}
        </div>
        <button class="btn btn-secondary btn-block" style="margin-bottom:var(--spacing-sm);" data-action="giveaway-channel-add">+ Добавить канал</button>
        <button class="btn btn-primary btn-block" data-action="giveaway-channels-save">Сохранить каналы</button>
      </div>
    </div>
  `;

  return `
    ${timingNoteHtml}
    ${formHtml}
    ${activeHtml}
    ${pastHtml}
    ${channelsSettingsHtml}
    <div style="margin-bottom:80px;"></div>
  `;
}

export async function loadGiveaways() {
  try {
    const response = await apiGet('/api/admin/giveaways');
    if (response.ok) {
      setGiveawaysData(await response.json());
    } else {
      setGiveawaysData({ giveaways: [], channels: [] });
    }
  } catch (err) {
    console.error('loadGiveaways error:', err);
    setGiveawaysData({ giveaways: [], channels: [] });
  }
  setGiveawaysLoaded(true);
  const subtabContent = document.getElementById('subtab-content');
  if (subtabContent && currentSubtab === 'giveaway') {
    subtabContent.innerHTML = renderGiveawaySubtab();
  }
}

export async function submitCreateGiveaway() {
  const title = document.getElementById('giveaway-title')?.value?.trim();
  const desc = document.getElementById('giveaway-desc')?.value?.trim();
  const prizes = document.getElementById('giveaway-prizes')?.value?.trim();
  const winnerCount = parseInt(document.getElementById('giveaway-winners')?.value || '1', 10);
  const endTime = document.getElementById('giveaway-endtime')?.value;
  const channelChecks = document.querySelectorAll('.giveaway-channel-check:checked');
  const channelIds = Array.from(channelChecks).map(el => el.value);

  if (!title) { showError('Введите название'); return; }
  if (!endTime) { showError('Укажите дату окончания'); return; }
  if (channelIds.length === 0) { showError('Выберите хотя бы один канал'); return; }

  const btn = document.querySelector('[data-action="giveaway-submit"]');
  if (btn) btn.disabled = true;

  try {
    const response = await apiPost('/api/admin/giveaways/create', {
      title,
      description: desc || undefined,
      prizes: prizes || undefined,
      winner_count: winnerCount,
      channel_ids: channelIds,
      end_time: new Date(endTime).toISOString()
    });
    const data = await response.json();
    if (response.ok) {
      showToast('Розыгрыш создан и опубликован', 'success');
      setShowGiveawayForm(false);
      setGiveawaysLoaded(false);
      setGiveawaysData(null);
      loadGiveaways();
    } else {
      showError(data.error || 'Ошибка создания');
      if (btn) btn.disabled = false;
    }
  } catch (err) {
    console.error('submitCreateGiveaway error:', err);
    showError('Ошибка запроса');
    if (btn) btn.disabled = false;
  }
}

export async function pickGiveawayWinners(giveawayId) {
  const btn = document.querySelector(`[data-action="giveaway-pick-winners"][data-id="${giveawayId}"]`);
  if (btn) btn.disabled = true;

  try {
    const response = await apiPost('/api/admin/giveaways/pick-winners', { giveaway_id: giveawayId });
    const data = await response.json();
    if (response.ok) {
      showToast(`Победители выбраны (${data.winners?.length || 0} из ${data.totalParticipants})`, 'success');
      setGiveawaysLoaded(false);
      setGiveawaysData(null);
      loadGiveaways();
    } else {
      showError(data.error || 'Ошибка');
      if (btn) btn.disabled = false;
    }
  } catch (err) {
    console.error('pickGiveawayWinners error:', err);
    showError('Ошибка запроса');
    if (btn) btn.disabled = false;
  }
}

export async function cancelGiveaway(giveawayId) {
  const btn = document.querySelector(`[data-action="giveaway-cancel"][data-id="${giveawayId}"]`);
  if (btn) btn.disabled = true;

  try {
    const response = await apiPost('/api/admin/giveaways/cancel', { giveaway_id: giveawayId });
    const data = await response.json();
    if (response.ok) {
      showToast('Розыгрыш отменён', 'success');
      setGiveawaysLoaded(false);
      setGiveawaysData(null);
      loadGiveaways();
    } else {
      showError(data.error || 'Ошибка');
      if (btn) btn.disabled = false;
    }
  } catch (err) {
    console.error('cancelGiveaway error:', err);
    showError('Ошибка запроса');
    if (btn) btn.disabled = false;
  }
}

export async function saveGiveawayChannels() {
  const rows = document.querySelectorAll('.giveaway-channel-row');
  const channels = Array.from(rows).map(row => ({
    id: row.querySelector('.giveaway-channel-id')?.value?.trim(),
    name: row.querySelector('.giveaway-channel-name')?.value?.trim()
  })).filter(c => c.id && c.name);

  const btn = document.querySelector('[data-action="giveaway-channels-save"]');
  if (btn) btn.disabled = true;

  try {
    const response = await apiPost('/api/admin/giveaways/channels', { channels });
    const data = await response.json();
    if (response.ok) {
      if (giveawaysData) setGiveawaysData({ ...giveawaysData, channels: data.channels });
      showToast('Каналы сохранены', 'success');
    } else {
      showError(data.error || 'Ошибка сохранения');
    }
  } catch (err) {
    console.error('saveGiveawayChannels error:', err);
    showError('Ошибка запроса');
  } finally {
    if (btn) btn.disabled = false;
  }
}
