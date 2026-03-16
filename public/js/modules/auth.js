/**
 * Auth — shared authentication state module.
 * Caches user info, provides role checks, handles logout.
 * Like TR-BUTE's core/auth.js pattern.
 */

var Auth = (function () {
  var cachedUser = null;
  var fetchPromise = null;
  var initialized = false;

  /**
   * Fetch current user from server. Caches result.
   * @returns {Promise<object|null>}
   */
  function fetchUser() {
    if (fetchPromise) return fetchPromise;

    fetchPromise = fetch('/api/auth/me')
      .then(function (res) {
        if (!res.ok) {
          cachedUser = null;
          return null;
        }
        return res.json();
      })
      .then(function (user) {
        cachedUser = user;
        initialized = true;
        fetchPromise = null;
        return user;
      })
      .catch(function () {
        cachedUser = null;
        initialized = true;
        fetchPromise = null;
        return null;
      });

    return fetchPromise;
  }

  /**
   * Get current user. Returns cached if available, fetches if not.
   * @returns {Promise<object|null>}
   */
  function getUser() {
    if (initialized) return Promise.resolve(cachedUser);
    return fetchUser();
  }

  /**
   * Force refresh user from server.
   * @returns {Promise<object|null>}
   */
  function refresh() {
    initialized = false;
    fetchPromise = null;
    return fetchUser();
  }

  /**
   * Check if user is logged in (sync, uses cache).
   * @returns {boolean}
   */
  function isLoggedIn() {
    return cachedUser !== null;
  }

  /**
   * Check if user has editor or admin role.
   * @returns {boolean}
   */
  function isEditor() {
    return cachedUser && (cachedUser.role === 'editor' || cachedUser.role === 'admin');
  }

  /**
   * Check if user has admin role.
   * @returns {boolean}
   */
  function isAdmin() {
    return cachedUser && cachedUser.role === 'admin';
  }

  /**
   * Require a minimum role. Redirects to /profile if not met.
   * @param {string} role — 'reader', 'editor', or 'admin'
   * @returns {Promise<boolean>} — true if authorized
   */
  async function requireRole(role) {
    var user = await getUser();
    if (!user) {
      Router.navigate('/profile');
      return false;
    }
    if (role === 'editor' && user.role !== 'editor' && user.role !== 'admin') {
      Router.navigate('/profile');
      return false;
    }
    if (role === 'admin' && user.role !== 'admin') {
      Router.navigate('/profile');
      return false;
    }
    return true;
  }

  /**
   * Logout: call server, clear cache, redirect to home.
   * @returns {Promise<void>}
   */
  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (err) {
      console.error('Logout error:', err);
    }
    cachedUser = null;
    initialized = true;
    fetchPromise = null;
    document.dispatchEvent(new CustomEvent('auth:change', { detail: { user: null } }));
  }

  /**
   * Called after successful login to update state.
   */
  async function onLogin() {
    var user = await refresh();
    document.dispatchEvent(new CustomEvent('auth:change', { detail: { user: user } }));
    return user;
  }

  return {
    getUser: getUser,
    refresh: refresh,
    isLoggedIn: isLoggedIn,
    isEditor: isEditor,
    isAdmin: isAdmin,
    requireRole: requireRole,
    logout: logout,
    onLogin: onLogin,
  };
})();
