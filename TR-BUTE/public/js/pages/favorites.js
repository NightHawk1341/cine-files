// ============================================================
// FAVORITES PAGE WITH TAGGING
// Display user's favorited products with color-coded tags
// Tags: "present" (gift), "wish" (want), or null (untagged)
// ============================================================

import { isLoggedIn } from '/js/core/auth.js';
import { initFAQPopup, addFAQButton } from '../modules/faq-popup.js';
import { showSkeletonLoaders } from '../modules/skeleton-loader.js';
import { DataStore } from '../core/data-store.js';
import { renderProductGrid } from '../modules/product-grid.js';
import { createPageFilters, sortProducts, matchesSearch } from '../modules/page-filters.js';

// Global state
let allFavoriteProducts = [];
let favoriteTags = {};
let pageFilters = null;

// Page-level state (for cleanup)
let scrollHandler = null;
let shareButtonHandler = null;
let isSharedView = false;
let isFavoritesPageInitialized = false;

/**
 * Load all products from API using DataStore (cached if coming from main page)
 */
const loadAllProducts = async () => {
  try {
    const products = await DataStore.loadProducts();
    return Array.isArray(products) ? products : [];
  } catch (err) {
    console.error('Error loading products:', err);
    return [];
  }
};

/**
 * Get favorites with tags from server
 */
const loadFavoriteTags = async () => {
  if (!isLoggedIn()) return {};

  try {
    const response = await fetch('/api/sync/favorites', {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('tributary_accessToken')}`
      }
    });

    if (!response.ok) {
      console.warn('Failed to load favorite tags from server');
      return {};
    }

    const data = await response.json();
    const tags = {};
    if (data.favoritesWithTags) {
      data.favoritesWithTags.forEach(item => {
        tags[item.productId] = item.tag;
      });
    }
    return tags;
  } catch (err) {
    console.error('Error loading favorite tags:', err);
    return {};
  }
};

/**
 * Update tag for a specific product
 */
const updateProductTag = async (productId, tag) => {
  if (!isLoggedIn()) {
    favoriteTags[productId] = tag;
    localStorage.setItem('tributary_favoriteTags', JSON.stringify(favoriteTags));
    return true;
  }

  try {
    const response = await fetch('/api/favorites/tag', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('tributary_accessToken')}`
      },
      body: JSON.stringify({ productId, tag })
    });

    if (!response.ok) {
      console.error('Failed to update tag on server');
      return false;
    }

    favoriteTags[productId] = tag;
    localStorage.setItem('tributary_favoriteTags', JSON.stringify(favoriteTags));
    return true;
  } catch (err) {
    console.error('Error updating product tag:', err);
    return false;
  }
};

/**
 * Get favorites list from localStorage
 */
const getFavoritesFromStorage = () => {
  try {
    const saved = localStorage.getItem('tributeFavorites');
    if (saved) return new Set(JSON.parse(saved));
  } catch (e) {
    console.error('Error loading favorites:', e);
  }
  return new Set();
};

/**
 * Get favorite tags from localStorage (fallback for non-logged in users)
 */
const getFavoriteTagsFromStorage = () => {
  try {
    const saved = localStorage.getItem('tributary_favoriteTags');
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error('Error loading favorite tags:', e);
  }
  return {};
};

/**
 * Render tag selector for a product card
 */
const renderTagSelector = (productId, currentTag) => {
  const tagBtn = document.createElement('button');
  tagBtn.className = `product-card-tag-btn ${currentTag || 'no-tag'}`;
  tagBtn.dataset.tooltip = 'Изменить список';

  let iconSvg = '';
  if (currentTag === 'present') {
    iconSvg = '<svg width="16" height="16"><use href="#gift-24"></use></svg>';
  } else if (currentTag === 'wish') {
    iconSvg = '<svg width="16" height="16"><use href="#wish-heart"></use></svg>';
  } else {
    iconSvg = '<svg width="16" height="16" viewBox="0 0 64 64"><use href="#tag-filled"></use></svg>';
  }
  tagBtn.innerHTML = iconSvg;

  const dropdown = document.createElement('div');
  dropdown.className = 'tag-dropdown';
  dropdown.innerHTML = `
    <div class="tag-dropdown-header">Выбрать список</div>
    <div class="tag-dropdown-options">
      <button class="tag-dropdown-option tag-present ${currentTag === 'present' ? 'active' : ''}" data-tag="present">
        <svg width="16" height="16"><use href="#gift-24"></use></svg>
        <span>Подарок</span>
      </button>
      <button class="tag-dropdown-option tag-wish ${currentTag === 'wish' ? 'active' : ''}" data-tag="wish">
        <svg width="16" height="16"><use href="#wish-heart"></use></svg>
        <span>Хочу</span>
      </button>
    </div>
  `;

  tagBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    const isCurrentlyOpen = dropdown.classList.contains('active');

    document.querySelectorAll('.card-format-dropdown.active, .variant-dropdown-menu.active, .tag-dropdown.active').forEach(d => {
      if (d !== dropdown) {
        d.classList.remove('active');
        const parentCard = d.closest('.product');
        if (parentCard) parentCard.classList.remove('format-open');
      }
    });

    dropdown.classList.toggle('active', !isCurrentlyOpen);

    if (!isCurrentlyOpen) {
      tagBtn.dataset.tooltip = 'Скрыть';
      setTimeout(() => {
        const headerHeight = document.querySelector('.header')?.offsetHeight || 60;
        const rect = dropdown.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const isAboveViewport = rect.top < headerHeight;
        const isBelowViewport = rect.bottom > viewportHeight;
        if (isAboveViewport || isBelowViewport) {
          if (isBelowViewport) {
            const bottomNavEl = window.innerWidth <= 1024 ? document.querySelector('.bottom-nav') : null;
            const bottomNavHeight = bottomNavEl ? bottomNavEl.offsetHeight : 0;
            window.scrollTo({ top: window.pageYOffset + rect.bottom - viewportHeight + 20 + bottomNavHeight, behavior: 'smooth' });
          } else {
            window.scrollTo({ top: window.pageYOffset + rect.top - headerHeight - 10, behavior: 'smooth' });
          }
        }
      }, 100);
    } else {
      tagBtn.dataset.tooltip = 'Изменить список';
    }
  });

  document.addEventListener('click', (e) => {
    if (!tagBtn.contains(e.target) && !dropdown.contains(e.target)) {
      if (dropdown.classList.contains('active')) {
        dropdown.classList.remove('active');
        tagBtn.dataset.tooltip = 'Изменить список';
      }
    }
  });

  dropdown.querySelectorAll('.tag-dropdown-option').forEach(option => {
    option.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const clickedTag = option.dataset.tag;
      const isCurrentlyActive = option.classList.contains('active');
      const newTag = isCurrentlyActive ? null : clickedTag;

      const success = await updateProductTag(productId, newTag);

      if (success) {
        const tagNames = { present: 'Подарок', wish: 'Хочу' };

        tagBtn.className = `product-card-tag-btn ${newTag || 'no-tag'}`;
        tagBtn.dataset.tooltip = tagNames[newTag] || 'Изменить список';

        if (newTag === 'present') {
          tagBtn.innerHTML = '<svg width="16" height="16"><use href="#gift-24"></use></svg>';
        } else if (newTag === 'wish') {
          tagBtn.innerHTML = '<svg width="16" height="16"><use href="#wish-heart"></use></svg>';
        } else {
          tagBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 64 64"><use href="#tag-filled"></use></svg>';
        }

        dropdown.querySelectorAll('.tag-dropdown-option').forEach(opt => {
          opt.classList.toggle('active', opt.dataset.tag === newTag);
        });

        if (window.showToast) {
          const message = newTag ? `Метка: ${tagNames[newTag]}` : 'Метка удалена';
          window.showToast(message, 'success', 2000);
        }

        dropdown.classList.remove('active');

        // Re-render with current filters
        applyFavoritesFilters(pageFilters ? pageFilters.getFilters() : {});
      } else {
        if (window.showToast) {
          window.showToast('Ошибка обновления метки', 'error', 3000);
        }
      }
    });
  });

  return { button: tagBtn, menu: dropdown };
};

/**
 * Apply filters and render favorites
 */
function applyFavoritesFilters(filterState) {
  const favoritesItemsList = document.getElementById('favorites-items-list');
  if (!favoritesItemsList || !allFavoriteProducts.length) return;

  const searchQ = filterState.search?.toLowerCase() || '';

  let filtered = allFavoriteProducts.filter(product => {
    if (!matchesSearch(product, searchQ)) return false;
    if (filterState.genre && product.genre !== filterState.genre) return false;
    if (filterState.type && product.type !== filterState.type) return false;

    // Tag filter
    if (filterState.tag) {
      const productTag = favoriteTags[product.id];
      if (filterState.tag === 'present' && productTag !== 'present') return false;
      if (filterState.tag === 'wish' && productTag !== 'wish') return false;
    }

    return true;
  });

  filtered = sortProducts([...filtered], filterState.sort, filterState.sortDirection);

  if (filtered.length === 0) {
    const hasAnyFilter = filterState.search || filterState.genre || filterState.type || filterState.tag || filterState.sort;
    const msg = hasAnyFilter ? 'Нет товаров по выбранным фильтрам' : 'Нет избранных товаров';
    favoritesItemsList.innerHTML = `<div class="favorites-empty-state">${msg}</div>`;
    return;
  }

  renderProductGrid(favoritesItemsList, filtered, {
    defaultProperty: 'A3 без рамки',
    gridExtras: ['сборка обложки', 'варианты', 'приближение'],
    clearContainer: true,
    onFavoriteClick: (productId) => {
      const card = document.querySelector(`#favorites-items-list [data-product-id="${productId}"]`);
      if (!card || card.classList.contains('removing')) return;

      const overlay = document.createElement('div');
      overlay.className = 'product-remove-overlay';
      const undoBtn = document.createElement('button');
      undoBtn.className = 'product-remove-undo';
      undoBtn.textContent = 'Вернуть';
      overlay.appendChild(undoBtn);
      card.appendChild(overlay);
      card.classList.add('removing');

      const timer = setTimeout(async () => {
        if (window.toggleFavorite) window.toggleFavorite(productId);

        allFavoriteProducts = allFavoriteProducts.filter(p => p.id !== productId);
        delete favoriteTags[productId];
        card.remove();

        // Re-apply filters after removal
        applyFavoritesFilters(pageFilters ? pageFilters.getFilters() : {});

        if (window.syncFavoritesToServer) {
          try {
            await window.syncFavoritesToServer(window.favorites);
          } catch (syncError) {
            console.error('Error syncing favorites:', syncError);
          }
        }
      }, 2000);

      undoBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        clearTimeout(timer);
        overlay.remove();
        card.classList.remove('removing');
      });
    },
    afterCardRender: (card, product) => {
      const currentTag = favoriteTags[product.id];
      const { button, menu } = renderTagSelector(product.id, currentTag);
      const buttonGroup = card.querySelector('.product-card-buttons');
      const favoriteBtn = buttonGroup?.querySelector('.favorite-button');
      if (buttonGroup && favoriteBtn) {
        const zoomBtn = buttonGroup.querySelector('.zoom-button');
        (zoomBtn || favoriteBtn).insertAdjacentElement('afterend', button);
      }
      card.appendChild(menu);
    }
  });
}

/**
 * Load and display favorite products
 */
const loadFavoritesPage = async () => {
  const favoritesItemsList = document.getElementById('favorites-items-list');

  if (!favoritesItemsList) {
    console.error('Favorites items list element not found');
    return;
  }

  // Show skeleton loaders
  const existingSkeletons = favoritesItemsList.querySelectorAll('.product-skeleton');
  const hasPrerenderedSkeletons = existingSkeletons.length === 18;

  if (!favoritesItemsList.children.length || !hasPrerenderedSkeletons) {
    const isDesktop = window.innerWidth > 1024;
    const skeletonCount = isDesktop ? 18 : 6;
    showSkeletonLoaders(favoritesItemsList, 'product', skeletonCount);
  }

  if (window.waitForData) {
    await window.waitForData();
  } else if (window.utilsReady) {
    await window.utilsReady;
  }

  if (window.loadProductVariants) {
    await window.loadProductVariants();
  }

  // Load tags
  if (isLoggedIn()) {
    favoriteTags = await loadFavoriteTags();
  } else {
    favoriteTags = getFavoriteTagsFromStorage();
  }

  const userFavorites = getFavoritesFromStorage();

  // Setup page filters module
  const wrapper = document.querySelector('.favorites-page-content .sticky-filter-wrapper');
  if (wrapper) {
    wrapper.style.display = '';

    pageFilters = createPageFilters(wrapper, {
      pageId: 'favorites',
      features: { search: true, genres: true, types: true, sort: true, reset: true, collapse: true },
      extraGroups: [{
        key: 'tag',
        groupClass: 'tags-group',
        buttonClass: 'extra-filter-button',
        buttons: [
          { label: 'Подарок', value: 'present' },
          { label: 'Хочу', value: 'wish' }
        ]
      }],
      storageKey: 'favoritesPageFilters',
      onFilter: applyFavoritesFilters
    });
  }

  if (userFavorites.size === 0) {
    const emptyMsg = !isLoggedIn()
      ? 'Нет избранных товаров. <button type="button" class="login-prompt-link">Войдите</button>, чтобы добавить'
      : 'Нет избранных товаров';
    favoritesItemsList.innerHTML = `<div class="favorites-empty-state">${emptyMsg}</div>`;
    const loginBtn = favoritesItemsList.querySelector('.login-prompt-link');
    if (loginBtn) {
      loginBtn.addEventListener('click', () => {
        if (typeof smoothNavigate === 'function') smoothNavigate('/profile');
        else window.location.href = '/profile';
      });
    }
    return;
  }

  try {
    const allProducts = await loadAllProducts();
    const favoriteProducts = allProducts.filter(product => userFavorites.has(product.id));
    allFavoriteProducts = favoriteProducts;

    if (favoriteProducts.length === 0) {
      favoritesItemsList.innerHTML = '<div class="favorites-empty-state">Нет избранных товаров</div>';
      return;
    }

    // Apply initial filters
    applyFavoritesFilters(pageFilters ? pageFilters.getFilters() : {});

  } catch (err) {
    console.error('Error loading favorites:', err);
    favoritesItemsList.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-secondary, #a3a3a3);">Ошибка загрузки избранного</div>';
  }
};

/**
 * Initialize share button for logged-in users
 */
function initShareButton() {
  const shareBtn = document.getElementById('favorites-share-button');
  if (!shareBtn) return;
  if (!isLoggedIn()) {
    shareBtn.style.display = 'none';
    return;
  }
  shareBtn.style.display = '';
  shareButtonHandler = async () => {
    shareBtn.disabled = true;
    try {
      const token = localStorage.getItem('tributary_accessToken');
      const resp = await fetch('/api/favorites/share', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        if (typeof window.showToast === 'function') {
          window.showToast(errData.error || 'Не удалось создать ссылку', 'error');
        }
        return;
      }
      const data = await resp.json();
      const shareUrl = data.shareUrl;
      // Telegram share
      if (window.Telegram?.WebApp?.platform && window.Telegram.WebApp.platform !== 'unknown') {
        try {
          const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent('Мой список избранного')}`;
          window.Telegram.WebApp.openTelegramLink(tgUrl);
          return;
        } catch (err) {
          console.warn('Telegram share error:', err);
        }
      }
      // Web Share API
      if (navigator.share) {
        try {
          await navigator.share({ title: 'Мой список избранного', url: shareUrl });
          return;
        } catch (err) {
          if (err.name === 'AbortError') return;
        }
      }
      // Clipboard fallback
      try {
        await navigator.clipboard.writeText(shareUrl);
        if (typeof window.showToast === 'function') window.showToast('Ссылка скопирована');
      } catch {
        if (typeof window.showToast === 'function') window.showToast('Не удалось скопировать ссылку', 'error');
      }
    } catch (err) {
      console.error('Share error:', err);
      if (typeof window.showToast === 'function') window.showToast('Ошибка при создании ссылки', 'error');
    } finally {
      shareBtn.disabled = false;
    }
  };
  shareBtn.addEventListener('click', shareButtonHandler);
}
/**
 * Load and display a shared wishlist
 */
async function loadSharedWishlist(token) {
  isSharedView = true;
  const favoritesItemsList = document.getElementById('favorites-items-list');
  const shareBtn = document.getElementById('favorites-share-button');
  if (shareBtn) shareBtn.style.display = 'none';
  // Update title
  const titleEl = document.querySelector('.favorites-title');
  if (titleEl) titleEl.textContent = 'Список избранного';
  if (!favoritesItemsList) return;
  // Show skeleton while loading
  const isDesktop = window.innerWidth > 1024;
  showSkeletonLoaders(favoritesItemsList, 'product', isDesktop ? 18 : 6);
  try {
    const resp = await fetch(`/api/favorites/shared/${encodeURIComponent(token)}`);
    if (!resp.ok) {
      favoritesItemsList.innerHTML = '<div class="favorites-empty-state">Список не найден или ссылка недействительна</div>';
      return;
    }
    const data = await resp.json();
    if (data.expired) {
      favoritesItemsList.innerHTML = '<div class="favorites-empty-state">Срок действия ссылки истёк</div>';
      return;
    }
    const products = data.products || [];
    if (products.length === 0) {
      favoritesItemsList.innerHTML = '<div class="favorites-empty-state">Список пуст</div>';
      return;
    }
    // Show banner
    const banner = document.createElement('div');
    banner.className = 'shared-wishlist-banner';
    banner.innerHTML = `
      <span>Общий список избранного</span>
      <a href="/favorites" class="shared-wishlist-own-link">Перейти к моим избранным →</a>
    `;
    banner.querySelector('.shared-wishlist-own-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      if (typeof window.smoothNavigate === 'function') window.smoothNavigate('/favorites');
      else window.location.href = '/favorites';
    });
    favoritesItemsList.parentNode.insertBefore(banner, favoritesItemsList);
    // Wait for data utilities
    if (window.waitForData) await window.waitForData();
    else if (window.utilsReady) await window.utilsReady;
    if (window.loadProductVariants) await window.loadProductVariants();
    // Render products in a grid
    allFavoriteProducts = products;
    renderProductGrid(favoritesItemsList, products, {
      defaultProperty: 'A3 без рамки',
      gridExtras: ['сборка обложки', 'варианты', 'приближение'],
      clearContainer: true
    });
  } catch (err) {
    console.error('Error loading shared wishlist:', err);
    favoritesItemsList.innerHTML = '<div class="favorites-empty-state">Ошибка загрузки списка</div>';
  }
}

/**
 * Initialize favorites page
 */
function initFavoritesPage() {
  if (isFavoritesPageInitialized) return;
  isFavoritesPageInitialized = true;

  allFavoriteProducts = [];
  favoriteTags = {};

  initFAQPopup('favorites');
  addFAQButton('.favorites-title');

  // Check for shared wishlist token
  const urlParams = new URLSearchParams(window.location.search);
  const sharedToken = urlParams.get('shared');
  if (sharedToken) {
    loadSharedWishlist(sharedToken);
  } else {
    loadFavoritesPage();
    initShareButton();
  }

  const scrollToTopBtn = document.getElementById('scroll-to-top-btn');
  if (scrollToTopBtn) {
    scrollHandler = () => {
      if (window.scrollY > 300) {
        scrollToTopBtn.classList.add('visible');
      } else {
        scrollToTopBtn.classList.remove('visible');
      }
    };
    window.addEventListener('scroll', scrollHandler, { passive: true });

    scrollToTopBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (typeof window.triggerHaptic === 'function') window.triggerHaptic();
    });
  }
}

/**
 * Cleanup favorites page
 */
function cleanupFavoritesPage() {
  isFavoritesPageInitialized = false;

  if (pageFilters) {
    pageFilters.destroy();
    pageFilters = null;
  }

  if (scrollHandler) {
    window.removeEventListener('scroll', scrollHandler);
    scrollHandler = null;
  }

  if (shareButtonHandler) {
    const shareBtn = document.getElementById('favorites-share-button');
    if (shareBtn) shareBtn.removeEventListener('click', shareButtonHandler);
    shareButtonHandler = null;
  }

  allFavoriteProducts = [];
  favoriteTags = {};

  if (window.activeCarousels) {
    window.activeCarousels.forEach((state) => {
      if (state.autoPlayInterval) clearInterval(state.autoPlayInterval);
    });
    window.activeCarousels.clear();
  }
}

// Register with SPA router
if (typeof window.registerPage === 'function') {
  window.registerPage('/favorites', {
    init: initFavoritesPage,
    cleanup: cleanupFavoritesPage
  });
}

// Auto-initialize for direct page visits
const isFavoritesPagePath = window.location.pathname === '/favorites' || window.location.pathname === '/favorites.html';
if (isFavoritesPagePath) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFavoritesPage);
  } else {
    initFavoritesPage();
  }
}
