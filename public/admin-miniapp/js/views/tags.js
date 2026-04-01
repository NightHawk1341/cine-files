/**
 * Tags management view
 */

import { escapeHtml, showToast } from '../utils.js';
import { apiFetch } from '../utils/apiClient.js';
import { createPageHeader, createLoadingSpinner } from '../utils/templates.js';

export async function renderTagsView() {
  const content = document.getElementById('content');
  content.innerHTML = createPageHeader({ title: 'Теги', refreshAction: 'refresh-tags' });

  const tableWrap = document.createElement('div');
  tableWrap.innerHTML = createLoadingSpinner();
  content.appendChild(tableWrap);

  content.addEventListener('click', function (e) {
    if (e.target.closest('[data-action="refresh-tags"]')) {
      renderTagsView();
    }
  });

  try {
    const res = await apiFetch('/api/tags?limit=200');
    const data = await res.json();
    const tags = data.tags || [];
    tableWrap.innerHTML = '';

    if (tags.length === 0) {
      tableWrap.innerHTML = '<p class="text-secondary">Тегов нет</p>';
      return;
    }

    const table = document.createElement('table');
    table.className = 'admin-table';
    table.innerHTML = '<thead><tr><th>Название</th><th>Тип</th><th>Статей</th><th>Slug</th></tr></thead>';
    const tbody = document.createElement('tbody');

    tags.forEach(function (t) {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + escapeHtml(t.name_ru) + '</td>' +
        '<td>' + escapeHtml(t.type || '') + '</td>' +
        '<td>' + (t.article_count || 0) + '</td>' +
        '<td><code>' + escapeHtml(t.slug) + '</code></td>';
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    tableWrap.appendChild(table);
  } catch (err) {
    console.error('Admin tags error:', err);
    tableWrap.innerHTML = '<p class="text-secondary">Не удалось загрузить теги</p>';
  }
}
