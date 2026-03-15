/**
 * Bottom sheet — slide-up panel for mobile interactions.
 * Supports swipe-down-to-dismiss matching TR-BUTE behavior.
 */

var BottomSheet = (function () {
  /**
   * Open a bottom sheet by ID.
   * @param {string} id
   */
  function open(id) {
    var sheet = document.getElementById(id);
    if (!sheet) return;
    sheet.classList.add('bottom-sheet-open');
    document.body.classList.add('sheet-open');

    // Focus first input if present
    var input = sheet.querySelector('input');
    if (input) {
      setTimeout(function () { input.focus(); }, 100);
    }

    // Click overlay to close
    var overlay = sheet.querySelector('.bottom-sheet-overlay');
    if (overlay) {
      overlay.addEventListener('click', function handler() {
        close(id);
        overlay.removeEventListener('click', handler);
      });
    }

    // Swipe-down to dismiss on the panel handle/panel
    var panel = sheet.querySelector('.bottom-sheet-panel');
    if (panel) {
      setupDragDismiss(id, sheet, panel);
    }

    // Escape key to close
    sheet._keyHandler = function (e) {
      if (e.key === 'Escape') close(id);
    };
    document.addEventListener('keydown', sheet._keyHandler);
  }

  function setupDragDismiss(id, sheet, panel) {
    var startY = 0;
    var currentY = 0;
    var dragging = false;
    var overlay = sheet.querySelector('.bottom-sheet-overlay');

    function onTouchStart(e) {
      dragging = true;
      startY = e.touches[0].clientY;
      currentY = startY;
      panel.style.transition = 'none';
    }

    function onTouchMove(e) {
      if (!dragging) return;
      currentY = e.touches[0].clientY;
      var diff = currentY - startY;
      if (diff > 0) {
        // Drag down with resistance (multiply by 0.5 like TR-BUTE)
        panel.style.transform = 'translateY(' + (diff * 0.5) + 'px)';
        if (overlay) {
          overlay.style.opacity = String(Math.max(0.3, 1 - diff / 400));
        }
      }
    }

    function onTouchEnd() {
      if (!dragging) return;
      dragging = false;
      var diff = currentY - startY;
      if (diff > 80) {
        // Dismiss
        panel.style.transition = 'transform 0.2s ease-out';
        panel.style.transform = 'translateY(100%)';
        setTimeout(function () {
          panel.style.transform = '';
          panel.style.transition = '';
          if (overlay) overlay.style.opacity = '';
          close(id);
        }, 200);
      } else {
        // Snap back
        panel.style.transition = 'transform 0.2s ease-out';
        panel.style.transform = '';
        if (overlay) {
          overlay.style.transition = 'opacity 0.2s ease-out';
          overlay.style.opacity = '';
          setTimeout(function () { overlay.style.transition = ''; }, 200);
        }
      }
    }

    panel.addEventListener('touchstart', onTouchStart, { passive: true });
    panel.addEventListener('touchmove', onTouchMove, { passive: true });
    panel.addEventListener('touchend', onTouchEnd, { passive: true });

    // Store handlers for cleanup
    panel._dragHandlers = { start: onTouchStart, move: onTouchMove, end: onTouchEnd };
  }

  /**
   * Close a bottom sheet by ID.
   * @param {string} id
   */
  function close(id) {
    var sheet = document.getElementById(id);
    if (!sheet) return;
    sheet.classList.remove('bottom-sheet-open');
    document.body.classList.remove('sheet-open');

    if (sheet._keyHandler) {
      document.removeEventListener('keydown', sheet._keyHandler);
      sheet._keyHandler = null;
    }
  }

  return {
    open: open,
    close: close,
  };
})();
