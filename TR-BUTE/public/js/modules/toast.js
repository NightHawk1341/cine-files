// ============================================================
// TOAST NOTIFICATION MODULE
// Desktop: top-right below header, slide from right, click to dismiss, stack
//          hover container to expand full list; mouseleave + 600ms delay to collapse
// Mobile:  top-center below header, slide from above, swipe-up to dismiss, stack
//          tap to expand full list; touch outside container to collapse
// ============================================================

const LEAVE_DURATION = 220; // ms - matches CSS animation
const EXPAND_GAP = 8;       // px gap between toasts when expanded
const COLLAPSE_DELAY = 600; // ms after mouseleave before collapsing

// Module-level expand/collapse state (single container)
let _isExpanded = false;
let _isHovering = false;
let _collapseTimer = null;
let _docTouchHandler = null;

function getOrCreateContainer() {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);

    // Desktop: expand on hover, collapse after leaving
    container.addEventListener('mouseenter', () => {
      if (window.innerWidth <= 1024) return;
      _isHovering = true;
      clearTimeout(_collapseTimer);
      _collapseTimer = null;
      // Pause timers for all toasts (even single ones), or expand if multiple
      const visible = container.querySelectorAll('.toast-notification:not(.toast-leaving)');
      if (visible.length >= 2) {
        expandToasts(container);
      } else if (visible.length === 1) {
        // Single toast: pause its timer without expanding
        pauseToastTimers(container);
      }
    });
    container.addEventListener('mouseleave', () => {
      if (window.innerWidth <= 1024) return;
      _isHovering = false;
      clearTimeout(_collapseTimer);
      _collapseTimer = null;

      const visible = container.querySelectorAll('.toast-notification:not(.toast-leaving)');
      if (_isExpanded) {
        // Expanded state: collapse after delay
        _collapseTimer = setTimeout(() => collapseToasts(container), COLLAPSE_DELAY);
      } else if (visible.length === 1) {
        // Single toast: dismiss after delay rather than resuming the original countdown,
        // so the toast disappears promptly after the cursor leaves.
        _collapseTimer = setTimeout(() => {
          container.querySelectorAll('.toast-notification:not(.toast-leaving)').forEach(t => dismissToast(t));
        }, COLLAPSE_DELAY);
      }
    });
  }
  return container;
}

// Set data-stack-index (0 = newest) and z-index, then apply collapsed or expanded layout.
function updateStackIndices(container) {
  const visible = [...container.querySelectorAll('.toast-notification:not(.toast-leaving)')];
  visible.reverse(); // newest last in DOM → index 0
  visible.forEach((t, i) => {
    t.dataset.stackIndex = i;
    t.style.zIndex = String(3 - i);
  });

  // Container needs pointer-events only while toasts are present
  container.style.pointerEvents = visible.length > 0 ? 'auto' : 'none';

  if (_isExpanded) {
    if (visible.length < 2) {
      // Nothing meaningful to keep expanded — auto-collapse
      _isExpanded = false;
      container.classList.remove('toast-expanded');
      removeDocumentCollapseListener();
      clearTimeout(_collapseTimer);
      _collapseTimer = null;
      resumeToastTimers(container);
      layoutCollapsed(container);
    } else {
      layoutExpanded(container);
    }
  } else {
    layoutCollapsed(container);
    // If cursor is already inside (e.g. a 2nd toast arrived while hovering), auto-expand
    if (_isHovering && window.innerWidth > 1024 && visible.length >= 2) {
      expandToasts(container);
    }
  }
}

// Clear inline transforms so CSS data-stack-index rules take over; size container to newest toast.
function layoutCollapsed(container) {
  const toasts = [...container.querySelectorAll('.toast-notification:not(.toast-leaving)')];
  toasts.forEach(t => { t.style.transform = ''; });
  const sorted = toasts.slice().sort((a, b) => Number(a.dataset.stackIndex) - Number(b.dataset.stackIndex));
  const newest = sorted[0];
  container.style.height = newest ? newest.offsetHeight + 'px' : '0px';
}

// Lay toasts out vertically (newest at top); skip entering toasts mid-animation.
function layoutExpanded(container) {
  const toasts = [...container.querySelectorAll(
    '.toast-notification:not(.toast-leaving):not(.toast-entering)'
  )];
  toasts.sort((a, b) => Number(a.dataset.stackIndex) - Number(b.dataset.stackIndex));
  let y = 0;
  toasts.forEach(t => {
    t.style.transform = `translateY(${y}px)`;
    t._expandedY = y;
    y += t.offsetHeight + EXPAND_GAP;
  });
  container.style.height = toasts.length > 0 ? (y - EXPAND_GAP) + 'px' : '0px';
}

function expandToasts(container) {
  const visible = [...container.querySelectorAll('.toast-notification:not(.toast-leaving)')];
  if (visible.length < 2 || _isExpanded) return;
  _isExpanded = true;
  container.classList.add('toast-expanded');
  pauseToastTimers(container);
  layoutExpanded(container);
  if (window.innerWidth <= 1024) addDocumentCollapseListener(container);
}

function collapseToasts(container) {
  if (!_isExpanded) return;
  _isExpanded = false;
  container.classList.remove('toast-expanded');
  removeDocumentCollapseListener();
  clearTimeout(_collapseTimer);
  _collapseTimer = null;
  layoutCollapsed(container);
  resumeToastTimers(container);
}

function pauseToastTimers(container) {
  container.querySelectorAll('.toast-notification:not(.toast-leaving)').forEach(t => {
    clearTimeout(t._autoDismiss);
    t._remainingTime = t._autoDismissAt ? Math.max(0, t._autoDismissAt - Date.now()) : 0;
  });
}

function resumeToastTimers(container) {
  container.querySelectorAll('.toast-notification:not(.toast-leaving)').forEach(t => {
    if (t._dismissed) return;
    const remaining = t._remainingTime != null ? t._remainingTime : (t._duration || 3000);
    t._remainingTime = null;
    if (remaining <= 0) {
      dismissToast(t);
    } else {
      t._autoDismissAt = Date.now() + remaining;
      t._autoDismiss = setTimeout(() => dismissToast(t), remaining);
    }
  });
}

function addDocumentCollapseListener(container) {
  removeDocumentCollapseListener();
  _docTouchHandler = (e) => {
    if (!container.contains(e.target)) collapseToasts(container);
  };
  document.addEventListener('touchstart', _docTouchHandler, { passive: true });
}

function removeDocumentCollapseListener() {
  if (_docTouchHandler) {
    document.removeEventListener('touchstart', _docTouchHandler);
    _docTouchHandler = null;
  }
}

function dismissToast(toast) {
  if (toast._dismissed) return;
  toast._dismissed = true;
  clearTimeout(toast._autoDismiss);
  toast.classList.remove('toast-entering');
  toast.classList.add('toast-leaving');
  setTimeout(() => {
    if (toast.parentNode) {
      const container = toast.parentNode;
      toast.remove();
      updateStackIndices(container);
    }
  }, LEAVE_DURATION);
}

/**
 * Show a toast notification
 * @param {string} message
 * @param {string} type - 'success' | 'removed' | 'error' | 'info'
 * @param {number} duration - ms before auto-dismiss (default 3000)
 * @param {boolean} allowHTML
 * @param {Object} customStyles - CSS variable overrides
 * @param {Function} onUndo - optional undo callback
 */
window.showToast = function(message, type = 'success', duration = 3000, allowHTML = false, customStyles = {}, onUndo = null) {
  const container = getOrCreateContainer();
  const isMobile = window.innerWidth <= 1024;

  const toast = document.createElement('div');
  toast.className = `toast-notification ${type}`;
  toast.style.opacity = '0'; // hidden before animation starts
  toast._dismissed = false;
  toast._duration = duration;

  if (customStyles && typeof customStyles === 'object') {
    Object.entries(customStyles).forEach(([key, value]) => {
      toast.style.setProperty(key, value);
    });
  }

  const messageSpan = document.createElement('span');
  if (allowHTML) {
    messageSpan.innerHTML = message;
  } else {
    messageSpan.textContent = message;
  }

  toast.appendChild(messageSpan);

  if (onUndo && typeof onUndo === 'function') {
    const undoLink = document.createElement('a');
    undoLink.href = '#';
    undoLink.textContent = 'Отменить';
    undoLink.style.marginLeft = '8px';
    undoLink.addEventListener('click', (e) => {
      e.preventDefault();
      onUndo();
      dismissToast(toast);
    });
    toast.appendChild(undoLink);
  }

  // Cap at 3 visible toasts — dismiss the oldest if over limit
  const visible = container.querySelectorAll('.toast-notification:not(.toast-leaving)');
  if (visible.length >= 3) {
    dismissToast(visible[0]);
  }

  container.appendChild(toast);
  updateStackIndices(container);

  // Trigger enter animation on next frame; re-layout expanded stack once animation finishes.
  requestAnimationFrame(() => {
    toast.style.opacity = '';
    toast.classList.add('toast-entering');
    toast.addEventListener('animationend', () => {
      toast.classList.remove('toast-entering');
      if (_isExpanded) layoutExpanded(container);
    }, { once: true });
  });

  toast._autoDismissAt = Date.now() + duration;
  toast._autoDismiss = setTimeout(() => dismissToast(toast), duration);

  // Desktop: click to dismiss
  if (!isMobile) {
    toast.addEventListener('click', () => dismissToast(toast));
  }

  // Mobile: swipe up to dismiss; tap on collapsed stack to expand
  if (isMobile) {
    let startY = 0;
    let currentY = 0;
    let dragging = false;

    toast.addEventListener('touchstart', (e) => {
      dragging = true;
      startY = e.touches[0].clientY;
      currentY = startY;
      toast.style.transition = 'none';
      clearTimeout(toast._autoDismiss);
    }, { passive: true });

    toast.addEventListener('touchmove', (e) => {
      if (!dragging) return;
      currentY = e.touches[0].clientY;
      const diff = currentY - startY; // negative = up
      if (diff < 0) {
        e.preventDefault(); // Prevent page scroll when swiping toast upward
        // Account for the toast's expanded Y offset so drag starts from its actual position
        const baseY = _isExpanded ? (toast._expandedY || 0) : 0;
        toast.style.transform = `translateY(${baseY + diff}px)`;
        toast.style.opacity = String(Math.max(0, 1 + diff / 80));
      }
    }, { passive: false });

    toast.addEventListener('touchend', () => {
      if (!dragging) return;
      dragging = false;
      const diff = currentY - startY;
      if (diff < -40) {
        // Swipe up — dismiss
        toast.style.transition = 'transform 0.2s ease-out, opacity 0.2s ease-out';
        toast.style.transform = 'translateY(-60px)';
        toast.style.opacity = '0';
        toast._dismissed = true;
        setTimeout(() => {
          if (toast.parentNode) {
            const c = toast.parentNode;
            toast.remove();
            updateStackIndices(c);
          }
        }, 200);
      } else {
        toast.style.transition = 'transform 0.2s ease-out, opacity 0.2s ease-out';
        toast.style.opacity = '';
        if (_isExpanded) {
          // Restore to expanded position; timers stay paused
          toast.style.transform = `translateY(${toast._expandedY || 0}px)`;
        } else {
          toast.style.transform = '';
          if (Math.abs(diff) < 10) {
            // Tap on collapsed stack — expand
            expandToasts(container);
            return;
          }
          toast._autoDismissAt = Date.now() + duration;
          toast._autoDismiss = setTimeout(() => dismissToast(toast), duration);
        }
      }
    }, { passive: true });
  }

  return toast;
};
