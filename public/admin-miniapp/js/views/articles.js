/**
 * Articles list view
 */

import { escapeHtml, showToast, formatDateShort } from '../utils.js';
import { apiFetch } from '../utils/apiClient.js';
import { createPageHeader, createLoadingSpinner } from '../utils/templates.js';

export async function renderArticlesView() {
  const content = document.getElementById('content');
  content.innerHTML = createPageHeader({
    title: 'Статьи',
    refreshAction: 'refresh-articles',
    extraButtons: '<button class="btn btn-primary btn-sm" data-action="new-article">Новая статья</button>'
  });

  const tableWrap = document.createElement('div');
  tableWrap.innerHTML = createLoadingSpinner();
  content.appendChild(tableWrap);

  content.addEventListener('click', function (e) {
    if (e.target.closest('[data-action="refresh-articles"]')) {
      renderArticlesView();
    }
    if (e.target.closest('[data-action="new-article"]')) {
      window.adminSwitchView('article-editor');
    }
  });

  try {
    const pubRes = await apiFetch('/api/articles?limit=50&status=published');
    const pubData = await pubRes.json();
    const draftRes = await apiFetch('/api/articles?limit=50&status=draft');
    const draftData = await draftRes.json();
    const articles = (pubData.articles || []).concat(draftData.articles || []);

    tableWrap.innerHTML = '';

    if (articles.length === 0) {
      tableWrap.innerHTML = '<p class="text-secondary">Статей пока нет</p>';
      return;
    }

    const statusLabels = { draft: 'Черновик', review: 'На проверке', published: 'Опубликовано', archived: 'В архиве' };

    const table = document.createElement('table');
    table.className = 'admin-table';
    table.innerHTML =
      '<thead><tr>' +
      '<th>Заголовок</th><th>Категория</th><th>Статус</th><th>Автор</th><th>Просм.</th><th>Комм.</th><th>Дата</th>' +
      '</tr></thead>';

    const tbody = document.createElement('tbody');

    articles.forEach(function (a) {
      const catName = (a.category && a.category.nameRu) || '';
      const authorName = (a.author && a.author.displayName) || '';
      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      tr.dataset.articleId = a.id;
      tr.innerHTML =
        '<td>' + escapeHtml(a.title) + '</td>' +
        '<td>' + escapeHtml(catName) + '</td>' +
        '<td><span class="status-badge status-' + a.status + '">' + (statusLabels[a.status] || a.status) + '</span></td>' +
        '<td>' + escapeHtml(authorName) + '</td>' +
        '<td>' + (a.viewCount || 0) + '</td>' +
        '<td>' + (a.commentCount || 0) + '</td>' +
        '<td>' + formatDateShort(a.createdAt || a.created_at) + '</td>';
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    tableWrap.appendChild(table);

    // Click row to edit
    tableWrap.addEventListener('click', function (e) {
      const tr = e.target.closest('tr[data-article-id]');
      if (tr) {
        window._adminEditArticleId = tr.dataset.articleId;
        window.adminSwitchView('article-editor');
      }
    });
  } catch (err) {
    console.error('Admin articles error:', err);
    tableWrap.innerHTML = '<p class="text-secondary">Не удалось загрузить статьи</p>';
  }
}
