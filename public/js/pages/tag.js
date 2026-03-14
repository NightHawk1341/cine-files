/**
 * Tag page — articles for a specific tag.
 * Route: /tag/:slug
 */

Router.registerPage('/tag/:slug', {
  styles: ['/css/tag.css'],

  async init(params) {
    var content = document.getElementById('page-content');
    content.innerHTML = '<div class="container page-content">' + Skeleton.grid(6).outerHTML + '</div>';

    try {
      var [tagData, articlesData] = await Promise.all([
        Utils.apiFetch('/api/tags/' + encodeURIComponent(params.slug)),
        Utils.apiFetch('/api/articles?tag=' + encodeURIComponent(params.slug) + '&limit=24&status=published'),
      ]);

      var articles = articlesData.articles || [];

      content.innerHTML = '';
      var container = document.createElement('div');
      container.className = 'container page-content';

      var h1 = document.createElement('h1');
      h1.className = 'tag-page-title';
      h1.textContent = tagData.name_ru || tagData.name_en || params.slug;
      container.appendChild(h1);

      if (tagData.description) {
        var desc = document.createElement('p');
        desc.className = 'tag-page-description';
        desc.textContent = tagData.description;
        container.appendChild(desc);
      }

      if (articles.length === 0) {
        var empty = document.createElement('p');
        empty.className = 'tag-page-empty';
        empty.textContent = 'Статей с этим тегом пока нет';
        container.appendChild(empty);
      } else {
        var grid = document.createElement('div');
        grid.className = 'article-grid';
        articles.forEach(function (a) {
          grid.appendChild(ArticleCard.build(a));
        });
        container.appendChild(grid);
      }

      content.appendChild(container);
      document.title = (tagData.name_ru || params.slug) + ' — CineFiles';
    } catch (err) {
      console.error('Tag page error:', err);
      content.innerHTML = '<div class="container" style="padding:60px 0;text-align:center">' +
        '<p style="color:var(--text-secondary)">Тег не найден</p></div>';
    }
  },
});
