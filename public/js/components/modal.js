/**
 * Modal — centered dialog with overlay.
 * Supports confirmation modals with icon variants.
 */

var Modal = (function () {
  /**
   * Show a confirmation modal.
   * @param {object} opts
   * @param {string} opts.title
   * @param {string} [opts.message]
   * @param {'danger'|'warning'|'success'|'info'} [opts.variant='info']
   * @param {string} [opts.confirmText='Подтвердить']
   * @param {string} [opts.cancelText='Отмена']
   * @param {Function} [opts.onConfirm]
   * @param {Function} [opts.onCancel]
   */
  function confirm(opts) {
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    var modal = document.createElement('div');
    modal.className = 'modal-dialog modal-' + (opts.variant || 'info');

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

    var cancelBtn = document.createElement('button');
    cancelBtn.className = 'modal-btn modal-btn-cancel';
    cancelBtn.textContent = opts.cancelText || 'Отмена';
    cancelBtn.addEventListener('click', function () {
      close();
      if (opts.onCancel) opts.onCancel();
    });

    var confirmBtn = document.createElement('button');
    confirmBtn.className = 'modal-btn modal-btn-confirm modal-btn-' + (opts.variant || 'info');
    confirmBtn.textContent = opts.confirmText || 'Подтвердить';
    confirmBtn.addEventListener('click', function () {
      close();
      if (opts.onConfirm) opts.onConfirm();
    });

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    modal.appendChild(actions);
    overlay.appendChild(modal);

    document.body.appendChild(overlay);
    document.body.classList.add('modal-open');

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) {
        close();
        if (opts.onCancel) opts.onCancel();
      }
    });

    function close() {
      document.body.classList.remove('modal-open');
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }
  }

  return {
    confirm: confirm,
  };
})();
