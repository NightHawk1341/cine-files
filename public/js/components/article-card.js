/**
 * Article card component — builds a card DOM element from article data.
 */

var ArticleCard = (function () {
  /**
   * Build an article card element.
   * @param {object} article — article object from API (camelCase, nested category/author)
   * @returns {HTMLElement}
   */
  function build(article) {
    var categorySlug = article.category ? article.category.slug : '';
    var href = '/' + categorySlug + '/' + article.slug;

    var card = document.createElement('article');
    card.className = 'article-card';

    var link = document.createElement('a');
    link.className = 'article-card-link';
    link.href = href;

    // Image
    if (article.coverImageUrl) {
      var imageWrapper = document.createElement('div');
      imageWrapper.className = 'article-card-image-wrapper';
      var img = document.createElement('img');
      img.className = 'article-card-image';
      img.src = Media.resolveImageUrl(article.coverImageUrl);
      img.alt = article.coverImageAlt || article.title;
      img.loading = 'lazy';
      imageWrapper.appendChild(img);
      link.appendChild(imageWrapper);
    }

    // Content
    var content = document.createElement('div');
    content.className = 'article-card-content';

    var title = document.createElement('h3');
    title.className = 'article-card-title';
    title.textContent = article.title;
    content.appendChild(title);

    if (article.lead) {
      var lead = document.createElement('p');
      lead.className = 'article-card-lead';
      lead.textContent = article.lead;
      content.appendChild(lead);
    }

    // Meta
    var meta = document.createElement('div');
    meta.className = 'article-card-meta';

    var authorName = article.author ? article.author.displayName : '';
    if (authorName) {
      var author = document.createElement('span');
      author.className = 'article-card-author';
      author.textContent = authorName;
      meta.appendChild(author);
    }

    if (article.publishedAt) {
      var date = document.createElement('time');
      date.className = 'article-card-date';
      date.textContent = Utils.formatDate(article.publishedAt);
      meta.appendChild(date);
    }

    if (article.viewCount > 0) {
      var views = document.createElement('span');
      views.className = 'article-card-stat';
      views.textContent = article.viewCount + ' просм.';
      meta.appendChild(views);
    }

    if (article.commentCount > 0) {
      var comments = document.createElement('span');
      comments.className = 'article-card-stat';
      comments.textContent = article.commentCount + ' комм.';
      meta.appendChild(comments);
    }

    content.appendChild(meta);
    link.appendChild(content);
    card.appendChild(link);

    // Tags
    if (article.tags && article.tags.length > 0) {
      var tagsDiv = document.createElement('div');
      tagsDiv.className = 'article-card-tags';
      article.tags.slice(0, 3).forEach(function (tag) {
        var tagLink = document.createElement('a');
        tagLink.className = 'article-card-tag';
        tagLink.href = '/tag/' + tag.slug;
        tagLink.textContent = tag.nameRu || tag.nameEn || tag.slug;
        tagsDiv.appendChild(tagLink);
      });
      card.appendChild(tagsDiv);
    }

    return card;
  }

  return {
    build: build,
  };
})();
