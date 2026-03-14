/**
 * Home page — hero, featured articles, latest news, popular tags.
 */

Router.registerPage('/', {
  styles: ['/css/style.css'],

  async init() {
    var content = document.getElementById('page-content');
    content.innerHTML = '';

    var page = document.createElement('div');
    page.className = 'home-page';

    // Hero
    var hero = document.createElement('section');
    hero.className = 'home-hero';
    hero.innerHTML =
      '<div class="container">' +
      '<h1 class="home-title">CineFiles</h1>' +
      '<p class="home-subtitle">Кино, аниме, игры — новости, рецензии, разборы</p>' +
      '</div>';
    page.appendChild(hero);

    // Featured section (skeleton first)
    var featuredSection = document.createElement('section');
    featuredSection.className = 'home-section container';
    featuredSection.innerHTML = '<h2 class="home-section-title">Избранное</h2>';
    var featuredGrid = document.createElement('div');
    featuredGrid.className = 'article-grid';
    featuredSection.appendChild(featuredGrid);
    page.appendChild(featuredSection);

    // Latest section
    var latestSection = document.createElement('section');
    latestSection.className = 'home-section container';
    latestSection.innerHTML = '<h2 class="home-section-title">Последние статьи</h2>';
    var latestGrid = document.createElement('div');
    latestGrid.className = 'article-grid';
    latestSection.appendChild(latestGrid);
    page.appendChild(latestSection);

    // Popular tags
    var tagsSection = document.createElement('section');
    tagsSection.className = 'home-section container';
    tagsSection.innerHTML = '<h2 class="home-section-title">Популярные теги</h2>';
    var tagsCloud = document.createElement('div');
    tagsCloud.className = 'tag-cloud';
    tagsSection.appendChild(tagsCloud);
    page.appendChild(tagsSection);

    content.appendChild(page);

    // Load data
    try {
      var [articlesData, tagsData] = await Promise.all([
        Utils.apiFetch('/api/articles?limit=12&status=published'),
        Utils.apiFetch('/api/tags?limit=20&sort=article_count'),
      ]);

      var articles = articlesData.articles || [];

      // Featured = first 3
      if (articles.length > 0) {
        articles.slice(0, 3).forEach(function (a) {
          featuredGrid.appendChild(ArticleCard.build(a));
        });
      } else {
        featuredGrid.innerHTML = '<p class="placeholder-text">Избранные статьи появятся здесь</p>';
      }

      // Latest = next 6
      if (articles.length > 3) {
        articles.slice(3, 9).forEach(function (a) {
          latestGrid.appendChild(ArticleCard.build(a));
        });
      } else if (articles.length <= 3) {
        latestGrid.innerHTML = '<p class="placeholder-text">Последние статьи появятся здесь</p>';
      }

      // Tags
      var tags = tagsData.tags || [];
      if (tags.length > 0) {
        tags.forEach(function (tag) {
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
      } else {
        tagsCloud.innerHTML = '<p class="placeholder-text">Популярные теги появятся здесь</p>';
      }
    } catch (err) {
      console.error('Home page load error:', err);
    }
  },
});
