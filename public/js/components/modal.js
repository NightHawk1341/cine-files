/**
 * Modal — centered dialog with overlay.
 * Supports confirm, alert, and prompt types.
 * Promise-based API matching TR-BUTE's modal pattern.
 * Also supports legacy callback API (onConfirm/onCancel).
 */

var Modal = (function () {
  var activeModal = null;

  /**
   * Show a confirmation modal.
   * @param {object} opts
   * @param {string} opts.title
   * @param {string} [opts.message]
   * @param {'danger'|'warning'|'success'|'info'} [opts.variant='info']
   * @param {string} [opts.type='confirm'] - 'confirm' | 'alert'
   * @param {string} [opts.confirmText]
   * @param {string} [opts.cancelText]
   * @param {Function} [opts.onConfirm]
   * @param {Function} [opts.onCancel]
   * @returns {Promise<boolean>}
   */
  function confirm(opts) {
    return new Promise(function (resolve) {
      if (activeModal) {
        closeActive(null);
      }

      var type = opts.type || 'confirm';

      var overlay = document.createElement('div');
      overlay.className = 'modal-overlay';

      var modal = document.createElement('div');
      modal.className = 'modal-dialog modal-' + (opts.variant || 'info');

      // Handle bar for mobile drag-to-dismiss
      var handle = document.createElement('div');
      handle.className = 'modal-handle';
      modal.appendChild(handle);

      var title = document.createElement('h3');
      title.className = 'modal-title';
      title.textContent = opts.title;
      modal.appendChild(title);

      if (opts.message) {
        var msg = document.createElement('p');
        msg.className = 'modal-message';
        msg.textContent = opts.message;
        modal.appendChild(msg);
      }

      var actions = document.createElement('div');
      actions.className = 'modal-actions';

      if (type !== 'alert') {
        var cancelBtn = document.createElement('button');
        cancelBtn.className = 'modal-btn modal-btn-cancel';
        cancelBtn.textContent = opts.cancelText || 'Отмена';
        cancelBtn.addEventListener('click', function () {
          close(false);
        });
        actions.appendChild(cancelBtn);
      }

      var confirmBtn = document.createElement('button');
      confirmBtn.className = 'modal-btn modal-btn-confirm modal-btn-' + (opts.variant || 'info');
      confirmBtn.textContent = opts.confirmText || (type === 'alert' ? 'OK' : 'Подтвердить');
      confirmBtn.addEventListener('click', function () {
        close(true);
      });

      actions.appendChild(confirmBtn);
      modal.appendChild(actions);
      overlay.appendChild(modal);

      document.body.appendChild(overlay);
      document.body.classList.add('modal-open');
      activeModal = overlay;

      // Backdrop click to dismiss
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) {
          close(false);
        }
      });

      // Escape key to dismiss
      function keyHandler(e) {
        if (e.key === 'Escape') close(false);
      }
      document.addEventListener('keydown', keyHandler);

      // Drag-to-dismiss on mobile
      var startY = 0;
      var currentY = 0;
      var dragging = false;

      handle.addEventListener('touchstart', function (e) {
        dragging = true;
        startY = e.touches[0].clientY;
        currentY = startY;
        modal.style.transition = 'none';
      }, { passive: true });

      overlay.addEventListener('touchmove', function (e) {
        if (!dragging) return;
        currentY = e.touches[0].clientY;
        var diff = currentY - startY;
        if (diff > 0) {
          modal.style.transform = 'translateY(' + diff + 'px)';
          overlay.style.opacity = String(Math.max(0.3, 1 - diff / 300));
        }
      }, { passive: true });

      overlay.addEventListener('touchend', function () {
        if (!dragging) return;
        dragging = false;
        var diff = currentY - startY;
        if (diff > 80) {
          close(false);
        } else {
          modal.style.transition = 'transform 0.2s ease-out';
          modal.style.transform = '';
          overlay.style.opacity = '';
        }
      }, { passive: true });

      function close(result) {
        document.removeEventListener('keydown', keyHandler);
        document.body.classList.remove('modal-open');
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        activeModal = null;

        if (result) {
          if (opts.onConfirm) opts.onConfirm();
        } else {
          if (opts.onCancel) opts.onCancel();
        }
        resolve(result);
      }
    });
  }

  function closeActive(result) {
    if (activeModal && activeModal.parentNode) {
      activeModal.parentNode.removeChild(activeModal);
    }
    document.body.classList.remove('modal-open');
    activeModal = null;
  }

  return {
    confirm: confirm,
  };
})();
