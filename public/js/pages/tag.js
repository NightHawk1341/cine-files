/**
 * Tag page — articles for a specific tag.
 * Route: /tag/:slug
 */

Router.registerPage('/tag/:slug', {
  styles: ['/css/tag.css'],

  async init(params) {
    var content = document.getElementById('page-content');
    content.innerHTML = '<div class="container page-content">' + Skeleton.grid(6).outerHTML + '</div>';

    var tagData = null;
    var articles = [];

    try {
      var [td, ad] = await Promise.all([
        Utils.apiFetch('/api/tags/' + encodeURIComponent(params.slug)),
        Utils.apiFetch('/api/articles?tag=' + encodeURIComponent(params.slug) + '&limit=24&status=published'),
      ]);
      tagData = td;
      articles = ad.articles || [];
    } catch (err) {
      // API unavailable
    }

    content.innerHTML = '';
    var container = document.createElement('div');
    container.className = 'container page-content';

    var tagName = tagData ? (tagData.name_ru || tagData.name_en || params.slug) : params.slug;

    var h1 = document.createElement('h1');
    h1.className = 'tag-page-title';
    h1.textContent = tagName;
    container.appendChild(h1);

    if (tagData && tagData.description) {
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
    document.title = tagName + ' — CineFiles';
  },
});
