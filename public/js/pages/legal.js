/**
 * Legal page — static content.
 * Route: /legal
 */

Router.registerPage('/legal', {
  styles: ['/css/legal.css'],

  init() {
    var content = document.getElementById('page-content');
    content.innerHTML =
      '<div class="container-narrow page-content legal-page">' +
      '<h1 class="legal-title">Правовая информация</h1>' +
      '<div class="legal-body">' +
      '<h2>Пользовательское соглашение</h2>' +
      '<p>Используя сайт CineFiles, вы соглашаетесь с условиями данного пользовательского соглашения.</p>' +
      '<h2>Политика конфиденциальности</h2>' +
      '<p>Мы собираем минимальный объем данных, необходимый для работы сервиса. ' +
      'Персональные данные не передаются третьим лицам без вашего согласия.</p>' +
      '<h2>Авторские права</h2>' +
      '<p>Все материалы сайта защищены авторским правом. ' +
      'Использование материалов без разрешения редакции запрещено.</p>' +
      '<p>Изображения из TMDB используются в соответствии с условиями TMDB API.</p>' +
      '</div>' +
      '</div>';
    document.title = 'Правовая информация — CineFiles';
  },
});
