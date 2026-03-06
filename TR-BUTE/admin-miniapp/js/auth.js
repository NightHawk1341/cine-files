/**
 * auth.js
 * Extracted from admin-miniapp/script.js
 */

import { state, updateState } from './state.js';
import { API_BASE, tg, isBrowserMode } from './config.js';
import { SVGIcons } from './utils.js';

// ============================================================================
// AUTHENTICATION
// ============================================================================

/**
 * Verify admin access (supports both Telegram and browser modes)
 */
async function verifyAdminAccess() {
  try {
    const browserMode = isBrowserMode();

    // Show loading state
    showAuthLoading();

    // Browser mode: Verify authentication via API
    if (browserMode) {
      // Verify authentication via API endpoint
      try {
        const response = await fetch(`${API_BASE}/api/admin/browser-verify`, {
          method: 'GET',
          credentials: 'include' // Include cookies
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          const message = data.message || 'Access denied';
          showAccessDenied(message);
          // Redirect to login page
          window.location.href = '/admin/login';
          return false;
        }

        // Store admin data
        state.isAuthenticated = true;
        state.adminData = data.admin;
        state.role = data.admin.role || 'admin';
        state.editorPermissions = data.admin.editorPermissions || null;

        // Mark app as authenticated to show UI
        document.getElementById('app')?.classList.add('authenticated');

        // Add role class to app for CSS-based hiding
        const appEl = document.getElementById('app');
        if (appEl) {
          appEl.classList.add(`role-${state.role}`);
        }

        return true;
      } catch (error) {
        console.error('Browser auth verification failed:', error);
        showAccessDenied('Authentication failed');
        window.location.href = '/admin/login';
        return false;
      }
    }

    // Telegram mode: Verify initData
    const initData = tg.initData;

    if (!initData) {
      showAccessDenied('No authentication data provided');
      return false;
    }

    // Send verification request
    const response = await fetch(`${API_BASE}/api/admin/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ initData })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      const message = data.message || 'Access denied';
      showAccessDenied(message);
      return false;
    }

    // Store admin data
    state.isAuthenticated = true;
    state.adminData = data.admin;
    state.role = data.admin.role || 'admin'; // Telegram users are always admin
    state.editorPermissions = data.admin.editorPermissions || null;

    // Mark app as authenticated to show UI
    const appEl = document.getElementById('app');
    if (appEl) {
      appEl.classList.add('authenticated');
      appEl.classList.add(`role-${state.role}`);
    }

    return true;
  } catch (error) {
    console.error('Authentication error:', error);
    showAccessDenied('Failed to verify access. Please try again.');
    return false;
  }
}

/**
 * Show loading state during authentication
 */
function showAuthLoading() {
  const content = document.getElementById('content');
  if (content) {
    content.innerHTML = `
      <div class="loading-spinner">
        <div class="spinner"></div>
        <p>Проверка доступа...</p>
      </div>
    `;
  }
}

/**
 * Show access denied message
 */
function showAccessDenied(message) {
  const app = document.getElementById('app');
  if (app) {
    app.innerHTML = `
      <div style="
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        padding: var(--spacing-xl);
        text-align: center;
        background: var(--bg-primary);
      ">
        <div style="
          width: 80px;
          height: 80px;
          color: var(--error);
          margin-bottom: var(--spacing-lg);
        ">${SVGIcons.lock}</div>
        <h1 style="
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: var(--spacing-md);
        ">Access Denied</h1>
        <p style="
          font-size: 1rem;
          color: var(--text-secondary);
          max-width: 400px;
          line-height: 1.6;
        ">${message}</p>
      </div>
    `;
  }

  // Hide navigation
  const nav = document.querySelector('.bottom-nav');
  if (nav) {
    nav.style.display = 'none';
  }

  // Disable closing confirmation
  if (tg) {
    tg.disableClosingConfirmation();
  }
}


/**
 * Logout function
 */
async function logout() {
  try {
    // Browser mode: Clear cookie via API
    if (isBrowserMode()) {
      await fetch(`${API_BASE}/api/admin/logout`, {
        method: 'POST',
        credentials: 'include'
      });

      // Redirect to login page
      window.location.href = '/admin/login';
    } else {
      // Telegram mode: Just clear state and close app
      state.isAuthenticated = false;
      state.adminData = null;

      if (tg) {
        tg.close();
      }
    }
  } catch (error) {
    console.error('Logout error:', error);
    // Force redirect anyway
    if (isBrowserMode()) {
      window.location.href = '/admin/login';
    }
  }
}

// Exports
export { verifyAdminAccess, showAuthLoading, showAccessDenied, logout };
