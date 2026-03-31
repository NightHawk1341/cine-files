/**
 * Admin dashboard — stats and quick links.
 * Route: /admin
 */

Router.registerPage('/admin', {
  styles: ['/css/admin.css'],

  async init() {
    var content = document.getElementById('page-content');
    content.innerHTML = '';

    var container = document.createElement('div');
    container.className = 'container page-content admin-page';

    var h1 = document.createElement('h1');
    h1.className = 'admin-title';
    h1.textContent = 'Панель управления';
    container.appendChild(h1);

    // Stats cards (skeleton while loading)
    var statsRow = document.createElement('div');
    statsRow.className = 'admin-stats-row';
    statsRow.innerHTML =
      '<div class="admin-stat-card"><div class="skeleton" style="height:60px"></div></div>' +
      '<div class="admin-stat-card"><div class="skeleton" style="height:60px"></div></div>' +
      '<div class="admin-stat-card"><div class="skeleton" style="height:60px"></div></div>' +
      '<div class="admin-stat-card"><div class="skeleton" style="height:60px"></div></div>';
    container.appendChild(statsRow);

    // Two-column layout for top articles + top authors
    var columnsRow = document.createElement('div');
    columnsRow.className = 'admin-columns';
    columnsRow.innerHTML =
      '<div class="admin-column">' +
        '<h2 class="admin-section-title">Популярные статьи</h2>' +
        '<div class="admin-top-articles"><div class="skeleton" style="height:200px"></div></div>' +
      '</div>' +
      '<div class="admin-column">' +
        '<h2 class="admin-section-title">Авторы</h2>' +
        '<div class="admin-top-authors"><div class="skeleton" style="height:200px"></div></div>' +
      '</div>';
    container.appendChild(columnsRow);

    // Quick links
    var navTitle = document.createElement('h2');
    navTitle.className = 'admin-section-title';
    navTitle.textContent = 'Управление';
    container.appendChild(navTitle);

    var nav = document.createElement('nav');
    nav.className = 'admin-nav';

    var links = [
      { href: '/admin/articles', label: 'Статьи' },
      { href: '/admin/comments', label: 'Комментарии' },
      { href: '/admin/categories', label: 'Категории' },
      { href: '/admin/tags', label: 'Теги' },
      { href: '/admin/users', label: 'Пользователи' },
      { href: '/admin/media', label: 'Медиатека' },
      { href: '/admin/collections', label: 'Подборки' },
      { href: '/admin/integrations', label: 'Интеграции' },
      { href: '/admin/moderation', label: 'Авто-модерация' },
      { href: '/admin/settings', label: 'Настройки' },
    ];

    links.forEach(function (item) {
      var a = document.createElement('a');
      a.className = 'admin-nav-card';
      a.href = item.href;
      a.textContent = item.label;
      nav.appendChild(a);
    });

    container.appendChild(nav);
    content.appendChild(container);
    document.title = 'Панель управления — CineFiles';

    // Load analytics data
    try {
      var data = await Utils.apiFetch('/api/admin/analytics');

      // Populate stats cards
      statsRow.innerHTML =
        _statCard('Статьи', data.articles.published, 'опубл. / ' + data.articles.drafts + ' черн.') +
        _statCard('Просмотры', _formatNum(data.totalViews), 'всего') +
        _statCard('Комментарии', data.comments.total, data.comments.visible + ' видимых') +
        _statCard('Пользователи', data.userCount, '');

      // Top articles
      var topEl = container.querySelector('.admin-top-articles');
      if (data.topArticles.length === 0) {
        topEl.innerHTML = '<p class="admin-empty">Нет данных</p>';
      } else {
        topEl.innerHTML = '<table class="admin-table admin-table-compact"><thead><tr>' +
          '<th>Статья</th><th>Просм.</th><th>Комм.</th>' +
          '</tr></thead><tbody>' +
          data.topArticles.map(function (a) {
            return '<tr>' +
              '<td><a href="/' + Utils.escapeHtml(a.categorySlug) + '/' + Utils.escapeHtml(a.slug) + '">' + Utils.escapeHtml(a.title) + '</a></td>' +
              '<td>' + _formatNum(a.viewCount) + '</td>' +
              '<td>' + a.commentCount + '</td>' +
            '</tr>';
          }).join('') +
          '</tbody></table>';
      }

      // Top authors
      var authorsEl = container.querySelector('.admin-top-authors');
      if (data.topAuthors.length === 0) {
        authorsEl.innerHTML = '<p class="admin-empty">Нет данных</p>';
      } else {
        authorsEl.innerHTML = '<table class="admin-table admin-table-compact"><thead><tr>' +
          '<th>Автор</th><th>Статей</th><th>Просм.</th>' +
          '</tr></thead><tbody>' +
          data.topAuthors.map(function (a) {
            return '<tr>' +
              '<td><a href="/author/' + a.id + '">' + Utils.escapeHtml(a.displayName) + '</a></td>' +
              '<td>' + a.articleCount + '</td>' +
              '<td>' + _formatNum(a.totalViews) + '</td>' +
            '</tr>';
          }).join('') +
          '</tbody></table>';
      }
    } catch (err) {
      console.error('Dashboard analytics error:', err);
      statsRow.innerHTML = '<p class="admin-error">Не удалось загрузить аналитику</p>';
    }
  },
});

function _statCard(label, value, sub) {
  return '<div class="admin-stat-card">' +
    '<div class="admin-stat-value">' + value + '</div>' +
    '<div class="admin-stat-label">' + label + '</div>' +
    (sub ? '<div class="admin-stat-sub">' + sub + '</div>' : '') +
  '</div>';
}

function _formatNum(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}
