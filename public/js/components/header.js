/**
 * Header — persistent site header with burger menu, nav, search, theme toggle.
 * Matches TR-BUTE header behavior: hide on scroll down (desktop only).
 */

var Header = (function () {
  var menuOpen = false;
  var hidden = false;
  var lastScrollY = 0;
  var ticking = false;
  var scrollHandler = null;

  function init() {
    var header = document.getElementById('site-header');
    var burgerBtn = document.getElementById('header-burger');
    var nav = document.getElementById('header-nav');
    var searchMobileBtn = document.getElementById('header-search-mobile');

    if (!header || !burgerBtn || !nav) return;

    // Burger toggle
    burgerBtn.addEventListener('click', function () {
      menuOpen = !menuOpen;
      nav.classList.toggle('nav-open', menuOpen);
      burgerBtn.innerHTML = menuOpen
        ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>'
        : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>';
    });

    // Close menu on nav link click
    nav.addEventListener('click', function (e) {
      if (e.target.closest('.header-nav-link')) {
        menuOpen = false;
        nav.classList.remove('nav-open');
        burgerBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>';
      }
    });

    // Mobile search bottom sheet
    if (searchMobileBtn) {
      searchMobileBtn.addEventListener('click', function () {
        BottomSheet.open('search-sheet');
      });
    }

    // Search form submission
    var searchForm = document.getElementById('search-sheet-form');
    if (searchForm) {
      searchForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var input = document.getElementById('search-sheet-input');
        var query = input ? input.value.trim() : '';
        if (query.length >= 2) {
          BottomSheet.close('search-sheet');
          Router.navigate('/search?q=' + encodeURIComponent(query));
          if (input) input.value = '';
        }
      });
    }

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
