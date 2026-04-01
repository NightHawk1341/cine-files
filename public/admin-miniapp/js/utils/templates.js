/**
 * utils/templates.js
 * Reusable HTML template helpers for admin miniapp
 */

import { SVGIcons } from '../utils.js';

export function createLoadingSpinner(message = 'Загрузка...') {
  return `
    <div class="loading-spinner">
      <div class="spinner"></div>
      <p>${message}</p>
    </div>
  `;
}

export function createEmptyState({ icon, title, message, buttonText, buttonAction }) {
  const iconHtml = SVGIcons[icon] || icon || SVGIcons.package;
  const buttonHtml = buttonText && buttonAction
    ? `<button class="btn btn-primary" data-action="${buttonAction}" style="margin-top: var(--spacing-md);">${buttonText}</button>`
    : '';

  return `
    <div class="empty-state">
      <div class="empty-state-icon">${iconHtml}</div>
      <h3>${title}</h3>
      <p>${message}</p>
      ${buttonHtml}
    </div>
  `;
}

export function createPageHeader({ title, refreshAction, extraButtons = '' }) {
  const refreshButton = refreshAction
    ? `<button class="btn btn-secondary btn-sm btn-icon-only" data-action="${refreshAction}" title="Обновить">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M23 4v6h-6M1 20v-6h6"/>
          <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
        </svg>
      </button>`
    : '';

  return `
    <div class="page-header">
      <h2 class="page-title">${title}</h2>
      <div class="page-header-actions">
        ${extraButtons}
        ${refreshButton}
      </div>
    </div>
  `;
}

export function createErrorState({ title, message, retryAction }) {
  return `
    <div class="empty-state">
      <div class="empty-state-icon empty-state-icon--sm empty-state-icon--warning">${SVGIcons.alert}</div>
      <h3>${title}</h3>
      <p style="color: var(--text-secondary); margin-top: var(--spacing-sm);">${message}</p>
      <button class="btn btn-primary" data-action="${retryAction}" style="margin-top: var(--spacing-md);">Повторить</button>
    </div>
  `;
}
