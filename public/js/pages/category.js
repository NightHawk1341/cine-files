/**
 * Category page — article listing with pagination.
 * Route: /:category (must be registered after specific routes)
 */

Router.registerPage('/:category', {
  styles: ['/css/category.css'],

  async init(params) {
    var content = document.getElementById('page-content');
    content.innerHTML = '<div class="container page-content">' + Skeleton.grid(6).outerHTML + '</div>';

    var articles = [];
    var categoryName = params.category.charAt(0).toUpperCase() + params.category.slice(1);
    var total = 0;
    var page = Number(Utils.getQueryParam('page')) || 1;

    try {
      var data = await Utils.apiFetch(
        '/api/articles?category=' + encodeURIComponent(params.category) +
        '&page=' + page + '&limit=12&status=published'
      );
      articles = data.articles || [];
      total = data.total || 0;
      categoryName = data.category_name || categoryName;
    } catch (err) {
      // API unavailable — show empty state
    }

    var totalPages = Math.ceil(total / 12);

    content.innerHTML = '';
    var container = document.createElement('div');
    container.className = 'container page-content';

    var h1 = document.createElement('h1');
    h1.className = 'category-title';
    h1.textContent = categoryName;
    container.appendChild(h1);

    if (articles.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'category-empty';
      empty.textContent = 'Статей в этой категории пока нет';
      container.appendChild(empty);
    } else {
      var grid = document.createElement('div');
      grid.className = 'article-grid';
      articles.forEach(function (a) {
        grid.appendChild(ArticleCard.build(a));
      });
      container.appendChild(grid);

      // Inject integration placements between articles
      if (typeof IntegrationSlot !== 'undefined') {
        IntegrationSlot.injectBetween(grid, 4);
      }

      // Pagination
      if (totalPages > 1) {
        var nav = document.createElement('nav');
        nav.className = 'category-pagination';

        if (page > 1) {
          var prev = document.createElement('a');
          prev.className = 'category-page-link';
          prev.href = '/' + params.category + '?page=' + (page - 1);
          prev.textContent = 'Назад';
          nav.appendChild(prev);
        }

        var info = document.createElement('span');
        info.className = 'category-page-info';
        info.textContent = 'Страница ' + page + ' из ' + totalPages;
        nav.appendChild(info);

        if (page < totalPages) {
          var next = document.createElement('a');
          next.className = 'category-page-link';
          next.href = '/' + params.category + '?page=' + (page + 1);
          next.textContent = 'Далее';
          nav.appendChild(next);
        }

        container.appendChild(nav);
      }
    }

    content.appendChild(container);
    document.title = categoryName + ' — CineFiles';
  },
});
