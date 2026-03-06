/**
 * theme.js
 * Extracted from admin-miniapp/script.js
 */

import { state, updateState } from './state.js';

// ============================================================================
// THEME MANAGEMENT
// ============================================================================

/**
 * Apply the current theme from state
 */
function applyTheme() {
  const theme = state.theme || 'dark';
  document.body.setAttribute('data-theme', theme);
}

/**
 * Toggle between light and dark theme
 */
function toggleTheme() {
  const newTheme = state.theme === 'dark' ? 'light' : 'dark';
  updateState({ theme: newTheme });
  localStorage.setItem('admin-theme', newTheme);
  applyTheme();
}


// Exports
export { toggleTheme, applyTheme };
