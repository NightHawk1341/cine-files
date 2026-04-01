/**
 * Collections management view
 */

import { escapeHtml, showToast, showConfirmModal, showModal, hideModal } from '../utils.js';
import { apiFetch } from '../utils/apiClient.js';
import { createPageHeader, createLoadingSpinner } from '../utils/templates.js';

let currentCollections = [];

async function loadList(tableWrap) {
  tableWrap.innerHTML = createLoadingSpinner();

  try {
    const res = await apiFetch('/api/collections?limit=100');
    const data = await res.json();
    currentCollections = data.collections || [];
    tableWrap.innerHTML = '';

    if (currentCollections.length === 0) {
      tableWrap.innerHTML = '<p class="text-secondary">Подборок нет</p>';
      return;
    }

    const table = document.createElement('table');
    table.className = 'admin-table';
    table.innerHTML =
      '<thead><tr>' +
      '<th>Название</th><th>Slug</th><th>Статей</th><th>Видимость</th><th>Порядок</th><th></th>' +
      '</tr></thead>';

    const tbody = document.createElement('tbody');

    currentCollections.forEach(function (c) {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + escapeHtml(c.title) + '</td>' +
        '<td><code>' + escapeHtml(c.slug) + '</code></td>' +
        '<td>' + (c.article_count || 0) + '</td>' +
        '<td><span class="status-badge status-' + (c.is_visible ? 'visible' : 'hidden') + '">' + (c.is_visible ? 'Видима' : 'Скрыта') + '</span></td>' +
        '<td>' + (c.sort_order || 0) + '</td>' +
        '<td style="white-space:nowrap">' +
          '<button class="btn btn-secondary btn-sm" data-action="edit-collection" data-id="' + c.id + '">Изменить</button> ' +
          '<button class="btn btn-danger btn-sm" data-action="delete-collection" data-id="' + c.id + '">Удалить</button>' +
        '</td>';
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    tableWrap.appendChild(table);
  } catch (err) {
    console.error('Admin collections error:', err);
    tableWrap.innerHTML = '<p class="text-secondary">Не удалось загрузить подборки</p>';
  }
}

function openEditorModal(collection) {
  const isEdit = !!collection;
  const c = collection || {};

  const bodyHTML =
    '<form id="collection-modal-form">' +
    '<div class="form-group">' +
      '<label class="form-label">Название</label>' +
      '<input class="form-input" name="title" required value="' + escapeHtml(c.title || '') + '">' +
    '</div>' +
    '<div class="form-group">' +
      '<label class="form-label">Slug</label>' +
      '<input class="form-input" name="slug" required value="' + escapeHtml(c.slug || '') + '">' +
    '</div>' +
    '<div class="form-group">' +
      '<label class="form-label">Описание</label>' +
      '<textarea class="form-textarea" name="description">' + escapeHtml(c.description || '') + '</textarea>' +
    '</div>' +
    '<div class="form-group">' +
      '<label class="form-label">URL обложки</label>' +
      '<input class="form-input" name="cover_image_url" value="' + escapeHtml(c.cover_image_url || '') + '">' +
    '</div>' +
    '<div class="form-group">' +
      '<label class="form-label">Порядок сортировки</label>' +
      '<input class="form-input" name="sort_order" type="number" value="' + (c.sort_order || 0) + '">' +
    '</div>' +
    '<div class="form-group">' +
      '<label class="form-label"><input type="checkbox" name="is_visible"' + (c.is_visible !== false ? ' checked' : '') + '> Видима</label>' +
    '</div>' +
    '</form>';

  showModal(
    isEdit ? 'Редактировать подборку' : 'Новая подборка',
    bodyHTML,
    [
      { text: 'Отмена', className: 'btn btn-secondary', onClick: () => hideModal() },
      {
        text: 'Сохранить',
        className: 'btn btn-primary',
        onClick: async () => {
          const form = document.getElementById('collection-modal-form');
          const body = {
            title: form.title.value.trim(),
            slug: form.slug.value.trim(),
            description: form.description.value.trim() || null,
            cover_image_url: form.cover_image_url.value.trim() || null,
            sort_order: Number(form.sort_order.value) || 0,
            is_visible: form.is_visible.checked,
          };

          if (!body.title || !body.slug) {
            showToast('Заполните название и slug', 'warning');
            return;
          }

          try {
            if (isEdit) {
              await apiFetch('/api/collections/' + c.id, {
                method: 'PUT',
                body: JSON.stringify(body),
              });
              showToast('Подборка обновлена', 'success');
            } else {
              await apiFetch('/api/collections', {
                method: 'POST',
                body: JSON.stringify(body),
              });
              showToast('Подборка создана', 'success');
            }
            hideModal();
            renderCollectionsView();
          } catch (err) {
            showToast('Не удалось сохранить', 'error');
          }
        }
      }
    ]
  );
}

export async function renderCollectionsView() {
  const content = document.getElementById('content');
  content.innerHTML = createPageHeader({
    title: 'Подборки',
    refreshAction: 'refresh-collections',
    extraButtons: '<button class="btn btn-primary btn-sm" data-action="new-collection">Новая подборка</button>'
  });

  const tableWrap = document.createElement('div');
  content.appendChild(tableWrap);

  content.addEventListener('click', async function (e) {
    if (e.target.closest('[data-action="refresh-collections"]')) {
      renderCollectionsView();
      return;
    }
    if (e.target.closest('[data-action="new-collection"]')) {
      openEditorModal(null);
      return;
    }

    const editBtn = e.target.closest('[data-action="edit-collection"]');
    if (editBtn) {
      const id = editBtn.getAttribute('data-id');
      try {
        const res = await apiFetch('/api/collections/' + id);
        const data = await res.json();
        openEditorModal(data.collection);
      } catch (err) {
        showToast('Не удалось загрузить подборку', 'error');
      }
      return;
    }

    const delBtn = e.target.closest('[data-action="delete-collection"]');
    if (delBtn) {
      const confirmed = await showConfirmModal('Удалить подборку?');
      if (!confirmed) return;
      const id = delBtn.getAttribute('data-id');
      try {
        await apiFetch('/api/collections/' + id, { method: 'DELETE' });
        showToast('Подборка удалена', 'success');
        delBtn.closest('tr').remove();
      } catch (err) {
        showToast('Не удалось удалить', 'error');
      }
    }
  });

  await loadList(tableWrap);
}
