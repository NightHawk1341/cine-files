// ============================================================
// HEADER MODULE
// Persistent element across all pages
// ============================================================

// ============================================================
// TELEGRAM CONTEXT MENU BLOCKING
// Disable right-click/long-press context menu when viewed in Telegram
// ============================================================

/**
 * Check if the site is being viewed in Telegram's in-app browser.
 * Checks window.isInsideTelegram (set by utils.js) first, then falls back to a
 * direct SDK check that works before utils.js loads, then UA as a last resort.
 * @returns {boolean}
 */
function isTelegramBrowser() {
  if (window.isInsideTelegram?.()) return true;
  // Direct SDK check: telegram-web-app.js loads synchronously before all other
  // scripts, so window.Telegram.WebApp is available here even before utils.js runs.
  const tg = window.Telegram?.WebApp;
  if (tg && ((tg.initData && tg.initData.length > 0) || (tg.platform && tg.platform !== 'unknown' && tg.platform !== ''))) return true;
  const ua = navigator.userAgent.toLowerCase();
  return ua.includes('telegram') || ua.includes('tdesktop');
}

/**
 * Disable context menu in all mini-app environments (Telegram, VK, MAX).
 * Prevents right-click, long-press, and middle-click context menus on all elements
 * so users cannot see internal URLs by long-pressing links or images.
 */
function disableTelegramContextMenu() {
  // VK: URL has vk_app_id param (reliable even before vkBridge loads asynchronously)
  const inVK = window.isVKMiniApp?.() || window.location.search.includes('vk_app_id');
  // MAX: window.WebApp.InitData is set by the synchronously-loaded max-web-app.js SDK
  const inMAX = window.isMAXMiniApp?.() || (window.WebApp?.InitData?.length > 0);
  if (!isTelegramBrowser() && !inVK && !inMAX) return;

  // Prevent context menu on right-click and long-press on all elements
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    return false;
  }, { capture: true, passive: false });

  // Prevent middle-click paste menu (auxclick with button 1)
  document.addEventListener('auxclick', (e) => {
    if (e.button === 1) {
      e.preventDefault();
      return false;
    }
  }, { capture: true, passive: false });

  // Set attribute for CSS -webkit-touch-callout suppression (global.css)
  document.documentElement.setAttribute('data-miniapp', 'true');
  // Keep data-telegram for backward compat with any existing CSS selectors
  if (isTelegramBrowser()) document.documentElement.setAttribute('data-telegram', 'true');
}

// Initialize Telegram context menu blocking immediately
disableTelegramContextMenu();

// Expose detection function globally for other modules
window.isTelegramBrowser = isTelegramBrowser;

// ============================================================

/**
 * Initialize and inject header HTML into the page
 */
function initHeader() {
  // Check auth state immediately to set correct initial icon display
  const isLoggedIn = Boolean(localStorage.getItem('tributary_accessToken'));
  const loginIconDisplay = isLoggedIn ? 'none' : 'block';
  const profileIconDisplay = isLoggedIn ? 'block' : 'none';

  const headerHTML = `
  <div class="header">

    <div class="header-left-buttons">

      <button class="header-back-button" id="header-back-btn" title="Назад">
        <svg width="20" height="20"><use href="#arrow-left"></use></svg>
      </button>

      <button class="header-burger-button" id="header-burger-btn" title="Каталоги">
        <svg width="20" height="20"><use href="#burger-menu"></use></svg>
      </button>

    </div>

    <div class="header-wrapper">

      <!-- Left icon buttons group -->
      <div class="header-icon-buttons-left desktop-only">
        <!-- Opens customers page -->
        <a href="/customers" class="header-icon-button customers-toggle-button-header">
          <svg width="12" height="12" class="header-icon"><use href="#gallery"></use></svg>
          <span class="button-text">Покупатели</span>
        </a>

        <!-- Opens picker page -->
        <a href="/picker" class="header-icon-button picker-toggle-button-header">
          <svg width="12" height="12" class="header-icon"><use href="#picker"></use></svg>
          <span class="button-text">Подборщик</span>
        </a>
      </div>

      <!-- Centered logo group (fixed width) -->
      <div class="header-logo-wrapper">

        <!-- Header button (leads to main page) -->
        <a href="/" class="header-logo-button" title="На главную">

          <!-- Header logo (changes with CSS for screen width) -->
          <div class="header-logo">
            <svg class="header-logo header-logo-full" width="90" height="20"><use href="#logo-full"></use></svg>
            <svg class="header-logo header-logo-short" width="80" height="20"><use href="#logo-short"></use></svg>
            <svg class="header-logo header-logo-mini" width="20" height="20"><use href="#logo-mini"></use></svg>
          </div>

        </a>

        <!-- Beta badge (only visible on main page) -->
        <div class="beta main-page-only">бета</div>

        <!-- Header search button (only visible on non-main pages) -->
        <div class="header-search-container non-main-page-only">
          <button class="header-search-button btn-filter" title="Поиск">
            <svg width="16" height="16" class="filter-icon"><use href="#search"></use></svg>
          </button>
          <div class="header-search-dropdown">
            <div class="header-search-input-wrapper">
              <input type="text" class="header-search-input" placeholder="Поиск товаров..." />
              <button class="header-search-clear" title="Очистить">
                <svg width="9" height="9"><use href="#x"></use></svg>
              </button>
            </div>
            <div class="header-search-results"></div>
          </div>
        </div>

      </div>

      <!-- Right icon buttons group -->
      <div class="header-icon-buttons-right desktop-only">
        <!-- Opens favorites page -->
        <a href="/favorites" class="header-icon-button favorites-toggle-button-header">
          <span class="header-icon-count-wrap">
            <svg width="12" height="12" class="header-icon"><use href="#favorite"></use></svg>
            <span class="favorites-count-header"></span>
          </span>
          <span class="button-text">Избранное</span>
        </a>

        <!-- Opens cart page -->
        <a href="/cart" class="header-icon-button cart-toggle-button-header">
          <span class="header-icon-count-wrap">
            <svg width="12" height="12" class="header-icon"><use href="#shopping-basket"></use></svg>
            <span class="cart-count-header"></span>
          </span>
          <span class="button-text">Корзина</span>
        </a>
      </div>

    </div>


    <div class="header-right-buttons">

      <button class="header-gear-button" id="header-gear-btn" title="Настройки">
        <svg width="20" height="20"><use href="#gear"></use></svg>
      </button>

      <a href="/profile" class="header-profile-button" id="header-profile-btn" title="Профиль">
        <span class="header-profile-icon-wrap">
          <svg class="profile-btn-login-icon" width="20" height="20" style="display: ${loginIconDisplay};"><use href="#arrow-forward-heavy"></use></svg>
          <svg class="profile-btn-icon" width="20" height="20" style="display: ${profileIconDisplay};"><use href="#user-circle-outline"></use></svg>
          <span class="profile-count-header"></span>
        </span>
      </a>

    </div>

  </div>
  `;

  // Insert header at the beginning of body
  document.body.insertAdjacentHTML('afterbegin', headerHTML);

  // Set up button visibility based on current page
  setupButtonVisibility();

  // Add navigation functionality
  setupHeaderNavigation();

  // Initialize scroll behavior now that header DOM exists
  if (typeof initMobileHeaderScrollBehavior === 'function') {
    initMobileHeaderScrollBehavior();
  }
}

/**
 * Setup FAQ/Back button visibility based on current page
 */
function setupButtonVisibility() {
  const mainPageOnlyElements = document.querySelectorAll('.main-page-only');
  const nonMainPageOnlyElements = document.querySelectorAll('.non-main-page-only');

  // Check if we're on the main page (root or /index.html)
  const isMainPage = window.location.pathname === '/' ||
                     window.location.pathname === '/index.html' ||
                     window.location.pathname === '';

  // Pages that show the beta badge instead of the search button
  const isCheckoutPage = window.location.pathname === '/checkout' ||
                         window.location.pathname === '/checkout.html';
  const showBetaBadge = isMainPage || isCheckoutPage;

  // Batch all DOM updates in a single animation frame to prevent layout thrashing
  requestAnimationFrame(() => {
    if (showBetaBadge) {
      // Show beta badge, hide search
      mainPageOnlyElements.forEach(el => el.style.display = '');
      nonMainPageOnlyElements.forEach(el => el.style.display = 'none');
    } else {
      // Hide beta badge, show search
      mainPageOnlyElements.forEach(el => el.style.display = 'none');
      nonMainPageOnlyElements.forEach(el => el.style.display = '');
    }

    // Set active state for current page
    updateActivePageState();
  });
}

/**
 * Update active state for current page navigation buttons
 */
function updateActivePageState() {
  const pathname = window.location.pathname;

  // Remove all active states
  document.querySelectorAll('.header-icon-button, .bottom-nav-button, #header-profile-btn').forEach(btn => {
    btn.classList.remove('active-page');
  });

  // Add active state based on current page
  let selector = null;
  if (pathname === '/' || pathname === '/index.html' || pathname === '') {
    // Main page - highlight home button in bottom nav
    const homeBtn = document.querySelector('.home-toggle-button-mobile');
    if (homeBtn) homeBtn.classList.add('active-page');
    return;
  } else if (pathname.includes('/customers')) {
    selector = '.customers-toggle-button-header, .customers-toggle-button-mobile';
  } else if (pathname.includes('/picker')) {
    selector = '.picker-toggle-button-header, .picker-toggle-button-mobile';
  } else if (pathname.includes('/favorites')) {
    selector = '.favorites-toggle-button-header, .favorites-toggle-button-mobile';
  } else if (pathname.includes('/cart')) {
    selector = '.cart-toggle-button-header, .cart-toggle-button-mobile';
  } else if (pathname.includes('/profile')) {
    // Profile is special - it's in header but different class
    const profileBtn = document.getElementById('header-profile-btn');
    if (profileBtn) profileBtn.classList.add('active-page');
    return;
  }

  if (selector) {
    document.querySelectorAll(selector).forEach(btn => {
      btn.classList.add('active-page');
    });
  }
}

// Expose functions globally
window.updateActivePageState = updateActivePageState;
window.setupButtonVisibility = setupButtonVisibility;

/**
 * Setup navigation for header buttons
 * Uses preventDefault for left-clicks with smooth navigation
 * Allows MMB/RMB to open in new tabs naturally
 */
function setupHeaderNavigation() {
  // Helper to handle link clicks with smooth navigation
  const handleLinkClick = (e, path) => {
    // Only prevent default for left-clicks (button 0)
    // Allow middle-click (button 1) and right-click (button 2) to work naturally
    if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault();
      if (typeof smoothNavigate === 'function') {
        smoothNavigate(path);
      } else {
        window.location.href = path;
      }
    }
  };

  // Logo button - go to home
  const logoBtn = document.querySelector('.header-logo-button');
  if (logoBtn) {
    logoBtn.addEventListener('click', (e) => handleLinkClick(e, '/'));
  }

  // Back button - go back in history
  const backBtn = document.getElementById('header-back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      window.history.back();
    });
  }

  // Customers button - navigate to customers page
  const customersBtn = document.querySelector('.customers-toggle-button-header');
  if (customersBtn) {
    customersBtn.addEventListener('click', (e) => handleLinkClick(e, '/customers'));
  }

  // Picker button - navigate to picker page
  const pickerBtn = document.querySelector('.picker-toggle-button-header');
  if (pickerBtn) {
    pickerBtn.addEventListener('click', (e) => handleLinkClick(e, '/picker'));
  }

  // Favorites button - navigate to favorites page
  const favoritesBtn = document.querySelector('.favorites-toggle-button-header');
  if (favoritesBtn) {
    favoritesBtn.addEventListener('click', (e) => handleLinkClick(e, '/favorites'));
  }

  // Cart button - navigate to cart page
  const cartBtn = document.querySelector('.cart-toggle-button-header');
  if (cartBtn) {
    cartBtn.addEventListener('click', (e) => handleLinkClick(e, '/cart'));
  }

  // Profile button - navigate to profile page
  const profileBtn = document.getElementById('header-profile-btn');
  if (profileBtn) {
    profileBtn.addEventListener('click', (e) => handleLinkClick(e, '/profile'));
  }

  // Burger button - toggle catalog menu
  const burgerBtn = document.getElementById('header-burger-btn');
  if (burgerBtn) {
    burgerBtn.addEventListener('click', () => {
      if (typeof window.toggleCatalogMenu === 'function') {
        window.toggleCatalogMenu();
      }
    });
  }

  // Gear button - toggle settings menu
  const gearBtn = document.getElementById('header-gear-btn');
  if (gearBtn) {
    gearBtn.addEventListener('click', () => {
      if (typeof window.toggleSettingsMenu === 'function') {
        window.toggleSettingsMenu();
      }
    });
  }
}

/**
 * Update profile button display based on auth state
 * Call this function after auth state changes
 */
function updateProfileButton() {
  const loginIcon = document.querySelector('.profile-btn-login-icon');
  const profileIcon = document.querySelector('.profile-btn-icon');

  // Check if user is logged in (check localStorage)
  const isLoggedIn = Boolean(localStorage.getItem('tributary_accessToken'));

  if (loginIcon && profileIcon) {
    if (isLoggedIn) {
      // Logged in: show profile icon, hide login arrow
      loginIcon.style.display = 'none';
      profileIcon.style.display = 'block';
    } else {
      // Not logged in: show login arrow, hide profile icon
      loginIcon.style.display = 'block';
      profileIcon.style.display = 'none';
    }
  }
}

// Auto-initialize when script loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initHeader);
} else {
  initHeader();
}

// Update profile button when auth state changes
window.addEventListener('storage', (e) => {
  if (e.key === 'tributary_accessToken') {
    updateProfileButton();
  }
});

// Check auth state on load (with small delay to ensure localStorage is ready)
setTimeout(() => {
  updateProfileButton();
}, 100);

// Also check when page becomes visible (e.g., after navigation)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    updateProfileButton();
  }
});

// Check periodically to catch any missed updates (every 2 seconds)
setInterval(() => {
  updateProfileButton();
}, 2000);

// Expose function globally so other modules can call it
window.updateProfileButton = updateProfileButton;

/**
 * Fetch and display the profile updates counter.
 * Counts order status changes and new admin feedback responses since the user
 * last visited their profile page.
 */
async function updateProfileCounter() {
  const profileBtn = document.getElementById('header-profile-btn');
  const counter = profileBtn?.querySelector('.profile-count-header');
  if (!profileBtn || !counter) return;

  const token = localStorage.getItem('tributary_accessToken');
  if (!token) {
    profileBtn.classList.remove('has-profile-count');
    counter.textContent = '';
    return;
  }

  const since = localStorage.getItem('tributary_profileLastSeen') || '';
  const url = since
    ? `/api/profile/updates-count?since=${encodeURIComponent(since)}`
    : '/api/profile/updates-count';

  try {
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      profileBtn.classList.remove('has-profile-count');
      counter.textContent = '';
      return;
    }

    const data = await response.json();
    const count = data.count || 0;

    if (count > 0) {
      counter.textContent = count > 99 ? '99+' : String(count);
      profileBtn.classList.add('has-profile-count');
    } else {
      counter.textContent = '';
      profileBtn.classList.remove('has-profile-count');
    }
  } catch (err) {
    console.error('Error fetching profile updates count:', err);
    profileBtn.classList.remove('has-profile-count');
    counter.textContent = '';
  }
}

/**
 * Mark profile as seen — call when user visits the profile page.
 * Saves current timestamp and hides the counter immediately.
 */
function markProfileAsSeen() {
  localStorage.setItem('tributary_profileLastSeen', new Date().toISOString());
  const profileBtn = document.getElementById('header-profile-btn');
  const counter = profileBtn?.querySelector('.profile-count-header');
  if (profileBtn) profileBtn.classList.remove('has-profile-count');
  if (counter) counter.textContent = '';
}

// Backward compat alias (profile/orders.js still calls markOrdersAsSeen)
function markOrdersAsSeen() { markProfileAsSeen(); }

// Run on page load
setTimeout(() => { updateProfileCounter(); }, 500);

// Re-run when auth state changes (login / logout)
window.addEventListener('authStateChanged', () => { updateProfileCounter(); });

// Expose globally
window.updateProfileCounter = updateProfileCounter;
window.markProfileAsSeen = markProfileAsSeen;
window.markOrdersAsSeen = markOrdersAsSeen;

// ============================================================
// HEADER SEARCH (non-main pages)
// ============================================================

let headerSearchTimeout = null;
let headerSearchProducts = null;

// ============================================================
// RECENT SEARCHES MANAGEMENT
// ============================================================

const RECENT_SEARCHES_KEY = 'tributary_recentSearches';
const MAX_RECENT_SEARCHES = 5;

/**
 * Get recent searches from localStorage
 */
function getRecentSearches() {
  try {
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.error('Error loading recent searches:', e);
    return [];
  }
}

/**
 * Save a search query to recent searches
 */
function saveRecentSearch(query) {
  if (!query || query.trim().length < 2) return;

  try {
    let searches = getRecentSearches();
    const trimmedQuery = query.trim();

    // Remove if already exists
    searches = searches.filter(s => s.toLowerCase() !== trimmedQuery.toLowerCase());

    // Add to beginning
    searches.unshift(trimmedQuery);

    // Limit to max
    searches = searches.slice(0, MAX_RECENT_SEARCHES);

    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(searches));
  } catch (e) {
    console.error('Error saving recent search:', e);
  }
}

/**
 * Clear all recent searches
 */
function clearRecentSearches() {
  try {
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  } catch (e) {
    console.error('Error clearing recent searches:', e);
  }
}

/**
 * Show recent searches in desktop dropdown
 */
function showRecentSearches(searchResults) {
  if (!searchResults) return;

  const recentSearches = getRecentSearches();

  if (recentSearches.length === 0) {
    searchResults.innerHTML = '';
    return;
  }

  const searchesHTML = recentSearches.map(query => `
    <div class="header-search-recent-item" data-query="${query.replace(/"/g, '&quot;')}">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"></circle>
        <path d="m21 21-4.35-4.35"></path>
      </svg>
      <span class="header-search-recent-query">${query}</span>
    </div>
  `).join('');

  searchResults.innerHTML = `
    <div class="header-search-recent-header">
      <span>Недавние запросы</span>
      <button class="header-search-recent-clear">Очистить</button>
    </div>
    <div class="header-search-recent-list">${searchesHTML}</div>
  `;

  // Add click handlers for recent search items
  searchResults.querySelectorAll('.header-search-recent-item').forEach(item => {
    item.addEventListener('click', () => {
      const query = item.dataset.query;
      const searchInput = document.querySelector('.header-search-input');
      if (searchInput) {
        searchInput.value = query;
        searchInput.dispatchEvent(new Event('input'));
        searchInput.focus();
      }
    });
  });

  // Add click handler for clear button
  const clearBtn = searchResults.querySelector('.header-search-recent-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      clearRecentSearches();
      searchResults.innerHTML = '';
    });
  }
}

/**
 * Show recent searches in mobile search sheet
 */
function showRecentSearchesMobile(resultsContainer, goMainBtn) {
  if (!resultsContainer) return;

  const recentSearches = getRecentSearches();

  if (recentSearches.length === 0) {
    resultsContainer.innerHTML = '';
    goMainBtn.style.display = 'none';
    return;
  }

  const searchesHTML = recentSearches.map(query => `
    <div class="mobile-search-recent-item" data-query="${query.replace(/"/g, '&quot;')}">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"></circle>
        <path d="m21 21-4.35-4.35"></path>
      </svg>
      <span class="mobile-search-recent-query">${query}</span>
    </div>
  `).join('');

  resultsContainer.innerHTML = `
    <div class="mobile-search-recent-header">
      <span>Недавние запросы</span>
      <button class="mobile-search-recent-clear">Очистить</button>
    </div>
    <div class="mobile-search-recent-list">${searchesHTML}</div>
  `;

  goMainBtn.style.display = 'none';

  // Add click handlers for recent search items
  resultsContainer.querySelectorAll('.mobile-search-recent-item').forEach(item => {
    item.addEventListener('click', () => {
      const query = item.dataset.query;
      const input = document.querySelector('.mobile-search-sheet-input');
      if (input) {
        input.value = query;
        input.dispatchEvent(new Event('input'));
        input.focus();
      }
    });
  });

  // Add click handler for clear button
  const clearBtn = resultsContainer.querySelector('.mobile-search-recent-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      clearRecentSearches();
      resultsContainer.innerHTML = '';
    });
  }
}

/**
 * Initialize header search functionality
 */
function initHeaderSearch() {
  const container = document.querySelector('.header-search-container');
  const searchButton = document.querySelector('.header-search-button');
  const searchDropdown = document.querySelector('.header-search-dropdown');
  const searchInput = document.querySelector('.header-search-input');
  const searchClear = document.querySelector('.header-search-clear');
  const searchResults = document.querySelector('.header-search-results');

  if (!searchButton || !searchDropdown) return;

  // Prevent duplicate initialization — track on the element itself so that
  // if the header is re-rendered by SPA navigation the new element reinitializes
  if (searchButton.dataset.searchInitialized) return;
  searchButton.dataset.searchInitialized = 'true';

  // Toggle dropdown on button click
  searchButton.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = searchDropdown.classList.contains('open');

    if (isOpen) {
      closeHeaderSearch();
    } else {
      openHeaderSearch();
    }
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (container && !container.contains(e.target)) {
      if (searchDropdown.classList.contains('open')) {
        closeHeaderSearch();
      }
    }
  });

  // Handle input
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const query = searchInput.value.trim();

      clearTimeout(headerSearchTimeout);

      if (query.length === 0) {
        // Show recent searches when input is empty
        showRecentSearches(searchResults);
        return;
      }

      if (query.length < 2) {
        searchResults.innerHTML = '';
        return;
      }

      headerSearchTimeout = setTimeout(() => {
        performHeaderSearch(query);
      }, 300);
    });

    // Handle Enter key - go to main page with search
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const query = searchInput.value.trim();
        if (query.length >= 2) {
          saveRecentSearch(query);
          navigateToMainWithSearch(query);
        }
      } else if (e.key === 'Escape') {
        closeHeaderSearch();
      }
    });
  }

  // Clear button
  if (searchClear) {
    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      searchResults.innerHTML = '';
      searchInput.focus();
    });
  }

  // Auto-switch between mobile/desktop search on resize
  let searchResizeTimeout = null;
  let lastSearchWasMobile = window.innerWidth <= 768;

  window.addEventListener('resize', () => {
    clearTimeout(searchResizeTimeout);
    searchResizeTimeout = setTimeout(() => {
      const isMobile = window.innerWidth <= 768;
      if (isMobile === lastSearchWasMobile) return;
      lastSearchWasMobile = isMobile;

      const isDesktopOpen = searchDropdown?.classList.contains('open');

      if (isMobile && isDesktopOpen) {
        // Transfer query from desktop to mobile
        const query = searchInput?.value || '';
        searchDropdown.classList.remove('open');
        openMobileSearchSheet();
        // Restore query in mobile sheet input
        setTimeout(() => {
          const mobileInput = document.querySelector('.mobile-search-sheet-input');
          if (mobileInput && query) {
            mobileInput.value = query;
            mobileInput.dispatchEvent(new Event('input'));
          }
        }, 50);
      } else if (!isMobile && mobileSearchSheetOpen) {
        // Transfer query from mobile to desktop
        const mobileInput = document.querySelector('.mobile-search-sheet-input');
        const query = mobileInput?.value || '';
        closeMobileSearchSheet();
        // Wait for mobile sheet close animation, then open desktop
        setTimeout(() => {
          openDesktopSearchDropdown();
          const searchButton = document.querySelector('.header-search-button');
          if (searchButton) {
            searchButton.classList.add('active');
            searchButton.classList.remove('has-pending');
          }
          // Restore query in desktop input
          if (searchInput && query) {
            searchInput.value = query;
            searchInput.dispatchEvent(new Event('input'));
          }
        }, 350);
      }
    }, 150);
  });
}

function openHeaderSearch() {
  const searchButton = document.querySelector('.header-search-button');

  // Check if mobile (use bottom sheet) or desktop (use dropdown)
  const isMobile = window.innerWidth <= 768;

  if (isMobile) {
    openMobileSearchSheet();
  } else {
    openDesktopSearchDropdown();
  }

  searchButton.classList.add('active');
  searchButton.classList.remove('has-pending');
}

function openDesktopSearchDropdown() {
  const searchDropdown = document.querySelector('.header-search-dropdown');
  const searchInput = document.querySelector('.header-search-input');
  const searchResults = document.querySelector('.header-search-results');

  searchDropdown.classList.add('open');

  // Load products if not loaded
  if (!headerSearchProducts) {
    loadHeaderSearchProducts();
  }

  // If there's existing input, trigger search
  if (searchInput && searchInput.value.trim().length >= 2) {
    performHeaderSearch(searchInput.value.trim());
  } else if (searchInput && searchInput.value.trim().length === 0) {
    // Show recent searches when input is empty
    showRecentSearches(searchResults);
  }

  // Focus input after animation
  setTimeout(() => {
    if (searchInput) searchInput.focus();
  }, 100);
}

let mobileSearchSheetOpen = false;
let mobileSearchSheetCleanup = null;
let mobileSearchSheetScrollY = 0;

function openMobileSearchSheet() {
  // If state says open but DOM element is gone (e.g. removed by SPA router), reset state
  if (mobileSearchSheetOpen && !document.getElementById('mobile-search-sheet-overlay')) {
    mobileSearchSheetOpen = false;
    document.documentElement.style.overflow = '';
    document.documentElement.style.overscrollBehavior = '';
    document.body.style.overflow = '';
  }
  if (mobileSearchSheetOpen) return;
  mobileSearchSheetOpen = true;

  // Store current scroll position to prevent jump when keyboard opens
  mobileSearchSheetScrollY = window.scrollY;

  // Load products if not loaded
  if (!headerSearchProducts) {
    loadHeaderSearchProducts();
  }

  // Create overlay
  const overlay = document.createElement('div');
  overlay.className = 'mobile-search-sheet-overlay';
  overlay.id = 'mobile-search-sheet-overlay';

  // Create backdrop
  const backdrop = document.createElement('div');
  backdrop.className = 'mobile-search-sheet-backdrop';
  backdrop.addEventListener('click', closeMobileSearchSheet);
  backdrop.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  // Create sheet
  const sheet = document.createElement('div');
  sheet.className = 'mobile-search-sheet';
  sheet.id = 'mobile-search-sheet';

  sheet.innerHTML = `
    <div class="mobile-search-sheet-handle"><span></span></div>
    <div class="mobile-search-sheet-search">
      <input type="text" class="mobile-search-sheet-input" placeholder="Поиск товаров..." autofocus>
      <button class="mobile-search-sheet-clear" title="Очистить">
        <svg width="12" height="12"><use href="#x"></use></svg>
      </button>
    </div>
    <div class="mobile-search-sheet-results"></div>
    <button class="mobile-search-sheet-go-main" style="display: none;">
      Показать все на главной
      <svg width="14" height="14"><use href="#arrow-right"></use></svg>
    </button>
  `;

  overlay.appendChild(backdrop);
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  // Setup swipe to dismiss
  setupMobileSearchSheetSwipe(sheet, overlay);

  // Setup search functionality
  const input = sheet.querySelector('.mobile-search-sheet-input');
  const clearBtn = sheet.querySelector('.mobile-search-sheet-clear');
  const resultsContainer = sheet.querySelector('.mobile-search-sheet-results');
  const goMainBtn = sheet.querySelector('.mobile-search-sheet-go-main');
  let searchTimeout = null;

  input.addEventListener('input', () => {
    const query = input.value.trim();
    clearTimeout(searchTimeout);

    if (query.length === 0) {
      // Show recent searches when input is empty
      showRecentSearchesMobile(resultsContainer, goMainBtn);
      return;
    }

    if (query.length < 2) {
      resultsContainer.innerHTML = '';
      goMainBtn.style.display = 'none';
      return;
    }

    searchTimeout = setTimeout(() => {
      performMobileSearch(query, resultsContainer, goMainBtn);
    }, 300);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const query = input.value.trim();
      if (query.length >= 2) {
        saveRecentSearch(query);
        closeMobileSearchSheet();
        navigateToMainWithSearch(query);
      }
    } else if (e.key === 'Escape') {
      closeMobileSearchSheet();
    }
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    resultsContainer.innerHTML = '';
    goMainBtn.style.display = 'none';
    input.focus();
  });

  goMainBtn.addEventListener('click', () => {
    const query = input.value.trim();
    if (query.length >= 2) {
      saveRecentSearch(query);
    }
    closeMobileSearchSheet();
    if (query.length >= 2) {
      navigateToMainWithSearch(query);
    }
  });

  // Show recent searches on open if input is empty
  showRecentSearchesMobile(resultsContainer, goMainBtn);

  // Animate in
  requestAnimationFrame(() => {
    overlay.classList.add('active');
    // Lock scroll without position:fixed to avoid collapsing page layout
    document.documentElement.style.overflow = 'hidden';
    document.documentElement.style.overscrollBehavior = 'none';
    document.body.style.overflow = 'hidden';
    // Add grain to backdrop (replaces page grain which gets hidden)
    if (typeof window.addBackdropGrain === 'function') {
      window.addBackdropGrain(backdrop);
    }
    input.focus();
  });

  // Escape key listener
  mobileSearchSheetCleanup = (e) => {
    if (e.key === 'Escape') {
      closeMobileSearchSheet();
    }
  };
  document.addEventListener('keydown', mobileSearchSheetCleanup);
}

function closeMobileSearchSheet() {
  if (!mobileSearchSheetOpen) return;

  // Always reset state, even if overlay was already removed (e.g. by SPA navigation)
  mobileSearchSheetOpen = false;
  document.documentElement.style.overflow = '';
  document.documentElement.style.overscrollBehavior = '';
  document.body.style.overflow = '';

  const overlay = document.getElementById('mobile-search-sheet-overlay');
  if (!overlay) return;

  // Remove backdrop grain
  const backdrop = overlay.querySelector('.mobile-search-sheet-backdrop');
  if (backdrop && typeof window.removeBackdropGrain === 'function') {
    window.removeBackdropGrain(backdrop);
  }

  // Animate out
  overlay.classList.remove('active');
  // Restore scroll lock
  document.documentElement.style.overflow = '';
  document.documentElement.style.overscrollBehavior = '';
  document.body.style.overflow = '';

  // Update button state
  const searchButton = document.querySelector('.header-search-button');
  if (searchButton) {
    searchButton.classList.remove('active');
  }

  // Remove after animation
  setTimeout(() => {
    overlay.remove();
  }, 300);

  // Cleanup
  if (mobileSearchSheetCleanup) {
    document.removeEventListener('keydown', mobileSearchSheetCleanup);
    mobileSearchSheetCleanup = null;
  }
}

function setupMobileSearchSheetSwipe(sheet, overlay) {
  let touchStartY = 0;
  let touchCurrentY = 0;
  let isDragging = false;
  let canDrag = false; // set in touchstart, checked in touchmove

  const handleTouchStart = (e) => {
    const results = sheet.querySelector('.mobile-search-sheet-results');
    const resultsScrollTop = results ? results.scrollTop : 0;
    const input = sheet.querySelector('.mobile-search-sheet-input');
    const fromHandle = !!e.target.closest('.mobile-search-sheet-handle');
    const keyboardHidden = document.activeElement !== input;

    // Allow drag from handle always, or from anywhere when not scrolled / keyboard hidden
    canDrag = fromHandle || resultsScrollTop <= 5 || keyboardHidden;

    if (canDrag) {
      touchStartY = e.touches[0].clientY;
      touchCurrentY = touchStartY;
      isDragging = false;
    }
  };

  const handleTouchMove = (e) => {
    if (!canDrag || touchStartY === 0) return;

    touchCurrentY = e.touches[0].clientY;
    const diff = touchCurrentY - touchStartY;

    // Only handle downward swipes
    if (diff > 0) {
      isDragging = true;
      const translateY = Math.min(diff * 0.5, 150);
      sheet.style.transform = `translateY(${translateY}px)`;
      sheet.style.transition = 'none';

      const opacity = Math.max(0.3, 1 - (diff / 400));
      const backdrop = overlay.querySelector('.mobile-search-sheet-backdrop');
      if (backdrop) backdrop.style.opacity = opacity;

      e.preventDefault();
    }
  };

  const handleTouchEnd = () => {
    const diff = touchCurrentY - touchStartY;

    sheet.style.transform = '';
    sheet.style.transition = '';
    const backdrop = overlay.querySelector('.mobile-search-sheet-backdrop');
    if (backdrop) {
      backdrop.style.opacity = '';
    }

    // Lower threshold (60px) so small sheets are easy to dismiss
    if (isDragging && diff > 60) {
      closeMobileSearchSheet();
    }

    touchStartY = 0;
    touchCurrentY = 0;
    isDragging = false;
    canDrag = false;
  };

  sheet.addEventListener('touchstart', handleTouchStart, { passive: true });
  sheet.addEventListener('touchmove', handleTouchMove, { passive: false });
  sheet.addEventListener('touchend', handleTouchEnd, { passive: true });
  sheet.addEventListener('touchcancel', handleTouchEnd, { passive: true });
}

// Levenshtein distance between two strings.
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// Returns true if each word in `query` (>= 4 chars) fuzzy-matches a word in `field`.
// Field words are stripped of punctuation so "Дюна." matches "дюну".
// Multi-word queries require every long-enough query word to match some field word.
function fuzzyMatchField(field, query) {
  if (!field) return false;
  const fieldWords = field.split(/\s+/).map(w => w.replace(/[.,!?;:'"«»()\-–—]/g, ''));
  const queryWords = query.split(/\s+/).filter(w => w.length >= 4);
  if (queryWords.length === 0) return false;
  return queryWords.every(qWord => {
    const maxDist = qWord.length <= 5 ? 1 : 2;
    return fieldWords.some(fWord => {
      if (Math.abs(fWord.length - qWord.length) > maxDist) return false;
      return levenshtein(fWord, qWord) <= maxDist;
    });
  });
}

function performMobileSearch(query, resultsContainer, goMainBtn) {
  if (!headerSearchProducts) {
    resultsContainer.innerHTML = '<div class="mobile-search-sheet-loading">Загрузка...</div>';
    loadHeaderSearchProducts().then(() => performMobileSearch(query, resultsContainer, goMainBtn));
    return;
  }

  const queryLower = query.toLowerCase();

  const results = headerSearchProducts
    .filter(product => {
      const title = product.title?.toLowerCase() || '';
      const alt = product.alt?.toLowerCase() || '';
      const keywords = product.key_word?.toLowerCase() || '';
      return title.includes(queryLower) || alt.includes(queryLower) || keywords.includes(queryLower) ||
             fuzzyMatchField(title, queryLower) || fuzzyMatchField(alt, queryLower) || fuzzyMatchField(keywords, queryLower);
    })
    .sort((a, b) => {
      const aExact = (a.title?.toLowerCase().includes(queryLower) || a.alt?.toLowerCase().includes(queryLower) || a.key_word?.toLowerCase().includes(queryLower)) ? 0 : 1;
      const bExact = (b.title?.toLowerCase().includes(queryLower) || b.alt?.toLowerCase().includes(queryLower) || b.key_word?.toLowerCase().includes(queryLower)) ? 0 : 1;
      return aExact - bExact;
    })
    .slice(0, 3); // Same limit as desktop

  if (results.length === 0) {
    resultsContainer.innerHTML = '<div class="mobile-search-sheet-empty">Ничего не найдено</div>';
    goMainBtn.style.display = 'none';
    return;
  }

  const resultsHTML = results.map(product => {
    const imageUrl = product.images?.[0]?.url || product.image || '';
    const imageSrc = imageUrl ? addImageSizeHeader(imageUrl, '100x0') : '';
    const productId = product.id;

    const isCustomProduct = product.id == 1;
    return `
      <div class="mobile-search-sheet-item-wrapper header-search-result-wrapper" data-product-id="${productId}">
        <div class="mobile-search-sheet-item-row">
          <a href="/product/${product.slug || product.id}" class="mobile-search-sheet-item" data-product-id="${productId}">
            ${imageSrc ?
              `<img src="${imageSrc}" alt="${product.title}" class="mobile-search-sheet-item-image" loading="lazy">` :
              `<div class="mobile-search-sheet-item-image"></div>`
            }
            <div class="mobile-search-sheet-item-info">
              <div class="mobile-search-sheet-item-title">${product.title}</div>
              <div class="mobile-search-sheet-item-subtitle">${product.genre || ''}</div>
            </div>
          </a>
          ${isCustomProduct ? '' : `<button class="header-search-add-btn" data-product-id="${productId}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <svg class="add-btn-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>`}
        </div>
        ${isCustomProduct ? '' : `<div class="header-search-format-dropdown" data-product-id="${productId}"></div>`}
      </div>
    `;
  }).join('');

  resultsContainer.innerHTML = resultsHTML;
  goMainBtn.style.display = 'flex';

  // Initialize format dropdowns (shared with desktop)
  initHeaderSearchFormatDropdowns(results);

  // Add click handlers for product links
  resultsContainer.querySelectorAll('.mobile-search-sheet-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const href = item.getAttribute('href');
      closeMobileSearchSheet();
      if (typeof smoothNavigate === 'function') {
        smoothNavigate(href);
      } else {
        window.location.href = href;
      }
    });
  });
}

function closeHeaderSearch() {
  const searchButton = document.querySelector('.header-search-button');
  const searchDropdown = document.querySelector('.header-search-dropdown');
  const searchInput = document.querySelector('.header-search-input');
  const searchResults = document.querySelector('.header-search-results');

  searchButton.classList.remove('active');
  searchDropdown.classList.remove('open');

  // Add pending state if there's unapplied input
  const query = searchInput?.value.trim() || '';
  if (query.length >= 2) {
    searchButton.classList.add('has-pending');
  } else {
    searchButton.classList.remove('has-pending');
  }

  // Clear results
  if (searchResults) {
    searchResults.innerHTML = '';
  }
}

/**
 * Load products for search
 */
async function loadHeaderSearchProducts() {
  try {
    const response = await fetch('/products?all=true');
    if (!response.ok) throw new Error('Failed to load products');

    const products = await response.json();
    // Filter to only show available products
    headerSearchProducts = products.filter(p =>
      p.status === 'available' || p.status === 'coming_soon'
    );
  } catch (error) {
    console.error('Error loading products for header search:', error);
    headerSearchProducts = [];
  }
}

/**
 * Perform search and display results
 */
function performHeaderSearch(query) {
  const searchResults = document.querySelector('.header-search-results');

  if (!searchResults || !headerSearchProducts) {
    if (!headerSearchProducts) {
      searchResults.innerHTML = '<div class="header-search-loading">Загрузка...</div>';
      loadHeaderSearchProducts().then(() => performHeaderSearch(query));
    }
    return;
  }

  const queryLower = query.toLowerCase();

  // Search in products
  const results = headerSearchProducts
    .filter(product => {
      const title = product.title?.toLowerCase() || '';
      const alt = product.alt?.toLowerCase() || '';
      const keywords = product.key_word?.toLowerCase() || '';
      return title.includes(queryLower) || alt.includes(queryLower) || keywords.includes(queryLower) ||
             fuzzyMatchField(title, queryLower) || fuzzyMatchField(alt, queryLower) || fuzzyMatchField(keywords, queryLower);
    })
    .sort((a, b) => {
      const aExact = (a.title?.toLowerCase().includes(queryLower) || a.alt?.toLowerCase().includes(queryLower) || a.key_word?.toLowerCase().includes(queryLower)) ? 0 : 1;
      const bExact = (b.title?.toLowerCase().includes(queryLower) || b.alt?.toLowerCase().includes(queryLower) || b.key_word?.toLowerCase().includes(queryLower)) ? 0 : 1;
      return aExact - bExact;
    })
    .slice(0, 3); // Limit to 3 results

  // Render results
  if (results.length === 0) {
    searchResults.innerHTML = '<div class="header-search-empty">Ничего не найдено</div>';
    return;
  }

  const resultsHTML = results.map(product => {
    const imageUrl = product.images?.[0]?.url || product.image || '';
    const imageSrc = imageUrl ? addImageSizeHeader(imageUrl, '100x0') : '';
    const productId = product.id;

    const isCustomProduct = product.id == 1;
    return `
      <div class="header-search-result-wrapper" data-product-id="${productId}">
        <div class="header-search-result-row">
          <a href="/product/${product.slug || product.id}" class="header-search-result-item">
            ${imageSrc ?
              `<img src="${imageSrc}" alt="${product.title}" class="header-search-result-image" loading="lazy">` :
              `<div class="header-search-result-image"></div>`
            }
            <div class="header-search-result-info">
              <div class="header-search-result-title">${product.title}</div>
              <div class="header-search-result-subtitle">${product.genre || ''}</div>
            </div>
          </a>
          ${isCustomProduct ? '' : `<button class="header-search-add-btn" data-product-id="${productId}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <svg class="add-btn-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>`}
        </div>
        ${isCustomProduct ? '' : `<div class="header-search-format-dropdown" data-product-id="${productId}"></div>`}
      </div>
    `;
  }).join('');

  // Add "see more" button
  const moreButton = `
    <button class="header-search-more" onclick="navigateToMainWithSearch('${query.replace(/'/g, "\\'")}')">
      Показать все результаты
      <svg width="12" height="12"><use href="#arrow-right"></use></svg>
    </button>
  `;

  searchResults.innerHTML = resultsHTML + moreButton;

  // Add click handlers for result items (using smooth navigation if available)
  searchResults.querySelectorAll('.header-search-result-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const href = item.getAttribute('href');
      // Clear input since user selected a product
      const searchInput = document.querySelector('.header-search-input');
      if (searchInput) searchInput.value = '';
      closeHeaderSearch();
      if (typeof smoothNavigate === 'function') {
        smoothNavigate(href);
      } else {
        window.location.href = href;
      }
    });
  });

  // Add format dropdown handlers for add buttons
  initHeaderSearchFormatDropdowns(results);
}

// ============================================================
// SELF-CONTAINED CART HELPERS FOR HEADER SEARCH
// window.addToCart / window.removeFromCart are only available on the
// main page (set by product-grid.js). These helpers work on every page.
// ============================================================

const _headerTriptychMap = {
  'A3 без рамки': '3 A3 без рамок',
  'A2 без рамки': '3 A2 без рамок',
  'A1 без рамки': '3 A1 без рамок',
  'A3 в рамке': '3 A3 в рамках',
  'A2 в рамке': '3 A2 в рамках'
};

function _headerDisplayProperty(product, format) {
  return product.triptych ? (_headerTriptychMap[format] || format) : format;
}

function _headerProductInCart(product) {
  if (!window.cart || !product) return false;
  const opts = window.formatOptions || [
    { value: 'A3 без рамки' }, { value: 'A2 без рамки' }, { value: 'A1 без рамки' },
    { value: 'A3 в рамке' }, { value: 'A2 в рамке' }
  ];
  return opts.some(opt => !!window.cart[`${product.id}_${_headerDisplayProperty(product, opt.value)}`]);
}

function _headerAddBtnTooltip(product) {
  return _headerProductInCart(product) ? 'Изменить формат' : 'Выбрать формат';
}

function _headerSaveCart() {
  try {
    localStorage.setItem('tributeCart', JSON.stringify(window.cart));
    window.dispatchEvent(new Event('cartUpdated'));
  } catch (e) {}
  if (localStorage.getItem('tributary_accessToken') && typeof window.syncCartToServer === 'function') {
    const variations = _getCartVariationsHeader();
    window.syncCartToServer(window.cart, variations).catch(() => {});
  }
}

function _headerAddToCart(product, format) {
  const dp = _headerDisplayProperty(product, format);
  const key = `${product.id}_${dp}`;
  if (!window.cart[key]) {
    const imageUrl = product.images?.[0]?.url || product.image || '';
    window.cart[key] = {
      productId: product.id,
      title: product.title,
      property: dp,
      quantity: 1,
      triptych: product.triptych || false,
      image: imageUrl,
      checked: true,
      addedAt: Date.now()
    };
  } else {
    window.cart[key].quantity++;
  }
  _headerSaveCart();
}

function _headerRemoveFromCart(product, format) {
  const dp = _headerDisplayProperty(product, format);
  const key = `${product.id}_${dp}`;
  if (window.cart[key]) {
    const removedItem = { ...window.cart[key] };
    const wasLastItem = window.cart[key].quantity === 1;

    if (window.cart[key].quantity > 1) {
      window.cart[key].quantity--;
      _headerSaveCart();
    } else {
      delete window.cart[key];
      _headerSaveCart();

      // Show toast with undo for last item removal
      if (typeof window.showToast === 'function') {
        window.showToast('Товар удалён из корзины', 'removed', 3000, false, {}, () => {
          window.cart[key] = removedItem;
          _headerSaveCart();
          if (typeof window.showToast === 'function') {
            window.showToast('Товар восстановлен', 'success');
          }
        });
      }
    }
  }
}

function _getCartVariationsHeader() {
  try {
    return JSON.parse(localStorage.getItem('tributeCartVariations') || '{}');
  } catch {
    return {};
  }
}

function _saveCartVariationHeader(variationKey, value) {
  const variations = _getCartVariationsHeader();
  if (value) {
    variations[variationKey] = value;
  } else {
    delete variations[variationKey];
  }
  localStorage.setItem('tributeCartVariations', JSON.stringify(variations));
  window.dispatchEvent(new Event('cartUpdated'));
}

/**
 * Update in-cart state on all option buttons in a format dropdown without
 * re-rendering the whole dropdown (matches product-grid's approach).
 */
function _refreshHeaderFormatDropdown(dropdown, product) {
  const isOriginal = product.type === 'оригинал';
  const variations = isOriginal ? _getCartVariationsHeader() : null;

  dropdown.querySelectorAll('.header-search-format-option').forEach(btn => {
    const format = btn.dataset.format;
    const dp = _headerDisplayProperty(product, format);
    const key = `${product.id}_${dp}`;
    const qty = window.cart[key] ? window.cart[key].quantity : 0;
    const priceWrapper = btn.querySelector('.header-search-format-price-wrapper');
    const counter = btn.querySelector('.header-search-format-counter');
    const countSpan = btn.querySelector('.header-search-format-count');
    const label = btn.querySelector('.header-search-format-label');
    const varRow = btn.querySelector('.header-search-format-var-row');

    if (qty > 0) {
      btn.classList.add('in-cart');
      if (priceWrapper) priceWrapper.style.visibility = 'hidden';
      if (counter) counter.style.visibility = '';
      if (countSpan) countSpan.textContent = qty;
      if (isOriginal && label) label.style.visibility = 'hidden';
      if (isOriginal && varRow) {
        varRow.style.visibility = '';
        const input = varRow.querySelector('.header-search-format-var-input');
        if (input) input.value = variations[key] || '';
      }
    } else {
      btn.classList.remove('in-cart');
      if (priceWrapper) priceWrapper.style.visibility = '';
      if (counter) counter.style.visibility = 'hidden';
      if (isOriginal && label) label.style.visibility = '';
      if (isOriginal && varRow) varRow.style.visibility = 'hidden';
    }
  });
}

/**
 * Initialize format dropdowns for search results (desktop and mobile).
 * Uses event delegation on each dropdown — no listener accumulation.
 */
function initHeaderSearchFormatDropdowns(products) {
  const addBtns = document.querySelectorAll('.header-search-add-btn');

  addBtns.forEach(btn => {
    // Set initial tooltip based on whether product is already in cart
    const initProduct = products.find(p => p.id == btn.dataset.productId);
    btn.dataset.tooltip = _headerAddBtnTooltip(initProduct);

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const productId = btn.dataset.productId;
      const product = products.find(p => p.id == productId);
      if (!product) return;

      const wrapper = btn.closest('.header-search-result-wrapper');
      const dropdown = wrapper.querySelector('.header-search-format-dropdown');
      const chevron = btn.querySelector('.add-btn-chevron');
      const isActive = dropdown.classList.contains('active');

      // Close all other dropdowns and reset chevrons
      document.querySelectorAll('.header-search-format-dropdown.active').forEach(d => {
        if (d !== dropdown) {
          d.classList.remove('active');
          const otherBtn = d.closest('.header-search-result-wrapper').querySelector('.header-search-add-btn');
          otherBtn?.querySelector('.add-btn-chevron')?.classList.remove('up');
          if (otherBtn) {
            const otherProduct = products.find(p => p.id == otherBtn.dataset.productId);
            otherBtn.dataset.tooltip = _headerAddBtnTooltip(otherProduct);
          }
        }
      });

      if (isActive) {
        dropdown.classList.remove('active');
        if (chevron) chevron.classList.remove('up');
        btn.dataset.tooltip = _headerAddBtnTooltip(product);
      } else {
        renderHeaderSearchFormatDropdown(dropdown, product);
        dropdown.classList.add('active');
        if (chevron) chevron.classList.add('up');
        btn.dataset.tooltip = 'Скрыть';
      }
    });
  });

  // Single outside-click listener scoped to this results container
  const resultsContainer = addBtns[0]?.closest('.header-search-results, .mobile-search-sheet-results');
  if (resultsContainer && !resultsContainer._formatOutsideClick) {
    resultsContainer._formatOutsideClick = true;
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.header-search-result-wrapper')) {
        resultsContainer.querySelectorAll('.header-search-format-dropdown.active').forEach(d => {
          d.classList.remove('active');
          const wrapper = d.closest('.header-search-result-wrapper');
          wrapper?.querySelector('.add-btn-chevron')?.classList.remove('up');
          const btn = wrapper?.querySelector('.header-search-add-btn');
          if (btn) {
            const product = products.find(p => p.id == btn.dataset.productId);
            btn.dataset.tooltip = _headerAddBtnTooltip(product);
          }
        });
      }
    });
  }
}

/**
 * Render format dropdown for a search result product.
 * Called once when the dropdown is opened; afterwards only _refreshHeaderFormatDropdown
 * is used to update counts in-place via event delegation.
 */
function renderHeaderSearchFormatDropdown(dropdown, product) {
  const fmtOptions = product.triptych ?
    window.triptychFormatOptions || [
      { value: 'A3 без рамки', label: '3 A3 без рамок' },
      { value: 'A2 без рамки', label: '3 A2 без рамок' },
      { value: 'A1 без рамки', label: '3 A1 без рамок' },
      { value: 'A3 в рамке', label: '3 A3 в рамках' },
      { value: 'A2 в рамке', label: '3 A2 в рамках' }
    ] :
    window.formatOptions || [
      { value: 'A3 без рамки', label: 'A3 без рамки' },
      { value: 'A2 без рамки', label: 'A2 без рамки' },
      { value: 'A1 без рамки', label: 'A1 без рамки' },
      { value: 'A3 в рамке', label: 'A3 в рамке' },
      { value: 'A2 в рамке', label: 'A2 в рамке' }
    ];

  const isOriginal = product.type === 'оригинал';
  const currentVariations = isOriginal ? _getCartVariationsHeader() : {};

  const optionsHTML = fmtOptions.map(opt => {
    const dp = _headerDisplayProperty(product, opt.value);
    const price = window.getProductPrice ? window.getProductPrice(product, opt.value) : null;
    const oldPrice = window.getProductOldPrice ? window.getProductOldPrice(product, opt.value) : null;
    const priceLabel = price ? `${window.formatNumberRussian ? window.formatNumberRussian(price) : price} ₽` : '';
    const oldPriceLabel = oldPrice ? `${window.formatNumberRussian ? window.formatNumberRussian(oldPrice) : oldPrice} ₽` : '';
    const key = `${product.id}_${dp}`;
    const qty = window.cart[key]?.quantity || 0;
    const priceVis = qty > 0 ? ' style="visibility:hidden"' : '';
    const counterVis = qty > 0 ? '' : ' style="visibility:hidden"';
    const inCartClass = qty > 0 ? ' in-cart' : '';
    const labelVis = (isOriginal && qty > 0) ? ' style="visibility:hidden"' : '';
    const varRowVis = (isOriginal && qty > 0) ? '' : ' style="visibility:hidden"';
    const varNum = (isOriginal && qty > 0) ? (currentVariations[key] || '') : '';
    const varRowHtml = isOriginal
      ? `<span class="header-search-format-var-row"${varRowVis} data-tooltip="Указать вариант"><span class="header-search-format-var-label">вар.</span><input class="header-search-format-var-input" type="text" inputmode="numeric" maxlength="2" value="${varNum}" data-var-key="${key}"/></span>`
      : '';

    return `
      <button class="header-search-format-option${inCartClass}"
              data-format="${opt.value}"
              data-product-id="${product.id}">
        <span class="header-search-format-label"${labelVis}>${opt.label}</span>
        ${varRowHtml}
        <span class="header-search-format-price-wrapper"${priceVis}>
          ${oldPriceLabel ? `<span class="header-search-format-price-old">${oldPriceLabel}</span>` : ''}
          <span class="header-search-format-price">${priceLabel}</span>
        </span>
        <span class="header-search-format-counter"${counterVis}>
          <span class="header-search-format-minus" data-tooltip="Убрать">−</span>
          <span class="header-search-format-count">${qty || 0}</span>
          <span class="header-search-format-plus" data-tooltip="Добавить">+</span>
        </span>
      </button>
    `;
  }).join('');

  dropdown.innerHTML = `
    <div class="header-search-format-header">Выбрать формат</div>
    <div class="header-search-format-list">${optionsHTML}</div>
  `;

  // Variation input listeners for оригинальный products
  if (isOriginal) {
    dropdown.querySelectorAll('.header-search-format-var-input').forEach(input => {
      input.addEventListener('click', e => { e.stopPropagation(); });
      input.addEventListener('input', () => {
        input.value = input.value.replace(/[^0-9]/g, '').slice(0, 2);
      });
      input.addEventListener('change', () => {
        _saveCartVariationHeader(input.dataset.varKey, input.value);
      });
      input.addEventListener('blur', () => {
        if (!input.value) {
          _saveCartVariationHeader(input.dataset.varKey, '');
        }
      });
    });
  }

  // Single delegated listener on the dropdown — no per-button listeners
  dropdown.addEventListener('click', (e) => {
    e.stopPropagation();

    // Variation input clicks must not trigger format selection
    if (e.target.closest('.header-search-format-var-input')) return;

    const optBtn = e.target.closest('.header-search-format-option');
    if (!optBtn) return;

    const format = optBtn.dataset.format;
    const isMinus = !!e.target.closest('.header-search-format-minus');
    const isPlus = !!e.target.closest('.header-search-format-plus');
    const dp = _headerDisplayProperty(product, format);
    const inCart = window.cart[`${product.id}_${dp}`];

    if (isMinus) {
      _headerRemoveFromCart(product, format);
    } else if (isPlus) {
      _headerAddToCart(product, format);
    } else if (!inCart) {
      // First click on format option — add to cart
      _headerAddToCart(product, format);
    }

    _refreshHeaderFormatDropdown(dropdown, product);
  });
}

/**
 * Navigate to main page with search query
 */
function navigateToMainWithSearch(query) {
  // Save to recent searches
  saveRecentSearch(query);

  // Clear input since search is being applied
  const searchInput = document.querySelector('.header-search-input');
  if (searchInput) searchInput.value = '';

  closeHeaderSearch();

  // Store search query in sessionStorage for main page to pick up
  sessionStorage.setItem('headerSearchQuery', query);

  if (typeof smoothNavigate === 'function') {
    smoothNavigate('/');
  } else {
    window.location.href = '/';
  }
}

// Make navigateToMainWithSearch available globally for onclick handler
window.navigateToMainWithSearch = navigateToMainWithSearch;

// Sync any open header search format dropdowns when cart changes externally
// (e.g. user adds to cart from the product page or product grid while search is open)
window.addEventListener('cartUpdated', () => {
  document.querySelectorAll('.header-search-format-dropdown.active').forEach(dropdown => {
    const productId = dropdown.dataset.productId;
    const product = headerSearchProducts?.find(p => p.id == productId);
    if (product) {
      _refreshHeaderFormatDropdown(dropdown, product);
    }
  });
});

/**
 * Helper to add image size parameter - uses global addImageSize from formatters.js
 */
function addImageSizeHeader(url, size) {
  if (!url) return '';
  // Use global addImageSize (exported from formatters.js via utils.js)
  if (typeof window.addImageSize === 'function') {
    return window.addImageSize(url, size);
  }
  return url;
}

// Initialize header search after header is loaded
setTimeout(() => {
  initHeaderSearch();
}, 150);

// Re-initialize on SPA navigation
window.addEventListener('popstate', () => {
  setTimeout(() => {
    setupButtonVisibility();
    initHeaderSearch();
  }, 100);
});

// Expose initHeaderSearch globally so router can call it
window.initHeaderSearch = initHeaderSearch;

// ============================================================
// SCROLL BEHAVIOR FOR MOBILE HEADER
// ============================================================

// Initialize to current scroll position (handles browser scroll restoration)
let lastScrollTop = window.pageYOffset || document.documentElement.scrollTop || 0;
let scrollListener = null;
const scrollThreshold = 10; // Minimum scroll distance to trigger hide/show
let headerScrollHidden = false; // header is in translateY(-height) state
let filterScrollHidden = false; // primary filter is in top:-height state

// Cached element heights — read once on init and on resize, never during scroll.
// Reading offsetHeight during scroll forces synchronous layout reflow, which on
// mobile (during address bar appear/disappear) causes scroll position jumps.
let cachedHeaderHeight = 60;
let cachedProductsHeaderHeight = 0; // primary filter height (for threshold calc)
let cachedCombinedHeight = 60;

// All sticky filter elements on the current page with their cached heights.
// Populated by updateCachedHeights(); used during scroll (no DOM reads).
let cachedStickyFilters = []; // Array of { el: Element, height: number }

// Mobile bottom-fixed filter state
let filterBottomStates = []; // Array of { el, height, naturalBottom, spacer, isAtBottom }
let isMobileMode = false;

// Selectors for all sticky filter sections across pages
const STICKY_FILTER_SELECTORS = '.products-header, .sticky-filter-wrapper';

function getVisibleFilters() {
  return Array.from(document.querySelectorAll(STICKY_FILTER_SELECTORS))
    .filter(el => el.offsetParent !== null); // exclude display:none elements
}

function updateCachedHeights(header) {
  cachedHeaderHeight = header ? (header.offsetHeight || 60) : 60;

  const visibleFilters = getVisibleFilters();
  cachedStickyFilters = visibleFilters.map(el => ({ el, height: el.offsetHeight || 0 }));

  // Primary filter: topmost visible one, drives the hide threshold
  const primaryFilter = visibleFilters[0] || null;
  cachedProductsHeaderHeight = primaryFilter ? (primaryFilter.offsetHeight || 0) : 0;
  cachedCombinedHeight = cachedHeaderHeight + cachedProductsHeaderHeight;
}

function resetStickyFiltersTop() {
  document.querySelectorAll(STICKY_FILTER_SELECTORS).forEach(el => { el.style.top = ''; });
}

// Mobile: clean up bottom-fixed filter states
function cleanupFilterBottomStates() {
  filterBottomStates.forEach(state => {
    state.el.classList.remove('filters-at-bottom');
    state.el.style.top = '';
    if (state.spacer && state.spacer.parentNode) state.spacer.remove();
  });
  filterBottomStates = [];
  document.documentElement.style.removeProperty('--filter-at-bottom-height');
}

// Mobile: set up bottom-fixed filter tracking for visible filters
function isBottomNavVisible() {
  const nav = document.querySelector('.bottom-nav');
  return nav && getComputedStyle(nav).display !== 'none';
}

function getBottomNavHeight() {
  const nav = document.querySelector('.bottom-nav');
  if (!nav || getComputedStyle(nav).display === 'none') return 0;
  return nav.offsetHeight || 0;
}

function setupFilterBottomStates() {
  cleanupFilterBottomStates();
  isMobileMode = isBottomNavVisible();
  if (!isMobileMode) return;

  const visibleFilters = getVisibleFilters();
  const scrollTop = window.scrollY || 0;
  let maxAtBottomHeight = 0;

  // Set actual bottom nav height for flush positioning
  const navHeight = getBottomNavHeight();
  document.documentElement.style.setProperty('--actual-bottom-nav-height', navHeight + 'px');

  filterBottomStates = visibleFilters.map(el => {
    const rect = el.getBoundingClientRect();
    const naturalBottom = rect.bottom + scrollTop;
    const height = el.offsetHeight || 0;
    const state = { el, height, naturalBottom, spacer: null, isAtBottom: false };

    // Apply immediately if already scrolled past
    if (scrollTop > naturalBottom) {
      const spacer = document.createElement('div');
      spacer.className = 'filter-spacer';
      spacer.style.height = height + 'px';
      el.parentNode.insertBefore(spacer, el);
      el.classList.add('filters-at-bottom');
      state.spacer = spacer;
      state.isAtBottom = true;
      maxAtBottomHeight = Math.max(maxAtBottomHeight, height);
    }

    return state;
  });

  if (maxAtBottomHeight > 0) {
    document.documentElement.style.setProperty('--filter-at-bottom-height', maxAtBottomHeight + 'px');
  }
}

// Mobile: toggle filter position based on scroll
function updateFiltersBottomPosition(scrollTop) {
  let maxAtBottomHeight = 0;
  filterBottomStates.forEach(state => {
    if (scrollTop > state.naturalBottom && !state.isAtBottom) {
      // Scrolled past filter — fix above bottom nav
      const spacer = document.createElement('div');
      spacer.className = 'filter-spacer';
      spacer.style.height = state.height + 'px';
      state.el.parentNode.insertBefore(spacer, state.el);
      state.el.classList.add('filters-at-bottom');
      state.spacer = spacer;
      state.isAtBottom = true;
    } else if (scrollTop <= state.naturalBottom && state.isAtBottom) {
      // Scrolled back up — return to natural position
      state.el.classList.remove('filters-at-bottom');
      if (state.spacer && state.spacer.parentNode) state.spacer.remove();
      state.spacer = null;
      state.isAtBottom = false;
    }
    if (state.isAtBottom) maxAtBottomHeight = Math.max(maxAtBottomHeight, state.height);
  });
  // Shift scroll-to-top and scrubber buttons above the fixed filter
  if (maxAtBottomHeight > 0) {
    document.documentElement.style.setProperty('--filter-at-bottom-height', maxAtBottomHeight + 'px');
  } else {
    document.documentElement.style.removeProperty('--filter-at-bottom-height');
  }
}

function initMobileHeaderScrollBehavior() {
  const header = document.querySelector('.header');
  if (!header) return;

  // Sync lastScrollTop to current position (handles browser scroll restoration)
  lastScrollTop = window.pageYOffset || document.documentElement.scrollTop || 0;
  headerScrollHidden = false;
  filterScrollHidden = false;

  // Restore filters to natural flow before reading heights
  cleanupFilterBottomStates();

  // Cache element heights once (no reflows during scroll)
  updateCachedHeights(header);

  // Set up mobile bottom-fixed filter tracking
  setupFilterBottomStates();

  // Check if we're on the picker page
  const isPickerPage = window.location.pathname === '/picker' ||
                       window.location.pathname === '/picker.html' ||
                       window.location.pathname.includes('/pages/picker');

  // On picker page, keep header fixed and visible (no hide on scroll)
  if (isPickerPage) {
    header.style.transform = '';
    resetStickyFiltersTop();
    if (scrollListener) {
      window.removeEventListener('scroll', scrollListener);
      scrollListener = null;
    }
    return;
  }

  // Only create the scroll listener once — resize just updates cached values
  if (scrollListener) return;

  let ticking = false;

  function updateHeaderPosition() {
    // Don't update header position when modal is open
    // (modal sets position:fixed on body which resets scroll position to 0,
    // which would incorrectly trigger header to show)
    if (document.body.classList.contains('modal-open') ||
        document.body.classList.contains('popup-open') ||
        document.body.classList.contains('sheet-open')) {
      ticking = false;
      return;
    }

    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

    // Handle iOS rubber-banding: ignore negative scroll values
    if (scrollTop < 0) {
      ticking = false;
      return;
    }

    const scrollDelta = scrollTop - lastScrollTop;

    // Desktop: hide after scrolling past header + filter combined height.
    // Mobile: hide after scrolling past header height (filters are at bottom, not sticky).
    const hideThreshold = isMobileMode ? cachedHeaderHeight : cachedCombinedHeight;

    if (Math.abs(scrollDelta) > scrollThreshold) {
      if (scrollDelta > 0 && scrollTop > hideThreshold) {
        // Scrolling down past header-hide threshold.
        if (!headerScrollHidden) {
          headerScrollHidden = true;
          header.style.transform = `translateY(-${cachedHeaderHeight}px)`;
          const searchDropdown = document.querySelector('.header-search-dropdown');
          if (searchDropdown && searchDropdown.classList.contains('open')) {
            closeHeaderSearch();
          }
          // Desktop only: hide sticky filters with header
          if (!isMobileMode && cachedStickyFilters.length > 0) {
            filterScrollHidden = true;
            cachedStickyFilters.forEach(({ el, height }) => { el.style.top = `-${height}px`; });
          }
        }
      } else if (scrollDelta < 0) {
        // Scrolling up — restore header.
        if (headerScrollHidden || filterScrollHidden) {
          headerScrollHidden = false;
          header.style.transform = 'translateY(0)';
          // Desktop only: restore sticky filter tops
          if (!isMobileMode && filterScrollHidden) {
            cachedStickyFilters.forEach(({ el }) => { el.style.top = ''; });
          }
          filterScrollHidden = false;
        }
      }
    }

    // Mobile: toggle filters between natural position and fixed above bottom nav
    if (isMobileMode) {
      updateFiltersBottomPosition(scrollTop);
    }

    // Always update to prevent scroll drift (iOS/Firefox jump-to-top bug)
    lastScrollTop = scrollTop;

    ticking = false;
  }

  // Create scroll listener
  scrollListener = () => {
    if (!ticking) {
      window.requestAnimationFrame(updateHeaderPosition);
      ticking = true;
    }
  };

  window.addEventListener('scroll', scrollListener, { passive: true });
}

// Initialize scroll behavior after header is loaded (fallback for race condition)
setTimeout(() => {
  initMobileHeaderScrollBehavior();

  // On resize: update cached heights, sync scroll position, re-setup mobile filters.
  // Do NOT tear down and rebuild the scroll listener — that causes race
  // conditions with the mobile address bar appearing/disappearing.
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      lastScrollTop = window.pageYOffset || document.documentElement.scrollTop || 0;
      cleanupFilterBottomStates();
      const header = document.querySelector('.header');
      updateCachedHeights(header);
      setupFilterBottomStates();

      // Re-init only if listener state needs to change (picker page toggled)
      const isPickerPage = window.location.pathname === '/picker' ||
                           window.location.pathname === '/picker.html' ||
                           window.location.pathname.includes('/pages/picker');
      if (isPickerPage && scrollListener) {
        initMobileHeaderScrollBehavior();
      } else if (!isPickerPage && !scrollListener) {
        initMobileHeaderScrollBehavior();
      }
    }, 150);
  });

  // On SPA navigation, reset header + all filter tops, rebuild scroll listener
  window.addEventListener('spa:pageenter', () => {
    const header = document.querySelector('.header');
    if (header) header.style.transform = '';
    resetStickyFiltersTop();
    cleanupFilterBottomStates();
    if (scrollListener) {
      window.removeEventListener('scroll', scrollListener);
      scrollListener = null;
    }
    setTimeout(() => initMobileHeaderScrollBehavior(), 50);
  });

  // Re-cache when a previously-hidden filter section becomes visible
  // (e.g. customers/product masonry shown after data loads)
  window.addEventListener('spa:stickyfilterready', () => {
    cleanupFilterBottomStates();
    const header = document.querySelector('.header');
    updateCachedHeights(header);
    setupFilterBottomStates();
  });
}, 100);
