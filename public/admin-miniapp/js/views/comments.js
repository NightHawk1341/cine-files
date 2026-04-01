/**
 * Comments moderation view
 */

import { escapeHtml, showToast, showConfirmModal, formatDateShort } from '../utils.js';
import { apiFetch } from '../utils/apiClient.js';
import { createPageHeader, createLoadingSpinner } from '../utils/templates.js';

export async function renderCommentsView() {
  const content = document.getElementById('content');
  content.innerHTML = createPageHeader({ title: 'Комментарии', refreshAction: 'refresh-comments' });

  const listWrap = document.createElement('div');
  listWrap.innerHTML = createLoadingSpinner();
  content.appendChild(listWrap);

  content.addEventListener('click', function (e) {
    if (e.target.closest('[data-action="refresh-comments"]')) {
      renderCommentsView();
    }
  });

  try {
    const res = await apiFetch('/api/comments?limit=50');
    const data = await res.json();
    const comments = data.comments || [];
    listWrap.innerHTML = '';

    if (comments.length === 0) {
      listWrap.innerHTML = '<p class="text-secondary">Комментариев нет</p>';
      return;
    }

    comments.forEach(function (c) {
      const item = document.createElement('div');
      item.className = 'comment-card';
      item.innerHTML =
        '<div class="comment-card-header">' +
        '<strong>' + escapeHtml(c.author_name || 'Аноним') + '</strong>' +
        '<span class="text-secondary text-sm">' + formatDateShort(c.created_at) + '</span>' +
        '<span class="status-badge status-' + c.status + '">' + c.status + '</span>' +
        '</div>' +
        '<p class="comment-card-text">' + escapeHtml(c.text || '') + '</p>' +
        '<div class="comment-card-actions">' +
        '<button class="btn btn-secondary btn-sm" data-action="hide" data-id="' + c.id + '">Скрыть</button>' +
        '<button class="btn btn-danger btn-sm" data-action="delete" data-id="' + c.id + '">Удалить</button>' +
        '</div>';
      listWrap.appendChild(item);
    });

    listWrap.addEventListener('click', async function (e) {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-action');
      if (action !== 'hide' && action !== 'delete') return;
      const id = btn.getAttribute('data-id');

      if (action === 'delete') {
        const confirmed = await showConfirmModal('Удалить комментарий?');
        if (!confirmed) return;
      }

      try {
        await apiFetch('/api/admin/comments/' + id + '/moderate', {
          method: 'POST',
          body: JSON.stringify({ action: action }),
        });
        showToast('Действие выполнено', 'success');
        btn.closest('.comment-card').remove();
      } catch (err) {
        showToast('Не удалось выполнить действие', 'error');
      }
    });
  } catch (err) {
    console.error('Admin comments error:', err);
    listWrap.innerHTML = '<p class="text-secondary">Не удалось загрузить комментарии</p>';
  }
}
