/**
 * Header — persistent site header with search, theme toggle, auth buttons.
 * Matches TR-BUTE header behavior: hide on scroll down (desktop only).
 * Shows profile button and "new article" button for editors.
 */

var Header = (function () {
  var hidden = false;
  var lastScrollY = 0;
  var ticking = false;
  var scrollHandler = null;
  var authChangeHandler = null;

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

    // Listen for auth changes
    authChangeHandler = function () {
      updateAuthButtons();
    };
    document.addEventListener('auth:change', authChangeHandler);

    // Initial auth state (async, non-blocking)
    Auth.getUser().then(function () {
      updateAuthButtons();
    });
  }

  /**
   * Update header buttons based on auth state.
   */
  function updateAuthButtons() {
    var newArticleBtn = document.getElementById('header-new-article');
    var profileBtn = document.getElementById('header-profile-btn');
    var profileAvatar = document.getElementById('header-profile-avatar');
    var profileIcon = document.getElementById('header-profile-icon');

    if (!profileBtn) return;

    if (Auth.isLoggedIn()) {
      // Show new article button for editors
      if (newArticleBtn) {
        newArticleBtn.style.display = Auth.isEditor() ? 'flex' : 'none';
      }

      // Show avatar if available
      var user = null;
      // getUser returns a promise but we know it's cached at this point
      Auth.getUser().then(function (u) {
        if (!u) return;
        if (profileAvatar && profileIcon) {
          if (u.avatar_url) {
            profileAvatar.src = u.avatar_url;
            profileAvatar.style.display = 'block';
            profileIcon.style.display = 'none';
          } else {
            profileAvatar.style.display = 'none';
            profileIcon.style.display = 'block';
          }
        }
      });
    } else {
      // Hide new article button
      if (newArticleBtn) {
        newArticleBtn.style.display = 'none';
      }
      // Show generic profile icon
      if (profileAvatar) profileAvatar.style.display = 'none';
      if (profileIcon) profileIcon.style.display = 'block';
    }
  }

  function cleanup() {
    if (scrollHandler) {
      window.removeEventListener('scroll', scrollHandler);
      scrollHandler = null;
    }
    if (authChangeHandler) {
      document.removeEventListener('auth:change', authChangeHandler);
      authChangeHandler = null;
    }
  }

  return {
    init: init,
    cleanup: cleanup,
    updateAuthButtons: updateAuthButtons,
  };
})();
