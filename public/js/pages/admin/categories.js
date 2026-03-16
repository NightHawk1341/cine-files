/**
 * Admin categories management.
 * Route: /admin/categories
 */

Router.registerPage('/admin/categories', {
  styles: ['/css/admin.css'],

  async init() {
    var content = document.getElementById('page-content');
    content.innerHTML = '';

    var container = document.createElement('div');
    container.className = 'container page-content admin-page';

    // Header
    var header = document.createElement('div');
    header.className = 'admin-header';
    header.innerHTML =
      '<h1 class="admin-title">Категории</h1>' +
      '<button class="admin-btn-primary" id="cat-add-btn">Добавить</button>';
    container.appendChild(header);

    // Form (hidden)
    var formWrap = document.createElement('div');
    formWrap.id = 'cat-form-wrap';
    formWrap.style.display = 'none';
    formWrap.innerHTML =
      '<form class="admin-form" id="cat-form">' +
      '<input type="hidden" id="cat-edit-id">' +
      '<div class="admin-form-group">' +
        '<label class="admin-label">Slug (латиница)</label>' +
        '<input class="admin-input" id="cat-slug" required placeholder="news">' +
      '</div>' +
      '<div class="admin-form-group">' +
        '<label class="admin-label">Название (RU)</label>' +
        '<input class="admin-input" id="cat-name-ru" required placeholder="Новости">' +
      '</div>' +
      '<div class="admin-form-group">' +
        '<label class="admin-label">Название (EN)</label>' +
        '<input class="admin-input" id="cat-name-en" placeholder="News">' +
      '</div>' +
      '<div class="admin-form-group">' +
        '<label class="admin-label">Описание</label>' +
        '<textarea class="admin-textarea" id="cat-desc" rows="2"></textarea>' +
      '</div>' +
      '<div class="admin-form-group">' +
        '<label class="admin-label">Порядок сортировки</label>' +
        '<input class="admin-input" id="cat-sort" type="number" value="0">' +
      '</div>' +
      '<div class="admin-form-actions">' +
        '<button type="submit" class="admin-btn-primary">Сохранить</button>' +
        '<button type="button" class="admin-btn-secondary" id="cat-cancel">Отмена</button>' +
      '</div>' +
      '</form>';
    container.appendChild(formWrap);

    // Table
    var tableWrap = document.createElement('div');
    tableWrap.className = 'admin-table-wrap';
    tableWrap.id = 'cat-table-wrap';
    tableWrap.innerHTML = '<div class="skeleton" style="height:300px"></div>';
    container.appendChild(tableWrap);

    content.appendChild(container);
    document.title = 'Категории — Админ — CineFiles';

    var editingId = null;

    async function loadList() {
      try {
        var data = await Utils.apiFetch('/api/categories');
        var cats = data.categories || [];
        tableWrap.innerHTML = '';

        if (cats.length === 0) {
          tableWrap.innerHTML = '<p class="admin-empty">Категорий нет</p>';
          return;
        }

        var table = document.createElement('table');
        table.className = 'admin-table';
        table.innerHTML =
          '<thead><tr>' +
          '<th>Slug</th><th>Название (RU)</th><th>Название (EN)</th><th>Статей</th><th>Порядок</th><th></th>' +
          '</tr></thead>';

        var tbody = document.createElement('tbody');
        cats.forEach(function (c) {
          var tr = document.createElement('tr');
          tr.innerHTML =
            '<td>' + Utils.escapeHtml(c.slug) + '</td>' +
            '<td>' + Utils.escapeHtml(c.nameRu) + '</td>' +
            '<td>' + Utils.escapeHtml(c.nameEn || '—') + '</td>' +
            '<td>' + (c.articleCount || 0) + '</td>' +
            '<td>' + (c.sortOrder || 0) + '</td>' +
            '<td style="white-space:nowrap">' +
              '<button class="admin-btn-sm cat-edit-btn" data-id="' + c.id + '">Изменить</button> ' +
              '<button class="admin-btn-sm admin-btn-danger cat-del-btn" data-id="' + c.id + '">Удалить</button>' +
            '</td>';
          tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        tableWrap.appendChild(table);
      } catch (err) {
        console.error('Admin categories error:', err);
        tableWrap.innerHTML = '<p class="admin-error">Не удалось загрузить категории</p>';
      }
    }

    function resetForm() {
      editingId = null;
      document.getElementById('cat-edit-id').value = '';
      document.getElementById('cat-slug').value = '';
      document.getElementById('cat-name-ru').value = '';
      document.getElementById('cat-name-en').value = '';
      document.getElementById('cat-desc').value = '';
      document.getElementById('cat-sort').value = '0';
      formWrap.style.display = 'none';
    }

    // Add button
    document.getElementById('cat-add-btn').addEventListener('click', function () {
      resetForm();
      formWrap.style.display = '';
    });

    // Cancel
    document.getElementById('cat-cancel').addEventListener('click', resetForm);

    // Submit
    document.getElementById('cat-form').addEventListener('submit', async function (e) {
      e.preventDefault();

      var payload = {
        slug: document.getElementById('cat-slug').value.trim(),
        name_ru: document.getElementById('cat-name-ru').value.trim(),
        name_en: document.getElementById('cat-name-en').value.trim() || null,
        description: document.getElementById('cat-desc').value.trim() || null,
        sort_order: Number(document.getElementById('cat-sort').value) || 0,
      };

      try {
        if (editingId) {
          await Utils.apiFetch('/api/categories/' + editingId, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          Toast.show('Категория обновлена', 'success');
        } else {
          await Utils.apiFetch('/api/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          Toast.show('Категория создана', 'success');
        }
        resetForm();
        loadList();
      } catch (err) {
        Toast.show(err.data && err.data.error ? err.data.error : 'Ошибка сохранения', 'error');
      }
    });

    // Table delegation
    tableWrap.addEventListener('click', async function (e) {
      var editBtn = e.target.closest('.cat-edit-btn');
      var delBtn = e.target.closest('.cat-del-btn');

      if (editBtn) {
        var id = editBtn.getAttribute('data-id');
        // Find in current table data by fetching fresh
        try {
          var data = await Utils.apiFetch('/api/categories');
          var cat = (data.categories || []).find(function (c) { return String(c.id) === id; });
          if (cat) {
            editingId = cat.id;
            document.getElementById('cat-edit-id').value = cat.id;
            document.getElementById('cat-slug').value = cat.slug || '';
            document.getElementById('cat-name-ru').value = cat.nameRu || '';
            document.getElementById('cat-name-en').value = cat.nameEn || '';
            document.getElementById('cat-desc').value = cat.description || '';
            document.getElementById('cat-sort').value = cat.sortOrder || 0;
            formWrap.style.display = '';
          }
        } catch (err) {
          Toast.show('Не удалось загрузить', 'error');
        }
      }

      if (delBtn) {
        var delId = delBtn.getAttribute('data-id');
        if (!confirm('Удалить категорию?')) return;
        try {
          await Utils.apiFetch('/api/categories/' + delId, { method: 'DELETE' });
          Toast.show('Удалено', 'success');
          loadList();
        } catch (err) {
          Toast.show(err.data && err.data.error ? err.data.error : 'Не удалось удалить', 'error');
        }
      }
    });

    loadList();
  },
});
