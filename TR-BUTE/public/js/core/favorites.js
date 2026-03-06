// ============================================================
// FAVORITES MANAGEMENT
// localStorage-based favorites with UI sync
// ============================================================

import { favorites, setFavorites } from './state.js';

/**
 * Load favorites from localStorage
 * Initializes the favorites Set from stored data
 * @example
 * loadFavorites() // Call on page load
 */
export const loadFavorites = () => {
  try {
    const saved = localStorage.getItem('tributeFavorites');
    if (saved) {
      const favoritesSet = new Set(JSON.parse(saved));
      setFavorites(favoritesSet);
      window.favorites = favoritesSet; // For backward compatibility
    } else {
      const emptySet = new Set();
      setFavorites(emptySet);
      window.favorites = emptySet;
    }
  } catch (e) {
    console.error('Error loading favorites:', e);
    const emptySet = new Set();
    setFavorites(emptySet);
    window.favorites = emptySet;
  }
};

/**
 * Save favorites to localStorage
 * Persists current favorites Set to localStorage
 * @example
 * saveFavorites() // Call after modifying favorites
 */
export const saveFavorites = () => {
  try {
    const currentFavorites = window.favorites || favorites;
    localStorage.setItem('tributeFavorites', JSON.stringify([...currentFavorites]));
  } catch (e) {
    console.error('Error saving favorites:', e);
  }
};

/**
 * Toggle favorite status for a product
 * Updates localStorage and refreshes all favorite buttons on the page
 * @param {number} productId - Product ID to toggle
 * @example
 * toggleFavorite(123) // Toggle favorite for product ID 123
 */
export const toggleFavorite = (productId) => {
  if (!window.favorites) {
    window.favorites = new Set();
  }

  if (window.favorites.has(productId)) {
    window.favorites.delete(productId);
  } else {
    window.favorites.add(productId);
  }
  saveFavorites();
  window.dispatchEvent(new Event('favoritesUpdated'));

  const nowFavorite = window.favorites.has(productId);
  const favoriteTooltip = nowFavorite ? 'Убрать из избранного' : 'В избранное';

  // Update all favorite buttons for this product across the entire page
  document.querySelectorAll(`[data-product-id="${productId}"]`).forEach(card => {
    const heartBtn = card.querySelector('.favorite-button');
    if (heartBtn) {
      heartBtn.classList.toggle('is-favorite', nowFavorite);
      heartBtn.dataset.tooltip = favoriteTooltip;
    }
  });

  // Also update standalone favorite buttons (like on product page)
  document.querySelectorAll('.favorite-button').forEach(btn => {
    // Check if this button is for the current product (on product page)
    const pageProductId = window.currentProduct?.id;
    if (pageProductId === productId) {
      btn.classList.toggle('is-favorite', nowFavorite);
      btn.dataset.tooltip = favoriteTooltip;
    }
  });
};

/**
 * Toggle favorite with server sync and toast notification
 * Wrapper for toggleFavorite that adds user feedback and server sync
 * @param {number} productId - Product ID to toggle
 * @example
 * toggleFavoriteSynced(123) // Toggle with toast + server sync
 */
export const toggleFavoriteSynced = (productId) => {
  toggleFavorite(productId);
  const nowFavorite = window.favorites.has(productId);

  if (window.showToast) {
    const undoCallback = () => {
      toggleFavorite(productId);
      if (typeof syncFavoritesToServer === 'function') {
        syncFavoritesToServer(window.favorites).catch(() => {});
      }
    };
    if (nowFavorite) {
      window.showToast('Добавлено в избранное', 'success', 3000, false, {}, undoCallback);
    } else {
      window.showToast('Удалено из избранного', 'removed', 3000, false, {}, undoCallback);
    }
  }

  // Async server sync (fire and forget, page reload handles verification)
  if (typeof syncFavoritesToServer === 'function') {
    syncFavoritesToServer(window.favorites).catch(err => {
      console.error('Favorites sync error:', err);
    });
  }
};

// Make favorites functions available globally for backward compatibility
if (typeof window !== 'undefined') {
  window.loadFavorites = loadFavorites;
  window.saveFavorites = saveFavorites;
  window.toggleFavorite = toggleFavorite;
  window.toggleFavoriteSynced = toggleFavoriteSynced;
}
