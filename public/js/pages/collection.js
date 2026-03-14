/**
 * Single collection page.
 * Route: /collection/:slug
 */

Router.registerPage('/collection/:slug', {
  styles: ['/css/collections.css'],

  async init(params) {
    var content = document.getElementById('page-content');
    content.innerHTML = '<div class="container page-content">' + Skeleton.grid(4).outerHTML + '</div>';

    try {
      content.innerHTML = '';
      var container = document.createElement('div');
      container.className = 'container page-content';

      var h1 = document.createElement('h1');
      h1.className = 'collections-page-title';
      h1.textContent = 'Подборка';
      container.appendChild(h1);

      var empty = document.createElement('p');
      empty.className = 'collections-empty';
      empty.textContent = 'Подборка будет доступна позже';
      container.appendChild(empty);

      content.appendChild(container);
      document.title = 'Подборка — CineFiles';
    } catch (err) {
      console.error('Collection page error:', err);
    }
  },
});
