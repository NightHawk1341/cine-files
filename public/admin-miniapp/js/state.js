/**
 * Global State Management
 * CineFiles Admin Mini-App
 */

export const state = {
  currentView: 'dashboard',
  theme: localStorage.getItem('cinefiles-theme') || 'dark',
  isAuthenticated: false,
  adminData: null,
  role: null
};

export function isAdmin() {
  return state.role === 'admin';
}

export function updateState(updates, callback) {
  Object.assign(state, updates);
  if (callback) callback();
}

export function resetState() {
  state.currentView = 'dashboard';
  state.isAuthenticated = false;
  state.adminData = null;
  state.role = null;
}
