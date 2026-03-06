/**
 * MAX Mini App detection and bridge utilities
 *
 * MAX populates window.WebApp.InitData when the mini app is opened inside MAX.
 * The object is created by the MAX Bridge SDK (max-web-app.js) loaded in the page <head>.
 *
 * Unlike VK (which passes launch params in the URL), MAX uses window.WebApp.InitData —
 * the same approach as Telegram's window.Telegram.WebApp.initData.
 */

// Capture initData once on module load (before any SPA navigation could alter state)
const _initData = typeof window !== 'undefined'
  ? (window.WebApp?.InitData || '')
  : '';

// Running inside MAX only when InitData is non-empty
const _isMAX = _initData.length > 0;

/**
 * Returns true when the page was opened inside a MAX Mini App.
 */
export function isMAXMiniApp() {
  return _isMAX;
}

/**
 * Returns the raw MAX initData string (for server-side signature verification).
 * Null when not in a MAX Mini App.
 */
export function getMAXInitData() {
  return _isMAX ? _initData : null;
}

/**
 * Returns the MAX user_id parsed from initData, or null.
 */
export function getMAXUserId() {
  if (!_isMAX) return null;
  try {
    const params = new URLSearchParams(_initData);
    const userStr = params.get('user');
    if (!userStr) return null;
    const user = JSON.parse(userStr);
    return user.id ? String(user.id) : null;
  } catch {
    return null;
  }
}

/**
 * Signal to the MAX client that the app is ready to be displayed.
 * Should be called once when the app finishes loading.
 */
export function initMAXMiniApp() {
  if (!_isMAX) return;
  try {
    window.WebApp?.ready?.();
  } catch (err) {
    console.error('[MAX] ready() error:', err);
  }
}

/**
 * Open an external URL inside MAX's browser (equivalent of Telegram.WebApp.openLink).
 */
export function maxOpenLink(url) {
  if (!_isMAX) return;
  try {
    window.WebApp?.openLink?.(url);
  } catch (err) {
    console.error('[MAX] openLink error:', err);
  }
}

/**
 * Subscribe to MAX app lifecycle events.
 * Reloads when the user returns after 5+ minutes away (ensures fresh data).
 * Skipped on /checkout to avoid wiping form state.
 */
export function initMAXAppLifecycle() {
  if (!_isMAX) return;

  const RELOAD_THRESHOLD_MS = 5 * 60 * 1000;
  let hiddenAt = null;
  let savedScrollY = 0;

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      savedScrollY = window.scrollY;
    } else {
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
