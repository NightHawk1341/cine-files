/**
 * Telegram Mini App detection
 *
 * Centralizes the "is the page running inside Telegram?" check.
 * The Telegram SDK creates window.Telegram.WebApp in ALL browsers that load
 * the script, but only populates initData and sets a real platform value when
 * actually running inside a Telegram client.
 */

const _tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : null;

const _isInsideTelegram = !!_tg && (
  (_tg.initData && _tg.initData.length > 0) ||
  (_tg.platform && _tg.platform !== 'unknown' && _tg.platform !== '')
);

/**
 * Returns true when the page is running inside an actual Telegram Mini App,
 * not just a regular browser that loaded the Telegram SDK.
 */
export function isInsideTelegram() {
  return _isInsideTelegram;
}
