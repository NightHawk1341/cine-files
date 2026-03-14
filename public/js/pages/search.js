/**
 * Search page — search articles and tags.
 * Route: /search
 */

Router.registerPage('/search', {
  styles: ['/css/search.css'],

  async init() {
    var content = document.getElementById('page-content');
    content.innerHTML = '';

    var container = document.createElement('div');
    container.className = 'container page-content';

    var h1 = document.createElement('h1');
    h1.className = 'search-title';
    h1.textContent = 'Поиск';
    container.appendChild(h1);

    // Search form
    var form = document.createElement('form');
    form.className = 'search-form';

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'search-input';
    input.placeholder = 'Поиск статей, фильмов, людей...';
    input.value = Utils.getQueryParam('q') || '';

    var btn = document.createElement('button');
    btn.type = 'submit';
    btn.className = 'search-btn';
    btn.textContent = 'Найти';

    form.appendChild(input);
    form.appendChild(btn);
    container.appendChild(form);

    // Results container
    var results = document.createElement('div');
    results.className = 'search-results';
    container.appendChild(results);

    content.appendChild(container);

    // Handle form submit
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var q = input.value.trim();
      if (q.length >= 2) {
        history.replaceState(null, '', '/search?q=' + encodeURIComponent(q));
        performSearch(q, results);
      }
    });

    // Auto-search if query param present
    var initialQuery = Utils.getQueryParam('q');
    if (initialQuery && initialQuery.length >= 2) {
      performSearch(initialQuery, results);
    }

    document.title = 'Поиск — CineFiles';
  },
});

async function performSearch(query, container) {
  container.innerHTML = '<div class="skeleton" style="height:200px"></div>';

  try {
    var data = await Utils.apiFetch('/api/search?q=' + encodeURIComponent(query));
    container.innerHTML = '';

    var tags = data.tags || [];
    var articles = data.articles || [];

    if (tags.length === 0 && articles.length === 0) {
      container.innerHTML = '<p class="search-placeholder">Ничего не найдено по запросу &laquo;' +
        Utils.escapeHtml(query) + '&raquo;</p>';
      return;
    }

    // Tags results
    if (tags.length > 0) {
      var tagSection = document.createElement('div');
      tagSection.className = 'search-tags-section';
      tagSection.innerHTML = '<h2 class="search-section-title">Теги <span class="search-result-count">' +
        tags.length + '</span></h2>';

      var tagList = document.createElement('div');
      tagList.className = 'tag-cloud';
      tags.forEach(function (tag) {
        var a = document.createElement('a');
        a.className = 'tag-pill';
        a.href = '/tag/' + tag.slug;
        a.textContent = tag.name_ru;
        tagList.appendChild(a);
      });
      tagSection.appendChild(tagList);
      container.appendChild(tagSection);
    }

    // Article results
    if (articles.length > 0) {
      var artSection = document.createElement('div');
      artSection.innerHTML = '<h2 class="search-section-title">Статьи <span class="search-result-count">' +
        articles.length + '</span></h2>';

      var grid = document.createElement('div');
      grid.className = 'article-grid';
      articles.forEach(function (a) {
        grid.appendChild(ArticleCard.build(a));
      });
      artSection.appendChild(grid);
      container.appendChild(artSection);
    }
  } catch (err) {
    console.error('Search error:', err);
    container.innerHTML = '<p class="search-placeholder">Произошла ошибка при поиске</p>';
  }
}
