/**
 * About page — static content.
 * Route: /about
 */

Router.registerPage('/about', {
  styles: ['/css/about.css'],

  init() {
    var content = document.getElementById('page-content');
    content.innerHTML =
      '<div class="container-narrow page-content about-page">' +
      '<h1 class="about-title">О проекте</h1>' +
      '<div class="about-body">' +
      '<p>CineFiles — это медиа-проект о кино, аниме, играх и поп-культуре. ' +
      'Мы пишем новости, рецензии, разборы и аналитику.</p>' +
      '<p>Проект является частью экосистемы <a href="https://buy-tribute.com" target="_blank" rel="noopener noreferrer">TR-BUTE</a> — ' +
      'платформы для коллекционеров и ценителей поп-культуры.</p>' +
      '<h2>Контакты</h2>' +
      '<p>Telegram: <a href="https://t.me/cinefiles_txt" target="_blank" rel="noopener noreferrer">@cinefiles_txt</a></p>' +
      '<p>VK: <a href="https://vk.com/cinefiles_txt" target="_blank" rel="noopener noreferrer">cinefiles_txt</a></p>' +
      '</div>' +
      '</div>';
    document.title = 'О проекте — CineFiles';
  },
});
