/**
 * Global State Management
 * Centralized application state for the Admin Mini-App
 */

export const state = {
  currentView: 'feed',
  theme: localStorage.getItem('admin-theme') || 'dark',
  orders: [],
  reviews: [],
  analytics: null,
  selectedPeriod: 'today',
  isAuthenticated: false,
  adminData: null,
  // Role-based access
  role: null, // 'admin' or 'editor'
  editorPermissions: null // Permissions for editor role
};

/**
 * Check if current user is admin
 */
export function isAdmin() {
  return state.role === 'admin';
}

/**
 * Check if current user is editor
 */
export function isEditor() {
  return state.role === 'editor';
}

/**
 * Check if editor has permission for a specific feature
 * @param {string} permission - Permission key (e.g., 'products', 'stories')
 * @param {string} subPermission - Optional sub-permission (e.g., 'canDelete')
 */
export function hasPermission(permission, subPermission = null) {
  // Admin has all permissions
  if (state.role === 'admin') return true;

  // No editor permissions loaded
  if (!state.editorPermissions) return false;

  const perm = state.editorPermissions[permission];
  if (!perm || !perm.enabled) return false;

  // Check sub-permission if specified
  if (subPermission !== null) {
    return perm[subPermission] === true;
  }

  return true;
}

/**
 * Update state and optionally trigger callback
 * @param {Object} updates - State updates to apply
 * @param {Function} callback - Optional callback after state update
 */
export function updateState(updates, callback) {
  Object.assign(state, updates);
  if (callback) callback();
}

/**
 * Reset state to defaults
 */
export function resetState() {
  state.currentView = 'feed';
  state.orders = [];
  state.reviews = [];
  state.analytics = null;
  state.isAuthenticated = false;
  state.adminData = null;
  state.role = null;
  state.editorPermissions = null;
}
