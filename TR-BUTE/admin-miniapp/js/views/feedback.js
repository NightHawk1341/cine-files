/**
 * views/feedback.js
 * Extracted from admin-miniapp/script.js
 */

import { state, updateState } from '../state.js';
import { API_BASE, tg, isBrowserMode } from '../config.js';
import { SVGIcons, requireAuth, showModal, hideModal, formatDate, formatTime, formatPrice, showToast, showError, copyToClipboard, addImageSize } from '../utils.js';
import { apiGet, apiPost } from '../utils/apiClient.js';

// ============================================================================
// IMAGE MANAGEMENT HELPERS
// ============================================================================

// Known storage provider domains
const STORAGE_DOMAINS = {
  'vercel': ['blob.vercel-storage.com', 'public.blob.vercel-storage.com'],
  'yandex': ['storage.yandexcloud.net', 's3.yandexcloud.net'],
  'supabase': ['supabase.co', 'supabase.com']
};

/**
 * Detect if image is hosted (uploaded) vs external URL
 */
function isHostedImage(imageUrl) {
  if (!imageUrl) return false;
  const urlLower = imageUrl.toLowerCase();
  for (const domains of Object.values(STORAGE_DOMAINS)) {
    for (const domain of domains) {
      if (urlLower.includes(domain)) return true;
    }
  }
  return false;
}

/**
 * Get storage provider name from URL
 */
function getStorageProvider(imageUrl) {
  if (!imageUrl) return null;
  const urlLower = imageUrl.toLowerCase();
  for (const [provider, domains] of Object.entries(STORAGE_DOMAINS)) {
    for (const domain of domains) {
      if (urlLower.includes(domain)) return provider;
    }
  }
  return null;
}

/**
 * Generate download filename for review image
 * Format: YYYY-MM-DD_username_N.ext
 */
function generateDownloadFilename(reviewDate, userName, imageIndex, imageUrl) {
  const date = new Date(reviewDate);
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
  const safeName = (userName || 'user').replace(/[^a-zA-Zа-яА-Я0-9]/g, '_').substring(0, 30);
  const ext = imageUrl.split('.').pop()?.split('?')[0] || 'jpg';
  return `${dateStr}_${safeName}_${imageIndex + 1}.${ext}`;
}

/**
 * Download image with custom filename
 */
async function downloadImage(imageUrl, filename) {
  try {
    showToast('Загрузка изображения...', 'info');
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Изображение загружено', 'success');
  } catch (error) {
    console.error('Error downloading image:', error);
    showToast('Ошибка загрузки изображения', 'error');
  }
}

// ============================================================================
// FEEDBACK VIEW (Reviews, Comments, Suggestions)
// ============================================================================

let currentFeedbackType = 'all'; // all, reviews, comments, suggestions

async function loadReviews() {
  requireAuth();
  const content = document.getElementById('content');

  content.innerHTML = `
    <div class="page-header">
      <h2 class="page-title">Отзывы и Предложения</h2>
      <button class="btn btn-secondary btn-sm btn-icon-only" data-action="refresh-feedback" title="Обновить">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M23 4v6h-6M1 20v-6h6"/>
          <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
        </svg>
      </button>
    </div>

    <div class="tabs-carousel">
      <div class="tabs-container">
        <button class="tab-btn ${currentFeedbackType === 'all' ? 'active' : ''}" data-action="filter-feedback" data-filter='all'>
          Все
        </button>
        <button class="tab-btn ${currentFeedbackType === 'reviews' ? 'active' : ''}" data-action="filter-feedback" data-filter='reviews'>
          Отзывы
        </button>
        <button class="tab-btn ${currentFeedbackType === 'comments' ? 'active' : ''}" data-action="filter-feedback" data-filter='comments'>
          Комментарии
        </button>
        <button class="tab-btn ${currentFeedbackType === 'suggestions' ? 'active' : ''}" data-action="filter-feedback" data-filter='suggestions'>
          Предложения
        </button>
      </div>
    </div>

    <div id="feedback-list">
      <div class="loading-spinner">
        <div class="spinner"></div>
        <p>Загрузка...</p>
      </div>
    </div>
  `;

  try {
    await loadFeedbackData();
  } catch (error) {
    console.error('Error loading feedback:', error);
    document.getElementById('feedback-list').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">${SVGIcons.alert}</div>
        <h3>Ошибка загрузки</h3>
        <p>Не удалось загрузить данные</p>
      </div>
    `;
  }
}

async function loadFeedbackData() {
  // Fetch all types in parallel
  const [reviews, comments, suggestions] = await Promise.all([
    fetchReviews(),
    fetchComments(),
    fetchSuggestions()
  ]);

  state.reviews = reviews;
  state.comments = comments;
  state.suggestions = suggestions;

  // Update badge with unanswered count
  const unansweredReviews = reviews.filter(r => !r.admin_response).length;
  const unansweredComments = comments.filter(c => !c.admin_response).length;
  const unansweredSuggestions = suggestions.filter(s => !s.admin_response).length;
  const totalUnanswered = unansweredReviews + unansweredComments + unansweredSuggestions;

  updateReviewsBadge(totalUnanswered);
  renderFeedback();
    attachFeedbackEventListeners();
}

function filterFeedback(type) {
  currentFeedbackType = type;
  loadReviews(); // Reload the view
}

/**
 * Force refresh feedback data
 */
async function refreshFeedback() {
  showToast('Обновление...', 'info');
  state.reviews = [];
  state.comments = [];
  state.suggestions = [];
  await loadFeedbackData();
  showToast('Отзывы обновлены', 'success');
}

function renderFeedback() {
  const container = document.getElementById('feedback-list');

  // Combine all feedback based on filter
  let allFeedback = [];

  if (currentFeedbackType === 'all' || currentFeedbackType === 'reviews') {
    allFeedback = allFeedback.concat(
      (state.reviews || []).map(r => ({
        ...r,
        type: 'review',
        icon: '',
        typename: 'Отзыв'
      }))
    );
  }

  if (currentFeedbackType === 'all' || currentFeedbackType === 'comments') {
    allFeedback = allFeedback.concat(
      (state.comments || []).map(c => ({
        ...c,
        type: 'comment',
        icon: '',
        typename: 'Комментарий'
      }))
    );
  }

  if (currentFeedbackType === 'all' || currentFeedbackType === 'suggestions') {
    allFeedback = allFeedback.concat(
      (state.suggestions || []).map(s => ({
        ...s,
        type: 'suggestion',
        icon: '',
        typename: 'Предложение'
      }))
    );
  }

  // Sort by date (newest first)
  allFeedback.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  if (allFeedback.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"></div>
        <h3>Нет сообщений</h3>
        <p>Отзывы, комментарии и предложения будут отображаться здесь</p>
      </div>
    `;
    return;
  }

  container.innerHTML = allFeedback.map(item => {
    const hasResponse = item.admin_response && item.admin_response.trim().length > 0;

    return `
      <div class="review-card ${item.is_hidden ? 'review-card-hidden' : ''}">
        <div class="review-header">
          <div style="min-width: 0;">
            <div class="review-type-header">
              <span class="review-type-label">${item.typename}</span>
              ${item.type === 'review' ? `<span class="feed-item-rating">${'★'.repeat(item.rating || 5)}${'☆'.repeat(5 - (item.rating || 5))}</span>` : ''}
              ${item.is_hidden ? '<span class="review-hidden-badge">СКРЫТО</span>' : ''}
            </div>
            <div class="review-author">${item.user_name || 'Аноним'}</div>
          </div>
          <span class="review-date">${formatDate(item.created_at)}</span>
        </div>

        ${item.product_title ? `<div class="review-product"><span style="color: var(--text-tertiary);">Товар:</span> ${item.product_title}</div>` : ''}
        <div class="review-text">${item.review_text || item.comment_text || item.suggestion_text || ''}</div>

        ${item.images && item.images.length > 0 ? `
          <div class="review-images-grid">
            ${item.images.map((img, idx) => {
              const hosted = isHostedImage(img.image_url);
              const provider = getStorageProvider(img.image_url);
              const providerLabel = provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : 'URL';
              const downloadName = generateDownloadFilename(item.created_at, item.user_name, idx, img.image_url);

              return `
                <div class="review-image-item ${hosted ? 'review-image-item--hosted' : 'review-image-item--external'}"
                     data-image-id="${img.id}"
                     data-image-url="${img.image_url}"
                     data-review-id="${item.id}"
                     data-download-name="${downloadName}"
                     data-is-hosted="${hosted}"
                     data-user-name="${item.user_name || 'Аноним'}"
                     data-review-date="${item.created_at}">
                  <img src="${addImageSize(img.image_url, '200x0')}" alt="Review image"
                       onerror="this.src='${img.image_url}'">
                  <span class="image-storage-badge image-storage-badge--${hosted ? 'hosted' : 'external'}">${hosted ? providerLabel : 'URL'}</span>
                  <div class="review-image-actions">
                    <button class="img-action-btn" data-action="download-review-image" title="Скачать">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                    </button>
                    <button class="img-action-btn" data-action="replace-review-image" title="Заменить на URL">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="img-action-btn img-action-btn--delete" data-action="delete-review-image" title="Удалить">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18m-2 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        ` : ''}

        ${hasResponse ? `
          <div class="review-admin-reply">
            <div class="review-admin-reply-header">
              <span class="review-admin-reply-label">Ответ магазина</span>
              <button class="btn btn-danger btn-xxs" data-action="delete-admin-response" data-feedback-type="${item.type}" data-feedback-id="${item.id}" title="Удалить ответ магазина">×</button>
            </div>
            <div class="review-admin-reply-text">${item.admin_response}</div>
            ${item.response_sent_at ? `<div class="review-admin-reply-date">Отправлено: ${formatDate(item.response_sent_at)}</div>` : ''}
          </div>
        ` : ''}

        <div class="review-actions">
          ${!hasResponse && !item.is_hidden ? `
            <button class="btn btn-primary btn-sm" data-action="respond-feedback" data-feedback-type="${item.type}" data-feedback-id="${item.id}">
              Ответить
            </button>
          ` : ''}
          ${!item.is_hidden ? `
            <button class="btn btn-secondary btn-sm" data-action="hide-feedback" data-feedback-type="${item.type}" data-feedback-id="${item.id}" title="Скрыть для пользователей (не удаляет)">
              Скрыть
            </button>
          ` : `
            <button class="btn btn-secondary btn-sm" data-action="show-feedback" data-feedback-type="${item.type}" data-feedback-id="${item.id}" title="Показать для пользователей">
              Показать
            </button>
          `}
        </div>
      </div>
    `;
  }).join('');
}

async function fetchReviews() {
  try {
    const response = await apiGet('/api/reviews/pending');
    if (!response.ok) throw new Error('Failed to fetch reviews');
    return await response.json();
  } catch (error) {
    console.error('Error fetching reviews:', error);
    return [];
  }
}

async function fetchComments() {
  try {
    const response = await apiGet('/api/comments/all');
    if (!response.ok) throw new Error('Failed to fetch comments');
    const result = await response.json();
    return result.comments || [];
  } catch (error) {
    console.error('Error fetching comments:', error);
    return [];
  }
}

async function fetchSuggestions() {
  try {
    const response = await apiGet('/api/suggestions/all');
    if (!response.ok) throw new Error('Failed to fetch suggestions');
    const result = await response.json();
    return result.suggestions || [];
  } catch (error) {
    console.error('Error fetching suggestions:', error);
    return [];
  }
}

async function respondToFeedback(type, id) {
  // Find the card element (can be .review-card in feedback view or .feed-item in feed view)
  const actionButton = document.querySelector(`[data-action="respond-feedback"][data-feedback-type="${type}"][data-feedback-id="${id}"]`);
  const reviewCard = actionButton?.closest('.review-card') || actionButton?.closest('.feed-item');
  if (!reviewCard) {
    showToast('Ошибка: элемент не найден', 'error');
    return;
  }

  // Check if inline form already exists
  const existingForm = reviewCard.querySelector('.inline-response-form');
  if (existingForm) {
    existingForm.remove();
    return;
  }

  // Remove any other open inline forms
  document.querySelectorAll('.inline-response-form').forEach(form => form.remove());

  // Create inline form
  const formHtml = `
    <div class="inline-response-form">
      <div class="form-group">
        <textarea id="inline-feedback-response-${id}" class="form-input w-full" rows="3" placeholder="Ваш ответ..." style="resize: vertical;"></textarea>
      </div>
      <div class="form-group">
        <label class="notify-label">
          <input type="checkbox" id="inline-send-notification-${id}" checked>
          <span>Отправить уведомление в Telegram</span>
        </label>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary btn-sm" data-action="submit-inline-response" data-feedback-type="${type}" data-feedback-id="${id}">
          Отправить
        </button>
        <button class="btn btn-secondary btn-sm" data-action="cancel-inline-response">
          Отмена
        </button>
      </div>
    </div>
  `;

  // Insert form after the actions div (can be .review-actions or .feed-item-actions)
  const actionsDiv = reviewCard.querySelector('.review-actions') || reviewCard.querySelector('.feed-item-actions');
  if (actionsDiv) {
    actionsDiv.insertAdjacentHTML('afterend', formHtml);
  } else {
    // Fallback: append to the card itself
    reviewCard.insertAdjacentHTML('beforeend', formHtml);
  }

  // Focus on textarea
  setTimeout(() => {
    const textarea = document.getElementById(`inline-feedback-response-${id}`);
    if (textarea) textarea.focus();
  }, 50);
}

async function submitInlineResponse(type, id) {
  const textarea = document.getElementById(`inline-feedback-response-${id}`);
  const notificationCheckbox = document.getElementById(`inline-send-notification-${id}`);

  if (!textarea) return;

  const response = textarea.value.trim();
  const sendNotification = notificationCheckbox?.checked ?? true;

  if (!response) {
    showToast('Введите ответ', 'error');
    return;
  }

  try {
    const endpoint = type === 'review' ? 'reviews' : type === 'comment' ? 'comments' : 'suggestions';
    const updateResponse = await apiPost(`/api/${endpoint}/respond`, {
      id: id,
      admin_response: response,
      send_notification: sendNotification
    });

    if (!updateResponse.ok) {
      throw new Error('Failed to send response');
    }

    // Also mark as read since we responded
    try {
      await apiPost('/api/feedback/mark-read', {
        feedbackIds: [id],
        admin_id: state?.adminData?.telegram_id || 'browser-admin'
      });
    } catch (markError) {
      console.warn('Could not mark feedback as read:', markError);
    }

    showToast('Ответ отправлен', 'success');
    await loadFeedbackData();
    renderFeedback();
    attachFeedbackEventListeners();
  } catch (error) {
    console.error('Error sending response:', error);
    showToast('Ошибка при отправке ответа', 'error');
  }
}

async function deleteAdminResponse(type, id) {
  const typeNames = {
    review: 'отзыва',
    comment: 'комментария',
    suggestion: 'предложения'
  };

  showModal(`Удалить ответ на ${typeNames[type]}`, `
    <p style="color: var(--text-secondary); margin-bottom: var(--spacing-md);">
      Вы уверены, что хотите удалить ответ магазина? Это действие нельзя отменить.
    </p>
  `, [
    {
      text: 'Отменить',
      className: 'btn btn-secondary',
      onClick: hideModal
    },
    {
      text: 'Удалить ответ',
      className: 'btn btn-danger',
      onClick: async () => {
        try {
          const endpoint = type === 'review' ? 'reviews' : type === 'comment' ? 'comments' : 'suggestions';
          const deleteResponse = await apiPost(`/api/${endpoint}/response-delete`, {
            feedback_id: id
          });

          if (!deleteResponse.ok) {
            throw new Error('Failed to delete response');
          }

          showToast('Ответ удален', 'success');
          hideModal();
          await loadFeedbackData();
          renderFeedback();
    attachFeedbackEventListeners();
        } catch (error) {
          console.error('Error deleting response:', error);
          showToast('Ошибка при удалении ответа', 'error');
        }
      }
    }
  ]);
}

async function hideFeedback(type, id) {
  try {
    const response = await apiPost('/api/feedback/visibility', {
      id: id,
      is_hidden: true
    });

    if (!response.ok) throw new Error('Failed to hide feedback');

    showToast('Скрыто для пользователей', 'success');
    await loadFeedbackData();
    renderFeedback();
    attachFeedbackEventListeners();
  } catch (error) {
    console.error('Error hiding feedback:', error);
    showToast('Ошибка при скрытии', 'error');
  }
}

async function showFeedback(type, id) {
  try {
    const response = await apiPost('/api/feedback/visibility', {
      id: id,
      is_hidden: false
    });

    if (!response.ok) throw new Error('Failed to show feedback');

    showToast('Снова видно для пользователей', 'success');
    await loadFeedbackData();
    renderFeedback();
    attachFeedbackEventListeners();
  } catch (error) {
    console.error('Error showing feedback:', error);
    showToast('Ошибка при отображении', 'error');
  }
}

function updateReviewsBadge(count) {
  const badge = document.getElementById('reviews-badge');
  if (count > 0) {
    badge.textContent = count;
    badge.classList.add('show');
  } else {
    badge.classList.remove('show');
  }
}




/**
 * Attach event listeners for feedback view
 */
function attachFeedbackEventListeners() {
  const content = document.getElementById('content');
  if (!content) return;

  const oldHandler = content._feedbackClickHandler;
  if (oldHandler) {
    content.removeEventListener('click', oldHandler);
  }

  const clickHandler = (e) => {
    const target = e.target;
    const action = target.dataset.action || target.closest('[data-action]')?.dataset.action;
    if (!action) return;

    const filter = target.dataset.filter;
    const feedbackType = target.dataset.feedbackType || target.closest('[data-feedback-type]')?.dataset.feedbackType;
    const feedbackId = parseInt(target.dataset.feedbackId || target.closest('[data-feedback-id]')?.dataset.feedbackId);

    switch (action) {
      case 'filter-feedback':
        if (filter) filterFeedback(filter);
        break;
      case 'refresh-feedback':
        refreshFeedback();
        break;
      case 'respond-feedback':
        if (feedbackType && feedbackId) respondToFeedback(feedbackType, feedbackId);
        break;
      case 'submit-inline-response':
        if (feedbackType && feedbackId) submitInlineResponse(feedbackType, feedbackId);
        break;
      case 'cancel-inline-response':
        document.querySelectorAll('.inline-response-form').forEach(form => form.remove());
        break;
      case 'hide-feedback':
        if (feedbackType && feedbackId) hideFeedback(feedbackType, feedbackId);
        break;
      case 'show-feedback':
        if (feedbackType && feedbackId) showFeedback(feedbackType, feedbackId);
        break;
      case 'delete-admin-response':
        if (feedbackType && feedbackId) deleteAdminResponse(feedbackType, feedbackId);
        break;
      case 'download-review-image':
        handleDownloadImage(target);
        break;
      case 'replace-review-image':
        handleReplaceImage(target);
        break;
      case 'delete-review-image':
        handleDeleteImage(target);
        break;
    }
  };

  content._feedbackClickHandler = clickHandler;
  content.addEventListener('click', clickHandler);
}

// ============================================================================
// IMAGE ACTION HANDLERS
// ============================================================================

/**
 * Handle download image action
 */
function handleDownloadImage(target) {
  const imageItem = target.closest('.review-image-item');
  if (!imageItem) return;

  const imageUrl = imageItem.dataset.imageUrl;
  const downloadName = imageItem.dataset.downloadName;

  if (imageUrl && downloadName) {
    downloadImage(imageUrl, downloadName);
  }
}

/**
 * Handle replace image action
 */
function handleReplaceImage(target) {
  const imageItem = target.closest('.review-image-item');
  if (!imageItem) return;

  const imageId = imageItem.dataset.imageId;
  const currentUrl = imageItem.dataset.imageUrl;
  const isHosted = imageItem.dataset.isHosted === 'true';

  showModal('Заменить изображение на URL', `
    <p style="color: var(--text-secondary); margin-bottom: var(--spacing-md);">
      ${isHosted ? 'Текущее изображение загружено на наш сервер. После замены на внешний URL оно будет удалено из хранилища.' : 'Текущее изображение уже является внешним URL.'}
    </p>
    <div class="form-group">
      <label class="form-label">Новый URL изображения (VK CDN и т.д.)</label>
      <input type="url" id="new-image-url" class="form-input" placeholder="https://..." style="width: 100%;">
    </div>
    <div id="new-image-preview" style="margin-top: var(--spacing-sm); display: none;">
      <p style="font-size: 0.75rem; color: var(--text-tertiary); margin-bottom: 4px;">Предпросмотр:</p>
      <img id="preview-img" src="" alt="Preview" style="max-width: 200px; max-height: 150px; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
      <p id="preview-error" style="color: var(--error); font-size: 0.75rem; display: none;">Не удалось загрузить изображение по этому URL</p>
    </div>
  `, [
    {
      text: 'Отменить',
      className: 'btn btn-secondary',
      onClick: hideModal
    },
    {
      text: 'Заменить',
      className: 'btn btn-primary',
      onClick: async () => {
        const newUrl = document.getElementById('new-image-url').value.trim();
        if (!newUrl) {
          showToast('Введите URL изображения', 'error');
          return;
        }

        try {
          new URL(newUrl);
        } catch (e) {
          showToast('Некорректный URL', 'error');
          return;
        }

        try {
          const response = await apiPost('/api/admin/reviews/images', {
            action: 'replace',
            imageId: parseInt(imageId),
            newUrl
          });

          if (!response.ok) {
            throw new Error('Failed to replace image');
          }

          showToast('Изображение заменено', 'success');
          hideModal();
          await loadFeedbackData();
          renderFeedback();
          attachFeedbackEventListeners();
        } catch (error) {
          console.error('Error replacing image:', error);
          showToast('Ошибка при замене изображения', 'error');
        }
      }
    }
  ]);

  // Add preview functionality after modal is shown
  setTimeout(() => {
    const urlInput = document.getElementById('new-image-url');
    const previewContainer = document.getElementById('new-image-preview');
    const previewImg = document.getElementById('preview-img');
    const previewError = document.getElementById('preview-error');

    if (urlInput) {
      urlInput.addEventListener('input', () => {
        const url = urlInput.value.trim();
        if (!url) {
          previewContainer.style.display = 'none';
          return;
        }

        try {
          new URL(url);
          previewContainer.style.display = 'block';
          previewImg.style.display = 'block';
          previewError.style.display = 'none';
          previewImg.src = url;
          previewImg.onerror = () => {
            previewImg.style.display = 'none';
            previewError.style.display = 'block';
          };
        } catch (e) {
          previewContainer.style.display = 'none';
        }
      });
    }
  }, 100);
}

/**
 * Handle delete image action
 */
function handleDeleteImage(target) {
  const imageItem = target.closest('.review-image-item');
  if (!imageItem) return;

  const imageId = imageItem.dataset.imageId;
  const isHosted = imageItem.dataset.isHosted === 'true';

  showModal('Удалить изображение', `
    <p style="color: var(--text-secondary); margin-bottom: var(--spacing-md);">
      Вы уверены, что хотите удалить это изображение?
      ${isHosted ? ' Оно также будет удалено из хранилища.' : ''}
    </p>
  `, [
    {
      text: 'Отменить',
      className: 'btn btn-secondary',
      onClick: hideModal
    },
    {
      text: 'Удалить',
      className: 'btn btn-danger',
      onClick: async () => {
        try {
          const response = await apiPost('/api/admin/reviews/images', {
            action: 'delete',
            imageId: parseInt(imageId)
          });

          if (!response.ok) {
            throw new Error('Failed to delete image');
          }

          showToast('Изображение удалено', 'success');
          hideModal();
          await loadFeedbackData();
          renderFeedback();
          attachFeedbackEventListeners();
        } catch (error) {
          console.error('Error deleting image:', error);
          showToast('Ошибка при удалении изображения', 'error');
        }
      }
    }
  ]);
}

// Exports
export {
  loadFeedbackData as loadFeedback,
  loadReviews as renderFeedbackView,
  filterFeedback,
  respondToFeedback,
  submitInlineResponse,
  hideFeedback,
  showFeedback,
  deleteAdminResponse,
  fetchReviews,
  fetchComments,
  fetchSuggestions,
  isHostedImage,
  getStorageProvider,
  generateDownloadFilename,
  downloadImage
};
