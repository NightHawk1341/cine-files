/**
 * utils.js
 * CineFiles Admin — SVGIcons, escapeHtml, toast, modal
 */

import { state } from './state.js';
import { showAccessDenied } from './auth.js';

// ============================================================================
// SVG ICONS
// ============================================================================

export const SVGIcons = {
  package: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 20h20L12 2z"/><path d="M12 9v4m0 4h.01"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18m-2 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2m-6 5v6m4-6v6"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22"/></svg>',
  image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87m-4-12a4 4 0 010 7.75"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>',
  file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>',
  tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
  messageCircle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

export function requireAuth() {
  if (!state.isAuthenticated) {
    showAccessDenied('Session expired. Please reload the app.');
    throw new Error('Not authenticated');
  }
  return true;
}

// ============================================================================
// TOAST NOTIFICATIONS
// ============================================================================

export function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = {
    success: SVGIcons.check,
    error: SVGIcons.x,
    warning: SVGIcons.alert,
    info: SVGIcons.info
  };

  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-message">${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOut 0.2s ease-in';
    setTimeout(() => toast.remove(), 200);
  }, 3000);
}

export function showError(message) {
  showToast(message, 'error');
}

export function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('Скопировано в буфер обмена');
  }).catch(() => {
    showToast('Не удалось скопировать', 'error');
  });
}

// ============================================================================
// MODAL
// ============================================================================

const modalStack = [];

export function showModal(title, bodyHTML, footerButtons = [], options = {}) {
  const overlay = document.getElementById('modal-overlay');
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');
  const modalFooter = document.getElementById('modal-footer');

  // If modal is already active, save current state to stack
  if (overlay.classList.contains('active') && !options.skipStack) {
    const inputValues = {};
    modalBody.querySelectorAll('input, select, textarea').forEach((el, index) => {
      const key = el.id || `_idx_${index}`;
      if (el.type === 'checkbox' || el.type === 'radio') {
        inputValues[key] = { checked: el.checked, type: el.type };
      } else {
        inputValues[key] = { value: el.value, type: el.type };
      }
    });

    const savedFooterButtons = [];
    modalFooter.querySelectorAll('button').forEach(btn => {
      savedFooterButtons.push({
        text: btn.textContent,
        className: btn.className,
        onClick: btn.onclick
      });
    });

    modalStack.push({
      title: modalTitle.textContent,
      bodyHTML: modalBody.innerHTML,
      footerButtons: savedFooterButtons,
      inputValues: inputValues
    });
  }

  modalTitle.textContent = title;
  modalBody.innerHTML = bodyHTML;

  modalFooter.innerHTML = '';
  footerButtons.forEach(btn => {
    const button = document.createElement('button');
    button.className = btn.className || 'btn btn-secondary';
    button.textContent = btn.text;
    button.onclick = btn.onClick;
    modalFooter.appendChild(button);
  });

  overlay.classList.add('active');
  window._modalShownAt = Date.now();
}

export function hideModal() {
  const overlay = document.getElementById('modal-overlay');
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');
  const modalFooter = document.getElementById('modal-footer');

  // If there's a previous modal in the stack, restore it
  if (modalStack.length > 0) {
    const prev = modalStack.pop();
    modalTitle.textContent = prev.title;
    modalBody.innerHTML = prev.bodyHTML;

    modalFooter.innerHTML = '';
    if (prev.footerButtons) {
      prev.footerButtons.forEach(btn => {
        const button = document.createElement('button');
        button.className = btn.className || 'btn btn-secondary';
        button.textContent = btn.text;
        button.onclick = btn.onClick;
        modalFooter.appendChild(button);
      });
    }

    // Restore input values
    if (prev.inputValues) {
      modalBody.querySelectorAll('input, select, textarea').forEach((el, index) => {
        const key = el.id || `_idx_${index}`;
        const saved = prev.inputValues[key];
        if (saved) {
          if (saved.type === 'checkbox' || saved.type === 'radio') {
            el.checked = saved.checked;
          } else {
            el.value = saved.value;
          }
        }
      });
    }
    return;
  }

  overlay.classList.remove('active');
}

export function showConfirmModal(message, title = 'Подтверждение') {
  return new Promise((resolve) => {
    showModal(title, `
      <div style="padding: var(--spacing-md) 0;">
        <p style="white-space: pre-wrap; line-height: 1.6;">${message}</p>
      </div>
    `, [
      {
        text: 'Отменить',
        className: 'btn btn-secondary',
        onClick: () => { hideModal(); resolve(false); }
      },
      {
        text: 'Продолжить',
        className: 'btn btn-danger',
        onClick: () => { hideModal(); resolve(true); }
      }
    ]);
  });
}

// ============================================================================
// FORMAT HELPERS
// ============================================================================

export function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
