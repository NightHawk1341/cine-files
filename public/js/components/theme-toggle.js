/**
 * Theme toggle — dark/light mode switcher.
 * Reads localStorage('cinefiles-theme'), falls back to system preference.
 */

var ThemeToggle = (function () {
  var currentTheme = 'dark';

  var sunIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
    '<circle cx="12" cy="12" r="5"/>' +
    '<path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>' +
    '</svg>';

  var moonIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
    '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>' +
    '</svg>';

  function getInitialTheme() {
    var stored = localStorage.getItem('cinefiles-theme');
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  function applyTheme(theme) {
    currentTheme = theme;
    var root = document.documentElement;
    root.classList.add('theme-transition-disable');
    root.setAttribute('data-theme', theme);
    localStorage.setItem('cinefiles-theme', theme);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        root.classList.remove('theme-transition-disable');
      });
    });

    // Update meta theme-color
    var metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', theme === 'dark' ? '#121212' : '#f2ede4');
    }

    // Update button icon
    var btn = document.getElementById('theme-toggle-btn');
    if (btn) {
      btn.innerHTML = theme === 'dark' ? sunIcon : moonIcon;
      btn.setAttribute('aria-label', theme === 'dark' ? 'Светлая тема' : 'Темная тема');
    }
  }

  function toggle() {
    applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
  }

  function init() {
    currentTheme = getInitialTheme();
    var btn = document.getElementById('theme-toggle-btn');
    if (btn) {
      btn.innerHTML = currentTheme === 'dark' ? sunIcon : moonIcon;
      btn.addEventListener('click', toggle);
    }
  }

  return {
    init: init,
    toggle: toggle,
  };
})();
