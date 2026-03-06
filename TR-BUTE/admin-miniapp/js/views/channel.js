/**
 * views/channel.js
 * Extracted from admin-miniapp/script.js
 */

import { state, updateState } from '../state.js';
import { API_BASE, tg, isBrowserMode } from '../config.js';
import { requireAuth, formatDate, formatTime, formatPrice, showToast, showError, copyToClipboard } from '../utils.js';
import { apiPost } from '../utils/apiClient.js';

// ============================================================================
// CHANNEL POST VIEW
// ============================================================================

function loadChannelPost() {
  requireAuth();
  const content = document.getElementById('content');

  content.innerHTML = `
    <div class="page-header">
      <h2 class="page-title">Отправить в канал</h2>
    </div>

    <div class="card" style="padding: var(--spacing-md);">
      <!-- Text input -->
      <textarea
        id="channel-message"
        class="form-textarea"
        placeholder="Текст сообщения..."
        style="min-height: 120px; margin-bottom: var(--spacing-md); width: 100%; border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-primary); color: var(--text-primary); padding: var(--spacing-sm); font-family: inherit; resize: vertical;"
      ></textarea>

      <!-- Action buttons row -->
      <div style="display: flex; gap: var(--spacing-sm); margin-bottom: var(--spacing-md);">
        <!-- Image upload button -->
        <button class="btn btn-secondary btn-sm channel-action-btn" data-action="trigger-image-upload" title="Добавить изображение">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <circle cx="8.5" cy="8.5" r="1.5"></circle>
            <polyline points="21 15 16 10 5 21"></polyline>
          </svg>
        </button>
        <input type="file" id="channel-image" accept="image/*" style="display: none;">

        <!-- Schedule button -->
        <button class="btn btn-secondary btn-sm channel-action-btn" data-action="toggle-schedule-input" title="Запланировать публикацию">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
        </button>
      </div>

      <!-- Image preview (if uploaded) -->
      <div id="image-preview" style="margin-bottom: var(--spacing-md);"></div>

      <!-- Schedule input (hidden by default) -->
      <div id="schedule-input" style="display: none; margin-bottom: var(--spacing-md);">
        <div style="display: flex; align-items: center; gap: var(--spacing-sm);">
          <input type="datetime-local" id="schedule-time" class="form-input" style="flex: 1;">
          <button class="btn btn-secondary btn-xs" data-action="clear-schedule" title="Отменить">×</button>
        </div>
      </div>

      <!-- Schedule display (shows chosen time) -->
      <div id="schedule-display" style="display: none; margin-bottom: var(--spacing-md); padding: var(--spacing-sm); background: var(--bg-tertiary); border-radius: var(--radius-sm); font-size: 0.875rem; color: var(--text-secondary);"></div>

      <!-- Buttons section -->
      <div style="margin-bottom: var(--spacing-md);">
        <div style="font-size: 0.875rem; font-weight: 600; color: var(--text-secondary); margin-bottom: var(--spacing-sm);">Кнопки</div>

        <!-- Default shop button -->
        <div id="shop-button-container">
          <div class="channel-button-item" style="display: flex; align-items: center; gap: var(--spacing-sm); padding: var(--spacing-sm); background: var(--bg-secondary); border-radius: var(--radius-sm); margin-bottom: var(--spacing-xs);">
            <span style="flex: 1; font-size: 0.875rem;">Открыть магазин</span>
            <button class="btn btn-secondary btn-xs" data-action="remove-shop-button" title="Удалить">×</button>
          </div>
        </div>

        <!-- Custom buttons container -->
        <div id="channel-buttons"></div>

        <!-- Add button -->
        <button class="btn btn-secondary btn-sm" data-action="add-channel-button" style="width: 100%; margin-top: var(--spacing-sm);">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px;">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Добавить кнопку
        </button>
      </div>

      <!-- Send button -->
      <button class="btn btn-primary btn-block" data-action="send-channel-post">Отправить в канал</button>
    </div>
  `;

  // Add event listeners after DOM is updated
  setTimeout(() => {
    // Set up click event delegation for all channel actions
    attachChannelEventListeners();

    // Image upload handler
    const imageInput = document.getElementById('channel-image');
    const imagePreview = document.getElementById('image-preview');
    if (imageInput && imagePreview) {
      imageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (e) => {
            imagePreview.innerHTML = `
              <div style="display: flex; align-items: center; gap: var(--spacing-sm); padding: var(--spacing-sm); background: var(--bg-secondary); border-radius: var(--radius-md);">
                <img src="${e.target.result}" style="width: 60px; height: 60px; object-fit: cover; border-radius: var(--radius-sm);">
                <span style="flex: 1; font-size: 0.875rem; color: var(--text-secondary);">${file.name}</span>
                <button class="btn btn-secondary btn-xs" data-action="clear-image" title="Удалить">×</button>
              </div>
            `;
          };
          reader.readAsDataURL(file);
        } else {
          imagePreview.innerHTML = '';
        }
      });
    }

    // Schedule time change handler
    const scheduleTime = document.getElementById('schedule-time');
    const scheduleDisplay = document.getElementById('schedule-display');
    if (scheduleTime && scheduleDisplay) {
      scheduleTime.addEventListener('change', (e) => {
        if (e.target.value) {
          const date = new Date(e.target.value);
          scheduleDisplay.innerHTML = `📅 Запланировано на: ${formatDateTime(date)}`;
          scheduleDisplay.style.display = 'block';
        } else {
          scheduleDisplay.style.display = 'none';
        }
      });
    }
  }, 0);
}

// Helper functions for channel posting
function triggerImageUpload() {
  document.getElementById('channel-image').click();
}

function clearImage() {
  document.getElementById('channel-image').value = '';
  document.getElementById('image-preview').innerHTML = '';
}

function toggleScheduleInput() {
  const scheduleInput = document.getElementById('schedule-input');
  if (scheduleInput.style.display === 'none') {
    scheduleInput.style.display = 'block';
  } else {
    scheduleInput.style.display = 'none';
  }
}

function clearSchedule() {
  document.getElementById('schedule-time').value = '';
  document.getElementById('schedule-display').style.display = 'none';
  document.getElementById('schedule-input').style.display = 'none';
}

let shopButtonEnabled = true;

function removeShopButton() {
  document.getElementById('shop-button-container').style.display = 'none';
  shopButtonEnabled = false;
}

function restoreShopButton() {
  document.getElementById('shop-button-container').style.display = 'block';
  shopButtonEnabled = true;
}

let buttonCounter = 0;

function addChannelButton() {
  const container = document.getElementById('channel-buttons');
  const buttonId = `btn-${buttonCounter++}`;

  const buttonHTML = `
    <div class="channel-button-item" id="${buttonId}" style="display: flex; flex-direction: column; gap: var(--spacing-xs); padding: var(--spacing-sm); background: var(--bg-secondary); border-radius: var(--radius-sm); margin-bottom: var(--spacing-xs);">
      <div style="display: flex; gap: var(--spacing-xs);">
        <input type="text" placeholder="Название кнопки" class="button-text" style="flex: 1; padding: 6px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-primary); color: var(--text-primary); font-size: 0.875rem;">
        <button class="btn btn-secondary btn-xs" data-action="remove-channel-button" data-button-id='${buttonId}' title="Удалить">×</button>
      </div>
      <input type="url" placeholder="https://example.com" class="button-url" style="width: 100%; padding: 6px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-primary); color: var(--text-primary); font-size: 0.875rem;">
    </div>
  `;

  container.insertAdjacentHTML('beforeend', buttonHTML);
}

function removeChannelButton(buttonId) {
  document.getElementById(buttonId).remove();
}

async function sendChannelPost() {
  const message = document.getElementById('channel-message').value.trim();

  if (!message) {
    showToast('Введите текст сообщения', 'error');
    return;
  }

  // Check if scheduled
  const scheduleTime = document.getElementById('schedule-time');
  let scheduledAt = null;

  if (scheduleTime && scheduleTime.value) {
    scheduledAt = new Date(scheduleTime.value).toISOString();

    // Validate that scheduled time is in the future
    if (new Date(scheduledAt) <= new Date()) {
      showToast('Время публикации должно быть в будущем', 'error');
      return;
    }
  }

  // Collect buttons
  const buttons = [];

  // Add shop button if enabled
  if (shopButtonEnabled && document.getElementById('shop-button-container').style.display !== 'none') {
    buttons.push({
      text: 'Открыть магазин',
      url: window.location.origin
    });
  }

  // Add custom buttons
  document.querySelectorAll('#channel-buttons .channel-button-item').forEach(item => {
    const text = item.querySelector('.button-text').value.trim();
    const url = item.querySelector('.button-url').value.trim();

    if (text && url) {
      buttons.push({ text, url });
    }
  });

  // Handle image
  const imageInput = document.getElementById('channel-image');
  let imageBase64 = null;

  if (imageInput && imageInput.files.length > 0) {
    const file = imageInput.files[0];
    // Convert to base64
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
      message: message,
      buttons: buttons.length > 0 ? buttons : null,
      image: imageBase64,
      scheduled_at: scheduledAt
    };

    const response = await apiPost(`/api/webhooks/admin-bot`, payload);

    if (!response.ok) throw new Error('Failed to post');

    if (scheduledAt) {
      showToast('Сообщение запланировано', 'success');
    } else {
      showToast('Сообщение отправлено в канал', 'success');
    }

    // Clear form
    document.getElementById('channel-message').value = '';
    document.getElementById('channel-buttons').innerHTML = '';
    clearImage();
    clearSchedule();
    restoreShopButton();
    buttonCounter = 0;
  } catch (error) {
    console.error('Error sending channel post:', error);
    showToast('Ошибка при отправке сообщения', 'error');
  }
}




/**
 * Attach event listeners for channel view
 */
function attachChannelEventListeners() {
  const content = document.getElementById('content');
  if (!content) return;

  const oldHandler = content._channelClickHandler;
  if (oldHandler) {
    content.removeEventListener('click', oldHandler);
  }

  const clickHandler = (e) => {
    const target = e.target;
    const action = target.dataset.action || target.closest('[data-action]')?.dataset.action;
    if (!action) return;

    const buttonId = target.dataset.buttonId || target.closest('[data-button-id]')?.dataset.buttonId;

    switch (action) {
      case 'trigger-image-upload':
        triggerImageUpload();
        break;
      case 'toggle-schedule-input':
        toggleScheduleInput();
        break;
      case 'clear-schedule':
        clearSchedule();
        break;
      case 'clear-image':
        clearImage();
        break;
      case 'send-channel-post':
        sendChannelPost();
        break;
      case 'add-channel-button':
        addChannelButton();
        break;
      case 'remove-channel-button':
        if (buttonId) removeChannelButton(buttonId);
        break;
      case 'remove-shop-button':
        removeShopButton();
        break;
    }
  };

  content._channelClickHandler = clickHandler;
  content.addEventListener('click', clickHandler);
}

// Exports
export {
  loadChannelPost as renderChannelView,
  sendChannelPost as postToChannel,
  sendChannelPost,
  triggerImageUpload,
  clearImage,
  toggleScheduleInput,
  clearSchedule,
  addChannelButton,
  removeChannelButton
};
