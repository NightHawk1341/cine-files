/**
 * Toast notifications.
 * Variants: default, success, error, warning, info.
 */

var Toast = (function () {
  var container = null;

  function getContainer() {
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    return container;
  }

  /**
   * Show a toast notification.
   * @param {string} message
   * @param {'default'|'success'|'error'|'warning'|'info'} [variant='default']
   * @param {number} [duration=3000]
   */
  function show(message, variant, duration) {
    variant = variant || 'default';
    duration = duration || 3000;

    var el = document.createElement('div');
    el.className = 'toast' + (variant !== 'default' ? ' toast-' + variant : '');
    el.textContent = message;

    el.addEventListener('click', function () {
      dismiss(el);
    });

    getContainer().appendChild(el);

    setTimeout(function () {
      dismiss(el);
    }, duration);
  }

  function dismiss(el) {
    if (!el || el.classList.contains('toast-leaving')) return;
    el.classList.add('toast-leaving');
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 300);
  }

  return {
    show: show,
  };
})();
