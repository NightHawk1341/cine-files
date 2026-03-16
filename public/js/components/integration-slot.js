/**
 * IntegrationSlot — renders partner placements on public pages.
 * Fetches active integrations from /api/integrations, renders by placement,
 * tracks views (debounced) and clicks.
 */

var IntegrationSlot = (function () {
  var cache = null;
  var cacheTime = 0;
  var CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  var viewedIds = {};

  function fetchItems() {
    var now = Date.now();
    if (cache && (now - cacheTime) < CACHE_TTL) {
      return Promise.resolve(cache);
    }

    return Utils.apiFetch('/api/integrations')
      .then(function (data) {
        cache = data.items || [];
        cacheTime = Date.now();
        return cache;
      })
      .catch(function () {
        return cache || [];
      });
  }

  function filterByPlacement(items, placement, categoryId) {
    return items.filter(function (item) {
      if (item.placement !== placement) return false;
      if (item.target_categories && item.target_categories.length > 0 && categoryId) {
        return item.target_categories.indexOf(categoryId) !== -1;
      }
      return true;
    });
  }

  function trackView(id) {
    if (viewedIds[id]) return;
    viewedIds[id] = true;
    fetch('/api/integrations/' + id + '/view', { method: 'POST' }).catch(function () {});
  }

  function trackClick(id) {
    fetch('/api/integrations/' + id + '/click', { method: 'POST' }).catch(function () {});
  }

  function buildItem(item) {
    if (item.integration_type === 'html' && item.html_content) {
      var wrapper = document.createElement('div');
      wrapper.className = 'integration-slot-item integration-slot-html';
      wrapper.innerHTML = item.html_content;
      trackView(item.id);
      return wrapper;
    }

    var el = document.createElement('a');
    el.className = 'integration-slot-item';
    el.href = item.destination_url || '#';
    if (item.destination_url) {
      el.target = '_blank';
      el.rel = 'noopener noreferrer sponsored';
    }

    if (item.image_url) {
      var img = document.createElement('img');
      img.className = 'integration-slot-image';
      img.src = Media.resolveImageUrl(item.image_url);
      img.alt = item.alt_text || item.title || '';
      img.loading = 'lazy';
      el.appendChild(img);
    }

    if (item.title && item.integration_type === 'partner') {
      var label = document.createElement('span');
      label.className = 'integration-slot-label';
      label.textContent = item.title;
      el.appendChild(label);
    }

    el.addEventListener('click', function () {
      trackClick(item.id);
    });

    trackView(item.id);
    return el;
  }

  /**
   * Render integration items into a container for a given placement.
   * @param {HTMLElement} container
   * @param {string} placement — 'sidebar' | 'between' | 'footer' | 'header'
   * @param {object} [options]
   * @param {number} [options.categoryId] — filter by category
   * @param {number} [options.limit] — max items to render
   */
  function render(container, placement, options) {
    if (!container) return Promise.resolve();
    options = options || {};

    return fetchItems().then(function (items) {
      var filtered = filterByPlacement(items, placement, options.categoryId);
      if (options.limit) filtered = filtered.slice(0, options.limit);
      if (filtered.length === 0) return;

      var slot = document.createElement('div');
      slot.className = 'integration-slot integration-slot-' + placement;

      filtered.forEach(function (item) {
        slot.appendChild(buildItem(item));
      });

      container.appendChild(slot);
    });
  }

  /**
   * Inject integration items between article cards in a feed.
   * Inserts after every `interval` cards.
   * @param {HTMLElement} feedContainer — the .article-feed or .article-grid element
   * @param {number} [interval=4] — insert after every N cards
   * @param {object} [options]
   */
  function injectBetween(feedContainer, interval, options) {
    if (!feedContainer) return Promise.resolve();
    interval = interval || 4;
    options = options || {};

    return fetchItems().then(function (items) {
      var filtered = filterByPlacement(items, 'between', options.categoryId);
      if (filtered.length === 0) return;

      var cards = feedContainer.querySelectorAll('.article-card');
      var inserted = 0;

      for (var i = interval - 1; i < cards.length && inserted < filtered.length; i += interval) {
        var slot = document.createElement('div');
        slot.className = 'integration-slot integration-slot-between';
        slot.appendChild(buildItem(filtered[inserted]));
        cards[i].parentNode.insertBefore(slot, cards[i].nextSibling);
        inserted++;
        // Re-query after DOM change to get correct positions
        cards = feedContainer.querySelectorAll('.article-card');
        i++; // skip the inserted element
      }
    });
  }

  function invalidateCache() {
    cache = null;
    cacheTime = 0;
  }

  return {
    render: render,
    injectBetween: injectBetween,
    invalidateCache: invalidateCache,
  };
})();
