/**
 * auth.js
 * CineFiles Admin — browser-only authentication
 */

import { state } from './state.js';
import { API_BASE } from './config.js';
import { SVGIcons } from './utils.js';

/**
 * Verify admin access via browser cookie
 */
export async function verifyAdminAccess() {
  try {
    showAuthLoading();

    const response = await fetch(`${API_BASE}/api/admin/browser-verify`, {
      method: 'GET',
      credentials: 'include'
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      window.location.href = '/admin/login';
      return false;
    }

    state.isAuthenticated = true;
    state.adminData = data.admin;
    state.role = data.admin.role || 'admin';

    document.getElementById('app')?.classList.add('authenticated');
    document.getElementById('app')?.classList.add(`role-${state.role}`);

    return true;
  } catch (err) {
    console.error('Auth verification failed:', err);
    window.location.href = '/admin/login';
    return false;
  }
}

/**
 * Show loading state during authentication
 */
export function showAuthLoading() {
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
export function showAccessDenied(message) {
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
}

/**
 * Logout function
 */
export async function logout() {
  try {
    await fetch(`${API_BASE}/api/admin/logout`, {
      method: 'POST',
      credentials: 'include'
    });
  } catch (err) {
    console.error('Logout error:', err);
  }
  window.location.href = '/admin/login';
}
