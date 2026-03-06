/**
 * utils/templates.js
 * Reusable HTML template helpers for admin miniapp
 */

import { SVGIcons } from '../utils.js';

/**
 * Create a loading spinner element
 * @param {string} message - Loading message to display
 * @returns {string} HTML string
 */
export function createLoadingSpinner(message = 'Загрузка...') {
  return `
    <div class="loading-spinner">
      <div class="spinner"></div>
      <p>${message}</p>
    </div>
  `;
}

/**
 * Create an empty state element
 * @param {Object} options - Configuration options
 * @param {string} options.icon - SVG icon HTML or SVGIcons key
 * @param {string} options.title - Title text
 * @param {string} options.message - Description message
 * @param {string} [options.buttonText] - Optional button text
 * @param {string} [options.buttonAction] - Optional data-action for button
 * @returns {string} HTML string
 */
export function createEmptyState({ icon, title, message, buttonText, buttonAction }) {
  const iconHtml = SVGIcons[icon] || icon || SVGIcons.package;
  const buttonHtml = buttonText && buttonAction
    ? `<button class="btn btn-primary" data-action="${buttonAction}" style="margin-top: var(--spacing-md);">${buttonText}</button>`
    : '';

  return `
    <div class="empty-state">
      <div class="empty-state-icon">
        ${iconHtml}
      </div>
      <h3>${title}</h3>
      <p>${message}</p>
      ${buttonHtml}
    </div>
  `;
}

/**
 * Create a page header with title and optional refresh button
 * @param {Object} options - Configuration options
 * @param {string} options.title - Page title
 * @param {string} [options.refreshAction] - Optional data-action for refresh button
 * @param {string} [options.extraButtons] - Optional additional button HTML
 * @returns {string} HTML string
 */
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

/**
 * Create an error state with retry button
 * @param {Object} options - Configuration options
 * @param {string} options.title - Error title
 * @param {string} options.message - Error message
 * @param {string} options.retryAction - data-action for retry button
 * @returns {string} HTML string
 */
export function createErrorState({ title, message, retryAction }) {
  return `
    <div class="empty-state">
      <div class="empty-state-icon empty-state-icon--sm empty-state-icon--warning">
        ${SVGIcons.alert}
      </div>
      <h3>${title}</h3>
      <p style="color: var(--text-secondary); margin-top: var(--spacing-sm);">${message}</p>
      <button class="btn btn-primary" data-action="${retryAction}" style="margin-top: var(--spacing-md);">Повторить</button>
    </div>
  `;
}
