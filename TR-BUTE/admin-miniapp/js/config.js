/**
 * Application Configuration
 * Constants and configuration values
 */

// API Base URL
export const API_BASE = window.location.origin;

// Telegram Web App
export const tg = window.Telegram?.WebApp;

// Initialize Telegram Web App
if (tg) {
  tg.expand();
  // Don't enable closing confirmation - causes false warnings
  // tg.enableClosingConfirmation();
}

/**
 * Detect if running in browser mode (vs Telegram Mini App)
 * @returns {boolean} True if in browser mode
 */
export function isBrowserMode() {
  return !tg || !tg.initData;
}
