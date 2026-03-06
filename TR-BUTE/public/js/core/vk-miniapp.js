/**
 * VK Mini App detection and bridge utilities
 *
 * VK passes signed params in the URL when the Mini App is opened:
 *   vk_app_id, vk_user_id, vk_sign, vk_ts, vk_platform, etc.
 *
 * We capture these on first load (before SPA router might clean the URL)
 * and store them in module scope for the session lifetime.
 */

// Captured once on module load
const _rawSearch = typeof window !== 'undefined' ? window.location.search : '';
const _params = new URLSearchParams(_rawSearch);

// VK launch params are present when vk_app_id is in the URL
const _isVK = _params.has('vk_app_id');

// Serialize for sending to the server (all vk_* keys, preserves vk_sign)
const _launchParamsString = (() => {
  if (!_isVK) return null;
  const vkEntries = [];
  for (const [key, value] of _params.entries()) {
    if (key.startsWith('vk_')) vkEntries.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  }
  // Some VK contexts (Stories, clips, deep-links) send signature as 'sign' without vk_ prefix.
  // The HMAC covers the same vk_* params — just stored under a different key.
  const bareSign = _params.get('sign');
  if (bareSign && !_params.has('vk_sign')) {
    vkEntries.push(`vk_sign=${encodeURIComponent(bareSign)}`);
  }
  const result = vkEntries.join('&');
  return result || null;
})();

/**
 * Returns true when the page was opened inside a VK Mini App.
 */
export function isVKMiniApp() {
  return _isVK;
}

/**
 * Returns the raw VK launch params query string (for server signature verification).
 * Null when not in a VK Mini App.
 */
export function getVKLaunchParams() {
  return _launchParamsString;
}

/**
 * Returns the vk_user_id from launch params, or null.
 */
export function getVKUserId() {
  return _params.get('vk_user_id');
}

/**
 * Returns the vk_app_id integer (needed for VKWebAppGetAuthToken), or null.
 */
export function getVKAppId() {
  const raw = _params.get('vk_app_id');
  return raw ? parseInt(raw, 10) : null;
}

/**
 * Returns the vk_platform value (android, iphone, desktop_web, etc.), or null.
 */
export function getVKPlatform() {
  return _params.get('vk_platform');
}

// Lazy-loaded VK Bridge instance
let _bridge = null;

/**
 * Load VK Bridge SDK from CDN (cached after first call).
 * Returns the bridge object or null if loading fails.
 */
export async function loadVKBridge() {
  if (_bridge) return _bridge;
  if (!_isVK) return null;

  if (window.vkBridge) {
    _bridge = window.vkBridge;
    return _bridge;
  }

  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/@vkontakte/vk-bridge/dist/browser.min.js';
    script.onload = () => {
      _bridge = window.vkBridge || null;
      resolve(_bridge);
    };
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}

/**
 * Send a VK Bridge event. Returns the response or null on error.
 */
export async function vkBridgeSend(event, params = {}) {
  const bridge = await loadVKBridge();
  if (!bridge) return null;
  try {
    return await bridge.send(event, params);
  } catch (err) {
    console.error('[VK Bridge] Error sending', event, err);
    return null;
  }
}

/**
 * Initialize VK Mini App (call VKWebAppInit).
 * Should be called once when the app loads inside VK.
 */
export async function initVKMiniApp() {
  if (!_isVK) return;
  await vkBridgeSend('VKWebAppInit');
}

/**
 * Request permission to send notifications to this user.
 * Returns true if the user allowed.
 */
export async function requestVKNotifications() {
  const result = await vkBridgeSend('VKWebAppAllowNotifications');
  return result?.result === true;
}

/**
 * Open an external URL inside VK's browser (equivalent of Telegram.WebApp.openLink).
 */
export async function vkOpenLink(url) {
  await vkBridgeSend('VKWebAppOpenLink', { link: url });
}

/**
 * Subscribe to VK app lifecycle events.
 * Reloads when the user returns after 5+ minutes away (ensures fresh data).
 * Skipped on /checkout to avoid wiping form state.
 */
export async function initVKAppLifecycle() {
  if (!_isVK) return;
  const bridge = await loadVKBridge();
  if (!bridge || typeof bridge.subscribe !== 'function') return;

  const RELOAD_THRESHOLD_MS = 5 * 60 * 1000;
  let hiddenAt = null;
  let savedScrollY = 0;

  bridge.subscribe((event) => {
    if (event.type === 'VKWebAppUpdateConfig') {
      // Sync dark/light theme to match the VK app's current color scheme
      const vkScheme = event.data?.scheme;
      let theme = null;
      if (vkScheme === 'bright_light' || vkScheme === 'vkcom_light') theme = 'light';
      else if (vkScheme === 'space_gray' || vkScheme === 'vkcom_dark') theme = 'dark';
      if (theme && window.ThemeManager?.applyTheme) window.ThemeManager.applyTheme(theme);
    } else if (event.type === 'VKWebAppViewHide') {
      hiddenAt = Date.now();
      savedScrollY = window.scrollY;
    } else if (event.type === 'VKWebAppViewRestore') {
      const longAbsence = hiddenAt !== null && (Date.now() - hiddenAt) >= RELOAD_THRESHOLD_MS;
      hiddenAt = null;
      if (longAbsence) {
        savedScrollY = 0;
        if (window.location.pathname.startsWith('/checkout')) return;
        window.location.reload();
        return;
      }
      if (savedScrollY > 0 && window.scrollY < savedScrollY) {
        const scrollY = savedScrollY;
        requestAnimationFrame(() => window.scrollTo(0, scrollY));
      }
      savedScrollY = 0;
    }
  });
}
