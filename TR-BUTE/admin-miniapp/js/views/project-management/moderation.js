/**
 * Moderation management sub-module
 * Manages banned word list and moderation settings
 */

import { apiGet, apiPost, apiPut, apiDelete } from '../../utils/apiClient.js';
import { showToast, showError, showModal, hideModal } from '../../utils.js';
import {
  moderationWords, setModerationWords,
  moderationConfig, setModerationConfig,
  moderationLoaded, setModerationLoaded,
  moderationSearchQuery, setModerationSearchQuery,
  currentSubtab,
  escapeHtml,
  escapeAttr,
  updateSetting
} from './state.js';

// Category labels
const CATEGORY_LABELS = {
  general: 'Общее',
  hate: 'Ненависть',
  profanity: 'Мат',
  spam: 'Спам',
  custom: 'Другое'
};

const CATEGORIES = Object.keys(CATEGORY_LABELS);

export function renderModerationSubtab() {
  if (!moderationLoaded) {
    loadModerationData();
    return `
      <div class="loading-spinner">
        <div class="spinner"></div>
        <p>Загрузка настроек модерации...</p>
      </div>
    `;
  }

  const config = moderationConfig || { enabled: true, check_reviews: true, check_comments: true, check_suggestions: true };
  const words = moderationWords || [];

  // Filter words by search
  const query = moderationSearchQuery.toLowerCase();
  const filtered = query
    ? words.filter(w => w.word.toLowerCase().includes(query) || w.category.includes(query))
    : words;

  // Group by category
  const grouped = {};
  for (const w of filtered) {
    if (!grouped[w.category]) grouped[w.category] = [];
    grouped[w.category].push(w);
  }

  const totalActive = words.filter(w => w.is_active).length;

  return `
    <div class="card" style="margin-bottom: var(--spacing-md);">
      <div class="card-header" style="padding-bottom: 0;">
        <div class="toggle-row" style="padding: 0;">
          <div class="toggle-label">
            <span class="toggle-title">Автомодерация</span>
            <span class="toggle-subtitle">${config.enabled ? `Активна (${totalActive} слов)` : 'Отключена'}</span>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="moderation-enabled" ${config.enabled ? 'checked' : ''} data-action="toggle-moderation-enabled">
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
      ${config.enabled ? `
      <div style="padding: 0 var(--spacing-md) var(--spacing-md);">
        <div style="display: flex; gap: var(--spacing-sm); flex-wrap: wrap; margin-top: var(--spacing-sm);">
          <label style="display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-secondary); cursor: pointer;">
            <input type="checkbox" id="mod-check-reviews" ${config.check_reviews ? 'checked' : ''} data-action="toggle-moderation-type" data-type="check_reviews">
            Отзывы
          </label>
          <label style="display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-secondary); cursor: pointer;">
            <input type="checkbox" id="mod-check-comments" ${config.check_comments ? 'checked' : ''} data-action="toggle-moderation-type" data-type="check_comments">
            Комментарии
          </label>
          <label style="display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-secondary); cursor: pointer;">
            <input type="checkbox" id="mod-check-suggestions" ${config.check_suggestions ? 'checked' : ''} data-action="toggle-moderation-type" data-type="check_suggestions">
            Предложения
          </label>
        </div>
      </div>
      ` : ''}
    </div>

    <div class="card" style="margin-bottom: var(--spacing-md);">
      <div class="card-header">
        <h3 style="margin: 0; font-size: 15px;">Список запрещённых слов</h3>
      </div>
      <div style="padding: 0 var(--spacing-md) var(--spacing-sm);">
        <div style="display: flex; gap: var(--spacing-sm); align-items: center; flex-wrap: wrap;">
          <input type="text" class="form-input" id="moderation-search" placeholder="Поиск слова..."
            value="${escapeAttr(moderationSearchQuery)}"
            style="flex: 1; min-width: 150px; height: 36px; font-size: 13px;"
            data-action="moderation-search">
          <button class="btn btn-primary btn-sm" data-action="add-moderation-word">+ Добавить</button>
          <button class="btn btn-secondary btn-sm" data-action="bulk-import-moderation">Импорт</button>
          <button class="btn btn-secondary btn-sm" data-action="reload-moderation" title="Обновить список">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
          </button>
        </div>
      </div>

      <div style="padding: 0 var(--spacing-md) var(--spacing-md);">
        ${filtered.length === 0 ? `
          <div style="text-align: center; padding: var(--spacing-lg); color: var(--text-tertiary);">
            ${words.length === 0
              ? 'Список пуст. Добавьте слова для модерации.'
              : 'Ничего не найдено по запросу.'}
          </div>
        ` : Object.entries(grouped).map(([category, categoryWords]) => `
          <div class="moderation-category-group">
            <div class="moderation-category-header">
              <span>${escapeHtml(CATEGORY_LABELS[category] || category)}</span>
              <span style="color: var(--text-tertiary); font-size: 12px;">${categoryWords.length}</span>
            </div>
            <div class="moderation-words-list">
              ${categoryWords.map(w => `
                <div class="moderation-word-item ${!w.is_active ? 'moderation-word-inactive' : ''}">
                  <span class="moderation-word-text">${escapeHtml(w.word)}</span>
                  <div class="moderation-word-actions">
                    <button class="btn-icon" data-action="toggle-moderation-word-active" data-id="${w.id}" data-active="${w.is_active}" title="${w.is_active ? 'Деактивировать' : 'Активировать'}">
                      ${w.is_active
                        ? '<svg viewBox="0 0 24 24" fill="none" stroke="var(--status-success)" stroke-width="2" width="16" height="16"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
                        : '<svg viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>'
                      }
                    </button>
                    <button class="btn-icon" data-action="edit-moderation-word" data-id="${w.id}" title="Изменить">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="btn-icon" data-action="delete-moderation-word" data-id="${w.id}" title="Удалить">
                      <svg viewBox="0 0 24 24" fill="none" stroke="var(--status-error)" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                    </button>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3 style="margin: 0; font-size: 15px;">Тест модерации</h3>
      </div>
      <div style="padding: 0 var(--spacing-md) var(--spacing-md);">
        <textarea class="form-textarea" id="moderation-test-text" rows="3" placeholder="Введите текст для проверки..."
          style="font-size: 13px; margin-bottom: var(--spacing-sm);"></textarea>
        <div style="display: flex; gap: var(--spacing-sm); align-items: center;">
          <button class="btn btn-primary btn-sm" data-action="test-moderation">Проверить</button>
          <div id="moderation-test-result"></div>
        </div>
      </div>
    </div>
  `;
}

export async function loadModerationData() {
  try {
    const [wordsRes, configRes] = await Promise.all([
      apiGet('/api/admin/moderation/words'),
      apiGet('/api/settings/get?key=moderation_config')
    ]);

    if (wordsRes.ok) {
      const data = await wordsRes.json();
      setModerationWords(data.words || []);
    } else {
      setModerationWords([]);
    }

    if (configRes.ok) {
      const data = await configRes.json();
      setModerationConfig(data.setting?.value || {
        enabled: true,
        check_reviews: true,
        check_comments: true,
        check_suggestions: true
      });
    }
  } catch (err) {
    console.error('[moderation] Load error:', err);
    setModerationWords([]);
  }

  setModerationLoaded(true);

  const subtabContent = document.getElementById('subtab-content');
  if (subtabContent && currentSubtab === 'moderation') {
    subtabContent.innerHTML = renderModerationSubtab();
  }
}

export async function toggleModerationEnabled() {
  const checkbox = document.getElementById('moderation-enabled');
  const newConfig = { ...moderationConfig, enabled: checkbox.checked };
  setModerationConfig(newConfig);

  const saved = await updateSetting('moderation_config', newConfig);
  if (saved) {
    showToast(newConfig.enabled ? 'Модерация включена' : 'Модерация отключена', 'success');
  }

  const subtabContent = document.getElementById('subtab-content');
  if (subtabContent && currentSubtab === 'moderation') {
    subtabContent.innerHTML = renderModerationSubtab();
  }
}

export async function toggleModerationType(type) {
  const newConfig = { ...moderationConfig, [type]: !moderationConfig[type] };
  setModerationConfig(newConfig);

  await updateSetting('moderation_config', newConfig);

  const subtabContent = document.getElementById('subtab-content');
  if (subtabContent && currentSubtab === 'moderation') {
    subtabContent.innerHTML = renderModerationSubtab();
  }
}

export function handleModerationSearch() {
  const input = document.getElementById('moderation-search');
  if (!input) return;
  setModerationSearchQuery(input.value);

  const subtabContent = document.getElementById('subtab-content');
  if (subtabContent && currentSubtab === 'moderation') {
    subtabContent.innerHTML = renderModerationSubtab();
    // Restore focus and cursor position
    const newInput = document.getElementById('moderation-search');
    if (newInput) {
      newInput.focus();
      newInput.selectionStart = newInput.selectionEnd = newInput.value.length;
    }
  }
}

export function showAddWordModal() {
  showModal('Добавить слово', `
    <div class="form-group">
      <label class="form-label">Слово</label>
      <input type="text" class="form-input" id="new-word-input" placeholder="Введите слово" autofocus>
    </div>
    <div class="form-group">
      <label class="form-label">Категория</label>
      <select class="form-select" id="new-word-category">
        ${CATEGORIES.map(c => `<option value="${c}">${escapeHtml(CATEGORY_LABELS[c])}</option>`).join('')}
      </select>
    </div>
  `, [
    { text: 'Отмена', className: 'btn btn-secondary', onClick: hideModal },
    { text: 'Добавить', className: 'btn btn-primary', onClick: () => saveNewWord() }
  ]);
}

async function saveNewWord() {
  const input = document.getElementById('new-word-input');
  const category = document.getElementById('new-word-category');

  if (!input || !input.value.trim()) {
    showToast('Введите слово', 'error');
    return;
  }

  try {
    const response = await apiPost('/api/admin/moderation/words', {
      word: input.value.trim(),
      category: category?.value || 'general'
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || 'Failed');
    }

    const data = await response.json();
    if (data.inserted?.length > 0) {
      setModerationWords([...moderationWords, ...data.inserted]);
      showToast('Слово добавлено', 'success');
    } else {
      showToast('Слово уже существует', 'warning');
    }

    hideModal();

    const subtabContent = document.getElementById('subtab-content');
    if (subtabContent && currentSubtab === 'moderation') {
      subtabContent.innerHTML = renderModerationSubtab();
    }
  } catch (err) {
    console.error('[moderation] Add error:', err);
    showToast('Ошибка добавления', 'error');
  }
}

export function showBulkImportModal() {
  showModal('Импорт слов', `
    <div class="form-group">
      <label class="form-label">Слова (по одному на строку)</label>
      <textarea class="form-textarea" id="bulk-import-text" rows="8" placeholder="слово1\nслово2\nслово3" style="font-size: 13px;"></textarea>
    </div>
    <div class="form-group">
      <label class="form-label">Категория</label>
      <select class="form-select" id="bulk-import-category">
        ${CATEGORIES.map(c => `<option value="${c}">${escapeHtml(CATEGORY_LABELS[c])}</option>`).join('')}
      </select>
    </div>
  `, [
    { text: 'Отмена', className: 'btn btn-secondary', onClick: hideModal },
    { text: 'Импортировать', className: 'btn btn-primary', onClick: () => saveBulkImport() }
  ]);
}

async function saveBulkImport() {
  const textarea = document.getElementById('bulk-import-text');
  const category = document.getElementById('bulk-import-category');

  if (!textarea || !textarea.value.trim()) {
    showToast('Введите слова', 'error');
    return;
  }

  const words = textarea.value
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  if (words.length === 0) {
    showToast('Нет валидных слов', 'error');
    return;
  }

  try {
    const response = await apiPost('/api/admin/moderation/words', {
      words,
      category: category?.value || 'general'
    });

    if (!response.ok) throw new Error('Failed');

    const data = await response.json();
    const inserted = data.inserted || [];
    const skipped = data.skipped || [];

    if (inserted.length > 0) {
      setModerationWords([...moderationWords, ...inserted]);
    }

    hideModal();
    showToast(`Добавлено: ${inserted.length}, пропущено: ${skipped.length}`, 'success');

    const subtabContent = document.getElementById('subtab-content');
    if (subtabContent && currentSubtab === 'moderation') {
      subtabContent.innerHTML = renderModerationSubtab();
    }
  } catch (err) {
    console.error('[moderation] Bulk import error:', err);
    showToast('Ошибка импорта', 'error');
  }
}

export function showEditWordModal(wordId) {
  const word = moderationWords.find(w => w.id === parseInt(wordId));
  if (!word) return;

  showModal('Изменить слово', `
    <div class="form-group">
      <label class="form-label">Слово</label>
      <input type="text" class="form-input" id="edit-word-input" value="${escapeAttr(word.word)}">
    </div>
    <div class="form-group">
      <label class="form-label">Категория</label>
      <select class="form-select" id="edit-word-category">
        ${CATEGORIES.map(c => `<option value="${c}" ${c === word.category ? 'selected' : ''}>${escapeHtml(CATEGORY_LABELS[c])}</option>`).join('')}
      </select>
    </div>
  `, [
    { text: 'Отмена', className: 'btn btn-secondary', onClick: hideModal },
    { text: 'Сохранить', className: 'btn btn-primary', onClick: () => saveEditWord(word.id) }
  ]);
}

async function saveEditWord(wordId) {
  const input = document.getElementById('edit-word-input');
  const category = document.getElementById('edit-word-category');

  if (!input || !input.value.trim()) {
    showToast('Введите слово', 'error');
    return;
  }

  try {
    const response = await apiPut('/api/admin/moderation/words', {
      id: wordId,
      word: input.value.trim(),
      category: category?.value || 'general'
    });

    if (!response.ok) throw new Error('Failed');

    const data = await response.json();
    setModerationWords(moderationWords.map(w => w.id === wordId ? data.word : w));

    hideModal();
    showToast('Слово обновлено', 'success');

    const subtabContent = document.getElementById('subtab-content');
    if (subtabContent && currentSubtab === 'moderation') {
      subtabContent.innerHTML = renderModerationSubtab();
    }
  } catch (err) {
    console.error('[moderation] Edit error:', err);
    showToast('Ошибка обновления', 'error');
  }
}

export async function deleteWord(wordId) {
  try {
    const response = await apiDelete(`/api/admin/moderation/words?id=${wordId}`);
    if (!response.ok) throw new Error('Failed');

    setModerationWords(moderationWords.filter(w => w.id !== parseInt(wordId)));
    showToast('Слово удалено', 'success');

    const subtabContent = document.getElementById('subtab-content');
    if (subtabContent && currentSubtab === 'moderation') {
      subtabContent.innerHTML = renderModerationSubtab();
    }
  } catch (err) {
    console.error('[moderation] Delete error:', err);
    showToast('Ошибка удаления', 'error');
  }
}

export async function toggleWordActive(wordId, currentlyActive) {
  const newActive = currentlyActive === 'true' ? false : true;
  try {
    const response = await apiPut('/api/admin/moderation/words', {
      id: parseInt(wordId),
      is_active: newActive
    });

    if (!response.ok) throw new Error('Failed');

    const data = await response.json();
    setModerationWords(moderationWords.map(w => w.id === parseInt(wordId) ? data.word : w));

    const subtabContent = document.getElementById('subtab-content');
    if (subtabContent && currentSubtab === 'moderation') {
      subtabContent.innerHTML = renderModerationSubtab();
    }
  } catch (err) {
    console.error('[moderation] Toggle error:', err);
    showToast('Ошибка обновления', 'error');
  }
}

export async function testModeration() {
  const textarea = document.getElementById('moderation-test-text');
  const resultDiv = document.getElementById('moderation-test-result');

  if (!textarea || !textarea.value.trim()) {
    if (resultDiv) resultDiv.innerHTML = '<span style="color: var(--text-tertiary); font-size: 13px;">Введите текст</span>';
    return;
  }

  try {
    const response = await apiPost('/api/admin/moderation/test', {
      text: textarea.value
    });

    if (!response.ok) throw new Error('Failed');

    const data = await response.json();

    if (resultDiv) {
      if (data.passed) {
        resultDiv.innerHTML = '<span style="color: var(--status-success); font-size: 13px;">&#10003; Текст прошёл модерацию</span>';
      } else {
        resultDiv.innerHTML = `<span style="color: var(--status-error); font-size: 13px;">&#10007; Найдено: ${escapeHtml(data.matchedWords.join(', '))}</span>`;
      }
    }
  } catch (err) {
    console.error('[moderation] Test error:', err);
    if (resultDiv) resultDiv.innerHTML = '<span style="color: var(--status-error); font-size: 13px;">Ошибка проверки</span>';
  }
}
