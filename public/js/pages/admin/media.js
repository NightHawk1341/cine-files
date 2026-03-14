/**
 * Admin media library.
 * Route: /admin/media
 */

Router.registerPage('/admin/media', {
  styles: ['/css/admin.css'],

  init() {
    var content = document.getElementById('page-content');
    content.innerHTML =
      '<div class="container page-content admin-page">' +
      '<h1 class="admin-title">Медиатека</h1>' +
      '<p class="admin-empty">Медиатека будет доступна позже</p>' +
      '</div>';
    document.title = 'Медиатека — Админ — CineFiles';
  },
});
