/**
 * Author page — author profile + articles.
 * Route: /author/:id
 * Falls back to placeholder data when API is unavailable.
 */

Router.registerPage('/author/:id', {
  styles: ['/css/author.css'],

  async init(params) {
    var content = document.getElementById('page-content');
    content.innerHTML = '<div class="container page-content">' + Skeleton.grid(4).outerHTML + '</div>';

    var articles = [];
    var authorName = 'Автор';

    try {
      var data = await Utils.apiFetch(
        '/api/articles?author_id=' + encodeURIComponent(params.id) + '&limit=24&status=published'
      );
      articles = data.articles || [];
      authorName = articles.length > 0 ? articles[0].author_name : 'Автор';
    } catch (err) {
      // API unavailable — use placeholder data filtered by author
      var all = Placeholders.getArticles();
      var names = {
        '1': 'Редактор Иванов',
        '2': 'Мария Петрова',
      };
      authorName = names[params.id] || 'Автор';
      articles = all.filter(function (a) { return a.author_name === authorName; });
    }

    content.innerHTML = '';
    var container = document.createElement('div');
    container.className = 'container page-content';

    // Profile header
    var profile = document.createElement('div');
    profile.className = 'author-profile';

    var avatarEl = document.createElement('div');
    avatarEl.className = 'author-avatar-placeholder';
    avatarEl.textContent = authorName.charAt(0).toUpperCase();
    profile.appendChild(avatarEl);

    var info = document.createElement('div');
    var name = document.createElement('h1');
    name.className = 'author-name';
    name.textContent = authorName;
    info.appendChild(name);

    var stats = document.createElement('p');
    stats.className = 'author-stats';
    stats.textContent = Utils.pluralize(articles.length, ['статья', 'статьи', 'статей']);
    info.appendChild(stats);

    profile.appendChild(info);
    container.appendChild(profile);

    // Articles grid
    if (articles.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'author-empty';
      empty.textContent = 'У автора пока нет опубликованных статей';
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
    document.title = authorName + ' — CineFiles';
  },
});
