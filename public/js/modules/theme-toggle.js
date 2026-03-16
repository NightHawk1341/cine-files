/**
 * Theme toggle — dark/light mode switcher.
 * Reads localStorage('cinefiles-theme'), falls back to system preference.
 */

var ThemeToggle = (function () {
  var currentTheme = 'dark';

  var sunIcon = '<svg width="20" height="20" viewBox="0 0 64 64"><use href="#icon-sun"/></svg>';
  var moonIcon = '<svg width="20" height="20" viewBox="0 0 64 64"><use href="#icon-moon"/></svg>';

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

  function get() {
    return currentTheme;
  }

  function set(theme) {
    if (theme === 'light' || theme === 'dark') {
      applyTheme(theme);
    }
  }

  function getCssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function getCssVars(names) {
    var style = getComputedStyle(document.documentElement);
    var result = {};
    names.forEach(function (name) {
      result[name] = style.getPropertyValue(name).trim();
    });
    return result;
  }

  return {
    init: init,
    toggle: toggle,
    get: get,
    set: set,
    getCssVar: getCssVar,
    getCssVars: getCssVars,
  };
})();
