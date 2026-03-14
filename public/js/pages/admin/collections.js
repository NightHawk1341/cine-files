/**
 * Admin collections management.
 * Route: /admin/collections, /admin/collections/new, /admin/collections/:id
 */

Router.registerPage('/admin/collections', {
  styles: ['/css/admin.css'],

  async init() {
    var content = document.getElementById('page-content');
    content.innerHTML = '';

    var container = document.createElement('div');
    container.className = 'container page-content admin-page';

    var header = document.createElement('div');
    header.className = 'admin-header';
    header.innerHTML =
      '<h1 class="admin-title">Подборки</h1>' +
      '<a href="/admin/collections/new" class="admin-btn-primary">Новая подборка</a>';
    container.appendChild(header);

    var tableWrap = document.createElement('div');
    tableWrap.className = 'admin-table-wrap';
    tableWrap.innerHTML = '<div class="skeleton" style="height:300px"></div>';
    container.appendChild(tableWrap);

    content.appendChild(container);

    try {
      var data = await Utils.apiFetch('/api/collections?limit=100');
      var collections = data.collections || [];
      tableWrap.innerHTML = '';

      if (collections.length === 0) {
        tableWrap.innerHTML = '<p class="admin-empty">Подборок нет</p>';
        return;
      }

      var table = document.createElement('table');
      table.className = 'admin-table';
      table.innerHTML =
        '<thead><tr>' +
        '<th>Название</th><th>Slug</th><th>Статей</th><th>Видимость</th><th>Порядок</th><th></th>' +
        '</tr></thead>';

      var tbody = document.createElement('tbody');

      collections.forEach(function (c) {
        var tr = document.createElement('tr');
        tr.innerHTML =
          '<td><a href="/admin/collections/' + c.id + '">' + Utils.escapeHtml(c.title) + '</a></td>' +
          '<td><code>' + Utils.escapeHtml(c.slug) + '</code></td>' +
          '<td>' + c.article_count + '</td>' +
          '<td><span class="admin-status admin-status-' + (c.is_visible ? 'visible' : 'hidden') + '">' + (c.is_visible ? 'Видима' : 'Скрыта') + '</span></td>' +
          '<td>' + c.sort_order + '</td>' +
          '<td><button class="admin-btn-sm admin-btn-danger" data-action="delete" data-id="' + c.id + '">Удалить</button></td>';
        tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      tableWrap.appendChild(table);

      // Delete handler
      tableWrap.addEventListener('click', async function (e) {
        var btn = e.target.closest('[data-action="delete"]');
        if (!btn) return;
        var id = btn.getAttribute('data-id');
        if (!confirm('Удалить подборку?')) return;

        try {
          await Utils.apiFetch('/api/collections/' + id, { method: 'DELETE' });
          Toast.show('Подборка удалена', 'success');
          btn.closest('tr').remove();
        } catch (err) {
          Toast.show('Не удалось удалить', 'error');
        }
      });
    } catch (err) {
      console.error('Admin collections error:', err);
      tableWrap.innerHTML = '<p class="admin-error">Не удалось загрузить подборки</p>';
    }

    document.title = 'Подборки — Админ — CineFiles';
  },
});

/**
 * Collection editor — create/edit.
 * Routes: /admin/collections/new, /admin/collections/:id
 */
Router.registerPage('/admin/collections/new', {
  styles: ['/css/admin.css'],
  init: collectionEditorInit,
});

Router.registerPage('/admin/collections/:id', {
  styles: ['/css/admin.css'],
  init: collectionEditorInit,
});

async function collectionEditorInit(params) {
  var isEdit = params && params.id && params.id !== 'new';
  var content = document.getElementById('page-content');
  content.innerHTML = '';

  var container = document.createElement('div');
  container.className = 'container page-content admin-page';

  container.innerHTML =
    '<h1 class="admin-title">' + (isEdit ? 'Редактировать подборку' : 'Новая подборка') + '</h1>' +
    '<form class="admin-form" id="collection-form">' +
    '<div class="admin-form-group">' +
    '<label class="admin-label">Название</label>' +
    '<input class="admin-input" name="title" required>' +
    '</div>' +
    '<div class="admin-form-group">' +
    '<label class="admin-label">Slug</label>' +
    '<input class="admin-input" name="slug" required>' +
    '</div>' +
    '<div class="admin-form-group">' +
    '<label class="admin-label">Описание</label>' +
    '<textarea class="admin-textarea" name="description"></textarea>' +
    '</div>' +
    '<div class="admin-form-group">' +
    '<label class="admin-label">URL обложки</label>' +
    '<input class="admin-input" name="cover_image_url">' +
    '</div>' +
    '<div class="admin-form-group">' +
    '<label class="admin-label">Порядок сортировки</label>' +
    '<input class="admin-input" name="sort_order" type="number" value="0">' +
    '</div>' +
    '<div class="admin-form-group">' +
    '<label class="admin-label"><input type="checkbox" name="is_visible" checked> Видима</label>' +
    '</div>' +
    '<div class="admin-form-actions">' +
    '<button type="submit" class="admin-btn-primary">Сохранить</button>' +
    '<a href="/admin/collections" class="admin-btn-secondary">Отмена</a>' +
    '</div>' +
    '</form>';

  content.appendChild(container);

  var form = document.getElementById('collection-form');

  // Load existing data if editing
  if (isEdit) {
    try {
      var data = await Utils.apiFetch('/api/collections/' + params.id);
      var c = data.collection;
      form.title.value = c.title || '';
      form.slug.value = c.slug || '';
      form.description.value = c.description || '';
      form.cover_image_url.value = c.cover_image_url || '';
      form.sort_order.value = c.sort_order || 0;
      form.is_visible.checked = c.is_visible !== false;
    } catch (err) {
      Toast.show('Не удалось загрузить подборку', 'error');
    }
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var body = {
      title: form.title.value.trim(),
      slug: form.slug.value.trim(),
      description: form.description.value.trim() || null,
      cover_image_url: form.cover_image_url.value.trim() || null,
      sort_order: Number(form.sort_order.value) || 0,
      is_visible: form.is_visible.checked,
    };

    try {
      if (isEdit) {
        await Utils.apiFetch('/api/collections/' + params.id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        Toast.show('Подборка обновлена', 'success');
      } else {
        await Utils.apiFetch('/api/collections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        Toast.show('Подборка создана', 'success');
      }
      Router.navigate('/admin/collections');
    } catch (err) {
      Toast.show(err.data && err.data.error ? err.data.error : 'Не удалось сохранить', 'error');
    }
  });

  document.title = (isEdit ? 'Редактировать подборку' : 'Новая подборка') + ' — Админ — CineFiles';
}
