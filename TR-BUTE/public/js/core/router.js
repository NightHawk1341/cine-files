// ============================================================
// SPA ROUTER
// Client-side routing with History API
// Eliminates full page reloads for internal navigation
// ============================================================

/**
 * Page registry for init/cleanup functions
 * Maps route patterns to page handlers
 */
const pageRegistry = new Map();

/**
 * Current page state
 */
let currentPage = null;
let currentFullRouteKey = null; // Includes query params for skip comparison
let isNavigating = false;
let pendingPopstate = null; // queued back/forward nav interrupted by in-flight navigation
const scrollPositions = new Map(); // fullRouteKey → scrollY

/**
 * Router configuration
 */
const config = {
  // Main content selectors to swap
  contentSelectors: [
    // Index page
    '.products-header',
    '.products',
    '.faq-popup-overlay',
    // Shared elements across pages
    '.scroll-to-top-btn',
    // Other pages
    '.catalog-page-overlay',
    '.product-page-overlay',
    '.favorites-page-overlay',
    '.cart-page-overlay',
    '.order-popup-overlay',
    '.profile-page-overlay',
    '.picker-page-overlay',
    '.customers-page-overlay',
    '.faq-page-overlay',
    '.info-page',
    '.order-page-overlay',
    '.checkout-page-overlay',
    '.certificate-page-container',
    '.legal-page',
    '.ar-view-page'
  ],
  // Selectors for content that should persist (not be replaced)
  persistentSelectors: [
    '.header',
    '.footer',
    '.announcement-bar',
    '.bottom-nav',
    '.hint-container', // Hints (including story hints)
    '.zoom-overlay', // Zoom popup (shared across pages)
    'svg[style*="display:none"]', // SVG symbols
    '#toast-container' // Toast container (lazily created, must survive navigation)
  ],
  // Transition duration in ms
  transitionDuration: 200
};

/**
 * Check if device is mobile
 */
const isMobile = () => window.innerWidth <= 1024;

/**
 * Get content container element
 * Creates one if it doesn't exist
 */
const getOrCreateContentContainer = () => {
  let container = document.getElementById('spa-content');
  if (!container) {
    container = document.createElement('div');
    container.id = 'spa-content';
    container.className = 'spa-content';

    // Find where to insert the container
    const header = document.querySelector('.header');
    const footer = document.querySelector('.footer');
    const bottomNav = document.querySelector('.bottom-nav');

    // Gather all non-persistent content
    const body = document.body;
    const nonPersistentElements = [];

    Array.from(body.children).forEach(child => {
      const isPersistent = config.persistentSelectors.some(sel =>
        child.matches && child.matches(sel)
      );
      const isScript = child.tagName === 'SCRIPT';
      const isContainer = child.id === 'spa-content';

      if (!isPersistent && !isScript && !isContainer) {
        nonPersistentElements.push(child);
      }
    });

    // Insert container after header
    if (header && header.nextSibling) {
      body.insertBefore(container, header.nextSibling);
    } else {
      body.insertBefore(container, body.firstChild);
    }

    // Move non-persistent content into container
    nonPersistentElements.forEach(el => {
      container.appendChild(el);
    });
  }

  return container;
};

/**
 * Extract main content from parsed HTML document
 */
const extractContent = (doc) => {
  const content = document.createDocumentFragment();

  // Try to find content using known selectors
  for (const selector of config.contentSelectors) {
    const elements = doc.querySelectorAll(selector);
    elements.forEach(el => {
      content.appendChild(el.cloneNode(true));
    });
  }

  // If no specific content found, extract body excluding persistent elements
  if (content.childNodes.length === 0) {
    const body = doc.body;
    if (body) {
      Array.from(body.children).forEach(child => {
        const isPersistent = config.persistentSelectors.some(sel =>
          child.matches && child.matches(sel)
        );
        const isScript = child.tagName === 'SCRIPT';

        if (!isPersistent && !isScript) {
          content.appendChild(child.cloneNode(true));
        }
      });
    }
  }

  return content;
};

/**
 * Scripts that should NOT be reloaded on SPA navigation
 * These are shared modules that maintain global state
 */
const persistentScripts = [
  '/js/utils.js',
  '/js/core/',
  '/js/modules/product-grid.js',
  '/js/modules/faq-popup.js',
  '/js/modules/skeleton-loader.js',
  '/js/modules/header.js',
  '/js/modules/footer.js',
  '/js/modules/bottom-nav.js',
  '/js/modules/toast.js',
  '/js/modules/cart.js'
];

/**
 * Check if a script should persist across navigation
 */
const shouldPersistScript = (src) => {
  if (!src) return false;
  return persistentScripts.some(pattern => src.includes(pattern));
};

/**
 * Extract page scripts from parsed document
 * Only includes page-specific scripts, not shared modules
 * @param {Document} doc - The parsed HTML document
 * @param {string} baseUrl - The URL of the fetched document (for resolving relative paths)
 */
const extractScripts = (doc, baseUrl) => {
  const scripts = [];
  // Only include page-specific scripts
  // Note: Main page uses 'script.js' (relative or absolute path)
  const pageScripts = doc.querySelectorAll(
    'script[src*="/js/pages/"], ' +
    'script[src*="/js/modules/zoom.js"], ' +
    'script[src*="/js/certificate.js"], ' +
    'script[src="script.js"], ' +
    'script[src="/script.js"]'
  );

  pageScripts.forEach(script => {
    let src = script.getAttribute('src');
    // Skip persistent scripts
    if (shouldPersistScript(src)) {
      return;
    }
    // Normalize relative URLs to absolute (relative to the fetched document)
    if (src && !src.startsWith('/') && !src.startsWith('http')) {
      try {
        const resolvedUrl = new URL(src, baseUrl);
        src = resolvedUrl.pathname;
      } catch {
        // If URL parsing fails, just prepend / for root-relative
        src = '/' + src;
      }
    }
    scripts.push({
      src: src,
      type: script.getAttribute('type') || 'text/javascript',
      async: script.hasAttribute('async'),
      defer: script.hasAttribute('defer')
    });
  });

  return scripts;
};

/**
 * Extract page stylesheets from parsed document
 * @param {Document} doc - The parsed HTML document
 * @param {string} baseUrl - The URL of the fetched document (for resolving relative paths)
 */
const extractStyles = (doc, baseUrl) => {
  const styles = [];
  const links = doc.querySelectorAll('link[rel="stylesheet"]');

  links.forEach(link => {
    let href = link.getAttribute('href');
    // Only include page-specific styles, not global ones
    if (href && !href.includes('global.css') &&
        !href.includes('header.css') &&
        !href.includes('footer.css') &&
        !href.includes('bottom-nav.css')) {
      // Normalize relative URLs to absolute (relative to the fetched document)
      if (href && !href.startsWith('/') && !href.startsWith('http')) {
        // Resolve relative URL against the base URL
        try {
          const resolvedUrl = new URL(href, baseUrl);
          href = resolvedUrl.pathname;
        } catch {
          // If URL parsing fails, just prepend / for root-relative
          href = '/' + href;
        }
      }
      styles.push(href);
    }
  });

  return styles;
};

/**
 * Track which page scripts have been loaded
 * Page scripts register themselves via registerPage()
 */
const loadedPageScripts = new Set();

/**
 * Load and execute scripts for the page
 * Only loads page-specific scripts that haven't been loaded yet
 */
const loadScripts = async (scripts) => {
  for (const script of scripts) {
    if (!script.src) continue;

    // Normalize the script src for comparison
    const normalizedSrc = script.src.split('?')[0]; // Remove query strings

    // Check if script is already loaded
    const existingScript = document.querySelector(`script[src^="${normalizedSrc}"]`);

    // For page scripts, check if they're registered with the router
    // If registered, no need to reload - the init function will be called
    // Note: Main page script is 'script.js', certificate uses '/js/certificate.js'
    const isPageScript = script.src.includes('/js/pages/') ||
                         script.src.includes('/js/certificate.js') ||
                         script.src === 'script.js' ||
                         script.src === '/script.js' ||
                         script.src.endsWith('/script.js');

    if (existingScript) {
      if (isPageScript && loadedPageScripts.has(normalizedSrc)) {
        // Page script already loaded and registered, skip
        continue;
      }

      // For module scripts that need fresh execution, add a cache-busting param
      if (script.type === 'module' && isPageScript) {
        // Script exists but needs re-initialization
        // Don't remove the old one, let the browser cache it
        // The page's init function should handle re-initialization
        continue;
      } else {
        // Non-module script already exists
        continue;
      }
    }

    // Load the script
    try {
      await new Promise((resolve, reject) => {
        const scriptEl = document.createElement('script');
        scriptEl.src = script.src;
        scriptEl.type = script.type;
        if (script.async) scriptEl.async = true;
        if (script.defer) scriptEl.defer = true;

        scriptEl.onload = () => {
          if (isPageScript) {
            loadedPageScripts.add(normalizedSrc);
          }
          resolve();
        };
        scriptEl.onerror = reject;

        document.body.appendChild(scriptEl);
      });
    } catch (err) {
      console.warn(`Failed to load script: ${script.src}`, err);
    }
  }
};

/**
 * Page-specific CSS paths that should be removed when navigating away
 */
const pageSpecificStyles = [
  '/css/product.css',
  '/css/profile.css',
  '/css/catalog.css',
  '/css/favorites.css',
  '/css/cart.css',
  '/css/picker.css',
  '/css/customers.css',
  '/css/faq.css',
  '/css/order.css',
  '/css/certificate.css',
  '/css/info.css',
  '/css/legal.css',
  '/css/ar-view.css',
  'style.css',      // Main page styles (relative path)
  '/style.css'      // Main page styles (absolute path)
];

/**
 * Clean up old page-specific styles before loading new ones
 */
const cleanupPageStyles = (newStyles) => {
  // Get normalized new style paths for comparison
  const normalizedNewStyles = newStyles.map(href => {
    // Remove query strings and normalize path
    return href.split('?')[0].replace(/^\./, '');
  });

  // Remove page-specific styles that aren't needed for the new page
  pageSpecificStyles.forEach(stylePath => {
    // Skip if this style is needed for the new page
    if (normalizedNewStyles.some(s => s.includes(stylePath))) {
      return;
    }

    // Find and remove old style
    const existingLink = document.querySelector(`link[href*="${stylePath}"]`);
    if (existingLink) {
      existingLink.remove();
    }
  });
};

/**
 * Load stylesheets for the page
 */
const loadStyles = (styles) => {
  // Clean up old page-specific styles first
  cleanupPageStyles(styles);

  styles.forEach(href => {
    // Check if already loaded
    if (document.querySelector(`link[href="${href}"]`)) {
      return;
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  });
};

/**
 * Load stylesheets asynchronously and wait for them to load
 */
const loadStylesAsync = async (styles) => {
  // Clean up old page-specific styles first
  cleanupPageStyles(styles);

  const loadPromises = styles.map(href => {
    // Check if already loaded
    if (document.querySelector(`link[href="${href}"]`)) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = resolve;
      link.onerror = () => {
        console.warn(`Failed to load stylesheet: ${href}`);
        resolve(); // Don't block navigation on CSS load failure
      };
      document.head.appendChild(link);
    });
  });

  await Promise.all(loadPromises);
};

/**
 * Update page title
 */
const updateTitle = (doc) => {
  const title = doc.querySelector('title');
  if (title) {
    document.title = title.textContent;
  }
};

/**
 * Update Open Graph meta tags
 */
const updateMetaTags = (doc) => {
  const metaTags = ['og:title', 'og:description', 'og:image', 'og:url'];

  metaTags.forEach(property => {
    const newTag = doc.querySelector(`meta[property="${property}"]`);
    const existingTag = document.querySelector(`meta[property="${property}"]`);

    if (newTag && existingTag) {
      existingTag.setAttribute('content', newTag.getAttribute('content') || '');
    }
  });
};

/**
 * Merge SVG symbols from new page into existing symbols
 * Ensures page-specific symbols are available after SPA navigation
 */
const mergeSvgSymbols = (doc) => {
  // Find the hidden SVG block in the new document
  const newSvgBlock = doc.querySelector('svg[style*="display:none"]');
  if (!newSvgBlock) return;

  // Find or create the existing SVG block
  let existingSvgBlock = document.querySelector('body > svg[style*="display:none"]');
  if (!existingSvgBlock) {
    existingSvgBlock = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    existingSvgBlock.setAttribute('style', 'display:none');
    existingSvgBlock.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    document.body.insertBefore(existingSvgBlock, document.body.firstChild);
  }

  // Get all new symbols and merge them
  const newSymbols = newSvgBlock.querySelectorAll('symbol');
  newSymbols.forEach(newSymbol => {
    const id = newSymbol.getAttribute('id');
    if (id && !existingSvgBlock.querySelector(`#${id}`)) {
      // Symbol doesn't exist, add it
      existingSvgBlock.appendChild(newSymbol.cloneNode(true));
    }
  });
};

/**
 * Get route identifier from URL (pathname only, for page handler lookup)
 */
const getRouteId = (url) => {
  const urlObj = new URL(url, window.location.origin);
  let pathname = urlObj.pathname;

  // Normalize path
  if (pathname === '/index.html' || pathname === '/index') {
    pathname = '/';
  }

  // Remove trailing slash (except for root)
  if (pathname !== '/' && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }

  // Normalize parameterized routes to their base route
  // e.g., /product/some-slug -> /product
  const parameterizedRoutes = ['/product'];
  for (const baseRoute of parameterizedRoutes) {
    if (pathname.startsWith(baseRoute + '/')) {
      return baseRoute;
    }
  }

  return pathname;
};

/**
 * Get full route key including query params (for comparison/skip logic)
 */
const getFullRouteKey = (url) => {
  const urlObj = new URL(url, window.location.origin);
  let pathname = urlObj.pathname;

  // Normalize path
  if (pathname === '/index.html' || pathname === '/index') {
    pathname = '/';
  }

  // Remove trailing slash (except for root)
  if (pathname !== '/' && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }

  // Include search params for pages that use them (like product?id=xxx)
  const search = urlObj.search;
  return pathname + search;
};

/**
 * Call cleanup function for current page
 */
const cleanupCurrentPage = async () => {
  if (currentPage && pageRegistry.has(currentPage)) {
    const handler = pageRegistry.get(currentPage);
    if (handler && typeof handler.cleanup === 'function') {
      try {
        await handler.cleanup();
      } catch (err) {
        console.warn('Page cleanup error:', err);
      }
    }
  }

  // Dispatch custom event for cleanup
  window.dispatchEvent(new CustomEvent('spa:pageleave', {
    detail: { route: currentPage }
  }));
};

/**
 * Call init function for new page
 */
const initNewPage = async (routeId, fullRouteKey) => {
  currentPage = routeId;
  currentFullRouteKey = fullRouteKey;

  // Dispatch custom event for page enter
  window.dispatchEvent(new CustomEvent('spa:pageenter', {
    detail: { route: routeId }
  }));

  if (pageRegistry.has(routeId)) {
    const handler = pageRegistry.get(routeId);
    if (handler && typeof handler.init === 'function') {
      try {
        await handler.init();
      } catch (err) {
        console.warn('Page init error:', err);
      }
    }
  }
};

/**
 * Apply transition effect (instant cut - no animation)
 */
const applyTransition = (container, direction = 'in') => {
  return new Promise(resolve => {
    // Remove any existing transition classes
    container.classList.remove(
      'spa-fade-in', 'spa-fade-out',
      'spa-slide-in-right', 'spa-slide-out-left',
      'spa-slide-in-left', 'spa-slide-out-right'
    );
    // Instant cut - no animation, resolve immediately
    resolve();
  });
};

/**
 * Apply back navigation transition (instant cut - no animation)
 */
const applyBackTransition = (container, direction = 'in') => {
  return new Promise(resolve => {
    container.classList.remove(
      'spa-fade-in', 'spa-fade-out',
      'spa-slide-in-right', 'spa-slide-out-left',
      'spa-slide-in-left', 'spa-slide-out-right'
    );
    // Instant cut - no animation, resolve immediately
    resolve();
  });
};

/**
 * Get or create progress bar element
 */
const getOrCreateProgressBar = () => {
  let progressBar = document.querySelector('.spa-progress-bar');
  if (!progressBar) {
    progressBar = document.createElement('div');
    progressBar.className = 'spa-progress-bar';
    document.body.appendChild(progressBar);
  }
  return progressBar;
};

/**
 * Show progress bar (start animation)
 */
let progressBarSafetyTimeout = null;
const showProgressBar = () => {
  const progressBar = getOrCreateProgressBar();
  // Skip if already running — avoid restarting the animation on duplicate calls
  if (progressBar.classList.contains('active')) return;
  progressBar.classList.remove('completing');
  // Force reflow to restart animation
  progressBar.offsetHeight;
  progressBar.classList.add('active');
  // Safety: auto-hide after 8s in case hideProgressBar is never called
  clearTimeout(progressBarSafetyTimeout);
  progressBarSafetyTimeout = setTimeout(() => {
    if (progressBar.classList.contains('active')) {
      hideProgressBar();
    }
  }, 8000);
};

/**
 * Complete and hide progress bar
 */
const hideProgressBar = () => {
  const progressBar = getOrCreateProgressBar();
  progressBar.classList.remove('active');
  // Use rAF to ensure Safari processes the removal of .active before adding .completing
  // Without this, Safari may not restart the animation and the bar stays stuck at 70%
  requestAnimationFrame(() => {
    progressBar.classList.add('completing');
    // Remove completing class after animation (matches CSS animation duration)
    setTimeout(() => {
      progressBar.classList.remove('completing');
    }, 800);
  });
};

/**
 * Navigate to a URL using SPA routing
 */
export const navigate = async (url, options = {}) => {
  const { replace = false, isBack = false } = options;

  // Prevent concurrent navigation
  if (isNavigating) {
    hideProgressBar();
    return;
  }
  isNavigating = true;

  // Show progress bar (covers popstate + programmatic navigation)
  showProgressBar();

  const targetUrl = new URL(url, window.location.origin);
  const routeId = getRouteId(url);
  const fullRouteKey = getFullRouteKey(url);

  try {
    // Save scroll position for the page we're leaving
    if (currentFullRouteKey) {
      scrollPositions.set(currentFullRouteKey, window.scrollY);
    }

    // Skip if navigating to exact same URL including query params (unless forced)
    if (fullRouteKey === currentFullRouteKey && !options.force) {
      isNavigating = false;
      hideProgressBar();
      return;
    }

    // Get or create content container
    const container = getOrCreateContentContainer();

    // Apply exit transition
    if (isBack) {
      await applyBackTransition(container, 'out');
    } else {
      await applyTransition(container, 'out');
    }

    // Cleanup current page
    await cleanupCurrentPage();

    // Fetch new page content
    const response = await fetch(targetUrl.href);
    if (!response.ok) {
      throw new Error(`Failed to fetch page: ${response.status}`);
    }

    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Extract content, scripts, and styles
    const content = extractContent(doc);
    const scripts = extractScripts(doc, targetUrl.href);
    const styles = extractStyles(doc, targetUrl.href);

    // Update title and meta tags
    updateTitle(doc);
    updateMetaTags(doc);

    // Merge SVG symbols from new page
    mergeSvgSymbols(doc);

    // Hide container during content swap to prevent FOUC
    container.classList.add('loading');
    container.classList.remove('loaded');

    // Load new styles and wait for them to be applied
    await loadStylesAsync(styles);

    // Clear and replace content
    container.innerHTML = '';
    container.appendChild(content);

    // Update URL (only for forward navigation, not back/forward buttons)
    if (!options.fromPopState) {
      if (replace) {
        history.replaceState({ route: routeId }, '', targetUrl.href);
      } else {
        history.pushState({ route: routeId }, '', targetUrl.href);
      }
    }

    // Scroll to top (unless it's a back navigation with scroll restoration)
    if (!isBack) {
      window.scrollTo(0, 0);
    }

    // Clean up any stuck scroll-blocking styles from modals/popups that didn't close properly
    if (!document.body.classList.contains('modal-open') &&
        !document.body.classList.contains('sheet-open') &&
        !document.body.classList.contains('popup-open')) {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
    }

    // Wait for next frame to ensure styles are parsed and applied
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    // Show content with transition
    container.classList.remove('loading');
    container.classList.add('loaded');

    // Apply enter transition
    if (isBack) {
      await applyBackTransition(container, 'in');
    } else {
      await applyTransition(container, 'in');
    }

    // Ensure data is loaded before initializing page
    // This is critical for SPA navigation to have images and prices available
    if (typeof window.ensureDataLoaded === 'function') {
      await window.ensureDataLoaded();
    }

    // Load and execute page scripts
    await loadScripts(scripts);

    // Initialize new page
    await initNewPage(routeId, fullRouteKey);

    // Restore scroll position for back navigation
    if (isBack) {
      const savedY = scrollPositions.get(fullRouteKey);
      if (savedY !== undefined) {
        requestAnimationFrame(() => window.scrollTo(0, savedY));
      }
    }

    // Update header button visibility
    if (typeof window.setupButtonVisibility === 'function') {
      window.setupButtonVisibility();
    }
    if (typeof window.updateActivePageState === 'function') {
      window.updateActivePageState();
    }
    // Re-initialize header search for the new page context
    if (typeof window.initHeaderSearch === 'function') {
      window.initHeaderSearch();
    }

    // Update bottom nav active state
    const bottomNavButtons = document.querySelectorAll('.bottom-nav-button');
    bottomNavButtons.forEach(btn => btn.classList.remove('active-page'));

    const activeSelector = getActiveNavSelector(routeId);
    if (activeSelector) {
      document.querySelectorAll(activeSelector).forEach(btn => {
        btn.classList.add('active-page');
      });
    }

  } catch (err) {
    console.error('Navigation error:', err);
    // Fallback to regular navigation
    window.location.href = url;
  } finally {
    isNavigating = false;
    hideProgressBar();
    // Process any back/forward navigation that arrived while we were busy
    if (pendingPopstate) {
      const pending = pendingPopstate;
      pendingPopstate = null;
      navigate(pending.href, { fromPopState: true, isBack: pending.isBack });
    }
  }
};

/**
 * Get nav selector for active state based on route
 */
const getActiveNavSelector = (routeId) => {
  const routeMap = {
    '/': '.home-toggle-button-mobile',
    '/customers': '.customers-toggle-button-header, .customers-toggle-button-mobile',
    '/picker': '.picker-toggle-button-header, .picker-toggle-button-mobile',
    '/favorites': '.favorites-toggle-button-header, .favorites-toggle-button-mobile',
    '/cart': '.cart-toggle-button-header, .cart-toggle-button-mobile'
  };

  return routeMap[routeId] || null;
};

/**
 * Check if a URL is navigable via SPA router
 */
const isInternalUrl = (url) => {
  try {
    const targetUrl = new URL(url, window.location.origin);

    // Must be same origin
    if (targetUrl.origin !== window.location.origin) {
      return false;
    }

    // Skip anchors
    if (url.startsWith('#')) {
      return false;
    }

    // Skip special protocols
    if (url.startsWith('mailto:') || url.startsWith('tel:') || url.startsWith('javascript:')) {
      return false;
    }

    // Skip file downloads
    const downloadExtensions = ['.pdf', '.zip', '.doc', '.docx', '.xls', '.xlsx'];
    if (downloadExtensions.some(ext => targetUrl.pathname.endsWith(ext))) {
      return false;
    }

    // Skip admin pages
    if (targetUrl.pathname.startsWith('/admin')) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
};

/**
 * Handle link clicks for SPA navigation
 */
const handleLinkClick = (e) => {
  // Ignore if modifier keys are pressed (open in new tab)
  if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) {
    return;
  }

  // Ignore non-left clicks
  if (e.button !== 0) {
    return;
  }

  // Find the link element
  const link = e.target.closest('a');
  if (!link) return;

  // Skip if explicitly marked
  if (link.hasAttribute('data-no-router')) {
    return;
  }

  // Skip if target is new window/tab
  if (link.target === '_blank') {
    return;
  }

  // Skip download links
  if (link.hasAttribute('download')) {
    return;
  }

  const href = link.getAttribute('href');
  if (!href) return;

  // Check if it's an internal URL
  if (!isInternalUrl(href)) {
    return;
  }

  // Prevent default and navigate
  e.preventDefault();

  // Show progress bar immediately on click
  showProgressBar();

  // Trigger haptic feedback — 'selection' matches the feel of switching pages
  if (typeof window.triggerHaptic === 'function') {
    window.triggerHaptic('selection');
  }

  navigate(href);
};

/**
 * Handle browser back/forward buttons
 */
const handlePopState = (e) => {
  showProgressBar();

  if (isNavigating) {
    // Queue so it runs after current navigation finishes
    pendingPopstate = { href: window.location.href, isBack: true };
    return;
  }

  navigate(window.location.href, {
    fromPopState: true,
    isBack: true
  });
};

/**
 * Handle form submissions (prevent SPA routing for forms)
 */
const handleFormSubmit = (e) => {
  // Forms should submit normally - no SPA intervention
  // This handler exists just to document the behavior
};

/**
 * Register a page handler
 */
export const registerPage = (route, handler) => {
  // Normalize route
  if (route !== '/' && route.endsWith('/')) {
    route = route.slice(0, -1);
  }

  pageRegistry.set(route, handler);
};

/**
 * Initialize the SPA router
 */
export const initRouter = () => {
  // Clean up any stuck scroll-blocking styles from previous sessions
  // (e.g., if page was refreshed while modal was open)
  if (!document.body.classList.contains('modal-open') &&
      !document.body.classList.contains('sheet-open') &&
      !document.body.classList.contains('popup-open')) {
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.top = '';
  }

  // Set initial page
  currentPage = getRouteId(window.location.pathname);
  currentFullRouteKey = getFullRouteKey(window.location.href);

  // Replace current state with route info
  history.replaceState({ route: currentPage }, '', window.location.href);

  // Take over scroll restoration — we handle it ourselves in navigate()
  history.scrollRestoration = 'manual';

  // Listen for link clicks
  document.addEventListener('click', handleLinkClick);

  // Listen for browser navigation
  window.addEventListener('popstate', handlePopState);

  // Listen for form submissions (optional: could intercept for AJAX)
  document.addEventListener('submit', handleFormSubmit);

  // Dispatch ready event
  window.dispatchEvent(new CustomEvent('spa:ready', {
    detail: { route: currentPage }
  }));
};

/**
 * Smooth navigate function - replacement for the old one
 * Now uses SPA routing
 */
export const smoothNavigate = (url, useViewTransition = true) => {
  if (isInternalUrl(url)) {
    // Show progress bar IMMEDIATELY for instant user feedback
    showProgressBar();
    navigate(url);
  } else {
    // External URL - use regular navigation
    window.location.href = url;
  }
};

// Make functions globally available
window.smoothNavigate = smoothNavigate;
window.spaNavigate = navigate;
window.registerPage = registerPage;

export default {
  navigate,
  initRouter,
  registerPage,
  smoothNavigate
};
