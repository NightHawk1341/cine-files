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

    // Quick links
    var nav = document.createElement('nav');
    nav.className = 'admin-nav';

    var links = [
      { href: '/admin/articles', label: 'Статьи' },
      { href: '/admin/comments', label: 'Комментарии' },
      { href: '/admin/tags', label: 'Теги' },
      { href: '/admin/users', label: 'Пользователи' },
      { href: '/admin/media', label: 'Медиатека' },
      { href: '/admin/collections', label: 'Подборки' },
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
  },
});
