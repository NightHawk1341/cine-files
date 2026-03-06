/**
 * Auth Module
 * Handles user authentication (Telegram, Yandex), session management, and token refresh
 */

// Internal state
const state = {
  user: null,
  accessToken: null,
  refreshToken: null,
  isLoggedIn: false
};

/**
 * Save auth state to localStorage
 */
const saveState = () => {
  localStorage.setItem('tributary_user', JSON.stringify(state.user));
  localStorage.setItem('tributary_accessToken', state.accessToken);
  localStorage.setItem('tributary_refreshToken', state.refreshToken);
};

/**
 * Load auth state from localStorage
 * @returns {boolean} True if state was loaded successfully
 */
const loadState = () => {
  const savedUser = localStorage.getItem('tributary_user');
  const savedAccessToken = localStorage.getItem('tributary_accessToken');
  const savedRefreshToken = localStorage.getItem('tributary_refreshToken');

  if (savedUser && savedAccessToken) {
    state.user = JSON.parse(savedUser);
    state.accessToken = savedAccessToken;
    state.refreshToken = savedRefreshToken;
    state.isLoggedIn = true;
    return true;
  }
  return false;
};

// Pre-populate state from localStorage so isLoggedIn() and getAuthHeader()
// work as soon as the module is imported, even before init() is called.
// init() will later verify the token with the server and clearState() if invalid.
try { loadState(); } catch (_) { /* init() will handle properly */ }

/**
 * Clear auth state from memory and localStorage
 */
const clearState = () => {
  state.user = null;
  state.accessToken = null;
  state.refreshToken = null;
  state.isLoggedIn = false;
  localStorage.removeItem('tributary_user');
  localStorage.removeItem('tributary_accessToken');
  localStorage.removeItem('tributary_refreshToken');
};

/**
 * Refresh access token using refresh token
 * @returns {Promise<boolean>} True if token was refreshed successfully
 */
const refreshAccessToken = async () => {
  if (!state.refreshToken) return false;

  try {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: state.refreshToken })
    });

    if (!response.ok) {
      clearState();
      return false;
    }

    const data = await response.json();
    state.accessToken = data.accessToken;
    state.refreshToken = data.refreshToken;
    saveState();
    return true;
  } catch (err) {
    console.error('Token refresh failed:', err);
    return false;
  }
};

/**
 * Get authorization header for API requests
 * @returns {Object} Headers object with Authorization and Content-Type
 */
export function getAuthHeader() {
  return {
    'Authorization': `Bearer ${state.accessToken}`,
    'Content-Type': 'application/json'
  };
}

/**
 * Initialize auth session from localStorage and verify tokens
 * @returns {Promise<boolean>} True if session is valid
 */
export async function init() {
  if (loadState()) {
    // Try to verify the token is still valid
    try {
      const response = await fetch('/api/auth/user', {
        headers: getAuthHeader()
      });

      if (response.ok) {
        window.dispatchEvent(new Event('sessionRestored'));
        return true;
      } else if (response.status === 401 || response.status === 403) {
        // Token invalid/expired, try to refresh
        if (await refreshAccessToken()) {
          window.dispatchEvent(new Event('sessionRestored'));
          return true;
        }
        // Refresh failed, clear session
        clearState();
        return false;
      }
      // Server error (5xx) or other - keep session, assume temporary issue
      console.warn('Auth verification returned status:', response.status);
      window.dispatchEvent(new Event('sessionRestored'));
      return state.isLoggedIn;
    } catch (err) {
      console.error('Token verification failed:', err);
      // Network error - keep the session but mark as potentially invalid
      window.dispatchEvent(new Event('sessionRestored'));
      return state.isLoggedIn;
    }
  }
  return false;
}

/**
 * Login with Telegram Web App data
 * @param {string} initData - Telegram WebApp.initData string
 * @returns {Promise<boolean>} True if login successful
 */
export async function loginTelegram(initData) {
  try {
    const response = await fetch('/api/auth/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData })
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    state.user = data.user;
    state.accessToken = data.accessToken;
    state.refreshToken = data.refreshToken;
    state.isLoggedIn = true;
    saveState();
    // Dispatch login event for other modules to sync data
    window.dispatchEvent(new CustomEvent('userLoggedIn', { detail: { user: state.user } }));
    return true;
  } catch (err) {
    console.error('Telegram login failed:', err);
    return false;
  }
}

/**
 * Login with Yandex OAuth
 * @param {string} code - OAuth authorization code
 * @returns {Promise<boolean>} True if login successful
 */
export async function loginYandex(code) {
  try {
    const response = await fetch('/auth/yandex/callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    state.user = data.user;
    state.accessToken = data.accessToken;
    state.refreshToken = data.refreshToken;
    state.isLoggedIn = true;
    saveState();
    // Dispatch login event for other modules to sync data
    window.dispatchEvent(new CustomEvent('userLoggedIn', { detail: { user: state.user } }));
    return true;
  } catch (err) {
    console.error('Yandex login failed:', err);
    return false;
  }
}

/**
 * Login via VK Mini App launch params (HMAC-verified server-side).
 * @param {string} launchParams - Raw vk_* query string from the Mini App URL
 * @param {object|null} bridgeUserInfo - User info from VKWebAppGetUserInfo (name/photo hint)
 * @returns {Promise<boolean>} True if login successful
 */
export async function loginVKMiniApp(launchParams, bridgeUserInfo = null) {
  try {
    const body = { launchParams };
    if (bridgeUserInfo) {
      body.userInfo = {
        firstName: bridgeUserInfo.first_name || '',
        lastName: bridgeUserInfo.last_name || '',
        photoUrl: bridgeUserInfo.photo_200 || bridgeUserInfo.photo_100 || null,
        screenName: bridgeUserInfo.screen_name || null
      };
    }
    const response = await fetch('/api/auth/vk-miniapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    state.user = data.user;
    state.accessToken = data.accessToken;
    state.refreshToken = data.refreshToken;
    state.isLoggedIn = true;
    saveState();
    window.dispatchEvent(new CustomEvent('userLoggedIn', { detail: { user: state.user } }));
    return true;
  } catch (err) {
    console.error('VK Mini App login failed:', err);
    return false;
  }
}

/**
 * Login via MAX Mini App initData (HMAC-verified server-side).
 * @param {string} initData - Raw initData string from window.WebApp.InitData
 * @returns {Promise<boolean>} True if login successful
 */
export async function loginMAXMiniApp(initData) {
  try {
    const response = await fetch('/api/auth/max-miniapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData })
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    state.user = data.user;
    state.accessToken = data.accessToken;
    state.refreshToken = data.refreshToken;
    state.isLoggedIn = true;
    saveState();
    window.dispatchEvent(new CustomEvent('userLoggedIn', { detail: { user: state.user } }));
    return true;
  } catch (err) {
    console.error('MAX Mini App login failed:', err);
    return false;
  }
}

/**
 * Fetch VK user preview (name + photo) for confirmation dialog.
 * The server verifies the signature before returning user info.
 * @param {string} launchParams - Raw VK launch params query string
 * @returns {Promise<{firstName, lastName, photoUrl}|null>}
 */
export async function previewVKMiniAppUser(launchParams) {
  try {
    const response = await fetch('/api/auth/vk-miniapp/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ launchParams })
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.success ? data : null;
  } catch (err) {
    console.error('VK Mini App preview failed:', err);
    return null;
  }
}

/**
 * Login via Telegram Login Widget (external website, not mini-app).
 * @param {Object} userData - Data object from the Telegram Login Widget callback
 * @returns {Promise<boolean>} True if login successful
 */
export async function loginTelegramWidget(userData) {
  try {
    const response = await fetch('/api/auth/telegram-widget', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData)
    });

    if (!response.ok) return false;

    const data = await response.json();
    state.user = data.user;
    state.accessToken = data.accessToken;
    state.refreshToken = data.refreshToken;
    state.isLoggedIn = true;
    saveState();
    window.dispatchEvent(new CustomEvent('userLoggedIn', { detail: { user: state.user } }));
    return true;
  } catch (err) {
    console.error('Telegram widget login failed:', err);
    return false;
  }
}

/**
 * Logout and clear session
 * @returns {Promise<void>}
 */
export async function logout() {
  try {
    if (state.accessToken) {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: getAuthHeader()
      });
    }
  } catch (err) {
    console.error('Logout request failed:', err);
  }
  clearState();
}

/**
 * Check if user is logged in
 * @returns {boolean} True if user is logged in
 */
export function isLoggedIn() {
  return state.isLoggedIn && state.accessToken;
}

/**
 * Get current user info
 * @returns {Object|null} User object or null if not logged in
 */
export function getCurrentUser() {
  return state.user;
}

/**
 * Get current auth token
 * @returns {string|null} Access token or null if not logged in
 */
export function getAuthToken() {
  return state.accessToken;
}

/**
 * Get access token (alias for getAuthToken for backward compatibility)
 * @returns {string|null} Access token or null if not logged in
 */
export function getAccessToken() {
  return state.accessToken;
}
