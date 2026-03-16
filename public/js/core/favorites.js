/**
 * Favorites — saved articles system.
 * localStorage-based with server sync when authenticated.
 * Like TR-BUTE's core/favorites.js pattern.
 */

var Favorites = (function () {
  var STORAGE_KEY = 'cinefiles-favorites';
  var favSet = new Set();
  var loaded = false;
  var syncTimeout = null;

  /**
   * Load favorites from localStorage.
   */
  function load() {
    if (loaded) return;
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var ids = JSON.parse(raw);
        if (Array.isArray(ids)) {
          ids.forEach(function (id) { favSet.add(Number(id)); });
        }
      }
    } catch (err) {
      console.error('Favorites load error:', err);
    }
    loaded = true;
  }

  /**
   * Save favorites to localStorage.
   */
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(favSet)));
    } catch (err) {
      console.error('Favorites save error:', err);
    }
  }

  /**
   * Sync favorites to server (fire-and-forget, debounced).
   */
  function scheduleSync() {
    clearTimeout(syncTimeout);
    syncTimeout = setTimeout(function () {
      if (!Auth.isLoggedIn()) return;
      var ids = Array.from(favSet);
      fetch('/api/users/me/favorites', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article_ids: ids }),
      }).catch(function () {});
    }, 2000);
  }

  /**
   * Merge server favorites with local favorites (on login).
   * @returns {Promise<void>}
   */
  async function mergeFromServer() {
    if (!Auth.isLoggedIn()) return;
    try {
      var data = await Utils.apiFetch('/api/users/me/favorites');
      var serverIds = data.article_ids || [];
      serverIds.forEach(function (id) { favSet.add(Number(id)); });
      save();
      scheduleSync();
      dispatchUpdate();
    } catch (err) {
      // Table may not exist yet
    }
  }

  /**
   * Toggle a favorite article.
   * @param {number} articleId
   * @returns {boolean} — new state (true = added, false = removed)
   */
  function toggle(articleId) {
    load();
    var id = Number(articleId);
    var added;
    if (favSet.has(id)) {
      favSet.delete(id);
      added = false;
    } else {
      favSet.add(id);
      added = true;
    }
    save();
    scheduleSync();
    dispatchUpdate();
    return added;
  }

  /**
   * Check if an article is favorited.
   * @param {number} articleId
   * @returns {boolean}
   */
  function has(articleId) {
    load();
    return favSet.has(Number(articleId));
  }

  /**
   * Get all favorite article IDs.
   * @returns {number[]}
   */
  function getAll() {
    load();
    return Array.from(favSet);
  }

  /**
   * Get count of favorites.
   * @returns {number}
   */
  function count() {
    load();
    return favSet.size;
  }

  /**
   * Dispatch update event for UI sync.
   */
  function dispatchUpdate() {
    document.dispatchEvent(new CustomEvent('favorites:change', {
      detail: { count: favSet.size },
    }));
  }

  // Cross-tab sync via storage event
  window.addEventListener('storage', function (e) {
    if (e.key === STORAGE_KEY) {
      favSet.clear();
      loaded = false;
      load();
      dispatchUpdate();
    }
  });

  // Merge on login
  document.addEventListener('auth:change', function (e) {
    if (e.detail && e.detail.user) {
      mergeFromServer();
    }
  });

  // Initial load
  load();

  return {
    toggle: toggle,
    has: has,
    getAll: getAll,
    count: count,
    mergeFromServer: mergeFromServer,
  };
})();
