/**
 * Admin tags management.
 * Route: /admin/tags
 */

Router.registerPage('/admin/tags', {
  styles: ['/css/admin.css'],

  async init() {
    var content = document.getElementById('page-content');
    content.innerHTML = '';

    var container = document.createElement('div');
    container.className = 'container page-content admin-page';

    var header = document.createElement('div');
    header.className = 'admin-header';
    header.innerHTML = '<h1 class="admin-title">Теги</h1>';
    container.appendChild(header);

    var listWrap = document.createElement('div');
    listWrap.innerHTML = '<div class="skeleton" style="height:300px"></div>';
    container.appendChild(listWrap);

    content.appendChild(container);

    try {
      var data = await Utils.apiFetch('/api/tags?limit=200');
      var tags = data.tags || [];
      listWrap.innerHTML = '';

      if (tags.length === 0) {
        listWrap.innerHTML = '<p class="admin-empty">Тегов нет</p>';
        return;
      }

      var table = document.createElement('table');
      table.className = 'admin-table';
      table.innerHTML = '<thead><tr><th>Название</th><th>Тип</th><th>Статей</th><th>Slug</th></tr></thead>';
      var tbody = document.createElement('tbody');

      tags.forEach(function (t) {
        var tr = document.createElement('tr');
        tr.innerHTML =
          '<td>' + Utils.escapeHtml(t.name_ru) + '</td>' +
          '<td>' + Utils.escapeHtml(t.type || '') + '</td>' +
          '<td>' + (t.article_count || 0) + '</td>' +
          '<td><code>' + Utils.escapeHtml(t.slug) + '</code></td>';
        tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      listWrap.appendChild(table);
    } catch (err) {
      console.error('Admin tags error:', err);
      listWrap.innerHTML = '<p class="admin-error">Не удалось загрузить теги</p>';
    }

    document.title = 'Теги — Админ — CineFiles';
  },
});
