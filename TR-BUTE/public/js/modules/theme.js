// ============================================================
// THEME MODULE
// Handles dark/light theme switching
// ============================================================

const THEME_STORAGE_KEY = 'tributary-theme';

/**
 * Get the current theme.
 * User's stored preference takes priority; falls back to platform detection
 * or 'dark' when no preference is set.
 * @returns {'dark'|'light'}
 */
function getTheme() {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'dark' || stored === 'light') return stored;
  return detectPlatformTheme() || 'dark';
}

/**
 * Detect the dark/light theme currently active in the host mini-app.
 * Returns null when not inside a known mini-app or theme cannot be determined.
 * @returns {'dark'|'light'|null}
 */
function detectPlatformTheme() {
  // Telegram Mini App — colorScheme is 'dark' or 'light'
  if (window.isInsideTelegram?.()) {
    const tgScheme = window.Telegram?.WebApp?.colorScheme;
    if (tgScheme === 'dark' || tgScheme === 'light') return tgScheme;
  }
  // MAX Mini App — colorScheme follows the same convention as Telegram
  if (window.WebApp?.InitData?.length > 0) {
    const s = window.WebApp?.colorScheme;
    if (s === 'dark' || s === 'light') return s;
  }
  // VK Mini App — color scheme is passed as a URL query parameter
  if (new URLSearchParams(window.location.search).has('vk_app_id')) {
    const vkScheme = new URLSearchParams(window.location.search).get('vk_color_scheme');
    if (vkScheme === 'bright_light' || vkScheme === 'vkcom_light') return 'light';
    if (vkScheme === 'space_gray'   || vkScheme === 'vkcom_dark')  return 'dark';
  }
  return null;
}

const META_COLORS = { dark: '#121212', light: '#f2ede4' };

/**
 * Apply the theme to the document.
 * Temporarily disables transitions for an instant, simultaneous update.
 * @param {string} theme - 'dark' or 'light'
 */
function applyTheme(theme) {
  document.documentElement.classList.add('theme-transition-disable');
  document.documentElement.setAttribute('data-theme', theme);

  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', META_COLORS[theme] || META_COLORS.dark);
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.documentElement.classList.remove('theme-transition-disable');
    });
  });
}

/**
 * Set and persist a new theme.
 * @param {string} theme - 'dark' or 'light'
 */
function setTheme(theme) {
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  applyTheme(theme);
  window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
}

/**
 * Toggle between dark and light theme.
 * @returns {string} The new theme
 */
function toggleTheme() {
  const newTheme = getTheme() === 'dark' ? 'light' : 'dark';
  setTheme(newTheme);
  return newTheme;
}

/**
 * Initialize theme on page load. Call as early as possible to prevent flash.
 */
function initTheme() {
  applyTheme(getTheme());
}

// Initialize immediately (prevents flash of wrong theme/scheme)
initTheme();

/**
 * Subscribe to platform theme-change events so the site updates in real time
 * when the user changes the Telegram or MAX app theme while the mini app is open.
 * VK theme changes are handled in vk-miniapp.js via the VK Bridge subscribe API.
 */
(function setupPlatformThemeListeners() {
  // Telegram fires 'themeChanged' on window.Telegram.WebApp
  const tg = window.Telegram?.WebApp;
  if (tg && typeof tg.onEvent === 'function') {
    tg.onEvent('themeChanged', () => {
      const s = tg.colorScheme;
      if (s === 'dark' || s === 'light') applyTheme(s);
    });
  }

  // MAX: try the Telegram-style onEvent API first, then a dedicated onThemeChanged
  if (window.WebApp?.InitData?.length > 0) {
    const wa = window.WebApp;
    if (typeof wa.onEvent === 'function') {
      wa.onEvent('themeChanged', () => {
        const s = wa.colorScheme;
        if (s === 'dark' || s === 'light') applyTheme(s);
      });
    } else if (typeof wa.onThemeChanged === 'function') {
      wa.onThemeChanged(() => {
        const s = wa.colorScheme;
        if (s === 'dark' || s === 'light') applyTheme(s);
      });
    }
  }
})();

// Expose globally
window.ThemeManager = {
  get: getTheme,
  set: setTheme,
  toggle: toggleTheme,
  init: initTheme,
  applyTheme,
};

window.toggleTheme = toggleTheme;

/**
 * Get a CSS variable value from the current theme
 * @param {string} varName - CSS variable name (with or without --)
 * @returns {string} The computed value
 */
function getCssVar(varName) {
  const name = varName.startsWith('--') ? varName : `--${varName}`;
  return getComputedStyle(document.body).getPropertyValue(name).trim();
}

/**
 * Get multiple CSS variable values as an object
 * @param {string[]} varNames - Array of CSS variable names
 * @returns {Object} Object with variable names as keys and values
 */
function getCssVars(varNames) {
  const style = getComputedStyle(document.body);
  const result = {};
  varNames.forEach(name => {
    const cssName = name.startsWith('--') ? name : `--${name}`;
    result[name] = style.getPropertyValue(cssName).trim();
  });
  return result;
}

// Add to ThemeManager
window.ThemeManager.getCssVar = getCssVar;
window.ThemeManager.getCssVars = getCssVars;
