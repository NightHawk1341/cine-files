/**
 * Auto-moderation (word filter) management view
 */

import { escapeHtml, showToast, showConfirmModal, formatDateShort } from '../utils.js';
import { apiFetch } from '../utils/apiClient.js';
import { createPageHeader, createLoadingSpinner } from '../utils/templates.js';

let searchTimer = null;

export async function renderModerationView() {
  const content = document.getElementById('content');
  content.innerHTML = createPageHeader({ title: 'Авто-модерация', refreshAction: 'refresh-moderation' });

  // Test section
  const testSection = document.createElement('div');
  testSection.style.marginBottom = '24px';
  testSection.innerHTML =
    '<div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">' +
      '<div style="flex:1;min-width:200px">' +
        '<label class="form-label">Проверить текст</label>' +
        '<input class="form-input" id="mod-test-input" placeholder="Введите текст для проверки...">' +
      '</div>' +
      '<button class="btn btn-primary btn-sm" id="mod-test-btn">Проверить</button>' +
    '</div>' +
    '<div id="mod-test-result" style="margin-top:8px;font-size:14px"></div>';
  content.appendChild(testSection);

  // Add words section
  const addSection = document.createElement('div');
  addSection.style.marginBottom = '24px';
  addSection.innerHTML =
    '<div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">' +
      '<div style="flex:1;min-width:200px">' +
        '<label class="form-label">Добавить слова (через запятую)</label>' +
        '<input class="form-input" id="mod-add-input" placeholder="слово1, слово2, слово3">' +
      '</div>' +
      '<div style="min-width:120px">' +
        '<label class="form-label">Категория</label>' +
        '<select class="form-select" id="mod-add-category">' +
          '<option value="general">general</option>' +
          '<option value="profanity">profanity</option>' +
          '<option value="spam">spam</option>' +
          '<option value="hate">hate</option>' +
        '</select>' +
      '</div>' +
      '<button class="btn btn-primary btn-sm" id="mod-add-btn">Добавить</button>' +
    '</div>';
  content.appendChild(addSection);

  // Filters
  const filters = document.createElement('div');
  filters.className = 'filter-bar';
  filters.innerHTML =
    '<div style="flex:1;min-width:150px">' +
      '<label class="form-label">Поиск</label>' +
      '<input class="form-input" id="mod-search" placeholder="Поиск...">' +
    '</div>' +
    '<div>' +
      '<label class="form-label">Категория</label>' +
      '<select class="form-select" id="mod-filter-category">' +
        '<option value="">Все</option>' +
        '<option value="general">general</option>' +
        '<option value="profanity">profanity</option>' +
        '<option value="spam">spam</option>' +
        '<option value="hate">hate</option>' +
      '</select>' +
    '</div>' +
    '<div>' +
      '<label class="form-label">Статус</label>' +
      '<select class="form-select" id="mod-filter-active">' +
        '<option value="">Все</option>' +
        '<option value="true">Активные</option>' +
        '<option value="false">Неактивные</option>' +
      '</select>' +
    '</div>' +
    '<button class="btn btn-secondary btn-sm" id="mod-filter-btn" style="align-self:flex-end">Применить</button>';
  content.appendChild(filters);

  // Word list
  const tableWrap = document.createElement('div');
  tableWrap.id = 'mod-table-wrap';
  tableWrap.innerHTML = createLoadingSpinner();
  content.appendChild(tableWrap);

  // Load word list
  async function loadWords() {
    const search = document.getElementById('mod-search').value.trim();
    const category = document.getElementById('mod-filter-category').value;
    const active = document.getElementById('mod-filter-active').value;

    const qs = [];
    if (search) qs.push('search=' + encodeURIComponent(search));
    if (category) qs.push('category=' + encodeURIComponent(category));
    if (active) qs.push('active=' + active);

    tableWrap.innerHTML = createLoadingSpinner();

    try {
      const res = await apiFetch('/api/admin/moderation/words' + (qs.length ? '?' + qs.join('&') : ''));
      const data = await res.json();
      const words = data.words || [];
      tableWrap.innerHTML = '';

      if (words.length === 0) {
        tableWrap.innerHTML = '<p class="text-secondary">Слов не найдено</p>';
        return;
      }

      const table = document.createElement('table');
      table.className = 'admin-table';
      table.innerHTML =
        '<thead><tr>' +
        '<th>Слово</th><th>Категория</th><th>Активно</th><th>Добавлено</th><th></th>' +
        '</tr></thead>';

      const tbody = document.createElement('tbody');
      words.forEach(function (w) {
        const tr = document.createElement('tr');
        tr.innerHTML =
          '<td>' + escapeHtml(w.word) + '</td>' +
          '<td>' + escapeHtml(w.category) + '</td>' +
          '<td>' +
            '<button class="btn btn-secondary btn-sm" data-action="toggle-word" data-id="' + w.id + '" data-active="' + w.is_active + '">' +
            (w.is_active ? 'Активно' : 'Неактивно') +
            '</button>' +
          '</td>' +
          '<td>' + formatDateShort(w.created_at) + '</td>' +
          '<td>' +
            '<button class="btn btn-danger btn-sm" data-action="delete-word" data-id="' + w.id + '">Удалить</button>' +
          '</td>';
        tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      tableWrap.appendChild(table);
    } catch (err) {
      console.error('Admin moderation error:', err);
      tableWrap.innerHTML = '<p class="text-secondary">Не удалось загрузить слова</p>';
    }
  }

  // Test
  document.getElementById('mod-test-btn').addEventListener('click', async function () {
    const text = document.getElementById('mod-test-input').value.trim();
    if (!text) return;
    const result = document.getElementById('mod-test-result');
    try {
      const res = await apiFetch('/api/admin/moderation/test', {
        method: 'POST',
        body: JSON.stringify({ text: text }),
      });
      const data = await res.json();
      if (data.pass) {
        result.innerHTML = '<span style="color:var(--status-success)">Текст прошел проверку</span>';
      } else {
        result.innerHTML =
          '<span style="color:var(--status-error)">Найдены: ' +
          data.triggered.map(function (w) { return escapeHtml(w); }).join(', ') +
          '</span>';
      }
    } catch (err) {
      result.textContent = 'Ошибка проверки';
    }
  });

  // Add words
  document.getElementById('mod-add-btn').addEventListener('click', async function () {
    const input = document.getElementById('mod-add-input');
    const raw = input.value.trim();
    if (!raw) return;

    const words = raw.split(',').map(function (w) { return w.trim(); }).filter(Boolean);
    const category = document.getElementById('mod-add-category').value;

    try {
      const res = await apiFetch('/api/admin/moderation/words', {
        method: 'POST',
        body: JSON.stringify({ words: words, category: category }),
      });
      const data = await res.json();
      showToast('Добавлено: ' + data.inserted + ', пропущено: ' + data.skipped, 'success');
      input.value = '';
      loadWords();
    } catch (err) {
      showToast('Ошибка добавления', 'error');
    }
  });

  // Filter button
  document.getElementById('mod-filter-btn').addEventListener('click', loadWords);

  // Search debounce
  document.getElementById('mod-search').addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadWords, 400);
  });

  // Refresh
  content.addEventListener('click', function (e) {
    if (e.target.closest('[data-action="refresh-moderation"]')) {
      renderModerationView();
    }
  });

  // Table delegation
  tableWrap.addEventListener('click', async function (e) {
    const toggleBtn = e.target.closest('[data-action="toggle-word"]');
    const delBtn = e.target.closest('[data-action="delete-word"]');

    if (toggleBtn) {
      const id = toggleBtn.getAttribute('data-id');
      const isActive = toggleBtn.getAttribute('data-active') === 'true';
      try {
        await apiFetch('/api/admin/moderation/words/' + id, {
          method: 'PUT',
          body: JSON.stringify({ is_active: !isActive }),
        });
        loadWords();
      } catch (err) {
        showToast('Ошибка обновления', 'error');
      }
    }

    if (delBtn) {
      const confirmed = await showConfirmModal('Удалить слово?');
      if (!confirmed) return;
      const id = delBtn.getAttribute('data-id');
      try {
        await apiFetch('/api/admin/moderation/words/' + id, { method: 'DELETE' });
        showToast('Удалено', 'success');
        loadWords();
      } catch (err) {
        showToast('Ошибка удаления', 'error');
      }
    }
  });

  await loadWords();
}
