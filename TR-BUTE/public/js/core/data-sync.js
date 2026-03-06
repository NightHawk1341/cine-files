/**
 * DataSync Module
 * Handles synchronization of user data (favorites, cart, picker) with server
 * Requires auth.js for authentication
 */

import { isLoggedIn, getAuthHeader } from './auth.js';

// Record when this browser session started so the login merge can distinguish
// items added this session from stale items left over from a previous session.
if (!sessionStorage.getItem('tributeSessionStart')) {
  sessionStorage.setItem('tributeSessionStart', String(Date.now()));
}

/**
 * Sync favorites to server
 * @param {Array} favorites - Array of favorite product IDs
 * @returns {Promise<boolean>} True if sync successful
 */
export async function syncFavoritesToServer(favorites) {
  if (!isLoggedIn()) return false;

  try {
    const response = await fetch('/api/sync/favorites', {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify({ favorites: Array.from(favorites) })
    });

    return response.ok;
  } catch (err) {
    console.error('Failed to sync favorites:', err);
    return false;
  }
}

/**
 * Load favorites from server
 * @returns {Promise<Array>} Array of favorite product IDs
 */
export async function loadFavoritesFromServer() {
  if (!isLoggedIn()) return [];

  try {
    const response = await fetch('/api/sync/favorites', {
      headers: getAuthHeader()
    });

    if (!response.ok) {
      return [];
    }

    return await response.json();
  } catch (err) {
    console.error('Failed to load favorites from server:', err);
    return [];
  }
}

/**
 * Sync cart to server
 * @param {Object} cart - Cart object
 * @param {Object} variations - Cart variations (variation numbers and custom URLs)
 * @returns {Promise<boolean>} True if sync successful
 */
export async function syncCartToServer(cart, variations) {
  if (!isLoggedIn()) return false;

  try {
    const response = await fetch('/api/sync/cart', {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify({ cart, variations })
    });

    if (response.ok) {
      // Record when the cart was last successfully synced so the login merge
      // can distinguish newly-added local items from stale ones that were
      // deleted on another device/session.
      localStorage.setItem('tributeCartLastSync', String(Date.now()));
    }

    return response.ok;
  } catch (err) {
    console.error('Failed to sync cart:', err);
    return false;
  }
}

/**
 * Load cart from server
 * @returns {Promise<Object>} Object with cart and variations
 */
export async function loadCartFromServer() {
  if (!isLoggedIn()) return { cart: {}, variations: {} };

  try {
    const response = await fetch('/api/sync/cart', {
      headers: getAuthHeader()
    });

    if (!response.ok) {
      return { cart: {}, variations: {} };
    }

    const data = await response.json();

    // Handle old format (just cart) and new format (cart + variations)
    if (data.cart !== undefined) {
      return { cart: data.cart, variations: data.variations || {} };
    } else {
      // Old format - data is the cart
      return { cart: data, variations: {} };
    }
  } catch (err) {
    console.error('Failed to load cart from server:', err);
    return { cart: {}, variations: {} };
  }
}

/**
 * Sync picker progress to server
 * @param {Array} products - Array of product IDs in picker
 * @param {number} currentIndex - Current index in picker
 * @param {Array} history - History of liked/skipped products
 * @returns {Promise<boolean>} True if sync successful
 */
export async function syncPickerToServer(products, currentIndex, history) {
  if (!isLoggedIn()) return false;

  try {
    const response = await fetch('/api/sync/picker', {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify({ products, currentIndex, history })
    });

    return response.ok;
  } catch (err) {
    console.error('Failed to sync picker:', err);
    return false;
  }
}

/**
 * Load picker progress from server
 * @returns {Promise<Object|null>} Picker state object or null
 */
export async function loadPickerFromServer() {
  if (!isLoggedIn()) return null;

  try {
    const response = await fetch('/api/sync/picker', {
      headers: getAuthHeader()
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (err) {
    console.error('Failed to load picker from server:', err);
    return null;
  }
}

// ============================================================
// MERGE FUNCTIONS
// Handle merging localStorage data with server data on login
// ============================================================

/**
 * Merge local favorites with server favorites
 * Creates union of both sets
 * @param {Array} localFavorites - Array of product IDs from localStorage
 * @param {Array} serverFavorites - Array of product IDs from server
 * @returns {Array} Merged array of unique product IDs
 */
export function mergeFavorites(localFavorites, serverFavorites) {
  const localSet = new Set(localFavorites || []);
  const serverSet = new Set(serverFavorites || []);

  // Union of both sets
  const merged = new Set([...localSet, ...serverSet]);
  return Array.from(merged);
}

/**
 * Merge local cart with server cart
 * Server is authoritative for items that exist on both sides (quantity, checked).
 * Local-only items are kept (new additions pending sync).
 * Server-only items are kept (added on another device).
 * @param {Object} localCart - Cart object from localStorage
 * @param {Object} serverCart - Cart object from server
 * @returns {Object} Merged cart object
 */
export function mergeCart(localCart, serverCart) {
  const merged = {};
  const local = localCart || {};
  const server = serverCart || {};

  // Get all unique keys from both carts
  const allKeys = new Set([...Object.keys(local), ...Object.keys(server)]);

  for (const key of allKeys) {
    const localItem = local[key];
    const serverItem = server[key];

    if (localItem && serverItem) {
      // Item exists in both — server is authoritative for quantity and checked
      // because it was last synced from a device with the correct state.
      // Preserve local-only fields (unitPrice, custom_url, imageId) that the
      // server doesn't store.
      const parseTimestamp = (t) => {
        if (!t) return 0;
        if (typeof t === 'number') return t;
        const parsed = new Date(t).getTime();
        return isNaN(parsed) ? 0 : parsed;
      };
      const localAddedAt = parseTimestamp(localItem.addedAt);
      const serverAddedAt = parseTimestamp(serverItem.addedAt);

      merged[key] = {
        ...serverItem,
        unitPrice: localItem.unitPrice || serverItem.unitPrice,
        custom_url: localItem.custom_url || serverItem.custom_url,
        imageId: localItem.imageId || serverItem.imageId,
        quantity: serverItem.quantity || 1,
        addedAt: Math.max(localAddedAt, serverAddedAt),
        checked: serverItem.checked !== undefined ? serverItem.checked : (localItem.checked !== false)
      };
    } else if (localItem) {
      // Only in local
      merged[key] = { ...localItem };
    } else {
      // Only in server
      merged[key] = { ...serverItem };
    }
  }

  // Deduplicate: collapse entries with the same productId + property into one.
  // This can happen when old-format keys (just "123") and new-format keys
  // ("123_A3 без рамки") coexist after a merge, both representing the same item.
  // Custom product (id=1) items are intentionally NOT deduplicated — each upload is unique.
  const seen = new Map(); // dedupeKey -> winner key in merged
  for (const key of Object.keys(merged)) {
    const item = merged[key];
    if (item.type === 'certificate' || item.type === 'certificate_redemption') continue;
    if (!item.productId || !item.property) continue;

    // Custom product (id=1): each combination is unique, skip deduplication
    if (item.productId === 1) continue;

    const dedupeKey = `${item.productId}_${item.property}`;
    const canonicalKey = dedupeKey; // preferred key format

    if (seen.has(dedupeKey)) {
      const winnerKey = seen.get(dedupeKey);
      // Guard: if the current key IS the winner (happens when a previous old-format key
      // was renamed to this canonical key, which was also in the initial snapshot),
      // the item is already the winner — skip to avoid self-doubling then self-deletion.
      if (winnerKey === key) continue;
      // Take the higher quantity (these are two keys for the same item, not two separate items)
      merged[winnerKey].quantity = Math.max(merged[winnerKey].quantity || 1, item.quantity || 1);
      delete merged[key];
      // If the winner key is not canonical, rename it
      if (winnerKey !== canonicalKey && merged[winnerKey]) {
        merged[canonicalKey] = merged[winnerKey];
        merged[canonicalKey].productId = item.productId;
        delete merged[winnerKey];
        seen.set(dedupeKey, canonicalKey);
      }
    } else {
      seen.set(dedupeKey, key);
      // Rename to canonical key if needed; if canonicalKey already holds a server
      // item, merge both so we don't silently drop the higher server quantity.
      if (key !== canonicalKey) {
        const existing = merged[canonicalKey];
        merged[canonicalKey] = {
          ...(existing || {}),
          ...item,
          productId: item.productId,
          quantity: Math.max((existing && existing.quantity) || 1, item.quantity || 1)
        };
        delete merged[key];
        seen.set(dedupeKey, canonicalKey);
      }
    }
  }

  return merged;
}

/**
 * Merge local cart variations with server variations
 * @param {Object} localVariations - Variations object from localStorage
 * @param {Object} serverVariations - Variations object from server
 * @returns {Object} Merged variations object
 */
export function mergeCartVariations(localVariations, serverVariations) {
  // Simple merge - local takes priority since user just edited it
  return {
    ...(serverVariations || {}),
    ...(localVariations || {})
  };
}

/**
 * Merge local picker state with server state
 * @param {Object} localState - Picker state from localStorage
 * @param {Object} serverState - Picker state from server
 * @returns {Object} Merged picker state
 */
export function mergePickerState(localState, serverState) {
  if (!localState && !serverState) return null;
  if (!localState) return serverState;
  if (!serverState) return localState;

  // Use state with more progress (higher index)
  const localIndex = localState.index || localState.currentIndex || 0;
  const serverIndex = serverState.index || serverState.currentIndex || 0;

  // Merge history arrays (union of seen products)
  const localHistory = localState.history || [];
  const serverHistory = serverState.history || [];
  const mergedHistory = [...new Set([...localHistory, ...serverHistory])];

  // Take state with more progress
  if (localIndex >= serverIndex) {
    return {
      ...localState,
      history: mergedHistory
    };
  } else {
    return {
      ...serverState,
      history: mergedHistory
    };
  }
}

/**
 * Sync merged data back to server
 * Call after merging local and server data
 * @param {Object} data - Object with favorites, cart, variations, picker
 * @returns {Promise<boolean>} True if all syncs successful
 */
export async function syncMergedDataToServer(data) {
  if (!isLoggedIn()) return false;

  const results = await Promise.allSettled([
    data.favorites ? syncFavoritesToServer(data.favorites) : Promise.resolve(true),
    data.cart ? syncCartToServer(data.cart, data.variations || {}) : Promise.resolve(true),
    data.picker ? syncPickerToServer(
      data.picker.products,
      data.picker.index || data.picker.currentIndex || 0,
      data.picker.history || []
    ) : Promise.resolve(true)
  ]);

  const allSuccessful = results.every(r => r.status === 'fulfilled' && r.value);
  if (!allSuccessful) {
    console.warn('Some sync operations failed:', results);
  }

  return allSuccessful;
}

/**
 * Handle user login or session restore — merge local and server data.
 * Guarded against concurrent execution (e.g. session-restore + active login).
 */
let _syncInProgress = false;
let _sessionSyncPromise = null;

async function handleUserLogin() {
  if (!isLoggedIn()) return;
  if (_syncInProgress) return _sessionSyncPromise;
  _syncInProgress = true;

  try {
    // Load server data (async network request)
    const [serverCart, serverFavorites, serverPicker] = await Promise.all([
      loadCartFromServer(),
      loadFavoritesFromServer(),
      loadPickerFromServer()
    ]);

    // Re-read local data AFTER the async fetch to capture any items added
    // while the fetch was in-flight (avoids overwriting concurrent changes)
    const localCart = JSON.parse(localStorage.getItem('tributeCart') || '{}');
    const localVariations = JSON.parse(localStorage.getItem('tributeCartVariations') || '{}');
    const localFavorites = JSON.parse(localStorage.getItem('tributeFavorites') || '[]');
    const localPickerState = JSON.parse(localStorage.getItem('tribuePickerState') || 'null');

    // Filter stale local-only cart items.
    // Items present on the server are kept. Items only in localStorage are kept
    // only if they were added after the reference time (they're new, pending sync).
    // Older local-only items were deleted on another device.
    const lastSyncAt = parseInt(localStorage.getItem('tributeCartLastSync') || '0');
    const sessionStart = parseInt(sessionStorage.getItem('tributeSessionStart') || String(Date.now()));
    const referenceTime = lastSyncAt > 0 ? lastSyncAt : sessionStart;
    const serverCartObj = serverCart?.cart || {};
    const parseTs = (t) => {
      if (!t) return 0;
      if (typeof t === 'number') return t;
      const p = new Date(t).getTime();
      return isNaN(p) ? 0 : p;
    };
    const effectiveLocalCart = {};
    for (const [key, item] of Object.entries(localCart)) {
      if (item.type === 'certificate' || item.type === 'certificate_redemption') {
        effectiveLocalCart[key] = item;
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(serverCartObj, key) || parseTs(item.addedAt) > referenceTime) {
        effectiveLocalCart[key] = item;
      }
    }
    const mergedCart = mergeCart(effectiveLocalCart, serverCartObj);
    const mergedVariations = mergeCartVariations(localVariations, serverCart?.variations || {});

    // Merge favorites
    const serverFavoritesArray = Array.isArray(serverFavorites)
      ? serverFavorites
      : (serverFavorites?.favorites || []);
    const mergedFavorites = mergeFavorites(localFavorites, serverFavoritesArray);

    // Merge picker
    const mergedPicker = mergePickerState(localPickerState, serverPicker);

    // Save merged data to localStorage
    localStorage.setItem('tributeCart', JSON.stringify(mergedCart));
    window.cart = mergedCart;
    localStorage.setItem('tributeCartVariations', JSON.stringify(mergedVariations));
    localStorage.setItem('tributeFavorites', JSON.stringify(mergedFavorites));
    window.favorites = new Set(mergedFavorites);
    if (mergedPicker && mergedPicker.products && mergedPicker.products.length > 0) {
      localStorage.setItem('tribuePickerState', JSON.stringify(mergedPicker));
    }

    // Sync merged data back to server
    await syncMergedDataToServer({
      favorites: mergedFavorites,
      cart: mergedCart,
      variations: mergedVariations,
      picker: mergedPicker
    });

    // Update UI
    window.dispatchEvent(new Event('cartUpdated'));
    window.dispatchEvent(new Event('favoritesUpdated'));

  } catch (err) {
    console.warn('Failed to sync data after login:', err);
  } finally {
    _syncInProgress = false;
  }
}

/**
 * Returns a promise that resolves once the session-restore / login sync is
 * complete. The cart page awaits this before rendering so it always shows
 * the merged cart. Calling this multiple times returns the same promise.
 */
export function ensureCartSynced() {
  if (!_sessionSyncPromise) {
    if (!isLoggedIn()) return Promise.resolve();
    _sessionSyncPromise = handleUserLogin();
  }
  return _sessionSyncPromise;
}

// Listen for active login events
window.addEventListener('userLoggedIn', () => {
  _sessionSyncPromise = handleUserLogin();
});

// Listen for session restore (auth.js verified the saved token).
// Covers pages that call initAuth().
window.addEventListener('sessionRestored', () => {
  if (!_sessionSyncPromise) {
    _sessionSyncPromise = handleUserLogin();
  }
});

// Immediate check: auth.js pre-populates state from localStorage at import
// time, so isLoggedIn() works here even before init() is called. This
// ensures cart counters update on pages that never call initAuth() (e.g.
// catalog, favorites). The _syncInProgress guard prevents double execution
// if sessionRestored also fires later.
if (isLoggedIn()) {
  _sessionSyncPromise = handleUserLogin();
}
