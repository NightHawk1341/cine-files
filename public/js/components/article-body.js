/**
 * Article body — block renderer.
 * Converts JSON block array to HTML DOM.
 */

var ArticleBody = (function () {
  /**
   * Render blocks into a container element.
   * @param {HTMLElement} container
   * @param {Array} blocks
   */
  function render(container, blocks) {
    container.className = 'article-body';
    blocks.forEach(function (block) {
      var el = renderBlock(block);
      if (el) container.appendChild(el);
    });
  }

  /**
   * Render a single block.
   * @param {object} block
   * @returns {HTMLElement|null}
   */
  function renderBlock(block) {
    switch (block.type) {
      case 'paragraph': {
        var p = document.createElement('p');
        p.className = 'article-paragraph';
        p.innerHTML = Utils.sanitizeInlineHtml(block.text);
        return p;
      }

      case 'heading': {
        var level = Math.min(Math.max(block.level || 2, 2), 6);
        var h = document.createElement('h' + level);
        h.className = 'article-heading';
        h.textContent = block.text;
        return h;
      }

      case 'image': {
        var figure = document.createElement('figure');
        figure.className = 'article-figure';
        var img = document.createElement('img');
        img.className = 'article-image zoomable-image';
        img.src = Media.resolveImageUrl(block.url);
        img.alt = block.alt || '';
        img.loading = 'lazy';
        figure.appendChild(img);

        if (block.caption || block.credit) {
          var caption = document.createElement('figcaption');
          caption.className = 'article-figcaption';
          var text = block.caption || '';
          if (block.credit) {
            text += ' <span class="article-credit">' + Utils.escapeHtml(block.credit) + '</span>';
          }
          caption.innerHTML = text;
          figure.appendChild(caption);
        }
        return figure;
      }

      case 'quote': {
        var bq = document.createElement('blockquote');
        bq.className = 'article-quote';
        var qp = document.createElement('p');
        qp.innerHTML = Utils.sanitizeInlineHtml(block.text);
        bq.appendChild(qp);

        if (block.author || block.source) {
          var footer = document.createElement('footer');
          footer.className = 'article-quote-footer';
          var parts = [];
          if (block.author) parts.push('<cite>' + Utils.escapeHtml(block.author) + '</cite>');
          if (block.source) parts.push(Utils.escapeHtml(block.source));
          footer.innerHTML = parts.join(', ');
          bq.appendChild(footer);
        }
        return bq;
      }

      case 'list': {
        var tag = block.style === 'ordered' ? 'ol' : 'ul';
        var list = document.createElement(tag);
        list.className = 'article-list';
        (block.items || []).forEach(function (item) {
          var li = document.createElement('li');
          li.innerHTML = Utils.sanitizeInlineHtml(item);
          list.appendChild(li);
        });
        return list;
      }

      case 'embed': {
        return renderEmbed(block.provider, block.videoId);
      }

      case 'divider': {
        var hr = document.createElement('hr');
        hr.className = 'article-divider';
        return hr;
      }

      case 'spoiler': {
        var details = document.createElement('details');
        details.className = 'article-spoiler';
        var summary = document.createElement('summary');
        summary.className = 'article-spoiler-title';
        summary.textContent = block.title || 'Спойлер';
        details.appendChild(summary);
        var spoilerContent = document.createElement('div');
        spoilerContent.className = 'article-spoiler-content';
        (block.blocks || []).forEach(function (b) {
          var el = renderBlock(b);
          if (el) spoilerContent.appendChild(el);
        });
        details.appendChild(spoilerContent);
        return details;
      }

      case 'infobox': {
        var aside = document.createElement('aside');
        aside.className = 'article-infobox';
        var infoTitle = document.createElement('div');
        infoTitle.className = 'article-infobox-title';
        infoTitle.textContent = block.title || '';
        aside.appendChild(infoTitle);
        var infoContent = document.createElement('div');
        infoContent.className = 'article-infobox-content';
        (block.blocks || []).forEach(function (b) {
          var el = renderBlock(b);
          if (el) infoContent.appendChild(el);
        });
        aside.appendChild(infoContent);
        return aside;
      }

      case 'tribute_products': {
        var tribute = document.createElement('div');
        tribute.className = 'article-tribute-block';
        tribute.innerHTML = '<p class="article-tribute-placeholder">Связанные товары TR-BUTE: ' +
          Utils.escapeHtml((block.productIds || []).join(', ')) + '</p>';
        return tribute;
      }

      case 'movie_card': {
        var movie = document.createElement('div');
        movie.className = 'article-movie-card';
        movie.innerHTML = '<p class="article-movie-card-placeholder">Карточка фильма (TMDB Entity #' +
          Utils.escapeHtml(String(block.tmdbEntityId || '')) + ')</p>';
        return movie;
      }

      default:
        return null;
    }
  }

  function renderEmbed(provider, videoId) {
    var embedUrls = {
      youtube: 'https://www.youtube.com/embed/' + videoId,
      vk_video: 'https://vk.com/video_ext.php?oid=' + videoId,
      rutube: 'https://rutube.ru/play/embed/' + videoId,
    };

    var src = embedUrls[provider];
    if (!src) return null;

    var wrapper = document.createElement('div');
    wrapper.className = 'article-embed-wrapper';
    var iframe = document.createElement('iframe');
    iframe.className = 'article-embed-iframe';
    iframe.src = src;
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    iframe.allowFullscreen = true;
    iframe.loading = 'lazy';
    iframe.title = provider + ' video';
    wrapper.appendChild(iframe);
    return wrapper;
  }

  return {
    render: render,
  };
})();
