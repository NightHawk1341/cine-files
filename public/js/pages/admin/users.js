/**
 * Admin users management.
 * Route: /admin/users
 */

Router.registerPage('/admin/users', {
  styles: ['/css/admin.css'],

  init() {
    var content = document.getElementById('page-content');
    content.innerHTML =
      '<div class="container page-content admin-page">' +
      '<h1 class="admin-title">Пользователи</h1>' +
      '<p class="admin-empty">Управление пользователями будет доступно позже</p>' +
      '</div>';
    document.title = 'Пользователи — Админ — CineFiles';
  },
});
