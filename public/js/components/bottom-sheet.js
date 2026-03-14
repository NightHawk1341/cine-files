/**
 * Bottom sheet — slide-up panel for mobile interactions.
 * Used for mobile search, action menus, etc.
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
  }

  return {
    open: open,
    close: close,
  };
})();
