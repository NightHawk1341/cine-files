/**
 * Collections listing page.
 * Route: /collections
 */

Router.registerPage('/collections', {
  styles: ['/css/collections.css'],

  async init() {
    var content = document.getElementById('page-content');
    content.innerHTML = '<div class="container page-content">' + Skeleton.grid(4).outerHTML + '</div>';

    try {
      // Collections don't have a dedicated API yet, use articles with collection filter
      content.innerHTML = '';
      var container = document.createElement('div');
      container.className = 'container page-content';

      var h1 = document.createElement('h1');
      h1.className = 'collections-page-title';
      h1.textContent = 'Подборки';
      container.appendChild(h1);

      var empty = document.createElement('p');
      empty.className = 'collections-empty';
      empty.textContent = 'Подборки появятся здесь';
      container.appendChild(empty);

      content.appendChild(container);
      document.title = 'Подборки — CineFiles';
    } catch (err) {
      console.error('Collections page error:', err);
    }
  },
});
