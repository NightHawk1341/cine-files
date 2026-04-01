/**
 * Categories management view
 */

import { escapeHtml, showToast, showConfirmModal, showModal, hideModal } from '../utils.js';
import { apiFetch } from '../utils/apiClient.js';
import { createPageHeader, createLoadingSpinner } from '../utils/templates.js';

let tableWrapRef = null;

async function loadList() {
  if (!tableWrapRef) return;
  tableWrapRef.innerHTML = createLoadingSpinner();

  try {
    const res = await apiFetch('/api/categories');
    const data = await res.json();
    const cats = data.categories || [];
    tableWrapRef.innerHTML = '';

    if (cats.length === 0) {
      tableWrapRef.innerHTML = '<p class="text-secondary">Категорий нет</p>';
      return;
    }

    const table = document.createElement('table');
    table.className = 'admin-table';
    table.innerHTML =
      '<thead><tr>' +
      '<th>Slug</th><th>Название (RU)</th><th>Название (EN)</th><th>Статей</th><th>Порядок</th><th></th>' +
      '</tr></thead>';

    const tbody = document.createElement('tbody');
    cats.forEach(function (c) {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + escapeHtml(c.slug) + '</td>' +
        '<td>' + escapeHtml(c.nameRu) + '</td>' +
        '<td>' + escapeHtml(c.nameEn || '') + '</td>' +
        '<td>' + (c.articleCount || 0) + '</td>' +
        '<td>' + (c.sortOrder || 0) + '</td>' +
        '<td style="white-space:nowrap">' +
          '<button class="btn btn-secondary btn-sm" data-action="edit-cat" data-id="' + c.id + '">Изменить</button> ' +
          '<button class="btn btn-danger btn-sm" data-action="delete-cat" data-id="' + c.id + '">Удалить</button>' +
        '</td>';
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    tableWrapRef.appendChild(table);
  } catch (err) {
    console.error('Admin categories error:', err);
    tableWrapRef.innerHTML = '<p class="text-secondary">Не удалось загрузить категории</p>';
  }
}

function openCategoryModal(cat) {
  const isEdit = !!cat;
  const c = cat || {};

  const bodyHTML =
    '<form id="cat-modal-form">' +
    '<div class="form-group">' +
      '<label class="form-label">Slug (латиница)</label>' +
      '<input class="form-input" name="slug" required placeholder="news" value="' + escapeHtml(c.slug || '') + '">' +
    '</div>' +
    '<div class="form-group">' +
      '<label class="form-label">Название (RU)</label>' +
      '<input class="form-input" name="name_ru" required placeholder="Новости" value="' + escapeHtml(c.nameRu || '') + '">' +
    '</div>' +
    '<div class="form-group">' +
      '<label class="form-label">Название (EN)</label>' +
      '<input class="form-input" name="name_en" placeholder="News" value="' + escapeHtml(c.nameEn || '') + '">' +
    '</div>' +
    '<div class="form-group">' +
      '<label class="form-label">Описание</label>' +
      '<textarea class="form-textarea" name="description" rows="2">' + escapeHtml(c.description || '') + '</textarea>' +
    '</div>' +
    '<div class="form-group">' +
      '<label class="form-label">Порядок сортировки</label>' +
      '<input class="form-input" name="sort_order" type="number" value="' + (c.sortOrder || 0) + '">' +
    '</div>' +
    '</form>';

  showModal(
    isEdit ? 'Редактировать категорию' : 'Новая категория',
    bodyHTML,
    [
      { text: 'Отмена', className: 'btn btn-secondary', onClick: () => hideModal() },
      {
        text: 'Сохранить',
        className: 'btn btn-primary',
        onClick: async () => {
          const form = document.getElementById('cat-modal-form');
          const payload = {
            slug: form.slug.value.trim(),
            name_ru: form.name_ru.value.trim(),
            name_en: form.name_en.value.trim() || null,
            description: form.description.value.trim() || null,
            sort_order: Number(form.sort_order.value) || 0,
          };

          if (!payload.slug || !payload.name_ru) {
            showToast('Заполните slug и название', 'warning');
            return;
          }

          try {
            if (isEdit) {
              await apiFetch('/api/categories/' + c.id, {
                method: 'PUT',
                body: JSON.stringify(payload),
              });
              showToast('Категория обновлена', 'success');
            } else {
              await apiFetch('/api/categories', {
                method: 'POST',
                body: JSON.stringify(payload),
              });
              showToast('Категория создана', 'success');
            }
            hideModal();
            loadList();
          } catch (err) {
            showToast('Ошибка сохранения', 'error');
          }
        }
      }
    ]
  );
}

export async function renderCategoriesView() {
  const content = document.getElementById('content');
  content.innerHTML = createPageHeader({
    title: 'Категории',
    refreshAction: 'refresh-categories',
    extraButtons: '<button class="btn btn-primary btn-sm" data-action="new-category">Добавить</button>'
  });

  const tableWrap = document.createElement('div');
  tableWrapRef = tableWrap;
  content.appendChild(tableWrap);

  content.addEventListener('click', async function (e) {
    if (e.target.closest('[data-action="refresh-categories"]')) {
      renderCategoriesView();
      return;
    }
    if (e.target.closest('[data-action="new-category"]')) {
      openCategoryModal(null);
      return;
    }

    const editBtn = e.target.closest('[data-action="edit-cat"]');
    if (editBtn) {
      const id = editBtn.getAttribute('data-id');
      try {
        const res = await apiFetch('/api/categories');
        const data = await res.json();
        const cat = (data.categories || []).find(function (c) { return String(c.id) === id; });
        if (cat) openCategoryModal(cat);
      } catch (err) {
        showToast('Не удалось загрузить', 'error');
      }
      return;
    }

    const delBtn = e.target.closest('[data-action="delete-cat"]');
    if (delBtn) {
      const confirmed = await showConfirmModal('Удалить категорию?');
      if (!confirmed) return;
      const id = delBtn.getAttribute('data-id');
      try {
        await apiFetch('/api/categories/' + id, { method: 'DELETE' });
        showToast('Удалено', 'success');
        loadList();
      } catch (err) {
        showToast('Не удалось удалить', 'error');
      }
    }
  });

  await loadList();
}
