/**
 * Unified Sheet Module
 * Single module for all modal and bottom-sheet interactions.
 * Replaces: mobile-modal.js, mobile-bottom-sheet.js, confirm-sheet.js, bottom-card-modal.js
 *
 * Modal types (dialog, centered on desktop):
 *   confirm · alert · action-sheet · content · prompt
 *
 * Sheet (mobile-only bottom list / menu):
 *   showMobileBottomSheet / closeMobileBottomSheet
 *
 * Toast:
 *   showBottomToast
 */

// ============================================================
// STATE
// ============================================================

let activeModal = null;

let activeSheet = null;
let sheetKeyHandler = null;
let savedSheetScrollPosition = 0;

// ============================================================
// MODAL — dialog types
// ============================================================

/**
 * Show a modal dialog.
 * @param {Object} options
 * @param {string} options.type          - 'confirm' | 'alert' | 'action-sheet' | 'content' | 'prompt'
 * @param {string} options.title
 * @param {string} [options.message]
 * @param {string} [options.icon]        - Emoji shown above title
 * @param {string} [options.content]     - HTML content (content type only)
 * @param {Array}  [options.actions]     - Action buttons (action-sheet type)
 * @param {string} [options.confirmText]
 * @param {string} [options.cancelText]
 * @param {string} [options.confirmStyle]  - 'primary' | 'danger' | 'default'
 * @param {string} [options.placeholder] - Input placeholder (prompt type)
 * @param {string} [options.defaultValue]
 * @param {boolean}[options.multiline]   - Textarea instead of input (prompt type)
 * @param {boolean}[options.required]    - Require non-empty input (prompt type)
 * @param {Function}[options.onClose]    - Called with the resolved value on close
 * @param {string} [options.footerNote]  - Small note below actions (action-sheet type)
 * @returns {Promise<boolean|string|null>}
 */
export function showMobileModal(options = {}) {
  return new Promise((resolve) => {
    const {
      type = 'confirm',
      title = '',
      message = '',
      icon = '',
      content = '',
      actions = [],
      confirmText = 'Подтвердить',
      cancelText = 'Отмена',
      confirmStyle = 'primary',
      placeholder = '',
      defaultValue = '',
      multiline = false,
      required = false,
      onClose = null,
      footerNote = ''
    } = options;

    if (activeModal) {
      closeModal(null);
    }
    document.querySelectorAll('.mobile-modal-overlay').forEach(el => el.remove());
    document.body.classList.remove('modal-open');

    const overlay = document.createElement('div');
    overlay.className = 'mobile-modal-overlay';
    overlay.id = 'mobile-modal-overlay';

    const backdrop = document.createElement('div');
    backdrop.className = 'mobile-modal-backdrop';
    backdrop.addEventListener('click', () => closeModal(null));

    let backdropTouchStartY = 0;
    backdrop.addEventListener('touchstart', (e) => {
      backdropTouchStartY = e.touches[0].clientY;
    }, { passive: true });
    // Non-passive so preventDefault() can suppress the iOS ghost click that
    // would otherwise reach elements behind the now-closed overlay.
    backdrop.addEventListener('touchend', (e) => {
      const dy = Math.abs(e.changedTouches[0].clientY - backdropTouchStartY);
      if (dy < 15) {
        e.preventDefault();
        closeModal(null);
      }
    });
    backdrop.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

    const sheet = document.createElement('div');
    sheet.className = 'mobile-modal';
    sheet.setAttribute('data-type', type);

    const handleHTML = '<div class="mobile-modal-handle"><span></span></div>';
    const desktopCloseHTML = `
      <button class="mobile-modal-desktop-close" aria-label="Закрыть">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    `;
    const iconHTML = icon ? `<div class="mobile-modal-icon">${icon}</div>` : '';
    const titleHTML = title ? `<div class="mobile-modal-title">${title}</div>` : '';
    const messageHTML = message ? `<div class="mobile-modal-message">${message}</div>` : '';

    let bodyHTML = '';
    let footerHTML = '';

    switch (type) {
      case 'confirm':
        bodyHTML = `
          <div class="mobile-modal-header">
            ${iconHTML}
            ${titleHTML}
          </div>
          ${messageHTML ? `<div class="mobile-modal-body">${messageHTML}</div>` : ''}
        `;
        footerHTML = `
          <div class="mobile-modal-footer">
            <button class="mobile-modal-btn cancel">${cancelText}</button>
            <button class="mobile-modal-btn confirm ${confirmStyle}">${confirmText}</button>
          </div>
        `;
        break;

      case 'alert':
        bodyHTML = `
          <div class="mobile-modal-header">
            ${iconHTML}
            ${titleHTML}
          </div>
          ${messageHTML ? `<div class="mobile-modal-body">${messageHTML}</div>` : ''}
        `;
        footerHTML = `
          <div class="mobile-modal-footer single">
            <button class="mobile-modal-btn confirm ${confirmStyle}">${confirmText}</button>
          </div>
        `;
        break;

      case 'action-sheet':
        bodyHTML = `
          ${titleHTML ? `<div class="mobile-modal-header">${iconHTML}${titleHTML}</div>` : ''}
          ${messageHTML ? `<div class="mobile-modal-body">${messageHTML}</div>` : ''}
          <div class="mobile-modal-actions">
            ${actions.map((action, index) => {
              const isLink = action.href;
              const tag = isLink ? 'a' : 'button';
              const hrefAttr = isLink ? `href="${action.href}" target="${action.target || '_blank'}"` : '';
              const iconSvg = action.icon ? `<svg width="20" height="20"><use href="#${action.icon}"></use></svg>` : '';
              const styleClass = action.style || '';
              return `
                <${tag} class="mobile-modal-action ${styleClass}" ${hrefAttr} data-action-index="${index}">
                  ${iconSvg}
                  <span>${action.text}</span>
                </${tag}>
              `;
            }).join('')}
          </div>
          ${footerNote ? `<p class="mobile-modal-footer-note">${footerNote}</p>` : ''}
        `;
        break;

      case 'content':
        bodyHTML = `
          ${titleHTML ? `
            <div class="mobile-modal-header with-close">
              ${titleHTML}
              <button class="mobile-modal-close" aria-label="Закрыть">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          ` : ''}
          <div class="mobile-modal-body scrollable">${content}</div>
        `;
        break;

      case 'prompt': {
        const inputHTML = multiline
          ? `<textarea class="mobile-modal-input" placeholder="${placeholder}" rows="3">${defaultValue}</textarea>`
          : `<input type="text" class="mobile-modal-input" placeholder="${placeholder}" value="${defaultValue}">`;
        bodyHTML = `
          <div class="mobile-modal-header">
            ${iconHTML}
            ${titleHTML}
          </div>
          <div class="mobile-modal-body">
            ${messageHTML}
            ${inputHTML}
          </div>
        `;
        footerHTML = `
          <div class="mobile-modal-footer">
            <button class="mobile-modal-btn cancel">${cancelText}</button>
            <button class="mobile-modal-btn confirm ${confirmStyle}">${confirmText}</button>
          </div>
        `;
        break;
      }
    }

    sheet.innerHTML = handleHTML + desktopCloseHTML + bodyHTML + footerHTML;

    overlay.appendChild(backdrop);
    overlay.appendChild(sheet);
    document.body.appendChild(overlay);

    activeModal = { overlay, sheet, resolve, onClose, type, required };
    setupModalSwipe(sheet, overlay);

    const cancelBtn = sheet.querySelector('.mobile-modal-btn.cancel');
    const confirmBtn = sheet.querySelector('.mobile-modal-btn.confirm');
    const closeBtn = sheet.querySelector('.mobile-modal-close');
    const desktopCloseBtn = sheet.querySelector('.mobile-modal-desktop-close');
    const input = sheet.querySelector('.mobile-modal-input');

    if (cancelBtn) cancelBtn.addEventListener('click', () => closeModal(false));

    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => {
        if (type === 'prompt') {
          const value = input.value.trim();
          if (required && !value) {
            input.style.borderColor = 'var(--status-error)';
            input.focus();
            return;
          }
          closeModal(value);
        } else {
          closeModal(true);
        }
      });
    }

    if (closeBtn) closeBtn.addEventListener('click', () => closeModal(null));
    if (desktopCloseBtn) desktopCloseBtn.addEventListener('click', () => closeModal(type === 'prompt' ? null : false));

    if (type === 'action-sheet') {
      sheet.querySelectorAll('.mobile-modal-action').forEach((btn, index) => {
        btn.addEventListener('click', (e) => {
          const action = actions[index];
          if (action.onClick) action.onClick(e);
          if (!action.keepOpen) closeModal({ action: index, text: action.text });
        });
      });
    }

    if (type === 'prompt' && input && !multiline) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); confirmBtn.click(); }
      });
    }

    const escHandler = (e) => {
      if (e.key === 'Escape') closeModal(type === 'prompt' ? null : false);
    };
    document.addEventListener('keydown', escHandler);
    activeModal.escHandler = escHandler;

    requestAnimationFrame(() => {
      overlay.classList.add('active');
      document.body.classList.add('modal-open');
      document.documentElement.style.setProperty('--locked-dvh', window.innerHeight + 'px');
      if (typeof window.addBackdropGrain === 'function') {
        window.addBackdropGrain(backdrop);
      }
      if (type === 'prompt' && input) setTimeout(() => input.focus(), 100);
    });
  });
}

function closeModal(result) {
  if (!activeModal) return;
  const { overlay, resolve, escHandler, onClose } = activeModal;
  const sheet = overlay.querySelector('.mobile-modal');
  const backdrop = overlay.querySelector('.mobile-modal-backdrop');

  if (sheet && sheet.style.transform !== 'translateY(100%)') {
    sheet.style.transform = '';
    if (backdrop) {
      backdrop.style.opacity = '';
      backdrop.style.backdropFilter = '';
      backdrop.style.webkitBackdropFilter = '';
    }
  }
  if (sheet) sheet.style.transition = '';
  if (sheet && sheet._cleanupMouseEvents) sheet._cleanupMouseEvents();

  if (backdrop && typeof window.removeBackdropGrain === 'function') {
    window.removeBackdropGrain(backdrop);
  }

  overlay.classList.remove('active');
  document.body.classList.remove('modal-open');
  if (!document.body.classList.contains('sheet-open')) {
    document.documentElement.style.removeProperty('--locked-dvh');
  }

  if (escHandler) document.removeEventListener('keydown', escHandler);

  setTimeout(() => {
    overlay.remove();
    if (onClose) onClose(result);
    if (resolve) resolve(result);
    activeModal = null;
  }, 300);
}

function setupModalSwipe(sheet, overlay) {
  let touchStartY = 0;
  let touchCurrentY = 0;
  let isDragging = false;

  const handleTouchStart = (e) => {
    const handle = e.target.closest('.mobile-modal-handle');
    const body = sheet.querySelector('.mobile-modal-body');
    const bodyScrollTop = body ? body.scrollTop : 0;
    if (handle || bodyScrollTop <= 5) {
      touchStartY = e.touches[0].clientY;
      touchCurrentY = touchStartY;
      isDragging = false;
    }
  };

  const handleTouchMove = (e) => {
    if (touchStartY === 0) return;
    const body = sheet.querySelector('.mobile-modal-body');
    const bodyScrollTop = body ? body.scrollTop : 0;
    touchCurrentY = e.touches[0].clientY;
    const diff = touchCurrentY - touchStartY;
    if (diff > 0 && bodyScrollTop <= 5) {
      isDragging = true;
      sheet.style.transform = `translateY(${diff}px)`;
      sheet.style.transition = 'none';
      const backdrop = overlay.querySelector('.mobile-modal-backdrop');
      if (backdrop) {
        const progress = Math.min(1, diff / 160);
        backdrop.style.opacity = 1 - progress * 0.7;
        const blurVal = 4 * (1 - progress);
        backdrop.style.backdropFilter = `blur(${blurVal}px)`;
        backdrop.style.webkitBackdropFilter = `blur(${blurVal}px)`;
      }
      e.preventDefault();
    }
  };

  const handleTouchEnd = () => {
    const diff = touchCurrentY - touchStartY;
    const backdrop = overlay.querySelector('.mobile-modal-backdrop');
    if (isDragging && diff > 100) {
      sheet.style.transition = 'transform 0.25s ease-in';
      sheet.style.transform = 'translateY(100%)';
      if (backdrop) {
        backdrop.style.transition = 'opacity 0.25s ease-in, backdrop-filter 0.25s ease-in, -webkit-backdrop-filter 0.25s ease-in';
        backdrop.style.opacity = '0';
        backdrop.style.backdropFilter = 'blur(0px)';
        backdrop.style.webkitBackdropFilter = 'blur(0px)';
      }
      setTimeout(() => closeModal(activeModal?.type === 'prompt' ? null : false), 200);
    } else {
      sheet.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
      sheet.style.transform = '';
      setTimeout(() => { sheet.style.transition = ''; }, 400);
      if (backdrop) {
        backdrop.style.transition = 'opacity 0.3s ease, backdrop-filter 0.3s ease, -webkit-backdrop-filter 0.3s ease';
        backdrop.style.opacity = '';
        backdrop.style.backdropFilter = '';
        backdrop.style.webkitBackdropFilter = '';
        setTimeout(() => { backdrop.style.transition = ''; }, 300);
      }
    }
    touchStartY = 0;
    touchCurrentY = 0;
    isDragging = false;
  };

  sheet.addEventListener('touchstart', handleTouchStart, { passive: true });
  sheet.addEventListener('touchmove', handleTouchMove, { passive: false });
  sheet.addEventListener('touchend', handleTouchEnd, { passive: true });
  sheet.addEventListener('touchcancel', handleTouchEnd, { passive: true });

  let isMouseDown = false;

  const handleMouseDown = (e) => {
    const handle = e.target.closest('.mobile-modal-handle');
    const body = sheet.querySelector('.mobile-modal-body');
    const bodyScrollTop = body ? body.scrollTop : 0;
    if (handle || bodyScrollTop <= 5) {
      isMouseDown = true;
      touchStartY = e.clientY;
      touchCurrentY = e.clientY;
      isDragging = false;
      e.preventDefault();
    }
  };

  const handleMouseMove = (e) => {
    if (!isMouseDown) return;
    const body = sheet.querySelector('.mobile-modal-body');
    const bodyScrollTop = body ? body.scrollTop : 0;
    touchCurrentY = e.clientY;
    const diff = touchCurrentY - touchStartY;
    if (diff > 0 && bodyScrollTop <= 5) {
      isDragging = true;
      sheet.style.transform = `translateY(${diff}px)`;
      sheet.style.transition = 'none';
      const backdrop = overlay.querySelector('.mobile-modal-backdrop');
      if (backdrop) {
        const progress = Math.min(1, diff / 160);
        backdrop.style.opacity = 1 - progress * 0.7;
        const blurVal = 4 * (1 - progress);
        backdrop.style.backdropFilter = `blur(${blurVal}px)`;
        backdrop.style.webkitBackdropFilter = `blur(${blurVal}px)`;
      }
    }
  };

  const handleMouseUp = () => {
    if (!isMouseDown) return;
    isMouseDown = false;
    handleTouchEnd();
  };

  // Mouse drag-to-dismiss only on touch devices; desktop uses backdrop click
  if (window.matchMedia('(hover: none)').matches) {
    sheet.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }

  sheet._cleanupMouseEvents = () => {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };
}

// ============================================================
// CONVENIENCE MODAL WRAPPERS
// ============================================================

export async function confirm(options, title) {
  if (typeof options === 'string') {
    options = { message: options, title: title || 'Подтверждение' };
  }
  return showMobileModal({
    type: 'confirm',
    title: options.title || 'Подтверждение',
    message: options.message || '',
    icon: options.icon || '',
    confirmText: options.confirmText || 'Да',
    cancelText: options.cancelText || 'Отмена',
    confirmStyle: options.confirmStyle || 'primary'
  });
}

export async function confirmDanger(message, title = 'Удаление') {
  return showMobileModal({
    type: 'confirm',
    title,
    message,
    confirmText: 'Удалить',
    cancelText: 'Отмена',
    confirmStyle: 'danger'
  });
}

export async function alert(message, options = {}) {
  return showMobileModal({
    type: 'alert',
    title: options.title || 'Уведомление',
    message,
    confirmText: options.buttonText || 'OK',
    confirmStyle: options.style || 'primary'
  });
}

export async function actionSheet(options) {
  return showMobileModal({
    type: 'action-sheet',
    title: options.title || '',
    message: options.message || '',
    icon: options.icon || '',
    actions: options.actions || [],
    cancelText: options.cancelText || 'Закрыть',
    footerNote: options.footerNote || ''
  });
}

export async function contentModal(options) {
  return showMobileModal({
    type: 'content',
    title: options.title || '',
    content: options.content || ''
  });
}

export async function prompt(message, options = {}) {
  return showMobileModal({
    type: 'prompt',
    title: options.title || 'Ввод',
    message,
    placeholder: options.placeholder || '',
    defaultValue: options.defaultValue || '',
    multiline: options.multiline || false,
    required: options.required || false,
    confirmText: options.confirmText || 'OK',
    cancelText: options.cancelText || 'Отмена',
    confirmStyle: options.confirmStyle || 'primary'
  });
}

export function isModalOpen() {
  return activeModal !== null;
}

export function forceClose() {
  if (activeModal) closeModal(null);
}

// ============================================================
// CONFIRM-SHEET COMPAT (replaces confirm-sheet.js)
// showConfirmSheet is an alias for showMobileModal confirm type.
// confirmSheet is kept for call-sites that used the old module.
// ============================================================

export function showConfirmSheet(options) {
  return showMobileModal({
    type: 'confirm',
    title: options.title || '',
    message: options.message || '',
    icon: options.icon || '',
    confirmText: options.confirmText || 'Подтвердить',
    cancelText: options.cancelText || 'Отмена',
    confirmStyle: options.confirmStyle || 'danger'
  });
}

export async function confirmSheet(message, title = 'Подтверждение') {
  return showMobileModal({
    type: 'confirm',
    title,
    message,
    confirmText: 'Да',
    cancelText: 'Отмена',
    confirmStyle: 'primary'
  });
}

// ============================================================
// SHEET — bottom list/menu (replaces mobile-bottom-sheet.js)
// Uses .mobile-bottom-sheet-* class names; mobile-sort-sheet.js
// creates its own overlay with these same class names so they
// must remain in the CSS regardless.
// ============================================================

/**
 * Show a mobile bottom sheet with arbitrary HTML content.
 * @param {Object} options
 * @param {string} options.id              - Unique ID for the sheet element
 * @param {string} options.content         - HTML string for the sheet body
 * @param {string} [options.title]         - Optional header title
 * @param {boolean}[options.showTitle]     - Show the header (default false)
 * @param {Function}[options.onClose]      - Called when sheet closes
 * @param {Function}[options.onItemClick]  - Called with (event, item) for [data-sheet-item] clicks
 * @param {string} [options.className]     - Extra class on the sheet element
 * @returns {{ close: Function }}
 */
export function showMobileBottomSheet(options) {
  const {
    id = 'sheet-' + Date.now(),
    content = '',
    title = '',
    showTitle = false,
    onClose,
    onItemClick,
    className = ''
  } = options;

  if (activeSheet) closeSheet();

  const overlay = document.createElement('div');
  overlay.className = 'mobile-bottom-sheet-overlay';
  overlay.id = `${id}-overlay`;

  const backdrop = document.createElement('div');
  backdrop.className = 'mobile-bottom-sheet-backdrop';
  backdrop.addEventListener('click', closeSheet);

  const sheet = document.createElement('div');
  sheet.className = `mobile-bottom-sheet ${className}`;
  sheet.id = id;

  const handleBar = document.createElement('div');
  handleBar.className = 'mobile-bottom-sheet-handle';
  handleBar.innerHTML = '<span></span>';

  let headerHTML = '';
  if (showTitle && title) {
    headerHTML = `
      <div class="mobile-bottom-sheet-header">
        <span class="mobile-bottom-sheet-title">${title}</span>
        <button class="mobile-bottom-sheet-close" aria-label="Закрыть">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `;
  }

  const body = document.createElement('div');
  body.className = 'mobile-bottom-sheet-body';
  body.innerHTML = content;

  sheet.appendChild(handleBar);
  if (headerHTML) sheet.insertAdjacentHTML('beforeend', headerHTML);
  sheet.appendChild(body);

  overlay.appendChild(backdrop);
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  activeSheet = { id, overlay, sheet, onClose, onItemClick };
  setupSheetSwipe(sheet, overlay, onItemClick);

  requestAnimationFrame(() => {
    overlay.classList.add('active');
    savedSheetScrollPosition = window.scrollY;
    document.body.style.top = `-${savedSheetScrollPosition}px`;
    document.body.classList.add('sheet-open');
    document.documentElement.style.setProperty('--locked-dvh', window.innerHeight + 'px');
    if (typeof window.addBackdropGrain === 'function') {
      window.addBackdropGrain(backdrop);
    }
  });

  const closeBtn = sheet.querySelector('.mobile-bottom-sheet-close');
  if (closeBtn) closeBtn.addEventListener('click', closeSheet);

  sheetKeyHandler = (e) => {
    if (e.key === 'Escape') closeSheet();
  };
  document.addEventListener('keydown', sheetKeyHandler);

  return { close: closeSheet };
}

function closeSheet() {
  if (!activeSheet) return;
  const { overlay, sheet, onClose } = activeSheet;

  const backdrop = overlay.querySelector('.mobile-bottom-sheet-backdrop');
  if (backdrop && typeof window.removeBackdropGrain === 'function') {
    window.removeBackdropGrain(backdrop);
  }
  if (sheet && sheet._cleanupMouseEvents) sheet._cleanupMouseEvents();

  overlay.classList.remove('active');
  document.body.classList.remove('sheet-open');
  document.body.style.top = '';
  window.scrollTo(0, savedSheetScrollPosition);
  if (!document.body.classList.contains('modal-open')) {
    document.documentElement.style.removeProperty('--locked-dvh');
  }

  setTimeout(() => {
    overlay.remove();
    if (onClose) onClose();
  }, 300);

  if (sheetKeyHandler) {
    document.removeEventListener('keydown', sheetKeyHandler);
    sheetKeyHandler = null;
  }
  activeSheet = null;
}

export { closeSheet as closeMobileBottomSheet };

export function isSheetOpen() {
  return activeSheet !== null;
}

export function getActiveSheetId() {
  return activeSheet ? activeSheet.id : null;
}

function setupSheetSwipe(sheet, overlay, onItemClick) {
  let startY = 0;
  let currentY = 0;
  let isDragging = false;
  let isMouseDown = false;

  const canStartDrag = (target) => {
    const body = sheet.querySelector('.mobile-bottom-sheet-body');
    const bodyScrollTop = body ? body.scrollTop : 0;
    return target.closest('.mobile-bottom-sheet-handle') || bodyScrollTop <= 5;
  };

  const handleDragStart = (clientY) => {
    startY = clientY;
    currentY = startY;
    isDragging = false;
  };

  const handleDragMove = (clientY, e) => {
    if (startY === 0) return;
    const body = sheet.querySelector('.mobile-bottom-sheet-body');
    const bodyScrollTop = body ? body.scrollTop : 0;
    currentY = clientY;
    const diff = currentY - startY;
    if (diff > 0 && bodyScrollTop <= 5) {
      isDragging = true;
      const translateY = Math.min(diff * 0.5, 150);
      sheet.style.animation = 'none';
      sheet.style.transform = `translateY(${translateY}px)`;
      sheet.style.transition = 'none';
      const opacity = Math.max(0.3, 1 - (diff / 400));
      overlay.querySelector('.mobile-bottom-sheet-backdrop').style.opacity = opacity;
      if (e) e.preventDefault();
    }
  };

  const handleDragEnd = () => {
    const diff = currentY - startY;
    sheet.style.animation = '';
    sheet.style.transform = '';
    sheet.style.transition = '';
    const backdrop = overlay.querySelector('.mobile-bottom-sheet-backdrop');
    if (backdrop) backdrop.style.opacity = '';
    if (isDragging && diff > 100) closeSheet();
    startY = 0;
    currentY = 0;
    isDragging = false;
    isMouseDown = false;
  };

  const handleTouchStart = (e) => {
    if (canStartDrag(e.target)) handleDragStart(e.touches[0].clientY);
  };
  const handleTouchMove = (e) => { handleDragMove(e.touches[0].clientY, e); };

  sheet.addEventListener('touchstart', handleTouchStart, { passive: true });
  sheet.addEventListener('touchmove', handleTouchMove, { passive: false });
  sheet.addEventListener('touchend', handleDragEnd, { passive: true });
  sheet.addEventListener('touchcancel', handleDragEnd, { passive: true });

  const handleMouseDown = (e) => {
    if (canStartDrag(e.target)) {
      isMouseDown = true;
      handleDragStart(e.clientY);
      e.preventDefault();
    }
  };
  const handleMouseMove = (e) => { if (!isMouseDown) return; handleDragMove(e.clientY, e); };
  const handleMouseUp = () => { if (isMouseDown) handleDragEnd(); };

  // Mouse drag-to-dismiss only on touch devices; desktop uses backdrop click
  if (window.matchMedia('(hover: none)').matches) {
    sheet.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }

  sheet._cleanupMouseEvents = () => {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  if (onItemClick) {
    sheet.addEventListener('click', (e) => {
      const item = e.target.closest('[data-sheet-item]');
      if (item) onItemClick(e, item);
    });
  }
}

// ============================================================
// TOAST (replaces showBottomToast from bottom-card-modal.js)
// ============================================================

/**
 * Show a brief bottom toast notification.
 * @param {string} message
 * @param {'info'|'success'|'error'|'warning'} [type='info']
 * @param {number} [duration=3000] - Auto-dismiss delay in ms
 */
export function showBottomToast(message, type = 'info', duration = 3000) {
  const existing = document.querySelector('.bottom-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `bottom-toast ${type}`;
  toast.innerHTML = `<span class="bottom-toast-message">${message}</span>`;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('active'));

  setTimeout(() => {
    toast.classList.remove('active');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ============================================================
// GLOBALS
// ============================================================

window.mobileModal = {
  show: showMobileModal,
  confirm,
  confirmDanger,
  alert,
  actionSheet,
  contentModal,
  prompt,
  isOpen: isModalOpen,
  close: forceClose
};

window.showMobileModal = showMobileModal;

// confirm-sheet compat
window.showConfirmSheet = showConfirmSheet;
window.confirmSheet = confirmSheet;
window.confirmDanger = confirmDanger;

// bottom-sheet compat
window.showMobileBottomSheet = showMobileBottomSheet;
window.closeMobileBottomSheet = closeSheet;

// toast compat
window.showBottomToast = showBottomToast;
