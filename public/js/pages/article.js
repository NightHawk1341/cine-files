/**
 * Article page — displays single article with blocks, tags, and comments.
 * Route: /:category/:slug
 */

var _articleProductsController = null;

Router.registerPage('/:category/:slug', {
  styles: ['/css/article.css'],

  cleanup: function () {
    if (_articleProductsController) {
      _articleProductsController.abort();
      _articleProductsController = null;
    }
  },

  async init(params) {
    var content = document.getElementById('page-content');
    content.innerHTML = '<div class="container-narrow article-page" style="padding-top:32px">' +
      '<div class="skeleton" style="height:300px;border-radius:12px;margin-bottom:24px"></div>' +
      '<div class="skeleton" style="height:36px;width:60%;margin-bottom:12px"></div>' +
      '<div class="skeleton" style="height:20px;width:80%;margin-bottom:32px"></div>' +
      '</div>';

    var article = null;

    try {
      var data = await Utils.apiFetch('/api/articles/' + encodeURIComponent(params.slug));
      article = data.article || data;
    } catch (err) {
      // API unavailable
    }

    if (!article || !article.title) {
      content.innerHTML = '<div class="container-narrow" style="padding:60px 0;text-align:center">' +
        '<h1 style="font-size:var(--heading-desktop);color:var(--text-primary);margin-bottom:16px">Статья не найдена</h1>' +
        '<p style="color:var(--text-secondary)">Возможно, она была удалена или не существует</p>' +
        '</div>';
      return;
    }

    content.innerHTML = '';
    var container = document.createElement('article');
    container.className = 'container-narrow article-page';

    // Cover image
    if (article.coverImageUrl) {
      var cover = document.createElement('div');
      cover.className = 'article-cover';
      var coverImg = document.createElement('img');
      coverImg.className = 'article-cover-image zoomable-image';
      coverImg.src = Media.resolveImageUrl(article.coverImageUrl);
      coverImg.alt = article.coverImageAlt || article.title;
      cover.appendChild(coverImg);
      if (article.coverImageCredit) {
        var credit = document.createElement('p');
        credit.className = 'article-cover-credit';
        credit.textContent = article.coverImageCredit;
        cover.appendChild(credit);
      }
      container.appendChild(cover);
    }

    // Header
    var header = document.createElement('header');
    header.className = 'article-header';

    if (article.category) {
      var catLink = document.createElement('a');
      catLink.className = 'article-category-link';
      catLink.href = '/' + article.category.slug;
      catLink.textContent = article.category.nameRu || article.category.slug;
      header.appendChild(catLink);
    }

    var h1 = document.createElement('h1');
    h1.className = 'article-title';
    h1.textContent = article.title;
    header.appendChild(h1);

    if (article.subtitle) {
      var subtitle = document.createElement('p');
      subtitle.className = 'article-subtitle';
      subtitle.textContent = article.subtitle;
      header.appendChild(subtitle);
    }

    // Meta
    var meta = document.createElement('div');
    meta.className = 'article-meta';

    if (article.author && article.author.displayName) {
      var authorLink = document.createElement('a');
      authorLink.className = 'article-meta-author';
      authorLink.href = '/author/' + article.author.id;
      authorLink.textContent = article.author.displayName;
      meta.appendChild(authorLink);
    }

    if (article.publishedAt) {
      var date = document.createElement('time');
      date.className = 'article-meta-date';
      date.textContent = Utils.formatDate(article.publishedAt);
      meta.appendChild(date);
    }

    if (article.updatedAt && article.updatedAt !== article.publishedAt) {
      var updated = document.createElement('span');
      updated.className = 'article-meta-updated';
      updated.textContent = '(обновлено ' + Utils.formatDate(article.updatedAt) + ')';
      meta.appendChild(updated);
    }

    if (article.viewCount > 0) {
      var views = document.createElement('span');
      views.className = 'article-meta-stat';
      views.textContent = article.viewCount + ' просм.';
      meta.appendChild(views);
    }

    if (article.commentCount > 0) {
      var comments = document.createElement('span');
      comments.className = 'article-meta-stat';
      comments.textContent = article.commentCount + ' комм.';
      meta.appendChild(comments);
    }

    header.appendChild(meta);
    container.appendChild(header);

    // Lead
    if (article.lead) {
      var lead = document.createElement('p');
      lead.className = 'article-lead';
      lead.textContent = article.lead;
      container.appendChild(lead);
    }

    // Body blocks
    if (article.body && article.body.length > 0) {
      var body = document.createElement('div');
      ArticleBody.render(body, article.body);
      container.appendChild(body);
    }

    // Tags
    if (article.tags && article.tags.length > 0) {
      var tagsDiv = document.createElement('div');
      tagsDiv.className = 'article-tags';
      article.tags.forEach(function (tag) {
        var tagLink = document.createElement('a');
        tagLink.className = 'article-tag';
        tagLink.href = '/tag/' + tag.slug;
        tagLink.textContent = tag.nameRu || tag.nameEn || tag.slug;
        tagsDiv.appendChild(tagLink);
      });
      container.appendChild(tagsDiv);
    }

    // Products placeholder (populated async below)
    var productsSection = document.createElement('div');
    productsSection.className = 'article-products-section';
    container.appendChild(productsSection);

    // Comments
    var commentsContainer = document.createElement('div');
    commentsContainer.className = 'article-comments';
    container.appendChild(commentsContainer);
    CommentList.render(commentsContainer, article.id);

    content.appendChild(container);

    // Update page title
    document.title = article.title + ' — CineFiles';

    // Async: fetch and render auto-matched TR-BUTE products
    _articleProductsController = new AbortController();
    var signal = _articleProductsController.signal;
    fetch('/api/articles/' + encodeURIComponent(params.slug) + '/products', { signal: signal })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var products = data.products || [];
        if (products.length > 0) {
          _renderArticleProducts(productsSection, products);
        }
      })
      .catch(function () { /* graceful degradation — products are optional */ });
  },
});

function _renderArticleProducts(section, products) {
  section.classList.add('article-products-section--visible');
  section.innerHTML =
    '<div class="article-products-header">' +
      '<span class="article-products-label">Мерч</span>' +
      '<a class="article-products-link" href="https://buy-tribute.com" target="_blank" rel="noopener">TR-BUTE</a>' +
    '</div>' +
    '<div class="article-products-grid">' +
      products.map(function (p) {
        var imgHtml = p.imageUrl
          ? '<img class="tribute-card-image" src="' + Utils.escapeHtml(p.imageUrl) + '" alt="' + Utils.escapeHtml(p.name) + '" loading="lazy">'
          : '<div class="tribute-card-image tribute-card-no-image"></div>';
        var priceHtml = p.price
          ? '<span class="tribute-card-price">' + Utils.escapeHtml(Number(p.price).toLocaleString('ru-RU') + '\u00a0\u20BD') + '</span>'
          : '';
        return '<a class="tribute-card" href="' + Utils.escapeHtml(p.url) + '" target="_blank" rel="noopener">' +
          imgHtml +
          '<div class="tribute-card-info">' +
            '<span class="tribute-card-name">' + Utils.escapeHtml(p.name) + '</span>' +
            priceHtml +
          '</div>' +
        '</a>';
      }).join('') +
    '</div>';
}
