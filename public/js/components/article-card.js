/**
 * Article card component — builds a card DOM element from article data.
 */

var ArticleCard = (function () {
  /**
   * Build an article card element.
   * @param {object} article
   * @param {string} article.slug
   * @param {string} article.category_slug
   * @param {string} article.title
   * @param {string} [article.lead]
   * @param {string} [article.cover_image_url]
   * @param {string} [article.cover_image_alt]
   * @param {string} [article.published_at]
   * @param {string} [article.author_name]
   * @param {number} [article.view_count]
   * @param {number} [article.comment_count]
   * @param {Array} [article.tags]
   * @returns {HTMLElement}
   */
  function build(article) {
    var href = '/' + article.category_slug + '/' + article.slug;

    var card = document.createElement('article');
    card.className = 'article-card';

    var link = document.createElement('a');
    link.className = 'article-card-link';
    link.href = href;

    // Image
    if (article.cover_image_url) {
      var imageWrapper = document.createElement('div');
      imageWrapper.className = 'article-card-image-wrapper';
      var img = document.createElement('img');
      img.className = 'article-card-image';
      img.src = Media.resolveImageUrl(article.cover_image_url);
      img.alt = article.cover_image_alt || article.title;
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

    if (article.author_name) {
      var author = document.createElement('span');
      author.className = 'article-card-author';
      author.textContent = article.author_name;
      meta.appendChild(author);
    }

    if (article.published_at) {
      var date = document.createElement('time');
      date.className = 'article-card-date';
      date.textContent = Utils.formatDate(article.published_at);
      meta.appendChild(date);
    }

    if (article.view_count > 0) {
      var views = document.createElement('span');
      views.className = 'article-card-stat';
      views.textContent = article.view_count + ' просм.';
      meta.appendChild(views);
    }

    if (article.comment_count > 0) {
      var comments = document.createElement('span');
      comments.className = 'article-card-stat';
      comments.textContent = article.comment_count + ' комм.';
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
        tagLink.textContent = tag.name_ru || tag.nameRu;
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
