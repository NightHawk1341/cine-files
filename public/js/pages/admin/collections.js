/**
 * Admin collections management.
 * Route: /admin/collections
 */

Router.registerPage('/admin/collections', {
  styles: ['/css/admin.css'],

  init() {
    var content = document.getElementById('page-content');
    content.innerHTML =
      '<div class="container page-content admin-page">' +
      '<h1 class="admin-title">Подборки</h1>' +
      '<p class="admin-empty">Управление подборками будет доступно позже</p>' +
      '</div>';
    document.title = 'Подборки — Админ — CineFiles';
  },
});
