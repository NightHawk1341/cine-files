/**
 * Scroll to top button — shows after scrolling 400px.
 * Repositions above bottom-nav on mobile.
 */

var ScrollToTop = (function () {
  var btn = null;
  var scrollHandler = null;

  function init() {
    btn = document.getElementById('scroll-to-top');
    if (!btn) return;

    btn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    scrollHandler = function () {
      if (window.scrollY > 400) {
        btn.classList.add('scroll-to-top-visible');
      } else {
        btn.classList.remove('scroll-to-top-visible');
      }
    };
    window.addEventListener('scroll', scrollHandler, { passive: true });
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
