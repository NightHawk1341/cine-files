// ============ IMPORTS ============
import { showSkeletonLoaders } from '/js/modules/skeleton-loader.js';
import { DataStore } from '/js/core/data-store.js';
import { loadFavorites } from '/js/core/favorites.js';
import { allImagesByProduct, allAdditionalImagesByProduct, productPrices, favorites, setAllImagesByProduct, setAllAdditionalImagesByProduct } from '/js/core/state.js';
import { formatNumberRussian } from '/js/core/formatters.js';
import { renderProductGrid } from '/js/modules/product-grid.js';
import { initSortScrubber, updateSortScrubberVisibility } from '/js/modules/sort-scrubber.js';
import { initFAQPopup, openFAQPopup, closeFAQPopup, addFAQButton } from '/js/modules/faq-popup.js';
import { actionSheet } from '/js/modules/mobile-modal.js';
import { createPageFilters, sortProducts, matchesSearch } from '/js/modules/page-filters.js';

// ============ UTILITY FUNCTIONS ============
// formatNumberRussian is now provided by utils.js

/**
 * Shows toast notification with swipe-to-dismiss functionality
 * @param {string} message - Message to display
 * @param {string} type - Toast type ('success', 'removed')
 */
const showToast = (message, type = 'success') => {
  // Remove any existing toasts first
  document.querySelectorAll('.toast-notification').forEach(t => t.remove());

  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.style.cssText = `
    position: fixed;
    padding: 15px 20px;
    background-color: rgba(18, 18, 18, 0.95);
    border: 1px solid rgba(65, 65, 65, 0.5);
    border-radius: 12px;
    backdrop-filter: blur(20px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 14px;
    color: #E0E0E0;
    max-width: 320px;
    right: 20px;
    will-change: transform;
    transform: translateZ(0);
    z-index: 10003;
    opacity: 1;
    transition: none;
  `;

  // Mobile positioning
  if (window.innerWidth <= 1024) {
    toast.style.top = '20px';
    toast.style.bottom = 'auto';
  } else {
    toast.style.bottom = '20px';
    toast.style.top = 'auto';
  }

  let iconHref = '#favorite';
  if (type === 'removed') {
    iconHref = '#trash';
  }

  toast.innerHTML = `
    <svg width="20" height="20"><use href="${iconHref}"></use></svg>
    <span>${message}</span>
  `;

  document.body.appendChild(toast);
  
  // Apply animation AFTER in DOM
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease-out';
  }, 10);
  
  let autoRemoveTimeout;
  let touchStartY = 0;
  let isDragging = false;
  
  const handleTouchStart = (e) => {
    touchStartY = e.touches[0].clientY;
    isDragging = true;
    clearTimeout(autoRemoveTimeout);
    
    toast.style.animation = 'none';
    toast.style.transition = 'none';
    
    void toast.offsetHeight;
    
    toast.style.transform = 'translateY(0)';
    toast.style.opacity = '1';
  };
  
  const handleTouchMove = (e) => {
    if (!isDragging) return;
    
    const currentY = e.touches[0].clientY;
    const dragDistance = touchStartY - currentY;
    
    if (dragDistance > 0) {
      toast.style.transition = 'none';
      toast.style.transform = `translateY(-${dragDistance}px)`;
    }
  };
  
  const handleTouchEnd = (e) => {
    if (!isDragging) return;
    isDragging = false;
    
    const currentY = e.changedTouches[0].clientY;
    const dragDistance = touchStartY - currentY;
    
    if (dragDistance > 60) {
      toast.style.animation = 'none';
      toast.style.transition = 'all 0.3s ease-out';
      toast.style.transform = 'translateY(-150px)';
      toast.style.opacity = '0';
      
      document.body.classList.remove('popup-open');
      document.removeEventListener('touchmove', preventScroll);
      
      setTimeout(() => {
        if (toast.parentElement) {
          toast.remove();
        }
      }, 300);
    } else {
      toast.style.animation = 'none';
      toast.style.transition = 'transform 0.2s ease-out';
      toast.style.transform = 'translateY(0)';
      toast.style.opacity = '1';
      
      setTimeout(() => {
        autoRemoveTimeout = setTimeout(() => {
          if (toast.parentElement) {
            toast.remove();
          }
        }, 3000);
      }, 200);
    }
  };
  
  toast.addEventListener('touchstart', handleTouchStart, { passive: true });
  toast.addEventListener('touchmove', handleTouchMove, { passive: true });
  toast.addEventListener('touchend', handleTouchEnd, { passive: true });
  
  autoRemoveTimeout = setTimeout(() => {
    if (toast.parentElement && !isDragging) {
      toast.remove();
    }
  }, 3000);
};

// triggerHaptic is now provided by utils.js

/**
 * Show custom confirmation modal matching site design
 * @param {string} message - Message to display
 * @param {string} type - Modal type: 'success', 'error', or 'info' (default: 'info')
 * @param {number} duration - Auto-close duration in ms (default: 3000, 0 = manual close only)
 */
// showConfirmationModal is now provided by utils.js

const showConfirmation = (title, text, onConfirm) => {
  const overlay = document.createElement('div');
  overlay.className = 'confirmation-modal-overlay active';
  overlay.innerHTML = `
    <div class="confirmation-modal">
      <div class="confirmation-modal-title">${title}</div>
      <div class="confirmation-modal-text">${text}</div>
      <div class="confirmation-modal-buttons">
        <button class="confirmation-modal-button cancel">Отмена</button>
        <button class="confirmation-modal-button confirm">Подтвердить</button>
      </div>
    </div>
  `;

  const confirmBtn = overlay.querySelector('.confirm');
  const cancelBtn = overlay.querySelector('.cancel');

  confirmBtn.addEventListener('click', () => {
    onConfirm();
    overlay.remove();
  });

  cancelBtn.addEventListener('click', () => {
    overlay.remove();
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);
};

// ============ DATA SYNC MANAGER ============
// DataSync is now provided by /js/modules/data-sync.js


// ============ MAIN APPLICATION ============

// ============ PAGE-LEVEL STATE (module scope for cleanup) ============
let allProducts = [];
let displayedProducts = [];
let cart = {};
let cartVariations = {};
const SEGMENT_SIZE = 96;
let loadedSegments = 1;
let isLoadingMore = false;
let infiniteScrollObserver = null;
let scrollHandler = null;
let resizeHandler = null;
let isMainPageInitialized = false;
let imagesLoadedHandler = null;
let pageFilters = null;

/**
 * Show old posters modal with TR/BUTE social links
 */
function showOldPostersModal() {
  actionSheet({
    title: 'Больше постеров',
    message: 'Наши старые постеры можно найти тут',
    actions: [
      {
        text: 'Telegram',
        icon: 'socials-telegram',
        href: 'https://t.me/buy_tribute',
        style: 'primary'
      },
      {
        text: 'ВКонтакте',
        icon: 'socials-vk',
        href: 'https://vk.com/buy_tribute'
      },
      {
        text: 'X (Twitter)',
        icon: 'socials-x',
        href: 'https://x.com/buy_tribute'
      },
      {
        text: 'Pinterest',
        icon: 'socials-pinterest',
        href: 'https://ru.pinterest.com/buy_tribute/'
      },
      {
        text: 'TikTok',
        icon: 'socials-tiktok',
        href: 'https://www.tiktok.com/@buy_tribute'
      }
    ]
    // No cancelText - modal closes by clicking outside or pressing ESC
  });
}

/**
 * Create "Больше постеров" button styled like product card
 */
function createMorePostersButton() {
  const button = document.createElement('button');
  button.className = 'more-posters-btn';
  button.innerHTML = `
    <span class="more-posters-btn-icon">
      <svg width="24" height="24" viewBox="0 0 613.87 649.95"><use href="#logo-mini"></use></svg>
    </span>
    <span class="more-posters-btn-text">Больше постеров</span>`;

  button.addEventListener('click', (e) => {
    e.preventDefault();
    showOldPostersModal();
  });

  return button;
}

/**
 * Update .more-posters-btn layout: card-sized when in a row with other products,
 * full-width horizontal when alone in its own row.
 * Called after the grid renders or the window resizes.
 */
function updateMorePostersLayout() {
  const btn = document.querySelector('.more-posters-btn');
  if (!btn) return;

  const prev = btn.previousElementSibling;
  if (!prev) {
    btn.classList.add('is-alone-in-row');
    return;
  }

  // Temporarily remove the class so the button takes its natural grid position,
  // then measure — avoids the self-fulfilling layout where grid-column:1/-1
  // always puts the button on its own row.
  btn.classList.remove('is-alone-in-row');

  // getBoundingClientRect forces a reflow, giving us the natural layout position.
  const btnTop = btn.getBoundingClientRect().top;
  const prevTop = prev.getBoundingClientRect().top;
  btn.classList.toggle('is-alone-in-row', Math.abs(btnTop - prevTop) > 4);
}

/**
 * Initialize main page
 */
async function initMainPage() {
  // Prevent double initialization (can happen on first SPA navigation)
  if (isMainPageInitialized) {
    console.log('🏠 Main page already initialized, skipping');
    return;
  }
  isMainPageInitialized = true;
  console.log('🏠 Initializing main page...');

  // Reset page state
  allProducts = [];
  displayedProducts = [];
  loadedSegments = 1;
  isLoadingMore = false;

  // Mark body as loaded to prevent FOUC
  document.body.classList.add('loaded');

  // -------- BENTO GRID BACKGROUND IMAGES --------
  // Apply background images to bento items with data-bg-image attribute
  document.querySelectorAll('.bento-item[data-bg-image]').forEach(item => {
    const imageUrl = item.getAttribute('data-bg-image');
    if (imageUrl) {
      item.style.backgroundImage = `url('${imageUrl}')`;
    }
  });

  // -------- DOM ELEMENT REFERENCES --------

  // Product Grid
  const container = document.querySelector('.products');
  const productsHeader = document.querySelector(".products-header");

  // -------- PAGE FILTERS (shared module) --------
  await initFAQPopup('main');

  pageFilters = createPageFilters(productsHeader, {
    pageId: 'main',
    features: { search: true, genres: true, types: true, sort: true, reset: true, faq: true, collapse: true },
    onFilter: (filterState) => {
      filterAndDisplay(filterState);
      updateSortScrubberVisibility();
    },
    onFaqClick: () => openFAQPopup(),
    storageKey: 'catalogFilters',
  });

  // Customers page navigation - use event delegation
  document.addEventListener('click', (e) => {
    if (e.target.closest('.customers-toggle-button-header, .customers-toggle-button-mobile')) {
      triggerHaptic();
      console.log('👥 Navigating to customers page');
      if (typeof smoothNavigate === 'function') {
        smoothNavigate('/customers');
      } else {
        window.location.href = '/customers';
      }
    }
  });

  // -------- POPUP MANAGEMENT --------
  const closeCurrentPopup = () => {
    const faqOverlay = document.querySelector('.faq-popup-overlay');
    if (faqOverlay && faqOverlay.classList.contains('active')) {
      closeFAQPopup();
    }
  };

  // -------- AUTHENTICATION --------

  const yandexLoginButton = document.getElementById('yandex-login-button');

  const handleYandexLogin = async () => {
    try {
      const response = await fetch('/api/auth/yandex/login');
      const data = await response.json();
      window.location.href = data.loginUrl;
    } catch (err) {
      console.error('Yandex login error:', err);
      showToast('Ошибка при входе', 'removed');
    }
  };

  if (yandexLoginButton) {
    yandexLoginButton.addEventListener('click', handleYandexLogin);
  }

  // Header back button - closes current popup in Mini-App narrow mode
  const headerBackBtn = document.getElementById('header-back-btn');
  if (headerBackBtn) {
    headerBackBtn.addEventListener('click', () => {
      closeCurrentPopup();
    });
  }

  // buildHoverZones and resetOtherCarousels are now provided by product-grid module

  function createCertificateCard() {
    const card = document.createElement('div');
    card.className = 'product certificate-card';
    card.innerHTML = `
      <div class="image-carousel" data-count="1">
        <button class="favorite-button btn-favorite ${window.favorites && window.favorites.has('certificate_page') ? 'is-favorite' : ''}">
          <svg width="14" height="14"><use href="#heart"></use></svg>
        </button>
        <div class="slides">
          <div class="slide">
            <div class="certificate-placeholder">
              <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--primary);">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                <path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>
              </svg>
              <div style="margin-top: 10px; font-weight: 600; color: var(--primary);">Подарочный сертификат</div>
            </div>
          </div>
        </div>
        <div class="indicators"><span class="indicator active" data-index="0"></span></div>
      </div>
      <h3>Подарочный сертификат</h3>
      <div class="price">От 500 ₽</div>
    `;

    // Click handler to navigate to certificate page
    card.addEventListener('click', (e) => {
      if (!e.target.closest('.favorite-button')) {
        window.location.href = "/certificate";
      }
    });

    // Favorite button handler
    const favoriteBtn = card.querySelector('.favorite-button');
    favoriteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavoriteSynced('certificate_page');
    });

    return card;
  }

  function render(products, isLastSegment) {
    // Use product-grid module for consistency across pages
    renderProductGrid(container, products, {
      defaultProperty: 'A3 без рамки',
      gridExtras: ['сборка обложки', 'варианты', 'приближение'],
      clearContainer: true
    });

    // "Больше постеров" button only appears once all products are visible
    if (isLastSegment) {
      const morePostersBtn = createMorePostersButton();
      container.appendChild(morePostersBtn);
      // Double rAF: first frame schedules paint, second runs after layout is settled
      requestAnimationFrame(() => requestAnimationFrame(updateMorePostersLayout));
    }
  }

  function filterAndDisplay(filterState) {
    if (!filterState) filterState = pageFilters?.getFilters() || { search: null, genre: null, type: null, sort: null, sortDirection: 'desc' };
    const CUSTOM_PRODUCT_ID = 1; // Special product that should always appear first

    const filtered = allProducts.filter(product => {
      if (product.id === CUSTOM_PRODUCT_ID) return true;

      const searchQ = filterState.search || '';
      const matchSearch = matchesSearch(product, searchQ);
      const matchGenre = !filterState.genre || product.genre === filterState.genre;
      const matchType = !filterState.type || product.type === filterState.type;
      return matchGenre && matchType && matchSearch;
    });

    let sorted = sortProducts([...filtered], filterState.sort, filterState.sortDirection);

    // Prioritize custom product first (only when no explicit sorting is applied)
    if (!filterState.sort && typeof window.sortProductsWithCustomFirst === 'function') {
      sorted = window.sortProductsWithCustomFirst(sorted);
    }

    // Restore scroll if returning via back navigation
    const savedScrollY = parseInt(sessionStorage.getItem('homeScrollY') || '0', 10);
    if (savedScrollY > 0) {
      sessionStorage.removeItem('homeScrollY');
      // Render all products at once so the page is tall enough for scroll restoration
      loadedSegments = Math.ceil(sorted.length / SEGMENT_SIZE);
      render(sorted, true);
      requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, savedScrollY)));
    } else {
      // Load first segment
      loadedSegments = 1;
      displayedProducts = sorted.slice(0, SEGMENT_SIZE);
      const firstIsLast = sorted.length <= SEGMENT_SIZE;
      render(displayedProducts, firstIsLast);
      setupInfiniteScroll(sorted);
    }
  }

  function setupInfiniteScroll(allFilteredProducts) {
    if (infiniteScrollObserver) {
      infiniteScrollObserver.disconnect();
    }

    // All products already rendered — nothing more to load
    if (allFilteredProducts.length <= SEGMENT_SIZE) {
      return;
    }

    // Sentinel sits at the end of the grid; the observer fires before it reaches
    // the viewport (rootMargin below), triggering the next batch fetch
    let sentinel = document.createElement('div');
    sentinel.className = 'products-sentinel';
    container.appendChild(sentinel);

    infiniteScrollObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !isLoadingMore) {
          isLoadingMore = true;

          setTimeout(() => {
            const nextSegmentStart = loadedSegments * SEGMENT_SIZE;
            const nextSegmentEnd = nextSegmentStart + SEGMENT_SIZE;

            if (nextSegmentStart < allFilteredProducts.length) {
              const newProducts = allFilteredProducts.slice(nextSegmentStart, nextSegmentEnd);
              const isLastSegment = nextSegmentEnd >= allFilteredProducts.length;

              // Remove sentinel before appending new cards
              sentinel.remove();

              newProducts.forEach(product => {
                const card = createProductCard(product, {
                  defaultProperty: 'A3 без рамки',
                  gridExtras: ['сборка обложки', 'варианты', 'приближение']
                });
                container.appendChild(card);
              });

              loadedSegments++;

              if (isLastSegment) {
                // All products loaded — show the button and stop observing
                infiniteScrollObserver.disconnect();
                const morePostersBtn = createMorePostersButton();
                container.appendChild(morePostersBtn);
                requestAnimationFrame(() => requestAnimationFrame(updateMorePostersLayout));
              } else {
                // More segments to come — drop a new sentinel and keep watching
                sentinel = document.createElement('div');
                sentinel.className = 'products-sentinel';
                container.appendChild(sentinel);
                infiniteScrollObserver.observe(sentinel);
              }
            }

            isLoadingMore = false;
          }, 100);
        }
      });
    }, {
      rootMargin: '500px'
    });

    infiniteScrollObserver.observe(sentinel);
  }
  
  // Track if we need to re-render when images load
  let productsRenderedWithoutImages = false;

  async function loadProducts() {
    // Check if we need to show skeleton loaders
    const existingSkeletons = container.querySelectorAll('.product-skeleton');

    // Keep pre-rendered skeletons (18 from HTML) if present — CSS hides extras on mobile
    const hasPrerenderedSkeletons = existingSkeletons.length === 18;

    if (!container.children.length || !hasPrerenderedSkeletons) {
      // Desktop shows 18 skeleton placeholders (3 rows of 6), mobile shows 6 (3 rows of 2)
      const isDesktop = window.innerWidth > 1024;
      const skeletonCount = isDesktop ? 18 : 6;
      showSkeletonLoaders(container, 'product', skeletonCount);
    }

    try {
      // Wait for global data (prices, images) before rendering
      if (window.waitForData) {
        await window.waitForData();
      }

      // Use DataStore instead of direct fetch - enables caching across pages
      allProducts = await DataStore.loadProducts();

      // Load product variants for variant dropdown feature
      if (window.loadProductVariants) {
        await window.loadProductVariants();
      }

      // Check if we already have images loaded from the global data loaders
      // This avoids duplicate fetches and race conditions during SPA navigation
      const hasGlobalImages = window.allImagesByProduct && window.allImagesByProduct.size > 0;

      // If images aren't loaded yet, set up a listener to re-render when they become available
      if (!hasGlobalImages) {
        productsRenderedWithoutImages = true;

        // Remove any existing handler first
        if (imagesLoadedHandler) {
          window.removeEventListener('imagesLoaded', imagesLoadedHandler);
        }

        // Set up handler to re-render product grid when images load
        imagesLoadedHandler = () => {
          console.log('📸 Images loaded, re-rendering product grid');
          productsRenderedWithoutImages = false;
          filterAndDisplay();
        };
        window.addEventListener('imagesLoaded', imagesLoadedHandler, { once: true });
      }

      if (!hasGlobalImages) {
        // Only fetch images if not already available from global loader
        const byProduct = new Map();
        const byProductAdditional = new Map();

        const imageFetches = allProducts.map(async (product) => {
          try {
            const res = await fetch(`/products/${product.id}/images`);
            if (!res.ok) {
              byProduct.set(product.id, []);
              return;
            }
            const imageData = await res.json();
            imageData.sort((a, b) => (a.id || 0) - (b.id || 0));
            byProduct.set(product.id, imageData.length > 0 ? imageData : [product.image]);
          } catch (err) {
            console.warn(`Failed to load images for product ${product.id}`, err);
            byProduct.set(product.id, [product.image]);
          }
        });

        const additionalImageFetches = allProducts.map(async (product) => {
          try {
            const res = await fetch(`/products/${product.id}/images-2`);
            if (!res.ok) {
              byProductAdditional.set(product.id, []);
              return;
            }
            const imageData = await res.json();
            imageData.sort((a, b) => (a.id || 0) - (b.id || 0));
            byProductAdditional.set(product.id, imageData.length > 0 ? imageData : []);
          } catch (err) {
            console.warn(`Failed to load additional images for product ${product.id}`, err);
            byProductAdditional.set(product.id, []);
          }
        });

        await Promise.all([...imageFetches, ...additionalImageFetches]);

        setAllImagesByProduct(byProduct);
        setAllAdditionalImagesByProduct(byProductAdditional);
      }

      loadFavorites();
      filterAndDisplay();
    } catch (err) {
      console.error('Error loading products:', err);
      container.innerHTML = '<p>Не удалось загрузить товары.</p>';
    }
  }
  
  // Profile popup elements
  const profileLoggedOut = document.getElementById('profile-logged-out');
  const profileLoggedIn = document.getElementById('profile-logged-in');
  
  // Check for search query from header search (on other pages)
  const headerSearchQuery = sessionStorage.getItem('headerSearchQuery');
  if (headerSearchQuery) {
    sessionStorage.removeItem('headerSearchQuery');
    pageFilters.setFilters({ search: headerSearchQuery });
  }

  // Load products (with filters already applied via module's loadFromStorage)
  loadProducts();

  // Initialize sort scrubber (shows for all sort types except default)
  initSortScrubber();

  // Resize handler is stored and registered at the end of init for proper cleanup

  // FAQ popup only opens via FAQ button clicks (removed auto-open on first visit)

  // -------- SCROLL TO TOP BUTTON --------
  const scrollToTopBtn = document.getElementById('scroll-to-top-btn');
  if (scrollToTopBtn) {
    const updateScrollBtnVisibility = () => {
      if (window.scrollY > 300) {
        scrollToTopBtn.classList.add('visible');
      } else {
        scrollToTopBtn.classList.remove('visible');
      }
    };
    window.addEventListener('scroll', updateScrollBtnVisibility, { passive: true });

    scrollToTopBtn.addEventListener('click', () => {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
      triggerHaptic();
    });
  }

  // Store resize handler for cleanup (filter resize is handled by page-filters module)
  resizeHandler = () => {
    updateMorePostersLayout();
  };
  window.addEventListener('resize', resizeHandler);

  console.log('✅ Main page initialized');
}

/**
 * Cleanup main page (called when navigating away via SPA router)
 */
function cleanupMainPage() {
  console.log('🧹 Main page cleanup');

  // Save scroll position so it can be restored when navigating back
  sessionStorage.setItem('homeScrollY', String(window.scrollY));

  // Reset initialization flag for re-entry
  isMainPageInitialized = false;

  // Destroy page filters module (removes event listeners)
  if (pageFilters) {
    pageFilters.destroy();
    pageFilters = null;
  }

  // Remove scroll handler
  if (scrollHandler) {
    window.removeEventListener('scroll', scrollHandler);
    scrollHandler = null;
  }

  // Remove resize handler
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler);
    resizeHandler = null;
  }

  // Remove images loaded handler if still pending
  if (imagesLoadedHandler) {
    window.removeEventListener('imagesLoaded', imagesLoadedHandler);
    imagesLoadedHandler = null;
  }

  // Disconnect infinite scroll observer
  if (infiniteScrollObserver) {
    infiniteScrollObserver.disconnect();
    infiniteScrollObserver = null;
  }

  // Clear product grid carousels
  if (window.activeCarousels) {
    window.activeCarousels.forEach((state, productId) => {
      if (state.autoPlayInterval) {
        clearInterval(state.autoPlayInterval);
      }
    });
    window.activeCarousels.clear();
  }

  // Close any open popups
  const faqPopupOverlay = document.querySelector('.faq-popup-overlay');
  if (faqPopupOverlay && faqPopupOverlay.classList.contains('active')) {
    closeFAQPopup();
  }
}

// Register with SPA router
if (typeof window.registerPage === 'function') {
  window.registerPage('/', {
    init: initMainPage,
    cleanup: cleanupMainPage
  });
}

// Auto-initialize when script loads (for direct page visits only)
// Don't auto-init if we're not on the main page (SPA navigation to another page might load this script)
const isMainPagePath = window.location.pathname === '/' || window.location.pathname === '/index.html';
if (isMainPagePath) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMainPage);
  } else {
    initMainPage();
  }
}
