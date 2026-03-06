/**
 * utils.js
 * Extracted from admin-miniapp/script.js
 */

import { state } from './state.js';
import { showAccessDenied } from './auth.js';

// Payment provider label — T-Bank is the only active provider
export const PAYMENT_PROVIDER_LABEL = 'T-Bank';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Escape HTML to prevent XSS attacks
 * Converts special characters to HTML entities
 */
function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

/**
 * SVG Icon helpers
 */
const SVGIcons = {
  // Basic icons
  package: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/></svg>',
  feed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
  shopping: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 11-8 0"/></svg>',
  broadcast: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 20h20L12 2z"/><path d="M12 9v4m0 4h.01"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18m-2 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2m-6 5v6m4-6v6"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22"/></svg>',
  image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
  money: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v12m-4-8h8"/></svg>',
  creditCard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/></svg>',
  // Project management icons
  emergency: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>',
  cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>',
  truck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
  zap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
  helpCircle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3m.08 4h.01"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>',
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>',
  // Statistics icons
  trendingUp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
  dollarSign: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87m-4-12a4 4 0 010 7.75"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  palette: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="8" r="1"/><circle cx="8" cy="14" r="1"/><circle cx="16" cy="14" r="1"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>',
  // Subtab icons
  monitor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M12 17v4m-4 0h8"/></svg>',
  wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 12V8H6a2 2 0 01-2-2c0-1.1.9-2 2-2h12v4"/><path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/><path d="M18 12a2 2 0 00-2 2c0 1.1.9 2 2 2h4v-4h-4z"/></svg>',
  layoutCard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="14" rx="2"/><path d="M3 10h18"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
  file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
};

/**
 * Check if user is authenticated
 */
function requireAuth() {
  if (!state.isAuthenticated) {
    showAccessDenied('Session expired. Please reload the app.');
    throw new Error('Not authenticated');
  }
  return true;
}

/**
 * Show toast notification
 */
function showToast(message, type = 'success') {
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

/**
 * Modal stack for nested modals
 */
const modalStack = [];

/**
 * Show modal with support for modal stacking
 * @param {string} title - Modal title
 * @param {string} bodyHTML - Modal body HTML content
 * @param {Array} footerButtons - Array of button configurations
 * @param {Object} options - Additional options
 * @param {boolean} options.skipStack - If true, don't push to modal stack (for refreshing same modal)
 */
function showModal(title, bodyHTML, footerButtons = [], options = {}) {
  const overlay = document.getElementById('modal-overlay');
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');
  const modalFooter = document.getElementById('modal-footer');
  const modalClose = document.getElementById('modal-close');

  // If modal is already active, save current state to stack (unless skipStack is true)
  if (overlay.classList.contains('active') && !options.skipStack) {
    // Save current input/select/textarea values (innerHTML doesn't preserve these)
    const inputValues = {};
    modalBody.querySelectorAll('input, select, textarea').forEach((el, index) => {
      const key = el.id || `_idx_${index}`;
      if (el.type === 'checkbox' || el.type === 'radio') {
        inputValues[key] = { checked: el.checked, type: el.type };
      } else {
        inputValues[key] = { value: el.value, type: el.type };
      }
    });

    // Save footer buttons with their handlers (innerHTML alone doesn't preserve onclick)
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
      inputValues: inputValues,
      // Save event handlers
      clickHandler: modalBody._modalClickHandler,
      changeHandler: modalBody._modalChangeHandler,
      inputHandler: modalBody._modalInputHandler,
      closeHandler: modalClose?._closeHandler
    });
  }

  modalTitle.textContent = title;
  modalBody.innerHTML = bodyHTML;

  // Clear old event handlers when showing new modal
  if (modalBody._modalClickHandler) {
    modalBody.removeEventListener('click', modalBody._modalClickHandler);
    delete modalBody._modalClickHandler;
  }
  if (modalBody._modalChangeHandler) {
    modalBody.removeEventListener('change', modalBody._modalChangeHandler);
    delete modalBody._modalChangeHandler;
  }
  if (modalBody._modalInputHandler) {
    modalBody.removeEventListener('input', modalBody._modalInputHandler);
    delete modalBody._modalInputHandler;
  }

  // Set modal-close to use hideModal (which will pop from stack if needed)
  if (modalClose && modalClose._closeHandler) {
    modalClose.removeEventListener('click', modalClose._closeHandler);
    delete modalClose._closeHandler;
  }
  if (modalClose) {
    const simpleCloseHandler = () => hideModal();
    modalClose._closeHandler = simpleCloseHandler;
    modalClose.addEventListener('click', simpleCloseHandler);
  }

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

/**
 * Show confirm dialog with styled modal
 * Returns a Promise that resolves to true if confirmed, false if cancelled
 */
function showConfirmModal(message, title = 'Подтверждение') {
  return new Promise((resolve) => {
    showModal(title, `
      <div style="padding: var(--spacing-md) 0;">
        <p style="white-space: pre-wrap; line-height: 1.6;">${message}</p>
      </div>
    `, [
      {
        text: 'Отменить',
        className: 'btn btn-secondary',
        onClick: () => {
          hideModal();
          resolve(false);
        }
      },
      {
        text: 'Продолжить',
        className: 'btn btn-danger',
        onClick: () => {
          hideModal();
          resolve(true);
        }
      }
    ]);
  });
}

/**
 * Show prompt dialog with styled modal and text input
 * Returns a Promise that resolves to the input value, or null if cancelled
 */
function showPromptModal(message, title = 'Введите данные', defaultValue = '') {
  return new Promise((resolve) => {
    const inputId = 'prompt-modal-input';
    showModal(title, `
      <div style="padding: var(--spacing-md) 0;">
        <p style="margin-bottom: var(--spacing-md); line-height: 1.6;">${message}</p>
        <input
          type="text"
          id="${inputId}"
          class="form-control"
          value="${escapeHtml(defaultValue)}"
          placeholder="Введите текст..."
          style="width: 100%;"
        />
      </div>
    `, [
      {
        text: 'Отменить',
        className: 'btn btn-secondary',
        onClick: () => {
          hideModal();
          resolve(null);
        }
      },
      {
        text: 'ОК',
        className: 'btn btn-primary',
        onClick: () => {
          const input = document.getElementById(inputId);
          const value = input?.value?.trim() || '';
          hideModal();
          resolve(value || null);
        }
      }
    ]);

    // Focus input and select text after modal is shown
    setTimeout(() => {
      const input = document.getElementById(inputId);
      if (input) {
        input.focus();
        input.select();
        // Submit on Enter key
        input.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const value = input.value.trim();
            hideModal();
            resolve(value || null);
          }
        });
      }
    }, 100);
  });
}

/**
 * Hide modal with support for modal stacking
 * Checks for unsaved changes before closing
 */
async function hideModal() {
  const overlay = document.getElementById('modal-overlay');
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');
  const modalFooter = document.getElementById('modal-footer');

  // If there's a previous modal in the stack, restore it instead of closing
  if (modalStack.length > 0) {
    const previousModal = modalStack.pop();
    const modalClose = document.getElementById('modal-close');

    // Clean up current event handlers
    if (modalBody._modalClickHandler) {
      modalBody.removeEventListener('click', modalBody._modalClickHandler);
      delete modalBody._modalClickHandler;
    }
    if (modalBody._modalChangeHandler) {
      modalBody.removeEventListener('change', modalBody._modalChangeHandler);
      delete modalBody._modalChangeHandler;
    }
    if (modalBody._modalInputHandler) {
      modalBody.removeEventListener('input', modalBody._modalInputHandler);
      delete modalBody._modalInputHandler;
    }
    if (modalClose && modalClose._closeHandler) {
      modalClose.removeEventListener('click', modalClose._closeHandler);
      delete modalClose._closeHandler;
    }

    // Restore previous modal
    modalTitle.textContent = previousModal.title;
    modalBody.innerHTML = previousModal.bodyHTML;

    // Recreate footer buttons with their onclick handlers
    modalFooter.innerHTML = '';
    if (previousModal.footerButtons) {
      previousModal.footerButtons.forEach(btn => {
        const button = document.createElement('button');
        button.className = btn.className || 'btn btn-secondary';
        button.textContent = btn.text;
        button.onclick = btn.onClick;
        modalFooter.appendChild(button);
      });
    }

    // Restore input values (innerHTML doesn't preserve user-entered values)
    if (previousModal.inputValues) {
      modalBody.querySelectorAll('input, select, textarea').forEach((el, index) => {
        const key = el.id || `_idx_${index}`;
        const saved = previousModal.inputValues[key];
        if (saved) {
          if (saved.type === 'checkbox' || saved.type === 'radio') {
            el.checked = saved.checked;
          } else {
            el.value = saved.value;
          }
        }
      });
    }

    // Restore event handlers
    if (previousModal.clickHandler) {
      modalBody._modalClickHandler = previousModal.clickHandler;
      modalBody.addEventListener('click', previousModal.clickHandler);
    }
    if (previousModal.changeHandler) {
      modalBody._modalChangeHandler = previousModal.changeHandler;
      modalBody.addEventListener('change', previousModal.changeHandler);
    }
    if (previousModal.inputHandler) {
      modalBody._modalInputHandler = previousModal.inputHandler;
      modalBody.addEventListener('input', previousModal.inputHandler);
    }
    if (previousModal.closeHandler && modalClose) {
      modalClose._closeHandler = previousModal.closeHandler;
      modalClose.addEventListener('click', previousModal.closeHandler);
    }

    // Modal stays active
    return;
  }

  // No previous modal - check for unsaved changes and close
  const { hasUnsavedChanges, confirmDiscard, clearModalState } = await import('./utils/modalManager.js');

  // Check if there are unsaved changes
  if (hasUnsavedChanges()) {
    const shouldDiscard = await confirmDiscard();
    if (!shouldDiscard) {
      // User chose to return to modal
      return;
    }
  }

  // Clear modal state
  clearModalState();

  // Remove active class
  overlay.classList.remove('active');

  // Clean up event listeners stored on modalBody
  if (modalBody._modalClickHandler) {
    modalBody.removeEventListener('click', modalBody._modalClickHandler);
    delete modalBody._modalClickHandler;
  }
  if (modalBody._modalChangeHandler) {
    modalBody.removeEventListener('change', modalBody._modalChangeHandler);
    delete modalBody._modalChangeHandler;
  }
  if (modalBody._modalInputHandler) {
    modalBody.removeEventListener('input', modalBody._modalInputHandler);
    delete modalBody._modalInputHandler;
  }

  // Clear content after animation (300ms matches CSS transition)
  setTimeout(() => {
    if (!overlay.classList.contains('active')) {
      modalBody.innerHTML = '';
      modalFooter.innerHTML = '';
    }
  }, 300);
}

/**
 * Hide modal without checking for unsaved changes
 * Used internally by discard confirmation modal
 */
function hideModalWithoutConfirm() {
  const overlay = document.getElementById('modal-overlay');
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');
  const modalFooter = document.getElementById('modal-footer');

  // If there's a previous modal in the stack, restore it instead of closing
  if (modalStack.length > 0) {
    const previousModal = modalStack.pop();
    const modalClose = document.getElementById('modal-close');

    // Clean up current event handlers
    if (modalBody._modalClickHandler) {
      modalBody.removeEventListener('click', modalBody._modalClickHandler);
      delete modalBody._modalClickHandler;
    }
    if (modalBody._modalChangeHandler) {
      modalBody.removeEventListener('change', modalBody._modalChangeHandler);
      delete modalBody._modalChangeHandler;
    }
    if (modalBody._modalInputHandler) {
      modalBody.removeEventListener('input', modalBody._modalInputHandler);
      delete modalBody._modalInputHandler;
    }
    if (modalClose && modalClose._closeHandler) {
      modalClose.removeEventListener('click', modalClose._closeHandler);
      delete modalClose._closeHandler;
    }

    // Restore previous modal
    modalTitle.textContent = previousModal.title;
    modalBody.innerHTML = previousModal.bodyHTML;

    // Recreate footer buttons with their onclick handlers
    modalFooter.innerHTML = '';
    if (previousModal.footerButtons) {
      previousModal.footerButtons.forEach(btn => {
        const button = document.createElement('button');
        button.className = btn.className || 'btn btn-secondary';
        button.textContent = btn.text;
        button.onclick = btn.onClick;
        modalFooter.appendChild(button);
      });
    }

    // Restore input values (innerHTML doesn't preserve user-entered values)
    if (previousModal.inputValues) {
      modalBody.querySelectorAll('input, select, textarea').forEach((el, index) => {
        const key = el.id || `_idx_${index}`;
        const saved = previousModal.inputValues[key];
        if (saved) {
          if (saved.type === 'checkbox' || saved.type === 'radio') {
            el.checked = saved.checked;
          } else {
            el.value = saved.value;
          }
        }
      });
    }

    // Restore event handlers
    if (previousModal.clickHandler) {
      modalBody._modalClickHandler = previousModal.clickHandler;
      modalBody.addEventListener('click', previousModal.clickHandler);
    }
    if (previousModal.changeHandler) {
      modalBody._modalChangeHandler = previousModal.changeHandler;
      modalBody.addEventListener('change', previousModal.changeHandler);
    }
    if (previousModal.inputHandler) {
      modalBody._modalInputHandler = previousModal.inputHandler;
      modalBody.addEventListener('input', previousModal.inputHandler);
    }
    if (previousModal.closeHandler && modalClose) {
      modalClose._closeHandler = previousModal.closeHandler;
      modalClose.addEventListener('click', previousModal.closeHandler);
    }

    // Modal stays active
    return;
  }

  // No previous modal - close completely without checking for changes
  import('./utils/modalManager.js').then(({ clearModalState }) => clearModalState());

  // Remove active class
  overlay.classList.remove('active');

  // Clean up event listeners stored on modalBody
  if (modalBody._modalClickHandler) {
    modalBody.removeEventListener('click', modalBody._modalClickHandler);
    delete modalBody._modalClickHandler;
  }
  if (modalBody._modalChangeHandler) {
    modalBody.removeEventListener('change', modalBody._modalChangeHandler);
    delete modalBody._modalChangeHandler;
  }
  if (modalBody._modalInputHandler) {
    modalBody.removeEventListener('input', modalBody._modalInputHandler);
    delete modalBody._modalInputHandler;
  }

  // Clear content after animation (300ms matches CSS transition)
  setTimeout(() => {
    if (!overlay.classList.contains('active')) {
      modalBody.innerHTML = '';
      modalFooter.innerHTML = '';
    }
  }, 300);
}

/**
 * Close modal immediately, discarding the stack.
 * Use after the user confirms they want to close (e.g. unsaved-changes dialog).
 * Prevents the stack from restoring the parent modal on top of the close action.
 */
function forceHideModal() {
  modalStack.length = 0;
  const overlay = document.getElementById('modal-overlay');
  const modalBody = document.getElementById('modal-body');
  const modalFooter = document.getElementById('modal-footer');
  const modalClose = document.getElementById('modal-close');

  if (modalClose && modalClose._closeHandler) {
    modalClose.removeEventListener('click', modalClose._closeHandler);
    delete modalClose._closeHandler;
  }
  if (modalBody) {
    if (modalBody._modalClickHandler) {
      modalBody.removeEventListener('click', modalBody._modalClickHandler);
      delete modalBody._modalClickHandler;
    }
    if (modalBody._modalChangeHandler) {
      modalBody.removeEventListener('change', modalBody._modalChangeHandler);
      delete modalBody._modalChangeHandler;
    }
    if (modalBody._modalInputHandler) {
      modalBody.removeEventListener('input', modalBody._modalInputHandler);
      delete modalBody._modalInputHandler;
    }
  }

  import('./utils/modalManager.js').then(({ clearModalState }) => clearModalState());

  if (overlay) {
    overlay.classList.remove('active');
    setTimeout(() => {
      if (!overlay.classList.contains('active')) {
        if (modalBody) modalBody.innerHTML = '';
        if (modalFooter) modalFooter.innerHTML = '';
      }
    }, 300);
  }
}

/**
 * Format number with Russian locale (removes decimals/kopecks)
 */
function formatNumber(num) {
  return String(Math.floor(num)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/**
 * Format date
 */
function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now - date;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return 'Сегодня, ' + date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (days === 1) return 'Вчера, ' + date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (days < 7) return `${days} дн. назад`;

  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

// Cached order constants fetched from server at startup
let _orderConstants = null;

/**
 * Load order constants from server into cache.
 * Called once after authentication. Falls back to inline values if fetch fails.
 */
export async function loadOrderConstants(apiBase) {
  try {
    const token = localStorage.getItem('admin_token');
    const res = await fetch(`${apiBase}/api/admin/order-constants`, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });
    if (res.ok) {
      _orderConstants = await res.json();
    }
  } catch {
    // Use inline fallback values
  }
}

// Inline fallback status display names (kept in sync with server/utils/order-constants.js)
const _fallbackStatusNames = {
  awaiting_calculation: 'Ожидает расчёт',
  awaiting_payment: 'Ожидает оплаты',
  paid: 'Оплачен',
  awaiting_certificate: 'Ожидает сертификат',
  shipped: 'Отправлен',
  delivered: 'Доставлен',
  on_hold: 'В ожидании',
  refund_requested: 'Запрос возврата',
  refunded: 'Возвращён',
  cancelled: 'Отменён',
  created: 'Оформлен',
  confirmed: 'Подтверждён',
  new: 'Новый',
  evaluation: 'Расчёт',
  reviewed: 'Проверен',
  accepted: 'Подтверждён',
  in_work: 'В работе',
  parcel_pending: 'Готовится к отправке',
  parcel_ready: 'Передан в доставку',
  suggested: 'Предложение'
};

/**
 * Get status text (admin view - all statuses)
 */
function getStatusText(status) {
  const names = _orderConstants?.STATUS_DISPLAY_NAMES || _fallbackStatusNames;
  return names[status] || status;
}

/**
 * Get status class for styling
 */
function getStatusClass(status) {
  const classes = {
    'awaiting_calculation': 'status-awaiting_calculation',
    'awaiting_payment': 'status-awaiting_payment',
    'paid': 'status-paid',
    'awaiting_certificate': 'status-awaiting_certificate',
    'shipped': 'status-shipped',
    'delivered': 'status-delivered',
    'on_hold': 'status-on_hold',
    'refund_requested': 'status-refund_requested',
    'refunded': 'status-refunded',
    'cancelled': 'status-cancelled',
    'created': 'status-created',
    'confirmed': 'status-confirmed',
    'new': 'status-new',
    'evaluation': 'status-evaluation',
    'reviewed': 'status-reviewed',
    'accepted': 'status-accepted',
    'in_work': 'status-in_work',
    'parcel_pending': 'status-parcel_pending',
    'parcel_ready': 'status-parcel_ready',
    'suggested': 'status-suggested'
  };
  return classes[status] || 'status-awaiting_calculation';
}

/**
 * Get all valid status options for admin dropdown.
 * Uses server-loaded constants when available.
 */
function getAllStatusOptions() {
  if (_orderConstants?.VALID_STATUSES && _orderConstants?.STATUS_DISPLAY_NAMES) {
    return _orderConstants.VALID_STATUSES.map(value => ({
      value,
      label: _orderConstants.STATUS_DISPLAY_NAMES[value] || value
    }));
  }
  // Fallback inline list
  return [
    { value: 'awaiting_calculation', label: 'Ожидает расчёт' },
    { value: 'awaiting_payment', label: 'Ожидает оплаты' },
    { value: 'paid', label: 'Оплачен' },
    { value: 'awaiting_certificate', label: 'Ожидает сертификат' },
    { value: 'shipped', label: 'Отправлен' },
    { value: 'delivered', label: 'Доставлен' },
    { value: 'on_hold', label: 'В ожидании' },
    { value: 'refund_requested', label: 'Запрос возврата' },
    { value: 'refunded', label: 'Возвращён' },
    { value: 'cancelled', label: 'Отменён' }
  ];
}

/**
 * Check if status should be shown to user
 * All statuses are now user-visible in the new order flow
 */
function isUserVisibleStatus(status) {
  // All new and legacy statuses are now visible to users
  const userStatuses = [
    // Current statuses
    'awaiting_calculation', 'awaiting_payment', 'paid', 'awaiting_certificate', 'shipped', 'delivered',
    'on_hold', 'refund_requested', 'refunded', 'cancelled',
    // Legacy statuses
    'created', 'confirmed', 'new', 'evaluation', 'reviewed', 'accepted', 'in_work', 'parcel_pending',
    'parcel_ready', 'suggested'
  ];
  return userStatuses.includes(status);
}

/**
 * Show error toast (convenience wrapper)
 */
function showError(message) {
  showToast(message, 'error');
}

/**
 * Format time from date string
 */
function formatTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Format price in rubles
 */
function formatPrice(price) {
  return formatNumber(price) + '₽';
}

/**
 * Copy text to clipboard
 */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('Скопировано', 'success');
  } catch (err) {
    console.error('Failed to copy:', err);
    showToast('Ошибка копирования', 'error');
  }
}

/**
 * Add VK CDN image size parameter
 * Standardizes all images to cs=480x0 (or custom size)
 * Copied from public/js/utils.js to ensure consistency
 */
function addImageSize(url, size = '480x0') {
  if (!url) return url;

  const urlStr = String(url);

  if (urlStr.includes('cs=')) {
    return urlStr.replace(/cs=\d+x\d+/, `cs=${size}`);
  }

  const separator = urlStr.includes('?') ? '&' : '?';
  return `${urlStr}${separator}cs=${size}`;
}


// Exports
export {
  SVGIcons,
  requireAuth,
  showToast,
  showError,
  showModal,
  showConfirmModal,
  showPromptModal,
  hideModal,
  hideModalWithoutConfirm,
  forceHideModal,
  formatDate,
  formatTime,
  formatPrice,
  formatNumber,
  getStatusText,
  getStatusClass,
  getAllStatusOptions,
  isUserVisibleStatus,
  copyToClipboard,
  addImageSize,
  escapeHtml
};
