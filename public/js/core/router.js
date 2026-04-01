/**
 * SPA Router — matches TR-BUTE's registerPage pattern.
 * URL-based page loading with dynamic CSS injection and cleanup.
 * Scroll restoration, progress bar, modifier key handling, SPA events.
 *
 * Enhancements from TR-BUTE parity:
 * - SPA-1: Link prefetching on hover/touchstart with TTL cache
 * - SPA-2: OG meta tag updates on SPA navigation
 * - SPA-3: Race-safe pending navigation queue (replaces isNavigating flag)
 * - SPA-4: Connection warmup on tab visibility change for stale tabs
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
  /** Persistent elements that survive all navigations (never removed by router) */
  var persistentSelectors = [
    '#site-header',
    '.site-layout',
    '#sidebar-left',
    '#sidebar-right',
    '.footer',
    '.bottom-nav',
    '#scroll-to-top',
    '.grain-overlay',
    '.toast-container',
  ];

  // SPA-3: Pending navigation queue (replaces simple isNavigating flag)
  var isNavigating = false;
  var pendingNavigation = null;

  /** @type {Map<string, number>} */
  var scrollPositions = new Map();

  var progressBar = null;
  var progressTimer = null;

  // SPA-1: Prefetch cache with TTL
  var prefetchCache = new Map();
  var PREFETCH_TTL = 10000; // 10 seconds

  // SPA-4: Connection warmup tracking
  var lastActivityTime = Date.now();
  var STALE_TAB_THRESHOLD = 60000; // 60 seconds

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

  // SPA-2: Update OG meta tags on navigation
  function updateMetaTags(path) {
    var title = document.title;
    var desc = '';
    var descMeta = document.querySelector('meta[name="description"]');
    if (descMeta) desc = descMeta.getAttribute('content') || '';

    var ogTags = {
      'og:title': title,
      'og:description': desc,
      'og:url': window.location.origin + path,
    };

    Object.keys(ogTags).forEach(function (property) {
      var meta = document.querySelector('meta[property="' + property + '"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('property', property);
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', ogTags[property]);
    });
  }

  /**
   * Navigate to a URL path.
   * SPA-3: Race-safe — if a navigation is in progress, the new one queues
   * and replaces any previously queued navigation.
   * @param {string} path
   * @param {boolean} [pushState=true]
   */
  async function navigate(path, pushState) {
    if (pushState === undefined) pushState = true;

    // Admin routes redirect to standalone admin miniapp
    if (path === '/admin' || path.startsWith('/admin/')) {
      window.location.href = '/admin-miniapp/';
      return;
    }

    // SPA-3: Queue navigation if one is already in progress
    if (isNavigating) {
      pendingNavigation = { path: path, pushState: pushState };
      return;
    }
    isNavigating = true;
    lastActivityTime = Date.now();

    showProgressBar();

    try {
      // Dispatch page leave event
      if (currentPath) {
        document.dispatchEvent(new CustomEvent('spa:pageleave', {
          detail: { path: currentPath }
        }));
      }

      // Save scroll position for current route (SPA-3: use path + query for key)
      if (currentPath) {
        var scrollKey = currentPath + window.location.search;
        scrollPositions.set(scrollKey, window.scrollY);
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
      var restoreKey = path + window.location.search;
      if (!pushState && scrollPositions.has(restoreKey)) {
        window.scrollTo(0, scrollPositions.get(restoreKey));
      } else {
        window.scrollTo(0, 0);
      }

      // Init new page
      currentPage = matched;
      await matched.init(params);

      // Update active states
      updateActiveStates(path);

      // SPA-2: Update OG meta tags after page init (title may have changed)
      updateMetaTags(path);

      // Dispatch page enter event
      document.dispatchEvent(new CustomEvent('spa:pageenter', {
        detail: { path: path }
      }));
    } catch (err) {
      console.error('Navigation error:', err);
    } finally {
      isNavigating = false;
      hideProgressBar();

      // SPA-3: Process pending navigation if queued
      if (pendingNavigation) {
        var pending = pendingNavigation;
        pendingNavigation = null;
        navigate(pending.path, pending.pushState);
      }
    }
  }

  /**
   * Update active link states in header and bottom nav.
   * @param {string} path
   */
  function updateActiveStates(path) {
    // Bottom nav items
    document.querySelectorAll('.bottom-nav-button').forEach(function (link) {
      var href = link.getAttribute('href');
      if (!href) return;
      var isActive = href === '/' ? path === '/' : path.startsWith(href);
      link.classList.toggle('active-page', isActive);
    });

    // Close search panel on navigation
    if (typeof Header !== 'undefined' && Header.closeAllSearch) {
      Header.closeAllSearch();
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

  // SPA-1: Prefetch a URL by preloading its route match (warm CSS)
  function prefetchLink(href) {
    if (!href || href === currentPath) return;
    if (prefetchCache.has(href)) {
      var cached = prefetchCache.get(href);
      if (Date.now() - cached < PREFETCH_TTL) return;
    }

    // Find matching route and prefetch its CSS
    for (var entry of routes) {
      var handler = entry[1];
      if (handler.pattern.test(href) && handler.styles && handler.styles.length > 0) {
        handler.styles.forEach(function (cssHref) {
          var existing = document.querySelector('link[href="' + cssHref + '"]');
          if (!existing) {
            var link = document.createElement('link');
            link.rel = 'prefetch';
            link.as = 'style';
            link.href = cssHref;
            document.head.appendChild(link);
          }
        });
        break;
      }
    }

    prefetchCache.set(href, Date.now());
  }

  /**
   * Initialize the router — listen for link clicks, popstate, prefetch, warmup.
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

    // SPA-1: Prefetch on hover/touchstart
    var prefetchTimeout = null;
    document.addEventListener('mouseover', function (e) {
      var target = e.target.closest('a[href]');
      if (!target) return;
      var href = target.getAttribute('href');
      if (!href || href.startsWith('http') || href.startsWith('//') || href.startsWith('#')) return;
      if (target.hasAttribute('data-no-spa')) return;
      clearTimeout(prefetchTimeout);
      prefetchTimeout = setTimeout(function () {
        prefetchLink(href);
      }, 65);
    });

    document.addEventListener('touchstart', function (e) {
      var target = e.target.closest('a[href]');
      if (!target) return;
      var href = target.getAttribute('href');
      if (!href || href.startsWith('http') || href.startsWith('//') || href.startsWith('#')) return;
      if (target.hasAttribute('data-no-spa')) return;
      prefetchLink(href);
    }, { passive: true });

    // SPA-4: Connection warmup on tab visibility change for stale tabs
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        var idle = Date.now() - lastActivityTime;
        if (idle > STALE_TAB_THRESHOLD) {
          // Warm up connection by hitting health endpoint
          fetch('/api/health', { method: 'GET', cache: 'no-store' }).catch(function () {});
          lastActivityTime = Date.now();
        }
      }
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
