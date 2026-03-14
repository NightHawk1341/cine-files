/**
 * SPA Router — matches TR-BUTE's registerPage pattern.
 * URL-based page loading with dynamic CSS injection and cleanup.
 * Scroll restoration, progress bar, modifier key handling, SPA events.
 */

const Router = (function () {
  /** @type {Map<string, { pattern: RegExp, paramNames: string[], init: Function, cleanup?: Function }>} */
  const routes = new Map();
  /** @type {{ cleanup?: Function } | null} */
  let currentPage = null;
  /** @type {string | null} */
  let currentPath = null;
  /** @type {HTMLLinkElement[]} */
  let currentStylesheets = [];
  /** @type {string[]} */
  let pageSpecificStyles = [];
  /** @type {Record<string, string>} */
  let contentSelectors = {};
  let isNavigating = false;

  /** @type {Map<string, number>} */
  var scrollPositions = new Map();

  var progressBar = null;
  var progressTimer = null;

  /**
   * Register a page route.
   * @param {string} route — e.g. '/', '/news', '/tag/:slug', '/:category/:slug'
   * @param {{ init: Function, cleanup?: Function, styles?: string[], contentSelector?: string }} handler
   */
  function registerPage(route, handler) {
    const paramNames = [];
    const patternStr = route
      .replace(/:([^/]+)/g, (_, name) => {
        paramNames.push(name);
        return '([^/]+)';
      })
      .replace(/\//g, '\\/');
    const pattern = new RegExp('^' + patternStr + '$');
    routes.set(route, {
      pattern,
      paramNames,
      init: handler.init,
      cleanup: handler.cleanup,
      styles: handler.styles || [],
      contentSelector: handler.contentSelector || null,
    });
  }

  function showProgressBar() {
    if (progressBar && progressBar.parentNode) {
      progressBar.parentNode.removeChild(progressBar);
    }
    clearTimeout(progressTimer);
    progressBar = document.createElement('div');
    progressBar.className = 'progress-bar';
    progressBar.style.width = '0%';
    document.body.appendChild(progressBar);
    requestAnimationFrame(function () {
      if (progressBar) progressBar.style.width = '70%';
    });
    progressTimer = setTimeout(function () {
      hideProgressBar();
    }, 8000);
  }

  function hideProgressBar() {
    clearTimeout(progressTimer);
    if (!progressBar) return;
    progressBar.style.width = '100%';
    var bar = progressBar;
    setTimeout(function () {
      if (bar && bar.parentNode) {
        bar.style.opacity = '0';
        setTimeout(function () {
          if (bar.parentNode) bar.parentNode.removeChild(bar);
        }, 200);
      }
    }, 200);
    progressBar = null;
  }

  function cleanupBodyLocks() {
    document.body.classList.remove('modal-open', 'sheet-open', 'popup-open');
    document.body.style.removeProperty('position');
    document.body.style.removeProperty('top');
    document.body.style.removeProperty('width');
    document.body.style.removeProperty('overflow');
  }

  /**
   * Navigate to a URL path.
   * @param {string} path
   * @param {boolean} [pushState=true]
   */
  async function navigate(path, pushState) {
    if (pushState === undefined) pushState = true;
    if (isNavigating) return;
    isNavigating = true;

    showProgressBar();

    try {
      // Dispatch page leave event
      if (currentPath) {
        document.dispatchEvent(new CustomEvent('spa:pageleave', {
          detail: { path: currentPath }
        }));
      }

      // Save scroll position for current route
      if (currentPath) {
        scrollPositions.set(currentPath, window.scrollY);
      }

      // Cleanup current page
      if (currentPage && currentPage.cleanup) {
        try {
          currentPage.cleanup();
        } catch (err) {
          console.error('Page cleanup error:', err);
        }
      }

      // Clean up stuck body locks from modals/sheets
      cleanupBodyLocks();

      // Remove page-specific stylesheets
      currentStylesheets.forEach(function (link) {
        if (link.parentNode) link.parentNode.removeChild(link);
      });
      currentStylesheets = [];

      // Find matching route
      let matched = null;
      let params = {};

      // Try exact routes first, then parameterized
      for (const [route, handler] of routes) {
        const match = path.match(handler.pattern);
        if (match) {
          matched = handler;
          handler.paramNames.forEach(function (name, i) {
            params[name] = match[i + 1];
          });
          break;
        }
      }

      if (!matched) {
        // 404 — show not found
        var mainContent = document.getElementById('page-content');
        if (mainContent) {
          mainContent.innerHTML =
            '<div class="container not-found-page">' +
            '<h1 class="not-found-title">404</h1>' +
            '<p class="not-found-message">Страница не найдена</p>' +
            '</div>';
        }
        currentPage = null;
        currentPath = path;
        if (pushState) history.pushState(null, '', path);
        hideProgressBar();
        return;
      }

      // Load page-specific CSS
      if (matched.styles && matched.styles.length > 0) {
        matched.styles.forEach(function (href) {
          var link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = href;
          document.head.appendChild(link);
          currentStylesheets.push(link);
        });
      }

      // Update URL
      if (pushState) history.pushState(null, '', path);
      currentPath = path;

      // Scroll: restore saved position on back/forward, otherwise scroll to top
      if (!pushState && scrollPositions.has(path)) {
        window.scrollTo(0, scrollPositions.get(path));
      } else {
        window.scrollTo(0, 0);
      }

      // Init new page
      currentPage = matched;
      await matched.init(params);

      // Update active states
      updateActiveStates(path);

      // Dispatch page enter event
      document.dispatchEvent(new CustomEvent('spa:pageenter', {
        detail: { path: path }
      }));
    } catch (err) {
      console.error('Navigation error:', err);
    } finally {
      isNavigating = false;
      hideProgressBar();
    }
  }

  /**
   * Update active link states in header and bottom nav.
   * @param {string} path
   */
  function updateActiveStates(path) {
    // Header nav links
    document.querySelectorAll('.header-nav-link').forEach(function (link) {
      var href = link.getAttribute('href');
      var isActive = href === '/' ? path === '/' : path.startsWith(href);
      link.classList.toggle('nav-link-active', isActive);
    });

    // Bottom nav items
    document.querySelectorAll('.bottom-nav-item').forEach(function (link) {
      var href = link.getAttribute('href');
      var isActive = href === '/' ? path === '/' : path.startsWith(href);
      link.classList.toggle('item-active', isActive);
    });

    // Desktop search
    var searchLink = document.querySelector('.header-search-desktop');
    if (searchLink) {
      searchLink.classList.toggle('header-button-active', path === '/search');
    }
  }

  /**
   * Check if a click event has modifier keys (for opening in new tab).
   * @param {MouseEvent} e
   * @returns {boolean}
   */
  function hasModifierKey(e) {
    return e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button === 1;
  }

  /**
   * Initialize the router — listen for link clicks, popstate.
   */
  function init() {
    // Intercept link clicks for SPA navigation
    document.addEventListener('click', function (e) {
      var target = e.target.closest('a[href]');
      if (!target) return;
      var href = target.getAttribute('href');
      if (!href || href.startsWith('http') || href.startsWith('//') || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      if (target.hasAttribute('target')) return;
      if (target.hasAttribute('data-no-spa')) return;
      // Allow modifier keys to open in new tab natively
      if (hasModifierKey(e)) return;
      e.preventDefault();
      if (href !== currentPath) {
        navigate(href);
      }
    });

    // Handle browser back/forward
    window.addEventListener('popstate', function () {
      navigate(location.pathname, false);
    });

    // Initial page load
    navigate(location.pathname, false);
  }

  /**
   * Get current path.
   * @returns {string|null}
   */
  function getCurrentPath() {
    return currentPath;
  }

  return {
    registerPage: registerPage,
    navigate: navigate,
    init: init,
    getCurrentPath: getCurrentPath,
  };
})();
