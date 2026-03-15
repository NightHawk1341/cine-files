/**
 * Article page — displays single article with blocks, tags, and comments.
 * Route: /:category/:slug
 */

Router.registerPage('/:category/:slug', {
  styles: ['/css/article.css'],

  async init(params) {
    var content = document.getElementById('page-content');
    content.innerHTML = '<div class="container-narrow article-page" style="padding-top:32px">' +
      '<div class="skeleton" style="height:300px;border-radius:12px;margin-bottom:24px"></div>' +
      '<div class="skeleton" style="height:36px;width:60%;margin-bottom:12px"></div>' +
      '<div class="skeleton" style="height:20px;width:80%;margin-bottom:32px"></div>' +
      '</div>';

    var article = null;

    try {
      article = await Utils.apiFetch('/api/articles/' + encodeURIComponent(params.slug));
    } catch (err) {
      // API unavailable
    }

    if (!article) {
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
    if (article.cover_image_url) {
      var cover = document.createElement('div');
      cover.className = 'article-cover';
      var coverImg = document.createElement('img');
      coverImg.className = 'article-cover-image zoomable-image';
      coverImg.src = Media.resolveImageUrl(article.cover_image_url);
      coverImg.alt = article.cover_image_alt || article.title;
      cover.appendChild(coverImg);
      if (article.cover_credit) {
        var credit = document.createElement('p');
        credit.className = 'article-cover-credit';
        credit.textContent = article.cover_credit;
        cover.appendChild(credit);
      }
      container.appendChild(cover);
    }

    // Header
    var header = document.createElement('header');
    header.className = 'article-header';

    if (article.category_name_ru || article.category_slug) {
      var catLink = document.createElement('a');
      catLink.className = 'article-category-link';
      catLink.href = '/' + article.category_slug;
      catLink.textContent = article.category_name_ru || article.category_slug;
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

    if (article.author_name) {
      var authorLink = document.createElement('a');
      authorLink.className = 'article-meta-author';
      authorLink.href = '/author/' + (article.author_id || 1);
      authorLink.textContent = article.author_name;
      meta.appendChild(authorLink);
    }

    if (article.published_at) {
      var date = document.createElement('time');
      date.className = 'article-meta-date';
      date.textContent = Utils.formatDate(article.published_at);
      meta.appendChild(date);
    }

    if (article.updated_at && article.updated_at !== article.published_at) {
      var updated = document.createElement('span');
      updated.className = 'article-meta-updated';
      updated.textContent = '(обновлено ' + Utils.formatDate(article.updated_at) + ')';
      meta.appendChild(updated);
    }

    if (article.view_count > 0) {
      var views = document.createElement('span');
      views.className = 'article-meta-stat';
      views.textContent = article.view_count + ' просм.';
      meta.appendChild(views);
    }

    if (article.comment_count > 0) {
      var comments = document.createElement('span');
      comments.className = 'article-meta-stat';
      comments.textContent = article.comment_count + ' комм.';
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
    if (article.content_blocks && article.content_blocks.length > 0) {
      var body = document.createElement('div');
      ArticleBody.render(body, article.content_blocks);
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
        tagLink.textContent = tag.name_ru;
        tagsDiv.appendChild(tagLink);
      });
      container.appendChild(tagsDiv);
    }

    // Comments
    var commentsContainer = document.createElement('div');
    commentsContainer.className = 'article-comments';
    container.appendChild(commentsContainer);
    CommentList.render(commentsContainer, article.id);

    content.appendChild(container);

    // Update page title
    document.title = article.title + ' — CineFiles';
  },
});
