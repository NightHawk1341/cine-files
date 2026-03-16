/**
 * Sidebar — persistent left navigation and right widgets.
 * Visible on desktop (>= 1200px). Content persists across page navigation.
 */

var Sidebar = (function () {
  var leftEl = null;
  var rightEl = null;
  var popularLoaded = false;

  var navItems = [
    { href: '/', label: 'Главная', icon: 'icon-home' },
    { href: '/news', label: 'Новости', icon: 'icon-news' },
    { href: '/reviews', label: 'Рецензии', icon: 'icon-star' },
    { href: '/articles', label: 'Статьи', icon: 'icon-document' },
  ];

  var categoryItems = [
    { href: '/interviews', label: 'Интервью', icon: 'icon-chat' },
    { href: '/lists', label: 'Подборки', icon: 'icon-list' },
    { href: '/analysis', label: 'Разборы', icon: 'icon-search' },
  ];

  var utilItems = [
    { href: '/tags', label: 'Все теги', icon: 'icon-tag' },
    { href: '/collections', label: 'Подборки', icon: 'icon-grid' },
    { href: '/search', label: 'Поиск', icon: 'icon-search' },
  ];

  function buildNavLink(item) {
    var a = document.createElement('a');
    a.href = item.href;
    a.className = 'sidebar-nav-link';

    var iconWrap = document.createElement('span');
    iconWrap.className = 'sidebar-nav-icon';
    iconWrap.innerHTML = '<svg viewBox="0 0 64 64"><use href="#' + item.icon + '"/></svg>';
    a.appendChild(iconWrap);

    var label = document.createElement('span');
    label.textContent = item.label;
    a.appendChild(label);

    return a;
  }

  function buildLeftSidebar() {
    leftEl = document.getElementById('sidebar-left');
    if (!leftEl) return;

    // Main navigation
    var mainGroup = document.createElement('div');
    mainGroup.className = 'sidebar-nav-group';
    navItems.forEach(function (item) {
      mainGroup.appendChild(buildNavLink(item));
    });
    leftEl.appendChild(mainGroup);

    // Divider
    var divider1 = document.createElement('div');
    divider1.className = 'sidebar-divider';
    leftEl.appendChild(divider1);

    // Categories
    var catGroup = document.createElement('div');
    catGroup.className = 'sidebar-nav-group';
    var catTitle = document.createElement('div');
    catTitle.className = 'sidebar-nav-title';
    catTitle.textContent = 'Разделы';
    catGroup.appendChild(catTitle);
    categoryItems.forEach(function (item) {
      catGroup.appendChild(buildNavLink(item));
    });
    leftEl.appendChild(catGroup);

    // Divider
    var divider2 = document.createElement('div');
    divider2.className = 'sidebar-divider';
    leftEl.appendChild(divider2);

    // Utilities
    var utilGroup = document.createElement('div');
    utilGroup.className = 'sidebar-nav-group';
    utilItems.forEach(function (item) {
      utilGroup.appendChild(buildNavLink(item));
    });
    leftEl.appendChild(utilGroup);
  }

  function buildRightSidebar() {
    rightEl = document.getElementById('sidebar-right');
    if (!rightEl) return;

    // Popular articles widget
    var popularWidget = document.createElement('div');
    popularWidget.className = 'sidebar-widget';
    popularWidget.id = 'sidebar-popular';

    var popularTitle = document.createElement('div');
    popularTitle.className = 'sidebar-widget-title';
    popularTitle.textContent = 'Популярное';
    popularWidget.appendChild(popularTitle);

    var popularList = document.createElement('div');
    popularList.className = 'sidebar-article-list';
    popularWidget.appendChild(popularList);

    rightEl.appendChild(popularWidget);

    // Tags widget
    var tagsWidget = document.createElement('div');
    tagsWidget.className = 'sidebar-widget';
    tagsWidget.id = 'sidebar-tags';

    var tagsTitle = document.createElement('div');
    tagsTitle.className = 'sidebar-widget-title';
    tagsTitle.textContent = 'Теги';
    tagsWidget.appendChild(tagsTitle);

    var tagsList = document.createElement('div');
    tagsList.className = 'sidebar-tags-list';
    tagsWidget.appendChild(tagsList);

    rightEl.appendChild(tagsWidget);

    // Integration slot (sidebar placement)
    if (typeof IntegrationSlot !== 'undefined') {
      IntegrationSlot.render(rightEl, 'sidebar');
    }

    // Load content
    loadRightContent();
  }

  function loadRightContent() {
    if (popularLoaded) return;
    popularLoaded = true;

    // Show skeletons while loading
    var popularList = document.querySelector('#sidebar-popular .sidebar-article-list');
    var tagsList = document.querySelector('#sidebar-tags .sidebar-tags-list');

    if (popularList) {
      for (var i = 0; i < 5; i++) {
        var skel = document.createElement('div');
        skel.className = 'sidebar-skeleton-line skeleton';
        skel.style.width = (70 + Math.random() * 30) + '%';
        popularList.appendChild(skel);
      }
    }

    // Try API, fall back to placeholders
    loadPopularArticles(popularList);
    loadPopularTags(tagsList);
  }

  function loadPopularArticles(container) {
    if (!container) return;

    function render(articles) {
      container.innerHTML = '';
      var top = articles
        .slice()
        .sort(function (a, b) { return (b.viewCount || 0) - (a.viewCount || 0); })
        .slice(0, 5);

      top.forEach(function (article, idx) {
        var catSlug = article.category ? article.category.slug : 'articles';
        var link = document.createElement('a');
        link.className = 'sidebar-article-item';
        link.href = '/' + catSlug + '/' + article.slug;

        var rank = document.createElement('span');
        rank.className = 'sidebar-article-rank';
        rank.textContent = (idx + 1);
        link.appendChild(rank);

        var info = document.createElement('div');
        info.className = 'sidebar-article-info';

        var title = document.createElement('div');
        title.className = 'sidebar-article-title';
        title.textContent = article.title;
        info.appendChild(title);

        var authorName = article.author ? article.author.displayName : '';
        var meta = document.createElement('div');
        meta.className = 'sidebar-article-meta';
        meta.textContent = (authorName || '') +
          (article.viewCount ? ' \u00b7 ' + article.viewCount + ' \u043f\u0440\u043e\u0441\u043c.' : '');
        info.appendChild(meta);

        link.appendChild(info);
        container.appendChild(link);
      });
    }

    if (typeof Utils !== 'undefined' && Utils.apiFetch) {
      Utils.apiFetch('/api/articles?limit=5&sort=views&status=published')
        .then(function (data) {
          render(data.articles || []);
        })
        .catch(function () {
          container.innerHTML = '';
        });
    }
  }

  function loadPopularTags(container) {
    if (!container) return;

    function render(tags) {
      container.innerHTML = '';
      tags.slice(0, 12).forEach(function (tag) {
        var a = document.createElement('a');
        a.className = 'sidebar-tag';
        a.href = '/tag/' + tag.slug;
        a.textContent = tag.nameRu;
        container.appendChild(a);
      });
    }

    if (typeof Utils !== 'undefined' && Utils.apiFetch) {
      Utils.apiFetch('/api/tags?limit=12&sort=article_count')
        .then(function (data) {
          render(data.tags || []);
        })
        .catch(function () {
          container.innerHTML = '';
        });
    }
  }

  function updateActiveStates(path) {
    if (!leftEl) return;
    var links = leftEl.querySelectorAll('.sidebar-nav-link');
    links.forEach(function (link) {
      var href = link.getAttribute('href');
      var isActive = href === '/' ? path === '/' : path.startsWith(href);
      link.classList.toggle('active', isActive);
    });
  }

  function init() {
    buildLeftSidebar();
    buildRightSidebar();
    // Set initial active state
    updateActiveStates(location.pathname);

    // Update active states on SPA navigation
    document.addEventListener('spa:pageenter', function (e) {
      updateActiveStates(e.detail.path);
    });
  }

  return {
    init: init,
    updateActiveStates: updateActiveStates,
  };
})();
