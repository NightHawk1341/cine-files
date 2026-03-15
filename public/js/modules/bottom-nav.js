/**
 * Bottom navigation — fixed mobile nav bar.
 * Active state managed by Router.updateActiveStates.
 */

var BottomNav = (function () {
  function init() {
    // Pressed state feedback
    document.querySelectorAll('.bottom-nav-button').forEach(function (item) {
      item.addEventListener('pointerdown', function () {
        item.classList.add('mobile-pressed-to-active');
      });
      item.addEventListener('pointerup', function () {
        item.classList.remove('mobile-pressed-to-active');
      });
      item.addEventListener('pointerleave', function () {
        item.classList.remove('mobile-pressed-to-active');
      });
    });
  }

  return {
    init: init,
  };
})();
