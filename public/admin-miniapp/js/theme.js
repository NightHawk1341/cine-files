/**
 * theme.js
 * Syncs with main site localStorage key (cinefiles-theme)
 */

import { state, updateState } from './state.js';

export function applyTheme() {
  const theme = state.theme || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
}

export function toggleTheme() {
  const newTheme = state.theme === 'dark' ? 'light' : 'dark';
  updateState({ theme: newTheme });
  localStorage.setItem('cinefiles-theme', newTheme);
  applyTheme();
}
