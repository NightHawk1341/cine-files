/**
 * Footer — persistent site footer with nav links and social groups.
 * Mobile: social groups collapse into circle buttons, click to expand.
 */

var Footer = (function () {
  var isMobile = false;
  var openGroup = null;
  var resizeHandler = null;
  var clickOutsideHandler = null;

  function updateMobile() {
    isMobile = window.innerWidth <= 1024;
    if (!isMobile) {
      // Desktop: expand all groups
      document.querySelectorAll('.footer-right-group').forEach(function (g) {
        g.classList.remove('collapsed');
        var list = g.querySelector('.footer-socials-list');
        if (list) list.classList.remove('hidden');
      });
    } else if (!openGroup) {
      // Mobile: collapse all
      document.querySelectorAll('.footer-right-group').forEach(function (g) {
        g.classList.add('collapsed');
        var list = g.querySelector('.footer-socials-list');
        if (list) list.classList.add('hidden');
      });
    }
  }

  function toggleGroup(groupName) {
    if (!isMobile) return;
    if (openGroup === groupName) {
      openGroup = null;
    } else {
      openGroup = groupName;
    }
    document.querySelectorAll('.footer-right-group').forEach(function (g) {
      var name = g.getAttribute('data-group');
      var isOpen = name === openGroup;
      g.classList.toggle('collapsed', !isOpen);
      var list = g.querySelector('.footer-socials-list');
      if (list) list.classList.toggle('hidden', !isOpen);
    });
  }

  function init() {
    // Set year
    var yearEl = document.getElementById('footer-year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    updateMobile();

    // Resize handler
    var resizeTimeout;
    resizeHandler = function () {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(updateMobile, 150);
    };
    window.addEventListener('resize', resizeHandler);

    // Social group toggle buttons
    document.querySelectorAll('.footer-socials-button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var group = btn.closest('.footer-right-group');
        if (group) toggleGroup(group.getAttribute('data-group'));
      });
    });

    // Click outside to close
    clickOutsideHandler = function (e) {
      if (!isMobile || !openGroup) return;
      var right = document.querySelector('.footer-right');
      if (right && !right.contains(e.target)) {
        openGroup = null;
        document.querySelectorAll('.footer-right-group').forEach(function (g) {
          g.classList.add('collapsed');
          var list = g.querySelector('.footer-socials-list');
          if (list) list.classList.add('hidden');
        });
      }
    };
    document.addEventListener('click', clickOutsideHandler);
  }

  function cleanup() {
    if (resizeHandler) window.removeEventListener('resize', resizeHandler);
    if (clickOutsideHandler) document.removeEventListener('click', clickOutsideHandler);
  }

  return {
    init: init,
    cleanup: cleanup,
  };
})();
