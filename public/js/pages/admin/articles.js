/**
 * Admin articles list.
 * Route: /admin/articles
 */

Router.registerPage('/admin/articles', {
  styles: ['/css/admin.css'],

  async init() {
    var content = document.getElementById('page-content');
    content.innerHTML = '';

    var container = document.createElement('div');
    container.className = 'container page-content admin-page';

    var header = document.createElement('div');
    header.className = 'admin-header';
    header.innerHTML =
      '<h1 class="admin-title">Статьи</h1>' +
      '<a href="/admin/articles/new" class="admin-btn-primary">Новая статья</a>';
    container.appendChild(header);

    // Articles table
    var tableWrap = document.createElement('div');
    tableWrap.className = 'admin-table-wrap';
    tableWrap.innerHTML = '<div class="skeleton" style="height:400px"></div>';
    container.appendChild(tableWrap);

    content.appendChild(container);

    try {
      var data = await Utils.apiFetch('/api/articles?limit=50');
      var articles = data.articles || [];

      tableWrap.innerHTML = '';

      if (articles.length === 0) {
        tableWrap.innerHTML = '<p class="admin-empty">Статей пока нет</p>';
        return;
      }

      var table = document.createElement('table');
      table.className = 'admin-table';
      table.innerHTML =
        '<thead><tr>' +
        '<th>Заголовок</th><th>Категория</th><th>Статус</th><th>Автор</th><th>Дата</th>' +
        '</tr></thead>';

      var tbody = document.createElement('tbody');
      var statusLabels = { draft: 'Черновик', review: 'На проверке', published: 'Опубликовано', archived: 'В архиве' };

      articles.forEach(function (a) {
        var tr = document.createElement('tr');
        tr.innerHTML =
          '<td><a href="/admin/articles/' + a.id + '">' + Utils.escapeHtml(a.title) + '</a></td>' +
          '<td>' + Utils.escapeHtml(a.category_name_ru || '') + '</td>' +
          '<td><span class="admin-status admin-status-' + a.status + '">' + (statusLabels[a.status] || a.status) + '</span></td>' +
          '<td>' + Utils.escapeHtml(a.author_name || '') + '</td>' +
          '<td>' + Utils.formatDateShort(a.created_at) + '</td>';
        tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      tableWrap.appendChild(table);
    } catch (err) {
      console.error('Admin articles error:', err);
      tableWrap.innerHTML = '<p class="admin-error">Не удалось загрузить статьи</p>';
    }

    document.title = 'Статьи — Админ — CineFiles';
  },
});
