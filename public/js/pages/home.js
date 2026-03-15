/**
 * Home page — featured articles grid, latest content, popular tags.
 * Content-focused layout matching TR-BUTE's density.
 */

Router.registerPage('/', {
  styles: ['/css/style.css'],

  async init() {
    var content = document.getElementById('page-content');
    content.innerHTML = '';

    var page = document.createElement('div');
    page.className = 'home-page';

    // Featured section (skeleton first)
    var featuredSection = document.createElement('section');
    featuredSection.className = 'home-section container';
    featuredSection.innerHTML = '<h2 class="home-section-title">Избранное</h2>';
    var featuredGrid = document.createElement('div');
    featuredGrid.className = 'article-grid article-grid-featured';
    for (var s = 0; s < 4; s++) featuredGrid.appendChild(Skeleton.articleCard());
    featuredSection.appendChild(featuredGrid);
    page.appendChild(featuredSection);

    // Latest section
    var latestSection = document.createElement('section');
    latestSection.className = 'home-section container';
    latestSection.innerHTML = '<h2 class="home-section-title">Последние статьи</h2>';
    var latestGrid = document.createElement('div');
    latestGrid.className = 'article-grid';
    for (var s = 0; s < 8; s++) latestGrid.appendChild(Skeleton.articleCard());
    latestSection.appendChild(latestGrid);
    page.appendChild(latestSection);

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

    // Load data from API
    var articles = [];
    var tagsList = [];
    var cats = [];

    try {
      var [articlesData, tagsData, catsData] = await Promise.all([
        Utils.apiFetch('/api/articles?limit=12&status=published'),
        Utils.apiFetch('/api/tags?limit=20&sort=article_count'),
        Utils.apiFetch('/api/categories'),
      ]);
      articles = articlesData.articles || [];
      tagsList = tagsData.tags || [];
      cats = catsData.categories || catsData || [];
    } catch (err) {
      // API unavailable — show empty state
    }

    // Clear skeletons and populate with real data
    featuredGrid.innerHTML = '';
    latestGrid.innerHTML = '';
    tagsCloud.innerHTML = '';

    // Featured = first 4
    if (articles.length > 0) {
      articles.slice(0, 4).forEach(function (a) {
        featuredGrid.appendChild(ArticleCard.build(a));
      });
    }

    // Latest = remaining articles
    if (articles.length > 4) {
      articles.slice(4).forEach(function (a) {
        latestGrid.appendChild(ArticleCard.build(a));
      });
    } else if (articles.length <= 4 && articles.length > 0) {
      latestSection.style.display = 'none';
    }

    // Tags
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

    // Categories quick nav
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
