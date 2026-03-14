/**
 * Admin settings.
 * Route: /admin/settings
 */

Router.registerPage('/admin/settings', {
  styles: ['/css/admin.css'],

  init() {
    var content = document.getElementById('page-content');
    content.innerHTML =
      '<div class="container page-content admin-page">' +
      '<h1 class="admin-title">Настройки</h1>' +
      '<p class="admin-empty">Настройки будут доступны позже</p>' +
      '</div>';
    document.title = 'Настройки — Админ — CineFiles';
  },
});
