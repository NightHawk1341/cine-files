/**
 * Application Configuration
 * CineFiles Admin — browser-only (no Telegram/MAX)
 */

export const API_BASE = window.location.origin;

/**
 * Always true for CineFiles — no Telegram/MAX support
 */
export function isBrowserMode() {
  return true;
}
