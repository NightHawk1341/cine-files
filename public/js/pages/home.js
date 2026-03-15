/**
 * Home page — filter toolbar (new/popular) + vertical article feed, tags, categories.
 */

Router.registerPage('/', {
  styles: ['/css/style.css', '/css/filter-toolbar.css'],

  async init() {
    var content = document.getElementById('page-content');
    content.innerHTML = '';

    var page = document.createElement('div');
    page.className = 'home-page';

    // Filter toolbar
    var toolbarSection = document.createElement('section');
    toolbarSection.className = 'home-section home-section-toolbar container';

    var toolbar = document.createElement('div');
    toolbar.className = 'filter-toolbar';

    var btnNew = document.createElement('button');
    btnNew.className = 'filter-toolbar-btn active';
    btnNew.textContent = 'Новые';
    btnNew.setAttribute('data-sort', 'new');

    var btnPopular = document.createElement('button');
    btnPopular.className = 'filter-toolbar-btn';
    btnPopular.textContent = 'Популярные';
    btnPopular.setAttribute('data-sort', 'popular');

    toolbar.appendChild(btnNew);
    toolbar.appendChild(btnPopular);
    toolbarSection.appendChild(toolbar);
    page.appendChild(toolbarSection);

    // Feed section (skeleton first)
    var feedSection = document.createElement('section');
    feedSection.className = 'home-section container';
    var feed = document.createElement('div');
    feed.className = 'article-feed';
    for (var s = 0; s < 6; s++) feed.appendChild(Skeleton.articleCard());
    feedSection.appendChild(feed);
    page.appendChild(feedSection);

    // Popular tags
    var tagsSection = document.createElement('section');
    tagsSection.className = 'home-section container';
    tagsSection.innerHTML = '<h2 class="home-section-title">Популярные теги</h2>';
    var tagsCloud = document.createElement('div');
    tagsCloud.className = 'tag-cloud';
    for (var s = 0; s < 8; s++) {
      var pill = document.createElement('span');
      pill.className = 'tag-pill skeleton';
      pill.style.width = (60 + Math.random() * 60) + 'px';
      pill.style.height = '32px';
      pill.innerHTML = '&nbsp;';
      tagsCloud.appendChild(pill);
    }
    tagsSection.appendChild(tagsCloud);
    page.appendChild(tagsSection);

    // Categories quick nav
    var catsSection = document.createElement('section');
    catsSection.className = 'home-section container';
    catsSection.innerHTML = '<h2 class="home-section-title">Разделы</h2>';
    var catsGrid = document.createElement('div');
    catsGrid.className = 'categories-grid';
    catsSection.appendChild(catsGrid);
    page.appendChild(catsSection);

    content.appendChild(page);

    // State
    var currentSort = 'new';
    var cachedArticles = { new: null, popular: null };

    // Load and render articles
    async function loadArticles(sortKey) {
      feed.innerHTML = '';
      for (var s = 0; s < 6; s++) feed.appendChild(Skeleton.articleCard());

      if (cachedArticles[sortKey]) {
        renderArticles(cachedArticles[sortKey]);
        return;
      }

      try {
        var sortParam = sortKey === 'popular' ? '&sort=views' : '';
        var data = await Utils.apiFetch('/api/articles?limit=20&status=published' + sortParam);
        var articles = data.articles || [];
        cachedArticles[sortKey] = articles;
        renderArticles(articles);
      } catch (err) {
        feed.innerHTML = '';
      }
    }

    function renderArticles(articles) {
      feed.innerHTML = '';
      if (articles.length === 0) return;
      articles.forEach(function (a) {
        feed.appendChild(ArticleCard.build(a));
      });
    }

    // Toolbar click handler
    toolbar.addEventListener('click', function (e) {
      var btn = e.target.closest('.filter-toolbar-btn');
      if (!btn || btn.classList.contains('active')) return;

      toolbar.querySelector('.filter-toolbar-btn.active').classList.remove('active');
      btn.classList.add('active');

      currentSort = btn.getAttribute('data-sort');
      loadArticles(currentSort);
    });

    // Initial data load
    var tagsList = [];
    var cats = [];

    try {
      var [articlesData, tagsData, catsData] = await Promise.all([
        Utils.apiFetch('/api/articles?limit=20&status=published'),
        Utils.apiFetch('/api/tags?limit=20&sort=article_count'),
        Utils.apiFetch('/api/categories'),
      ]);
      cachedArticles['new'] = articlesData.articles || [];
      tagsList = tagsData.tags || [];
      cats = catsData.categories || catsData || [];
    } catch (err) {
      // API unavailable
    }

    // Render feed
    renderArticles(cachedArticles['new'] || []);

    // Tags
    tagsCloud.innerHTML = '';
    if (tagsList.length > 0) {
      tagsList.forEach(function (tag) {
        var a = document.createElement('a');
        a.className = 'tag-pill';
        a.href = '/tag/' + tag.slug;
        a.textContent = tag.name_ru;
        if (tag.article_count > 0) {
          var count = document.createElement('span');
          count.className = 'tag-pill-count';
          count.textContent = tag.article_count;
          a.appendChild(count);
        }
        tagsCloud.appendChild(a);
      });
    }

    // Categories
    if (Array.isArray(cats)) {
      cats.forEach(function (cat) {
        var link = document.createElement('a');
        link.className = 'category-card';
        link.href = '/' + cat.slug;
        var name = document.createElement('span');
        name.className = 'category-card-name';
        name.textContent = cat.name_ru;
        link.appendChild(name);
        if (cat.description) {
          var desc = document.createElement('span');
          desc.className = 'category-card-desc';
          desc.textContent = cat.description;
          link.appendChild(desc);
        }
        catsGrid.appendChild(link);
      });
    }
  },
});
