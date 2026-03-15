/**
 * Header — persistent site header with search and theme toggle.
 * Matches TR-BUTE header behavior: hide on scroll down (desktop only).
 */

var Header = (function () {
  var hidden = false;
  var lastScrollY = 0;
  var ticking = false;
  var scrollHandler = null;

  function init() {
    var header = document.getElementById('site-header');

    if (!header) return;

    // Hide header on scroll down (desktop only)
    scrollHandler = function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var currentY = window.scrollY;
        if (currentY > lastScrollY && currentY > 80) {
          if (!hidden) {
            hidden = true;
            header.classList.add('header-hidden');
          }
        } else {
          if (hidden) {
            hidden = false;
            header.classList.remove('header-hidden');
          }
        }
        lastScrollY = currentY;
        ticking = false;
      });
    };
    window.addEventListener('scroll', scrollHandler, { passive: true });

    // Init theme toggle
    ThemeToggle.init();
  }

  function cleanup() {
    if (scrollHandler) {
      window.removeEventListener('scroll', scrollHandler);
      scrollHandler = null;
    }
  }

  return {
    init: init,
    cleanup: cleanup,
  };
})();
