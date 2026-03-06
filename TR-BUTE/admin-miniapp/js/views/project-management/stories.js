/**
 * Stories management sub-module
 */

import { apiGet, apiPost } from '../../utils/apiClient.js';
import { showToast } from '../../utils.js';
import {
  storiesData, setStoriesData,
  storiesLoaded, setStoriesLoaded,
  editingStoryId, setEditingStoryId,
  storiesSortable, setStoriesSortable,
  showConfirmDialog
} from './state.js';

export function renderStoriesSubtab() {
  return `
    <!-- Stories Management Section -->
    <div class="card" id="stories-section">
      <div class="card-header">
        <h3 class="card-title" style="display: flex; align-items: center; gap: var(--spacing-sm);">
          <span class="icon-wrapper" style="width: 20px; height: 20px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </span>
          Stories (Истории)
        </h3>
        <button class="btn btn-secondary btn-sm" data-action="refresh-stories" title="Обновить">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 4v6h-6M1 20v-6h6"/>
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
          </svg>
        </button>
      </div>
      <div class="card-body" id="stories-section-content">
        <div id="stories-container">
          <div class="loading-spinner" style="padding: var(--spacing-md);">
            <div class="spinner"></div>
            <p>Загрузка историй...</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function renderStoriesContent() {
  const container = document.getElementById('stories-container');
  if (!container) return;

  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-md);">
      <p style="color: var(--text-secondary); font-size: 0.813rem; margin: 0;">
        Истории для уведомлений о новых функциях. Перетаскивайте для изменения порядка.
      </p>
      <button class="btn btn-primary btn-sm" data-action="add-story">
        + Story
      </button>
    </div>

    <div id="stories-list-container" style="display: flex; flex-direction: column; gap: var(--spacing-sm);">
      ${storiesData.length === 0 ? `
        <div class="empty-state" style="padding: var(--spacing-md);">
          <p style="color: var(--text-tertiary);">Нет историй</p>
          <p style="font-size: 0.75rem; color: var(--text-tertiary); margin-top: var(--spacing-xs);">
            Добавьте первую историю, чтобы рассказать пользователям о новых функциях
          </p>
        </div>
      ` : storiesData.map(story => renderStoryItem(story)).join('')}
    </div>
  `;

  initStoriesSortable();
}

function renderStoryItem(story) {
  const statusBadge = story.is_active
    ? '<span style="font-size: 0.7rem; padding: 2px 6px; border-radius: var(--radius-sm); background: var(--success-bg); color: var(--success);">Активна</span>'
    : '<span style="font-size: 0.7rem; padding: 2px 6px; border-radius: var(--radius-sm); background: var(--bg-tertiary); color: var(--text-tertiary);">Неактивна</span>';

  return `
    <div class="story-item-wrapper" data-story-id="${story.id}"
         style="
           display: flex;
           align-items: center;
           padding: var(--spacing-sm);
           background: var(--bg-secondary);
           border-radius: var(--radius-md);
           gap: var(--spacing-sm);
         ">
      <div class="story-drag-handle" data-drag="story" style="cursor: grab; color: var(--text-tertiary); padding: 4px; touch-action: none;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
          <path d="M4 8h16M4 16h16"/>
        </svg>
      </div>
      <div style="width: 48px; height: 48px; border-radius: var(--radius-sm); overflow: hidden; flex-shrink: 0; background: var(--bg-tertiary);">
        ${story.image_url ? `<img src="${story.image_url}" alt="" style="width: 100%; height: 100%; object-fit: cover;">` : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--text-tertiary);font-size:0.7rem;">Нет</div>'}
      </div>
      <div style="flex: 1; min-width: 0;">
        <div style="font-size: 0.875rem; font-weight: 500; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          ${story.title || 'Без заголовка'}
        </div>
        <div style="display: flex; align-items: center; gap: var(--spacing-xs); margin-top: 2px;">
          ${statusBadge}
          <span style="font-size: 0.7rem; color: var(--text-tertiary);">${story.duration / 1000}с</span>
          ${story.link_url ? '<span style="font-size: 0.7rem; color: var(--text-tertiary);">+ ссылка</span>' : ''}
        </div>
      </div>
      <button class="btn btn-secondary btn-sm" data-action="edit-story" data-story-id="${story.id}" title="Редактировать" style="padding: 4px 8px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
      <button class="btn btn-danger btn-sm" data-action="delete-story" data-story-id="${story.id}" title="Удалить" style="padding: 4px 8px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
        </svg>
      </button>
    </div>
  `;
}

export async function loadStories() {
  const container = document.getElementById('stories-container');
  if (!container) return;

  container.innerHTML = `
    <div class="loading-spinner" style="padding: var(--spacing-md);">
      <div class="spinner"></div>
      <p>Загрузка историй...</p>
    </div>
  `;

  try {
    const response = await apiGet('/api/admin/stories');
    if (response.ok) {
      const result = await response.json();
      setStoriesData(result.stories || []);
      setStoriesLoaded(true);
      renderStoriesContent();
    } else {
      throw new Error('Failed to load stories');
    }
  } catch (err) {
    console.error('Error loading stories:', err);
    container.innerHTML = `
      <div class="empty-state" style="padding: var(--spacing-md);">
        <p style="color: var(--error);">Ошибка загрузки историй</p>
        <button class="btn btn-primary btn-sm" data-action="refresh-stories" style="margin-top: var(--spacing-sm);">Повторить</button>
      </div>
    `;
  }
}

export function initStoriesSortable() {
  const listContainer = document.getElementById('stories-list-container');
  if (!listContainer || storiesData.length === 0) return;

  if (storiesSortable) {
    storiesSortable.destroy();
  }

  const sortable = new Sortable(listContainer, {
    animation: 150,
    handle: '[data-drag="story"]',
    ghostClass: 'story-item-ghost',
    chosenClass: 'story-item-chosen',
    onEnd: async (evt) => {
      const items = listContainer.querySelectorAll('.story-item-wrapper');
      const newOrder = Array.from(items).map(item => parseInt(item.dataset.storyId));
      await saveStoriesOrder(newOrder);
    }
  });
  setStoriesSortable(sortable);
}

async function saveStoriesOrder(storyIds) {
  try {
    const response = await apiPost('/api/admin/stories/reorder', { story_ids: storyIds });
    if (response.ok) {
      showToast('Порядок сохранён', 'success');
      // Update local data order
      const newData = [];
      storyIds.forEach(id => {
        const story = storiesData.find(s => s.id === id);
        if (story) newData.push(story);
      });
      setStoriesData(newData);
    } else {
      throw new Error('Failed to save order');
    }
  } catch (err) {
    console.error('Error saving stories order:', err);
    showToast('Ошибка сохранения порядка', 'error');
  }
}

export function openStoryModal(story = null) {
  const isEdit = story !== null;
  setEditingStoryId(isEdit ? story.id : null);

  const modalHtml = `
    <div class="modal-overlay story-modal-overlay" style="position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: var(--spacing-md);">
      <div class="modal-content story-modal" style="background: var(--bg-primary); border-radius: var(--radius-lg); width: 100%; max-width: 480px; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
        <div class="modal-header" style="padding: var(--spacing-md); border-bottom: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between;">
          <h3 style="margin: 0; font-size: 1.125rem;">${isEdit ? 'Редактировать историю' : 'Новая история'}</h3>
          <button class="btn-icon" data-action="close-story-modal" style="background: none; border: none; cursor: pointer; padding: 4px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div class="modal-body" style="padding: var(--spacing-md);">
          <!-- Image URL with preview -->
          <div class="form-group" style="margin-bottom: var(--spacing-md);">
            <label class="form-label">URL изображения *</label>
            <input type="text" id="story-modal-image" class="form-input" value="${story?.image_url || ''}" placeholder="https://sun9-..." style="margin-bottom: var(--spacing-xs);">
            <div id="story-image-preview" style="width: 100%; aspect-ratio: 9/16; max-height: 200px; border-radius: var(--radius-md); overflow: hidden; background: var(--bg-secondary); display: flex; align-items: center; justify-content: center;">
              ${story?.image_url ? `<img src="${story.image_url}" alt="" style="width: 100%; height: 100%; object-fit: contain;">` : '<span style="color: var(--text-tertiary); font-size: 0.813rem;">Превью изображения</span>'}
            </div>
          </div>

          <!-- Title -->
          <div class="form-group" style="margin-bottom: var(--spacing-md);">
            <label class="form-label">Заголовок (опционально)</label>
            <input type="text" id="story-modal-title" class="form-input" value="${story?.title || ''}" placeholder="Новая функция!">
            <small style="color: var(--text-tertiary); font-size: 0.75rem;">Отображается поверх изображения</small>
          </div>

          <!-- Link URL and text -->
          <div style="display: grid; grid-template-columns: 2fr 1fr; gap: var(--spacing-sm); margin-bottom: var(--spacing-md);">
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label">URL кнопки (опционально)</label>
              <input type="text" id="story-modal-link" class="form-input" value="${story?.link_url || ''}" placeholder="https://...">
            </div>
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label">Текст кнопки</label>
              <input type="text" id="story-modal-linktext" class="form-input" value="${story?.link_text || ''}" placeholder="Подробнее">
            </div>
          </div>

          <!-- Duration -->
          <div class="form-group" style="margin-bottom: var(--spacing-md);">
            <label class="form-label">Длительность показа</label>
            <div style="display: flex; align-items: center; gap: var(--spacing-sm);">
              <input type="range" id="story-modal-duration-range" min="3" max="15" value="${(story?.duration || 5000) / 1000}" style="flex: 1;">
              <span id="story-modal-duration-value" style="min-width: 40px; text-align: center; font-weight: 500;">${(story?.duration || 5000) / 1000}с</span>
            </div>
            <input type="hidden" id="story-modal-duration" value="${story?.duration || 5000}">
          </div>

          <!-- Schedule -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--spacing-sm); margin-bottom: var(--spacing-md);">
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label">Начало показа</label>
              <input type="datetime-local" id="story-modal-starts" class="form-input" value="${story?.starts_at ? story.starts_at.slice(0, 16) : ''}">
            </div>
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label">Конец показа</label>
              <input type="datetime-local" id="story-modal-ends" class="form-input" value="${story?.ends_at ? story.ends_at.slice(0, 16) : ''}">
            </div>
          </div>
          <small style="color: var(--text-tertiary); font-size: 0.75rem; display: block; margin-bottom: var(--spacing-md);">Оставьте пустым для показа без ограничений по времени</small>

          <!-- Active toggle -->
          <div class="toggle-row" style="padding: var(--spacing-sm); background: var(--bg-secondary); border-radius: var(--radius-md);">
            <div class="toggle-label">
              <span class="toggle-title">Активна</span>
              <span class="toggle-description" style="font-size: 0.75rem; color: var(--text-tertiary);">История будет видна пользователям</span>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="story-modal-active" ${story?.is_active ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
        <div class="modal-footer" style="padding: var(--spacing-md); border-top: 1px solid var(--border-color); display: flex; gap: var(--spacing-sm); justify-content: flex-end;">
          <button class="btn btn-secondary" data-action="close-story-modal">Отмена</button>
          <button class="btn btn-primary" data-action="save-story-modal">${isEdit ? 'Сохранить' : 'Создать'}</button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);

  // Setup image preview on URL change
  const imageInput = document.getElementById('story-modal-image');
  const previewContainer = document.getElementById('story-image-preview');

  imageInput?.addEventListener('input', () => {
    const url = imageInput.value.trim();
    if (url) {
      previewContainer.innerHTML = `<img src="${url}" alt="" style="width: 100%; height: 100%; object-fit: contain;" onerror="this.parentElement.innerHTML='<span style=\\'color: var(--error); font-size: 0.813rem;\\'>Ошибка загрузки</span>'">`;
    } else {
      previewContainer.innerHTML = '<span style="color: var(--text-tertiary); font-size: 0.813rem;">Превью изображения</span>';
    }
  });

  // Setup duration slider
  const durationRange = document.getElementById('story-modal-duration-range');
  const durationValue = document.getElementById('story-modal-duration-value');
  const durationHidden = document.getElementById('story-modal-duration');

  durationRange?.addEventListener('input', () => {
    const seconds = parseInt(durationRange.value);
    durationValue.textContent = seconds + 'с';
    durationHidden.value = seconds * 1000;
  });

  // Setup close on overlay click
  const overlay = document.querySelector('.story-modal-overlay');
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeStoryModal();
    }
  });

  // Setup button click handlers (modal is outside #content, so need direct handlers)
  const closeButtons = document.querySelectorAll('[data-action="close-story-modal"]');
  closeButtons.forEach(btn => btn.addEventListener('click', closeStoryModal));

  const saveButton = document.querySelector('[data-action="save-story-modal"]');
  saveButton?.addEventListener('click', saveStoryFromModal);

  // Focus on image input
  setTimeout(() => imageInput?.focus(), 100);
}

export function closeStoryModal() {
  const modal = document.querySelector('.story-modal-overlay');
  if (modal) {
    modal.remove();
  }
  setEditingStoryId(null);
}

export async function saveStoryFromModal() {
  const imageUrl = document.getElementById('story-modal-image')?.value?.trim();
  const title = document.getElementById('story-modal-title')?.value?.trim();
  const linkUrl = document.getElementById('story-modal-link')?.value?.trim();
  const linkText = document.getElementById('story-modal-linktext')?.value?.trim();
  const duration = parseInt(document.getElementById('story-modal-duration')?.value) || 5000;
  const startsAt = document.getElementById('story-modal-starts')?.value || null;
  const endsAt = document.getElementById('story-modal-ends')?.value || null;
  const isActive = document.getElementById('story-modal-active')?.checked;

  if (!imageUrl) {
    showToast('URL изображения обязателен', 'error');
    return;
  }

  const isEdit = editingStoryId !== null;

  try {
    let response;

    if (isEdit) {
      // Update existing story
      response = await fetch('/api/admin/stories', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': window.Telegram?.WebApp?.initData || ''
        },
        body: JSON.stringify({
          id: editingStoryId,
          image_url: imageUrl,
          title: title || null,
          link_url: linkUrl || null,
          link_text: linkText || null,
          duration,
          starts_at: startsAt || null,
          ends_at: endsAt || null,
          is_active: isActive
        })
      });
    } else {
      // Create new story
      response = await apiPost('/api/admin/stories', {
        image_url: imageUrl,
        title: title || null,
        link_url: linkUrl || null,
        link_text: linkText || null,
        duration,
        starts_at: startsAt || null,
        ends_at: endsAt || null,
        is_active: isActive
      });
    }

    if (response.ok) {
      const result = await response.json();

      if (isEdit) {
        // Update local data
        const index = storiesData.findIndex(s => s.id === editingStoryId);
        if (index !== -1) {
          const newData = [...storiesData];
          newData[index] = result.story;
          setStoriesData(newData);
        }
        showToast('История сохранена', 'success');
      } else {
        // Add to local data
        setStoriesData([...storiesData, result.story]);
        showToast('История создана', 'success');
      }

      closeStoryModal();
      renderStoriesContent();
    } else {
      throw new Error(isEdit ? 'Failed to save story' : 'Failed to create story');
    }
  } catch (err) {
    console.error('Error saving story:', err);
    showToast('Ошибка сохранения', 'error');
  }
}

export async function deleteStory(storyId) {
  const confirmed = await showConfirmDialog(
    'Удалить историю?',
    'Это действие нельзя отменить.',
    'Удалить',
    true
  );

  if (!confirmed) return;

  try {
    const response = await fetch('/api/admin/stories', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-init-data': window.Telegram?.WebApp?.initData || ''
      },
      body: JSON.stringify({ id: storyId })
    });

    if (response.ok) {
      setStoriesData(storiesData.filter(s => s.id !== storyId));
      renderStoriesContent();
      showToast('История удалена', 'success');
    } else {
      throw new Error('Failed to delete story');
    }
  } catch (err) {
    console.error('Error deleting story:', err);
    showToast('Ошибка удаления', 'error');
  }
}
