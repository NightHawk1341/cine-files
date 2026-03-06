// ============================================================
// CATALOG PAGE
// Display products from a specific catalog
// ============================================================

import { showSkeletonLoaders } from '../modules/skeleton-loader.js';
import { initFAQPopup, addFAQButton } from '../modules/faq-popup.js';
import { renderProductGrid, createProductCard } from '../modules/product-grid.js';
import { showPageScreen } from '../modules/page-screen.js';
import { createPageFilters, sortProducts, matchesSearch } from '../modules/page-filters.js';

const CATALOG_SEGMENT_SIZE = 96;

// Page-level state (for cleanup)
let scrollHandler = null;
let shareButtonHandler = null;
let isCatalogPageInitialized = false;
let catalogScrollObserver = null;
let pageFilters = null;

let allCatalogProducts = [];

/**
 * Apply filters and re-render the product grid
 */
function applyFilters(filterState) {
  const catalogItemsList = document.getElementById('catalog-items-list');
  if (!catalogItemsList || !allCatalogProducts.length) return;

  const searchQ = filterState.search?.toLowerCase() || '';

  let filtered = allCatalogProducts.filter(product => {
    if (!matchesSearch(product, searchQ)) return false;
    if (filterState.genre && product.genre !== filterState.genre) return false;
    if (filterState.type && product.type !== filterState.type) return false;
    return true;
  });

  filtered = sortProducts([...filtered], filterState.sort, filterState.sortDirection);

  setupCatalogInfiniteScroll(catalogItemsList, filtered);

  // Keep scroll-to-top button visible while sorting is active
  const scrollToTopBtn = document.getElementById('scroll-to-top-btn');
  if (scrollToTopBtn?._update) scrollToTopBtn._update();
}

/**
 * Render the first segment of catalog products and load the rest on scroll
 */
function setupCatalogInfiniteScroll(container, allProducts) {
  if (catalogScrollObserver) {
    catalogScrollObserver.disconnect();
    catalogScrollObserver = null;
  }

  const firstBatch = allProducts.slice(0, CATALOG_SEGMENT_SIZE);
  const isLastSegment = allProducts.length <= CATALOG_SEGMENT_SIZE;

  renderProductGrid(container, firstBatch, {
    defaultProperty: 'A3 без рамки',
    gridExtras: ['сборка обложки', 'варианты', 'приближение'],
    clearContainer: true
  });

  if (isLastSegment) return;

  let loadedSegments = 1;
  let isLoadingMore = false;
  let sentinel = document.createElement('div');
  sentinel.className = 'products-sentinel';
  container.appendChild(sentinel);

  catalogScrollObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !isLoadingMore) {
        isLoadingMore = true;

        setTimeout(() => {
          const nextStart = loadedSegments * CATALOG_SEGMENT_SIZE;
          const nextEnd = nextStart + CATALOG_SEGMENT_SIZE;

          if (nextStart < allProducts.length) {
            const newProducts = allProducts.slice(nextStart, nextEnd);
            const done = nextEnd >= allProducts.length;

            sentinel.remove();

            newProducts.forEach(product => {
              const card = createProductCard(product, {
                defaultProperty: 'A3 без рамки',
                gridExtras: ['сборка обложки', 'варианты', 'приближение']
              });
              container.appendChild(card);
            });

            loadedSegments++;

            if (done) {
              catalogScrollObserver.disconnect();
            } else {
              sentinel = document.createElement('div');
              sentinel.className = 'products-sentinel';
              container.appendChild(sentinel);
              catalogScrollObserver.observe(sentinel);
            }
          }

          isLoadingMore = false;
        }, 100);
      }
    });
  }, { rootMargin: '500px' });

  catalogScrollObserver.observe(sentinel);
}

/**
 * Load and display catalog products
 */
const loadCatalog = async (catalogId, catalogTitle) => {
  const catalogTitleEl = document.getElementById('catalog-popup-title');
  const catalogItemsList = document.getElementById('catalog-items-list');

  if (!catalogItemsList) {
    console.error('Catalog items list element not found');
    return;
  }

  // Set catalog title immediately from URL parameter
  if (catalogTitleEl && catalogTitle && catalogTitle !== 'Каталог') {
    const skeleton = catalogTitleEl.querySelector('.skeleton');
    if (skeleton) skeleton.remove();

    const existingButton = catalogTitleEl.querySelector('.page-faq-button');
    if (existingButton) {
      const textNode = Array.from(catalogTitleEl.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
      if (textNode) {
        textNode.textContent = catalogTitle;
      } else {
        catalogTitleEl.insertBefore(document.createTextNode(catalogTitle), catalogTitleEl.firstChild);
      }
    } else {
      catalogTitleEl.textContent = catalogTitle;
    }
    document.title = `${catalogTitle} - TR/BUTE`;
  }

  // Show skeleton loaders
  const existingSkeletons = catalogItemsList.querySelectorAll('.product-skeleton');
  const hasPrerenderedSkeletons = existingSkeletons.length === 18;

  if (!catalogItemsList.children.length || !hasPrerenderedSkeletons) {
    const isDesktop = window.innerWidth > 1024;
    const skeletonCount = isDesktop ? 18 : 6;
    showSkeletonLoaders(catalogItemsList, 'product', skeletonCount);
  }

  if (window.waitForData) {
    await window.waitForData();
  } else if (window.utilsReady) {
    await window.utilsReady;
  }

  if (window.loadProductVariants) {
    await window.loadProductVariants();
  }

  try {
    const res = await fetch(`/api/catalog/${catalogId}`);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    const catalogProducts = data.products || [];

    // Set catalog title from API response
    if (catalogTitleEl && data.catalog) {
      const newTitle = data.catalog.title || catalogTitle || 'Каталог';
      const skeleton = catalogTitleEl.querySelector('.skeleton');
      if (skeleton) skeleton.remove();

      const existingButton = catalogTitleEl.querySelector('.page-faq-button');
      if (existingButton) {
        const textNode = Array.from(catalogTitleEl.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
        if (textNode) {
          textNode.textContent = newTitle;
        } else {
          catalogTitleEl.insertBefore(document.createTextNode(newTitle), catalogTitleEl.firstChild);
        }
      } else {
        catalogTitleEl.textContent = newTitle;
      }
      document.title = `${newTitle} - TR/BUTE`;
    }

    if (catalogProducts.length === 0) {
      showPageScreen(catalogItemsList, {
        title: 'Пока нет постеров',
        text: 'В этом каталоге ещё не добавлены товары',
      });
      return;
    }

    allCatalogProducts = catalogProducts;

    // Setup page filters
    const wrapper = document.querySelector('.catalog-page-content .sticky-filter-wrapper');
    if (wrapper) {
      // Only show filters if there are products
      wrapper.style.display = '';

      pageFilters = createPageFilters(wrapper, {
        pageId: 'catalog',
        features: { search: true, genres: true, types: true, sort: true, reset: true, collapse: true },
        storageKey: `catalogPageFilters_${catalogId}`,
        onFilter: applyFilters
      });

      // Apply initial filters (may restore from storage)
      applyFilters(pageFilters.getFilters());
    } else {
      setupCatalogInfiniteScroll(catalogItemsList, catalogProducts);
    }

  } catch (err) {
    console.error('Error loading catalog products:', err);
    showPageScreen(catalogItemsList, {
      title: 'Ошибка загрузки',
      text: 'Не удалось загрузить каталог. Попробуйте обновить страницу.',
    });
  }
};

/**
 * Initialize catalog page
 */
function initCatalogPage() {
  if (isCatalogPageInitialized) return;
  isCatalogPageInitialized = true;

  initFAQPopup('catalog');
  addFAQButton('.catalog-title');

  const urlParams = new URLSearchParams(window.location.search);
  const catalogId = urlParams.get('id');
  const catalogTitle = urlParams.get('title') || 'Каталог';

  if (catalogId) {
    loadCatalog(catalogId, catalogTitle);
  } else {
    const overlay = document.querySelector('.catalog-page-overlay');
    if (overlay) {
      showPageScreen(overlay, {
        title: 'Каталог не найден',
        text: 'Воспользуйтесь навигацией',
        buttons: [{ label: 'На главную', href: '/' }],
      });
    }
    document.documentElement.classList.remove('page-loading');
    document.documentElement.classList.add('page-ready');
  }

  // Setup share button
  const shareButton = document.getElementById('catalog-share-button');
  if (shareButton) {
    shareButtonHandler = async () => {
      const url = window.location.href;
      const title = catalogTitle || 'Каталог';

      if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.platform !== 'unknown') {
        try {
          const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`;
          window.Telegram.WebApp.openTelegramLink(shareUrl);
          return;
        } catch (err) {
          console.warn('Telegram share error:', err);
        }
      }

      if (navigator.share) {
        try {
          await navigator.share({ title, url });
          return;
        } catch (err) {
          if (err.name === 'AbortError') return;
          console.warn('Share API error:', err);
        }
      }

      try {
        await navigator.clipboard.writeText(url);
        if (typeof window.showToast === 'function') {
          window.showToast('Ссылка скопирована');
        }
      } catch (err) {
        console.error('Failed to copy link:', err);
        if (typeof window.showToast === 'function') {
          window.showToast('Не удалось скопировать ссылку', 'removed');
        }
      }
    };
    shareButton.addEventListener('click', shareButtonHandler);
  }

  // Scroll-to-top button
  const scrollToTopBtn = document.getElementById('scroll-to-top-btn');
  if (scrollToTopBtn) {
    const updateScrollToTopBtn = () => {
      const sortActive = !!(pageFilters && pageFilters.getFilters().sort);
      scrollToTopBtn.classList.toggle('visible', window.scrollY > 300 || sortActive);
    };
    scrollToTopBtn._update = updateScrollToTopBtn;
    scrollHandler = updateScrollToTopBtn;
    window.addEventListener('scroll', scrollHandler, { passive: true });

    scrollToTopBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (typeof window.triggerHaptic === 'function') window.triggerHaptic();
    });
  }
}

/**
 * Cleanup catalog page
 */
function cleanupCatalogPage() {
  isCatalogPageInitialized = false;

  if (pageFilters) {
    pageFilters.destroy();
    pageFilters = null;
  }

  if (catalogScrollObserver) {
    catalogScrollObserver.disconnect();
    catalogScrollObserver = null;
  }

  if (scrollHandler) {
    window.removeEventListener('scroll', scrollHandler);
    scrollHandler = null;
  }

  if (window.activeCarousels) {
    window.activeCarousels.forEach((state) => {
      if (state.autoPlayInterval) clearInterval(state.autoPlayInterval);
    });
    window.activeCarousels.clear();
  }

  allCatalogProducts = [];
}

// Register with SPA router
if (typeof window.registerPage === 'function') {
  window.registerPage('/catalog', {
    init: initCatalogPage,
    cleanup: cleanupCatalogPage
  });
}

// Auto-initialize for direct page visits
const isCatalogPagePath = window.location.pathname === '/catalog' || window.location.pathname === '/catalog.html';
if (isCatalogPagePath) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCatalogPage);
  } else {
    initCatalogPage();
  }
}
