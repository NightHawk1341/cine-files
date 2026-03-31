/**
 * CineFiles Admin Mini-App Main Entry Point
 * Browser-only — no Telegram/MAX support
 */

import { state, updateState, isAdmin } from './state.js';
import { API_BASE } from './config.js';
import { verifyAdminAccess, logout } from './auth.js';
import { showToast, showModal, hideModal } from './utils.js';
import { toggleTheme, applyTheme } from './theme.js';

// View modules
import { renderDashboardView } from './views/dashboard.js';
import { renderArticlesView } from './views/articles.js';
import { renderArticleEditorView } from './views/article-editor.js';
import { renderCommentsView } from './views/comments.js';
import { renderTagsView } from './views/tags.js';
import { renderUsersView } from './views/users.js';
import { renderMediaView } from './views/media.js';
import { renderCollectionsView } from './views/collections.js';
import { renderCategoriesView } from './views/categories.js';
import { renderIntegrationsView } from './views/integrations.js';
import { renderModerationView } from './views/moderation.js';
import { renderSettingsView } from './views/settings.js';

/**
 * Initialize theme on page load
 */
function initTheme() {
  applyTheme();
}

/**
 * Check if user has access to a specific view
 */
function canAccessView(viewName) {
  return isAdmin();
}

/**
 * Switch between views
 */
function switchView(viewName) {
  if (!canAccessView(viewName)) {
    showToast('Доступ к этому разделу ограничен', 'error');
    return;
  }

  // Update navigation button states
  document.querySelectorAll('.nav-button, .header-nav-button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  // Update state and persist
  updateState({ currentView: viewName });
  try { localStorage.setItem('admin-current-view', viewName); } catch (e) {}

  // Set data-view on content-area for per-view CSS
  const contentArea = document.querySelector('.content-area');
  if (contentArea) contentArea.dataset.view = viewName;

  // Load view
  switch (viewName) {
    case 'dashboard': renderDashboardView(); break;
    case 'articles': renderArticlesView(); break;
    case 'article-editor': renderArticleEditorView(); break;
    case 'comments': renderCommentsView(); break;
    case 'tags': renderTagsView(); break;
    case 'users': renderUsersView(); break;
    case 'media': renderMediaView(); break;
    case 'collections': renderCollectionsView(); break;
    case 'categories': renderCategoriesView(); break;
    case 'integrations': renderIntegrationsView(); break;
    case 'moderation': renderModerationView(); break;
    case 'settings': renderSettingsView(); break;
    default: renderDashboardView(); break;
  }
}

// Make switchView available globally for cross-view navigation
window.adminSwitchView = switchView;

/**
 * Application initialization
 */
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize theme
  initTheme();

  // Logout button
  document.getElementById('logout-btn')?.addEventListener('click', logout);

  // Verify admin access before anything else
  const isAuthorized = await verifyAdminAccess();
  if (!isAuthorized) return;

  // Modal close
  document.getElementById('modal-close')?.addEventListener('click', hideModal);
  document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') {
      if (Date.now() - (window._modalShownAt || 0) < 350) return;
      hideModal();
    }
  });

  // Navigation - both bottom nav and header nav
  document.querySelectorAll('.nav-button, .header-nav-button').forEach(btn => {
    btn.addEventListener('click', () => {
      switchView(btn.dataset.view);
    });
  });

  // Load initial view
  const savedView = localStorage.getItem('admin-current-view');
  const defaultView = (savedView && canAccessView(savedView)) ? savedView : 'dashboard';
  switchView(defaultView);
});
