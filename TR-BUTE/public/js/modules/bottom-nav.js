// ============================================================
// BOTTOM NAV MODULE
// Persistent element across all pages (mobile only)
// ============================================================

/**
 * Initialize and inject bottom navigation HTML into the page
 */
function initBottomNav() {
  // Use <a> tags for proper "open in new tab" support
  const bottomNavHTML = `
  <div class="bottom-nav mobile-only">

    <a href="/customers" class="bottom-nav-button customers-toggle-button-mobile" title="Покупатели">
      <svg width="20" height="20"><use href="#gallery"></use></svg>
      <span class="bottom-nav-label">Покупатели</span>
    </a>

    <a href="/picker" class="bottom-nav-button picker-toggle-button-mobile" title="Подборщик">
      <svg width="20" height="20"><use href="#picker"></use></svg>
      <span class="bottom-nav-label">Подборщик</span>
    </a>

    <a href="/" class="bottom-nav-button home-toggle-button-mobile" title="Главная">
      <svg width="20" height="20"><use href="#grind-square"></use></svg>
      <span class="bottom-nav-label">Главная</span>
    </a>

    <a href="/favorites" class="bottom-nav-button favorites-toggle-button-mobile" title="Избранное">
      <span class="bottom-nav-icon-wrap">
        <svg width="20" height="20"><use href="#heart"></use></svg>
        <span class="favorites-count-bottom-nav"></span>
      </span>
      <span class="bottom-nav-label">Избранное</span>
    </a>

    <a href="/cart" class="bottom-nav-button cart-toggle-button-mobile" title="Корзина">
      <span class="bottom-nav-icon-wrap">
        <svg width="20" height="20"><use href="#shopping-basket"></use></svg>
        <span class="cart-count-bottom-nav"></span>
      </span>
      <span class="bottom-nav-label">Корзина</span>
    </a>

  </div>
  `;

  // Insert bottom nav before footer
  const footer = document.querySelector('.footer');
  if (footer) {
    footer.insertAdjacentHTML('beforebegin', bottomNavHTML);
  } else {
    // Fallback: insert before SVG symbols
    const svgElement = document.querySelector('svg[style*="display:none"]');
    if (svgElement) {
      svgElement.insertAdjacentHTML('beforebegin', bottomNavHTML);
    } else {
      document.body.insertAdjacentHTML('beforeend', bottomNavHTML);
    }
  }

  // Add navigation functionality
  setupBottomNavNavigation();

  // Set active button based on current page
  setBottomNavActiveButton();
}

/**
 * Set active state for current page button
 */
function setBottomNavActiveButton() {
  const buttons = document.querySelectorAll('.bottom-nav-button');
  const currentPath = window.location.pathname;

  // Remove active-page class from all buttons
  buttons.forEach(btn => btn.classList.remove('active-page'));

  // Determine which button should be active
  let activeButton = null;

  if (currentPath === '/' || currentPath === '/index.html' || currentPath === '/index') {
    activeButton = document.querySelector('.home-toggle-button-mobile');
  } else if (currentPath.includes('/customers')) {
    activeButton = document.querySelector('.customers-toggle-button-mobile');
  } else if (currentPath.includes('/picker')) {
    activeButton = document.querySelector('.picker-toggle-button-mobile');
  } else if (currentPath.includes('/favorites')) {
    activeButton = document.querySelector('.favorites-toggle-button-mobile');
  } else if (currentPath.includes('/cart')) {
    activeButton = document.querySelector('.cart-toggle-button-mobile');
  }

  // Add active-page class to the corresponding button
  if (activeButton) {
    activeButton.classList.add('active-page');
  }
}

/**
 * Setup navigation for bottom nav links
 * Uses <a> tags for proper "open in new tab" support
 * Left-clicks use smooth navigation, middle/right clicks work natively
 */
function setupBottomNavNavigation() {
  // Helper to handle link clicks with smooth navigation
  const handleLinkClick = (e, path) => {
    // Only prevent default for left-clicks (button 0) without modifier keys
    // Allow middle-click, right-click, Ctrl+click, Cmd+click, Shift+click to work natively
    if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault();
      triggerHaptic();
      if (typeof smoothNavigate === 'function') {
        smoothNavigate(path);
      } else {
        window.location.href = path;
      }
    }
  };

  // Home button
  const homeBtn = document.querySelector('.home-toggle-button-mobile');
  if (homeBtn) {
    homeBtn.addEventListener('click', (e) => handleLinkClick(e, '/'));
  }

  // Customers button
  const customersBtn = document.querySelector('.customers-toggle-button-mobile');
  if (customersBtn) {
    customersBtn.addEventListener('click', (e) => handleLinkClick(e, '/customers'));
  }

  // Picker button
  const pickerBtn = document.querySelector('.picker-toggle-button-mobile');
  if (pickerBtn) {
    pickerBtn.addEventListener('click', (e) => handleLinkClick(e, '/picker'));
  }

  // Favorites button
  const favoritesBtn = document.querySelector('.favorites-toggle-button-mobile');
  if (favoritesBtn) {
    favoritesBtn.addEventListener('click', (e) => handleLinkClick(e, '/favorites'));
  }

  // Cart button
  const cartBtn = document.querySelector('.cart-toggle-button-mobile');
  if (cartBtn) {
    cartBtn.addEventListener('click', (e) => handleLinkClick(e, '/cart'));
  }
}

// Auto-initialize when script loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initBottomNav);
} else {
  initBottomNav();
}
