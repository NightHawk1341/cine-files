// ============================================================
// PROFILE PAGE
// User profile with authentication, orders, reviews, comments, suggestions
// ============================================================

// Import auth functions
import {
  init as initAuth,
  isLoggedIn,
  getCurrentUser,
  loginTelegram,
  loginTelegramWidget,
  loginVKMiniApp,
  loginMAXMiniApp,
  logout,
  getAccessToken
} from '../core/auth.js';
import {
  isVKMiniApp,
  getVKAppId,
  getVKLaunchParams,
  vkBridgeSend,
  requestVKNotifications
} from '../core/vk-miniapp.js';
import {
  isMAXMiniApp,
  getMAXInitData
} from '../core/max-miniapp.js';
import { isInsideTelegram } from '../core/telegram-miniapp.js';
import { showSkeletonLoaders } from '../modules/skeleton-loader.js';
import { escapeHtml } from '../core/formatters.js';

// Import data sync functions
import {
  loadFavoritesFromServer,
  loadCartFromServer,
  loadPickerFromServer,
  mergeFavorites,
  mergeCart,
  mergeCartVariations,
  mergePickerState,
  syncMergedDataToServer
} from '../core/data-sync.js';

// Import FAQ module
import { initFAQPopup, addFAQButton } from '../modules/faq-popup.js';
import { renderFaqInfoBoxes } from '../modules/faq-info-boxes.js';

// Import viewed products module
import { getViewedProducts } from '../core/viewed-products.js';

// Import product grid module for consistent styling
import '../modules/product-grid.js';

// Import profile sub-modules
import { addImageSize, showToast, showConfirmation } from './profile/utils.js';
import { confirm } from '../modules/mobile-modal.js';
import { loadUserOrders } from './profile/orders.js';


// ============================================================
// STATE VARIABLES
// ============================================================

let isUserLoggedIn = false;
let cachedAllReviews = null;
let cachedAllComments = null;
let cachedAllSuggestions = null;

// ============================================================
// DOM ELEMENTS
// These are re-assigned on each init to handle SPA navigation
// ============================================================

let profileLoggedOut = null;
let profileLoggedIn = null;
let telegramLoginButton = null;
let telegramWidgetContainer = null;
let yandexLoginButton = null;
let vkLoginButton = null;
let maxLoginButton = null;
let profileLogoutButton = null;
let profileName = null;
let profileUsername = null;
let profileAvatar = null;

/**
 * Refresh DOM element references
 * Called on each init to ensure we have valid references after SPA navigation
 */
function refreshDOMReferences() {
  profileLoggedOut = document.getElementById('profile-logged-out');
  profileLoggedIn = document.getElementById('profile-logged-in');
  telegramLoginButton = document.getElementById('telegram-login-button');
  telegramWidgetContainer = document.getElementById('telegram-widget-container');
  yandexLoginButton = document.getElementById('yandex-login-button');
  vkLoginButton = document.getElementById('vk-login-button');
  maxLoginButton = document.getElementById('max-login-button');
  profileLogoutButton = document.getElementById('profile-logout-button');
  profileName = document.getElementById('profile-name');
  profileUsername = document.getElementById('profile-username');
  profileAvatar = document.getElementById('profile-avatar');
}

// ============================================================
// DATA LOADING
// ============================================================

/**
 * Load profile data from server and merge with localStorage.
 * Items added while logged out persist after login.
 */
const loadProfileData = async () => {
  if (!isUserLoggedIn || !isLoggedIn()) return;

  try {
    // Load local data first
    let localFavorites = [];
    let localCart = {};
    let localCartVariations = {};
    let localPickerState = null;

    try {
      const savedFavorites = localStorage.getItem('tributeFavorites');
      if (savedFavorites) localFavorites = JSON.parse(savedFavorites);
    } catch (e) { /* ignore parse errors */ }

    try {
      const savedCart = localStorage.getItem('tributeCart');
      if (savedCart) localCart = JSON.parse(savedCart);
    } catch (e) { /* ignore parse errors */ }

    try {
      const savedVariations = localStorage.getItem('tributeCartVariations');
      if (savedVariations) localCartVariations = JSON.parse(savedVariations);
    } catch (e) { /* ignore parse errors */ }

    try {
      const savedPicker = localStorage.getItem('tribuePickerState');
      if (savedPicker) localPickerState = JSON.parse(savedPicker);
    } catch (e) { /* ignore parse errors */ }

    // Load server data
    const [serverFavoritesResponse, serverCart, serverPickerState] = await Promise.all([
      loadFavoritesFromServer(),
      loadCartFromServer(),
      loadPickerFromServer()
    ]);

    // Extract server favorites (handles both array and object response)
    const serverFavorites = Array.isArray(serverFavoritesResponse)
      ? serverFavoritesResponse
      : (serverFavoritesResponse?.favorites || []);

    // Merge favorites (union of local + server)
    const mergedFavorites = mergeFavorites(localFavorites, serverFavorites);

    // Merge cart
    const mergedCart = mergeCart(localCart, serverCart?.cart || {});

    // Merge cart variations
    const mergedVariations = mergeCartVariations(localCartVariations, serverCart?.variations || {});

    // Merge picker state
    const mergedPickerState = mergePickerState(localPickerState, serverPickerState);

    // Save merged data to localStorage
    if (mergedFavorites.length > 0) {
      localStorage.setItem('tributeFavorites', JSON.stringify(mergedFavorites));
      // Update global favorites Set
      window.favorites = new Set(mergedFavorites);
    }

    if (Object.keys(mergedCart).length > 0) {
      localStorage.setItem('tributeCart', JSON.stringify(mergedCart));
      // Update global cart
      window.cart = mergedCart;
    }

    if (Object.keys(mergedVariations).length > 0) {
      localStorage.setItem('tributeCartVariations', JSON.stringify(mergedVariations));
    }

    if (mergedPickerState && mergedPickerState.products && mergedPickerState.products.length > 0) {
      const state = {
        products: mergedPickerState.products,
        index: mergedPickerState.index || mergedPickerState.currentIndex || 0,
        history: mergedPickerState.history || [],
        timestamp: Date.now()
      };
      localStorage.setItem('tribuePickerState', JSON.stringify(state));
    }

    // Sync merged data back to server (fire and forget)
    syncMergedDataToServer({
      favorites: mergedFavorites,
      cart: mergedCart,
      variations: mergedVariations,
      picker: mergedPickerState
    }).catch(err => {
      console.warn('Failed to sync merged data to server:', err);
    });

    // Dispatch cart update event to refresh UI
    window.dispatchEvent(new Event('cartUpdated'));

  } catch (err) {
    console.warn('Failed to load profile data:', err);
  }
};

/**
 * Load and display recently viewed products (#24)
 * Uses localStorage to show products user has recently viewed
 * Uses product card styling with single image and title (no carousel/indicators/price)
 */
function loadRecentlyViewedProducts() {
  const viewedSection = document.getElementById('profile-viewed-section');
  const viewedContainer = document.getElementById('profile-viewed-products');

  if (!viewedSection || !viewedContainer) {
    return;
  }

  try {
    const viewedProducts = getViewedProducts();

    // Show or hide section based on whether there are viewed products
    if (viewedProducts.length === 0) {
      viewedSection.style.display = 'none';
      return;
    }

    viewedSection.style.display = 'block';

    // Clear the container
    viewedContainer.innerHTML = '';

    // Render using product card structure with single image and title (no carousel/indicators/price)
    viewedProducts.forEach(product => {
      const imageUrl = addImageSize(product.image || '/placeholder.png', '480x0');
      const productParam = product.slug || product.id;
      const productLink = `/product?id=${productParam}`;

      // Create product card container with proper status classes
      const productCard = document.createElement('div');
      const isSpecialProduct = product.type === 'фирменный';
      const isComingSoon = product.status === 'coming_soon';
      const isTest = product.status === 'test';

      productCard.className = 'product' +
        (isSpecialProduct ? ' special-product' : '') +
        (isComingSoon ? ' coming-soon' : '') +
        (isTest ? ' test-product' : '');
      productCard.dataset.productId = product.id;

      // Create inner link
      const cardInner = document.createElement('a');
      cardInner.className = 'product-card-inner';
      cardInner.href = productLink;

      // Create image carousel container (single image, no indicators)
      const imageCarousel = document.createElement('div');
      imageCarousel.className = 'image-carousel';

      const slides = document.createElement('div');
      slides.className = 'slides';

      const slide = document.createElement('div');
      slide.className = 'slide';

      const img = document.createElement('img');
      img.src = imageUrl;
      img.alt = escapeHtml(product.title);
      img.loading = 'lazy';
      // Add loaded class when image finishes loading
      if (img.complete && img.naturalHeight !== 0) {
        img.classList.add('loaded');
      } else {
        img.addEventListener('load', () => {
          img.classList.add('loaded');
        });
      }

      slide.appendChild(img);
      slides.appendChild(slide);
      imageCarousel.appendChild(slides);

      // Create title
      const title = document.createElement('h3');
      title.textContent = product.title;

      // Assemble the card
      cardInner.appendChild(imageCarousel);
      cardInner.appendChild(title);
      productCard.appendChild(cardInner);

      // Handle click for SPA navigation
      cardInner.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof smoothNavigate === 'function') {
          smoothNavigate(productLink);
        } else {
          window.location.href = productLink;
        }
      });

      viewedContainer.appendChild(productCard);
    });

    // Add "Все товары" button at the end of carousel
    const viewAllBtn = document.createElement('a');
    viewAllBtn.className = 'profile-viewed-all-btn';
    viewAllBtn.href = '/';
    viewAllBtn.innerHTML = `
      <div class="profile-viewed-all-btn-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
      </div>
      <span class="profile-viewed-all-btn-text">Все товары</span>
    `;
    viewAllBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (typeof smoothNavigate === 'function') {
        smoothNavigate('/');
      } else {
        window.location.href = '/';
      }
    });
    viewedContainer.appendChild(viewAllBtn);

    // Setup carousel arrows
    setupViewedProductsArrows();

  } catch (error) {
    console.error('Error loading recently viewed products:', error);
    viewedSection.style.display = 'none';
  }
}

/**
 * Setup carousel arrows for recently viewed products
 */
function setupViewedProductsArrows() {
  const grid = document.getElementById('profile-viewed-products');
  const leftArrow = document.querySelector('.profile-viewed-left-arrow');
  const rightArrow = document.querySelector('.profile-viewed-right-arrow');

  if (!grid || !leftArrow || !rightArrow) return;

  // Function to update arrow visibility
  const updateArrowVisibility = () => {
    const isAtStart = grid.scrollLeft === 0;
    const isAtEnd = Math.abs(grid.scrollLeft + grid.clientWidth - grid.scrollWidth) < 1;

    leftArrow.classList.toggle('hidden', isAtStart);
    rightArrow.classList.toggle('hidden', isAtEnd);
  };

  // Arrow click handlers
  leftArrow.addEventListener('click', (e) => {
    e.preventDefault();
    grid.scrollBy({ left: -200, behavior: 'smooth' });
  });

  rightArrow.addEventListener('click', (e) => {
    e.preventDefault();
    grid.scrollBy({ left: 200, behavior: 'smooth' });
  });

  // Update visibility on scroll
  grid.addEventListener('scroll', updateArrowVisibility, { passive: true });

  // Initial visibility check
  updateArrowVisibility();
}

/**
 * Load and display user's subscribed products
 */
async function loadSubscribedProducts() {
  const currentUser = getCurrentUser();
  if (!isLoggedIn() || !currentUser) {
    return;
  }

  const subscribedSection = document.getElementById('profile-subscribed-section');
  const subscribedContainer = document.getElementById('profile-subscribed-products');

  if (!subscribedSection || !subscribedContainer) {
    return;
  }

  try {
    const response = await fetch(`/api/products/subscribed?user_id=${currentUser.id}`, {
      headers: {
        'Authorization': `Bearer ${getAccessToken()}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to load subscribed products');
    }

    const data = await response.json();
    const products = data.products || [];

    // Show or hide section based on whether there are subscribed products
    if (products.length === 0) {
      subscribedSection.style.display = 'none';
      return;
    }

    subscribedSection.style.display = 'block';

    // Clear container
    subscribedContainer.innerHTML = '';

    // Render each subscribed product as a product card (matching recently viewed style)
    products.forEach(product => {
      const imageUrl = addImageSize(product.image_url || '/placeholder.png', '480x0');
      const productParam = product.slug || product.id;
      const productLink = `/product?id=${productParam}`;

      // Create product card container
      const productCard = document.createElement('div');
      productCard.className = 'product coming-soon';
      productCard.dataset.productId = product.id;
      productCard.style.position = 'relative';

      // Create inner link
      const cardInner = document.createElement('a');
      cardInner.className = 'product-card-inner subscribed-product-link';
      cardInner.href = productLink;

      // Create image carousel container (single image)
      const imageCarousel = document.createElement('div');
      imageCarousel.className = 'image-carousel';

      const slides = document.createElement('div');
      slides.className = 'slides';

      const slide = document.createElement('div');
      slide.className = 'slide';

      const img = document.createElement('img');
      img.src = imageUrl;
      img.alt = escapeHtml(product.title);
      img.loading = 'lazy';
      if (img.complete && img.naturalHeight !== 0) {
        img.classList.add('loaded');
      } else {
        img.addEventListener('load', () => img.classList.add('loaded'));
      }

      slide.appendChild(img);
      slides.appendChild(slide);
      imageCarousel.appendChild(slides);

      // Create title
      const title = document.createElement('h3');
      title.textContent = product.title;

      // Assemble card
      cardInner.appendChild(imageCarousel);
      cardInner.appendChild(title);
      productCard.appendChild(cardInner);

      // Create X (unsubscribe) button overlay
      const unsubBtn = document.createElement('button');
      unsubBtn.className = 'subscribed-remove-btn';
      unsubBtn.dataset.productId = product.id;
      unsubBtn.title = 'Удалить из ожидаемых';
      unsubBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
      productCard.appendChild(unsubBtn);

      // Handle card click for SPA navigation
      cardInner.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof smoothNavigate === 'function') {
          smoothNavigate(productLink);
        } else {
          window.location.href = productLink;
        }
      });

      // Handle unsubscribe click
      unsubBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();

        try {
          const response = await fetch('/api/products/subscribe-release', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_id: currentUser.id,
              product_id: product.id,
              action: 'unsubscribe'
            })
          });

          if (!response.ok) {
            throw new Error('Failed to unsubscribe');
          }

          if (typeof showToast === 'function') {
            showToast('Вы больше не подписаны на уведомления', { type: 'info' });
          }

          await loadSubscribedProducts();
        } catch (error) {
          console.error('Error unsubscribing:', error);
          if (typeof showToast === 'function') {
            showToast('Ошибка отписки', { type: 'error' });
          }
        }
      });

      subscribedContainer.appendChild(productCard);
    });

  } catch (error) {
    console.error('Error loading subscribed products:', error);
    subscribedSection.style.display = 'none';
  }
}

// ============================================================
// PROFILE UI UPDATE
// ============================================================

/**
 * Update profile UI based on authentication state
 */
async function updateProfileUI() {
  const profileHeader = document.querySelector('.profile-header');
  const guestTheme = document.getElementById('profile-theme-guest');

  if (isUserLoggedIn && isLoggedIn()) {
    const user = getCurrentUser();

    if (!user) {
      console.error('User data not available');
      return;
    }

    // Update profile sections
    profileLoggedOut.style.display = 'none';
    profileLoggedIn.style.display = 'block';
    if (profileHeader) profileHeader.style.display = 'flex';
    if (guestTheme) guestTheme.style.display = 'none';

    // Set name and username with login method icon
    const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || 'Пользователь';

    // Generate login icon for profile
    const profileLoginIcon = user.login_method === 'telegram'
      ? '<span class="profile-login-icon" title="Вход по Telegram OAuth" style="display: inline-flex; align-items: center; margin-left: 6px; vertical-align: middle;"><svg width="14" height="14" style="color: #26A5E4;"><use href="#socials-telegram"></use></svg></span>'
      : user.login_method === 'yandex'
      ? '<span class="profile-login-icon" title="Вход по Яндекс ID" style="display: inline-flex; align-items: center; margin-left: 6px; vertical-align: middle;"><svg width="14" height="14" style="color: #FC3F1D;"><use href="#yandex"></use></svg></span>'
      : user.login_method === 'vk'
      ? '<span class="profile-login-icon" title="Вход по VK OAuth" style="display: inline-flex; align-items: center; margin-left: 6px; vertical-align: middle;"><svg width="14" height="14" style="color: #0077FF;"><use href="#socials-vk"></use></svg></span>'
      : user.login_method === 'max'
      ? '<span class="profile-login-icon" title="Вход через MAX" style="display: inline-flex; align-items: center; margin-left: 6px; vertical-align: middle;"><svg width="14" height="14"><use href="#socials-max"></use></svg></span>'
      : '';

    profileName.textContent = displayName;

    const displayHandle = user.login_method === 'vk' ? (user.screen_name || user.username) : user.username;
    const usernamePrefix = (user.login_method === 'telegram' || user.login_method === 'vk') ? '@' : '';
    profileUsername.innerHTML = `${usernamePrefix}${displayHandle || 'user'}${profileLoginIcon}`;

    // Load and display user avatar with fallback
    if (profileAvatar) {
      const initials = (user.firstName?.[0] || user.username?.[0] || '?').toUpperCase();
      const defaultAvatar = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect fill='%23066fa3' width='40' height='40'/%3E%3Ctext x='20' y='25' text-anchor='middle' fill='%23fff' font-size='20' font-weight='bold'%3E${initials}%3C/text%3E%3C/svg%3E`;
      // Respect hide_photo preference - use default avatar if user has hidden their photo
      const avatarUrl = (user.hide_photo || !user.photo_url) ? defaultAvatar : user.photo_url;
      profileAvatar.innerHTML = `<img src="${avatarUrl}" alt="${displayName}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;"/>`;
    }

    // Render account info (email, member since) — fetch extended profile from API
    fetchProfileInfo().then(profileData => {
      if (profileData) renderAccountInfo(profileData);
    });

    // Update favorites count badge
    updateFavoritesCount();

    // Load user's reviews
    await loadUserReviews(user);

    // Load user's comments
    await loadUserComments(user);

    // Load user's suggestions
    await loadUserSuggestions(user);

    // Load user's orders to populate counter + saved address
    await loadUserOrders();

    // Load saved address from last order
    loadSavedAddress();

    // Load user's certificates
    loadUserCertificates(user);

    // Load user's subscribed products
    await loadSubscribedProducts();

    // Setup profile tabs
    setupProfileTabs();

  } else {
    // User not logged in
    profileLoggedOut.style.display = 'block';
    profileLoggedIn.style.display = 'none';
    if (profileHeader) profileHeader.style.display = 'none';
    if (guestTheme) guestTheme.style.display = 'block';
  }
}


// ============================================================
// ACCOUNT INFO, FAVORITES COUNT, SAVED ADDRESS
// ============================================================

/**
 * Render account info (email, member since)
 */
function renderAccountInfo(user) {
  const container = document.getElementById('profile-account-info');
  if (!container) return;

  const items = [];

  // Member since
  if (user.created_at) {
    const date = new Date(user.created_at);
    const formatted = date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
    items.push(`<span class="profile-account-info-item">С нами с <span class="profile-account-info-value">${formatted}</span></span>`);
  }

  // Email
  const email = user.email || user.payment_email;
  if (email) {
    items.push(`<span class="profile-account-info-item">Почта: <span class="profile-account-info-value">${escapeHtml(email)}</span></span>`);
  }

  if (items.length > 0) {
    container.innerHTML = items.join('');
    container.style.display = '';
  } else {
    container.style.display = 'none';
  }
}

/**
 * Fetch extended profile info (email, created_at) from API
 */
async function fetchProfileInfo() {
  try {
    const token = localStorage.getItem('tributary_accessToken');
    if (!token) return null;
    const response = await fetch('/api/user/profile', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.user || null;
  } catch {
    return null;
  }
}

/**
 * Update favorites count badge
 */
function updateFavoritesCount() {
  const countEl = document.getElementById('profile-favorites-count');
  if (!countEl) return;

  try {
    const favorites = JSON.parse(localStorage.getItem('tributeFavorites') || '[]');
    const count = Array.isArray(favorites) ? favorites.length : 0;
    if (count > 0) {
      countEl.textContent = count;
      countEl.style.display = '';
    } else {
      countEl.style.display = 'none';
    }
  } catch {
    countEl.style.display = 'none';
  }
}

/**
 * Load saved delivery addresses from server (or localStorage fallback)
 */
async function loadSavedAddress() {
  const section = document.getElementById('profile-addresses-section');
  const list = document.getElementById('profile-addresses-list');
  if (!section || !list) return;

  // For logged-in users, load from server
  if (isLoggedIn()) {
    try {
      const token = localStorage.getItem('tributary_accessToken');
      const resp = await fetch('/api/user/addresses', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resp.ok) {
        const data = await resp.json();
        const addresses = data.addresses || [];
        if (addresses.length > 0) {
          list.innerHTML = addresses.map(addr => renderProfileAddressCard(addr)).join('');
          attachAddressCardEvents(list);
          section.style.display = '';
          // "Add address" button (max 5)
          if (addresses.length < 5) {
            const addBtn = document.createElement('button');
            addBtn.className = 'profile-address-add-btn';
            addBtn.textContent = '+ Добавить адрес';
            addBtn.addEventListener('click', () => openAddressForm(list));
            list.appendChild(addBtn);
          }
          return;
        }
      }
    } catch (err) {
      console.warn('Failed to load saved addresses:', err);
    }
  }
  // Fallback: localStorage address
  try {
    const savedData = JSON.parse(localStorage.getItem('tributary_orderFormData') || '{}');
    const hasAddress = savedData.address || savedData.surname || savedData.name;

    if (hasAddress) {
      const parts = [];
      if (savedData.surname || savedData.name) {
        parts.push(`${savedData.surname || ''} ${savedData.name || ''}`.trim());
      }
      if (savedData.phone) parts.push(savedData.phone);
      if (savedData.address) parts.push(savedData.address);

      list.innerHTML = `
        <div class="profile-address-card">
          <div class="profile-address-card-label">Последний адрес доставки</div>
          ${parts.join('<br>')}
        </div>
      `;

      // Offer to save the localStorage address if logged in
      if (isLoggedIn()) {
        const saveBtn = document.createElement('button');
        saveBtn.className = 'profile-address-add-btn';
        saveBtn.textContent = 'Сохранить этот адрес';
        saveBtn.addEventListener('click', async () => {
          try {
            const token = localStorage.getItem('tributary_accessToken');
            const resp = await fetch('/api/user/addresses', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({
                surname: savedData.surname || '',
                name: savedData.name || '',
                phone: savedData.phone || '',
                address: savedData.address || '',
                postal_index: savedData.postal_index || '',
                comment: savedData.comment || '',
                is_default: true
              })
            });
            if (resp.ok) {
              if (typeof window.showToast === 'function') window.showToast('Адрес сохранён');
              loadSavedAddress();
            }
          } catch (err) {
            console.error('Failed to save address:', err);
          }
        });
        list.appendChild(saveBtn);
      }

      section.style.display = '';
    } else {
      // Show add button for logged in users even with no existing address
      if (isLoggedIn()) {
        list.innerHTML = '';
        const addBtn = document.createElement('button');
        addBtn.className = 'profile-address-add-btn';
        addBtn.textContent = '+ Добавить адрес';
        addBtn.addEventListener('click', () => openAddressForm(list));
        list.appendChild(addBtn);
        section.style.display = '';
      } else {
        section.style.display = 'none';
      }
    }
  } catch {
    section.style.display = 'none';
  }
}

function renderProfileAddressCard(addr) {
  const label = addr.label || (addr.is_default ? 'Основной' : 'Адрес');
  const fullName = `${addr.surname || ''} ${addr.name || ''}`.trim();
  const defaultBadge = addr.is_default ? '<span class="profile-address-default-badge">по умолчанию</span>' : '';
  return `
    <div class="profile-address-card" data-address-id="${addr.id}">
      <div class="profile-address-card-header">
        <div class="profile-address-card-label">${label} ${defaultBadge}</div>
        <div class="profile-address-card-actions">
          ${!addr.is_default ? `<button class="profile-address-action-btn" data-action="set-default" data-id="${addr.id}" title="По умолчанию">★</button>` : ''}
          <button class="profile-address-action-btn" data-action="delete" data-id="${addr.id}" title="Удалить">✕</button>
        </div>
      </div>
      <div class="profile-address-card-body">
        ${fullName ? `<div>${fullName}</div>` : ''}
        ${addr.phone ? `<div>${addr.phone}</div>` : ''}
        <div>${addr.address}</div>
        ${addr.postal_index ? `<div>Индекс: ${addr.postal_index}</div>` : ''}
      </div>
    </div>
  `;
}
function attachAddressCardEvents(container) {
  container.querySelectorAll('.profile-address-action-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      const token = localStorage.getItem('tributary_accessToken');
      if (action === 'delete') {
        if (!confirm('Удалить этот адрес?')) return;
        try {
          const resp = await fetch(`/api/user/addresses/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (resp.ok) {
            if (typeof window.showToast === 'function') window.showToast('Адрес удалён');
            loadSavedAddress();
          }
        } catch (err) {
          console.error('Failed to delete address:', err);
        }
      } else if (action === 'set-default') {
        try {
          const resp = await fetch(`/api/user/addresses/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ is_default: true })
          });
          if (resp.ok) {
            if (typeof window.showToast === 'function') window.showToast('Адрес по умолчанию обновлён');
          }
          loadSavedAddress();
        } catch (err) {
          console.error('Failed to set default:', err);
        }
      }
    });
  });
}
function openAddressForm(container) {
  // Remove existing form if any
  const existingForm = container.querySelector('.profile-address-form');
  if (existingForm) { existingForm.remove(); return; }
  const form = document.createElement('div');
  form.className = 'profile-address-form';
  form.innerHTML = `
    <div class="profile-address-form-fields">
      <input type="text" placeholder="Название (дом, работа...)" class="addr-label" maxlength="50">
      <input type="text" placeholder="Фамилия *" class="addr-surname" required>
      <input type="text" placeholder="Имя *" class="addr-name" required>
      <input type="tel" placeholder="Телефон *" class="addr-phone" required>
      <input type="text" placeholder="Адрес *" class="addr-address" required>
      <input type="text" placeholder="Индекс" class="addr-postal">
      <div class="profile-address-form-row">
        <input type="text" placeholder="Подъезд" class="addr-entrance">
        <input type="text" placeholder="Этаж" class="addr-floor">
        <input type="text" placeholder="Квартира" class="addr-apartment">
      </div>
      <textarea placeholder="Комментарий" class="addr-comment" rows="2"></textarea>
    </div>
    <div class="profile-address-form-actions">
      <button class="profile-address-save-btn">Сохранить</button>
      <button class="profile-address-cancel-btn">Отмена</button>
    </div>
  `;
  form.querySelector('.profile-address-cancel-btn').addEventListener('click', () => form.remove());
  form.querySelector('.profile-address-save-btn').addEventListener('click', async () => {
    const surname = form.querySelector('.addr-surname').value.trim();
    const name = form.querySelector('.addr-name').value.trim();
    const phone = form.querySelector('.addr-phone').value.trim();
    const address = form.querySelector('.addr-address').value.trim();
    if (!surname || !name || !phone || !address) {
      if (typeof window.showToast === 'function') window.showToast('Заполните обязательные поля', 'error');
      return;
    }
    try {
      const token = localStorage.getItem('tributary_accessToken');
      const resp = await fetch('/api/user/addresses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          label: form.querySelector('.addr-label').value.trim() || null,
          surname, name, phone, address,
          postal_index: form.querySelector('.addr-postal').value.trim() || null,
          entrance: form.querySelector('.addr-entrance').value.trim() || null,
          floor_number: form.querySelector('.addr-floor').value.trim() || null,
          apartment: form.querySelector('.addr-apartment').value.trim() || null,
          comment: form.querySelector('.addr-comment').value.trim() || null
        })
      });
      if (resp.ok) {
        if (typeof window.showToast === 'function') window.showToast('Адрес сохранён');
        loadSavedAddress();
      } else {
        const errData = await resp.json().catch(() => ({}));
        if (typeof window.showToast === 'function') window.showToast(errData.error || 'Ошибка сохранения', 'error');
      }
    } catch (err) {
      console.error('Failed to save address:', err);
    }
  });
  container.appendChild(form);
}

/**
 * Load and display user's reviews
 */
async function loadUserReviews(user) {
  const profileReviewsDiv = document.getElementById('profile-user-reviews');
  if (!profileReviewsDiv) return;

  // Show skeleton while loading
  showSkeletonLoaders(profileReviewsDiv, 'review', 3);

  try {
    const response = await fetch('/api/reviews');

    if (!response.ok) {
      throw new Error(`Failed to load reviews: ${response.status}`);
    }

    const result = await response.json();
    // API returns { data: [...], pagination: {...} } - extract the data array
    const allReviews = Array.isArray(result) ? result : (result.data || []);
    const userReviews = allReviews.filter(r => r.user_id === user.id);

    profileReviewsDiv.innerHTML = '';

    if (userReviews.length === 0) {
      profileReviewsDiv.innerHTML = '<div style="color: var(--text-tertiary, #666); font-size: 12px;">Вы еще не оставили отзывов</div>';
    } else {
      userReviews.forEach(review => {
        const stars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
        const date = new Date(review.created_at).toLocaleDateString('ru-RU');

        const reviewDiv = document.createElement('div');
        reviewDiv.className = 'review-item product-review-item';

        reviewDiv.innerHTML = `
          <div class="product-review-content">
            <div class="product-review-header">
              <div>
                <div class="product-review-user">${escapeHtml(review.product_title || 'Общий отзыв')}</div>
                <div class="product-review-rating"><span class="product-review-star">${stars}</span></div>
              </div>
              <button class="review-item-delete" data-review-id="${review.id}" style="align-self: flex-start; padding: 4px 8px; font-size: 12px;">Удалить</button>
            </div>
            <div class="product-review-text">${escapeHtml(review.review_text)}</div>
            <div class="product-review-footer">
              <div class="product-review-date">${date}</div>
            </div>
          </div>
        `;

        const deleteBtn = reviewDiv.querySelector('.review-item-delete');
        deleteBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();

          showConfirmation('Удалить отзыв?', '', async () => {
            try {
              const accessToken = localStorage.getItem('tributary_accessToken');
              const response = await fetch(`/api/reviews/${review.id}`, {
                method: 'DELETE',
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Content-Type': 'application/json'
                }
              });

              if (response.ok) {
                cachedAllReviews = null;
                updateProfileUI();
                showToast('Отзыв удалён');
              } else {
                console.error('Delete failed:', response.status);
                showToast('Ошибка при удалении', 'removed');
              }
            } catch (err) {
              console.error('Error deleting review:', err);
              showToast('Ошибка при удалении', 'removed');
            }
          });
        });

        profileReviewsDiv.appendChild(reviewDiv);
      });
    }
  } catch (err) {
    console.error('Error loading user reviews:', err);
    // Clear skeleton loaders and show error state
    profileReviewsDiv.innerHTML = '<div style="color: var(--status-error, #f44336); font-size: 12px;">Ошибка загрузки отзывов</div>';
  }
}

/**
 * Load and display user's comments
 */
async function loadUserComments(user) {
  const profileCommentsDiv = document.getElementById('profile-user-comments');
  if (!profileCommentsDiv) return;

  // Show skeleton while loading
  showSkeletonLoaders(profileCommentsDiv, 'review', 3);

  try {
    const response = await fetch('/api/comments/user', {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('tributary_accessToken')}`
      }
    });

    // Handle 404 as "no comments" rather than an error
    if (!response.ok) {
      if (response.status === 404) {
        const userComments = [];
        profileCommentsDiv.innerHTML = '<div style="color: var(--text-tertiary, #666); font-size: 12px;">Вы еще не оставили комментариев</div>';
        return;
      }
      throw new Error(`Failed to load comments: ${response.status}`);
    }

    const result = await response.json();
    const userComments = result.comments || [];

    profileCommentsDiv.innerHTML = '';

    if (userComments.length === 0) {
      profileCommentsDiv.innerHTML = '<div style="color: var(--text-tertiary, #666); font-size: 12px;">Вы еще не оставили комментариев</div>';
    } else {
      userComments.forEach(comment => {
        const date = new Date(comment.created_at).toLocaleDateString('ru-RU');

        const commentDiv = document.createElement('div');
        commentDiv.className = 'comment-item product-review-item';

        commentDiv.innerHTML = `
          <div class="comment-item-content product-review-content">
            <div class="comment-item-header">
              <div class="comment-item-user-info">
                <div class="comment-item-user product-review-user">${escapeHtml(comment.product_title || 'Общий комментарий')}</div>
              </div>
              <button class="comment-item-delete" data-comment-id="${comment.id}">Удалить</button>
            </div>
            <div class="comment-item-text product-review-text">${escapeHtml(comment.comment_text)}</div>
            <div class="comment-item-footer product-review-footer">
              <div class="comment-item-date product-review-date">${date}</div>
              <div style="color: var(--text-tertiary, #818181); font-size: 12px; display: flex; align-items: center; gap: 4px;"><svg width="14" height="14" style="color: var(--favorite-color, #e91e63);"><use href="#heart-like"></use></svg> ${comment.like_count || 0}</div>
            </div>
          </div>
        `;

        const deleteBtn = commentDiv.querySelector('.comment-item-delete');
        deleteBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();

          showConfirmation('Удалить комментарий?', '', async () => {
            try {
              const response = await fetch(`/api/comments/${comment.id}`, {
                method: 'DELETE',
                headers: {
                  'Authorization': `Bearer ${localStorage.getItem('tributary_accessToken')}`,
                  'Content-Type': 'application/json'
                }
              });

              if (response.ok) {
                cachedAllComments = null;
                updateProfileUI();
                showToast('Комментарий удалён');
              } else {
                console.error('Delete failed:', response.status);
                showToast('Ошибка при удалении', 'removed');
              }
            } catch (err) {
              console.error('Error deleting comment:', err);
              showToast('Ошибка при удалении', 'removed');
            }
          });
        });

        profileCommentsDiv.appendChild(commentDiv);
      });
    }
  } catch (err) {
    console.error('Error loading user comments:', err);
    // Clear skeleton loaders and show error state
    profileCommentsDiv.innerHTML = '<div style="color: var(--status-error, #f44336); font-size: 12px;">Ошибка загрузки комментариев</div>';
  }
}

/**
 * Load and display user's certificates (purchased and redeemed)
 */
async function loadUserCertificates(user) {
  const section = document.getElementById('profile-certificates-section');
  const listEl = document.getElementById('profile-certificates-list');
  if (!section || !listEl) return;

  try {
    const token = localStorage.getItem('tributary_accessToken');
    const response = await fetch(`/api/certificates/user/${user.id}`, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });

    if (!response.ok) return;

    const data = await response.json();
    // Only show certificates the user received and redeemed themselves (not ones they purchased as gifts)
    const certs = (data.certificates || []).filter(c => c.status !== 'pending' && c.relationship === 'redeemed');

    if (certs.length === 0) return;

    section.style.display = 'block';

    const statusLabels = {
      pending: 'Ожидает оплаты',
      paid: 'Активен',
      delivered: 'Доставлен',
      redeemed: 'Использован'
    };
    const statusColors = {
      pending: 'var(--status-warning, #f59e0b)',
      paid: 'var(--status-success, #26de81)',
      delivered: 'var(--status-info, #45aaf2)',
      redeemed: 'var(--text-tertiary, #999)'
    };

    listEl.innerHTML = certs.map(cert => {
      const isPurchased = cert.relationship === 'purchased';
      const statusLabel = statusLabels[cert.status] || cert.status;
      const statusColor = statusColors[cert.status] || 'var(--text-tertiary)';
      const amount = Number(cert.amount).toLocaleString('ru-RU');
      const codeDisplay = (cert.status === 'paid' || cert.status === 'delivered' || cert.status === 'redeemed')
        ? `<span style="font-family:monospace;letter-spacing:0.05em;">${cert.certificate_code}</span>`
        : '<span style="color:var(--text-tertiary);font-size:0.75rem;">Код появится после оплаты</span>';

      return `
        <div class="profile-cert-card">
          ${cert.template_image ? `<img src="${cert.template_image}" alt="Сертификат" class="profile-cert-image">` : ''}
          <div class="profile-cert-info">
            <div class="profile-cert-top">
              <span class="profile-cert-amount">${amount} ₽</span>
              <span class="profile-cert-status" style="color:${statusColor};">${statusLabel}</span>
            </div>
            <div class="profile-cert-code">${codeDisplay}</div>
            ${isPurchased && cert.recipient_name
              ? `<div class="profile-cert-meta">Для: ${cert.recipient_name}</div>`
              : ''}
            ${!isPurchased
              ? `<div class="profile-cert-meta">Использован вами</div>`
              : ''}
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    console.warn('Failed to load user certificates:', err);
  }
}

/**
 * Load and display user's suggestions
 */
async function loadUserSuggestions(user) {
  const profileSuggestionsDiv = document.getElementById('profile-user-suggestions');
  if (!profileSuggestionsDiv) return;

  // Show skeleton while loading
  showSkeletonLoaders(profileSuggestionsDiv, 'review', 3);

  try {
    const response = await fetch('/api/suggestions/user', {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('tributary_accessToken')}`
      }
    });

    // Handle 404 as "no suggestions" rather than an error
    if (!response.ok) {
      if (response.status === 404) {
        const userSuggestions = [];
        profileSuggestionsDiv.innerHTML = '<div style="color: var(--text-tertiary, #666); font-size: 12px;">Вы еще не оставили предложений</div>';
        return;
      }
      throw new Error(`Failed to load suggestions: ${response.status}`);
    }

    const result = await response.json();
    const userSuggestions = result.suggestions || [];

    profileSuggestionsDiv.innerHTML = '';

    if (userSuggestions.length === 0) {
      profileSuggestionsDiv.innerHTML = '<div style="color: var(--text-tertiary, #666); font-size: 12px;">Вы еще не оставили предложений</div>';
    } else {
      userSuggestions.forEach(suggestion => {
        const date = new Date(suggestion.created_at).toLocaleDateString('ru-RU');

        const suggestionDiv = document.createElement('div');
        suggestionDiv.className = 'suggestion-item';

        suggestionDiv.innerHTML = `
          <div class="suggestion-item-content">
            <div class="suggestion-item-header">
              <div class="suggestion-item-user">${escapeHtml(user.first_name || user.username || 'Пользователь')}</div>
              <button class="suggestion-item-delete" data-suggestion-id="${suggestion.id}">Удалить</button>
            </div>
            <div class="suggestion-item-text">${escapeHtml(suggestion.suggestion_text)}</div>
            <div class="suggestion-item-footer">
              <div class="suggestion-item-date">${date}</div>
              <div style="color: var(--text-tertiary, #818181); font-size: 12px; display: flex; align-items: center; gap: 4px;"><svg width="14" height="14" style="color: var(--favorite-color, #e91e63);"><use href="#heart-like"></use></svg> ${suggestion.upvote_count || 0}</div>
            </div>
          </div>
        `;

        const deleteBtn = suggestionDiv.querySelector('.suggestion-item-delete');
        deleteBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();

          showConfirmation('Удалить предложение?', '', async () => {
            try {
              const response = await fetch(`/api/suggestions/${suggestion.id}`, {
                method: 'DELETE',
                headers: {
                  'Authorization': `Bearer ${localStorage.getItem('tributary_accessToken')}`,
                  'Content-Type': 'application/json'
                }
              });

              if (response.ok) {
                cachedAllSuggestions = null;
                updateProfileUI();
                showToast('Предложение удалено');
              } else {
                console.error('Delete failed:', response.status);
                showToast('Ошибка при удалении', 'removed');
              }
            } catch (err) {
              console.error('Error deleting suggestion:', err);
              showToast('Ошибка при удалении', 'removed');
            }
          });
        });

        profileSuggestionsDiv.appendChild(suggestionDiv);
      });
    }
  } catch (err) {
    console.error('Error loading user suggestions:', err);
    // Clear skeleton loaders and show error state
    profileSuggestionsDiv.innerHTML = '<div style="color: var(--status-error, #f44336); font-size: 12px;">Ошибка загрузки предложений</div>';
  }
}

/**
 * Setup modern profile tabs
 */
function setupProfileTabs() {
  // Orders are now displayed directly in the left column (no popup needed)

  // Setup modern tabs (reviews, comments, suggestions)
  const modernTabBtns = document.querySelectorAll('.tab');

  modernTabBtns.forEach(btn => {
    if (!btn.dataset.tabInitialized) {
      btn.dataset.tabInitialized = 'true';

      btn.addEventListener('click', () => {
        const tabName = btn.dataset.tab;
        const targetContent = document.getElementById(`profile-${tabName}-tab`);

        if (targetContent) {
          // Get parent tab container to find siblings
          const parentTabContainer = btn.closest('.tabs-container');
          const siblingTabs = parentTabContainer ? parentTabContainer.querySelectorAll('.tab') : [btn];

          // Get all modern tab contents (excluding orders)
          const siblingContents = document.querySelectorAll('#profile-reviews-tab, #profile-comments-tab, #profile-suggestions-tab');

          // Remove active class from all tabs and contents in this group
          siblingTabs.forEach(t => t.classList.remove('active'));
          siblingContents.forEach(c => c.classList.remove('active'));

          // Add active class to clicked tab and its content
          btn.classList.add('active');
          targetContent.classList.add('active');

          // Update corner rounding: square top-left/right when first/last tab is active
          const wrapper = parentTabContainer.closest('.tabs-wrapper');
          if (wrapper) {
            wrapper.classList.toggle('first-tab-active', btn === siblingTabs[0]);
            wrapper.classList.toggle('last-tab-active', btn === siblingTabs[siblingTabs.length - 1]);
          }
        }
      });
    }
  });
}

// ============================================================
// AUTHENTICATION
// ============================================================

/**
 * Handle Telegram login
 */
const handleTelegramLogin = async () => {
  const tg = window.Telegram?.WebApp;

  if (!tg || !tg.initData) {
    showToast('Войдите через приложение Telegram', 'removed');
    return;
  }

  const initData = tg.initData;

  // Show confirmation popup with the user's Telegram name
  const tgUser = tg.initDataUnsafe?.user;
  const displayName = tgUser?.username
    ? `@${tgUser.username}`
    : [tgUser?.first_name, tgUser?.last_name].filter(Boolean).join(' ') || 'Telegram';

  tg.showPopup({
    title: 'Вход в аккаунт',
    message: `Войти как ${displayName}?`,
    buttons: [
      { id: 'login', type: 'ok' },
      { id: 'cancel', type: 'cancel' }
    ]
  }, async (buttonId) => {
    if (buttonId !== 'login') return;

    try {
      const success = await loginTelegram(initData);
      if (success) {
        isUserLoggedIn = true;

        try {
          await loadProfileData();
        } catch (err) {
          console.warn('Failed to load synced data:', err);
        }

        updateProfileUI();

        if (typeof window.updateProfileButton === 'function') {
          window.updateProfileButton();
        }

        showToast('Вы успешно вошли в аккаунт');
      } else {
        showToast('Ошибка входа', 'removed');
      }
    } catch (err) {
      console.error('Login error:', err);
      showToast('Ошибка входа', 'removed');
    }
  });
};

/**
 * Handle Yandex login
 */
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

/**
 * Handle VK login — Mini App (signature-based) or web OAuth redirect
 */
const handleVkLogin = async () => {
  if (isVKMiniApp()) {
    await handleVKMiniAppLogin();
  } else {
    // Web OAuth redirect (Yandex deployment)
    try {
      const response = await fetch('/api/auth/vk/login');
      const data = await response.json();
      if (!response.ok || !data.loginUrl) {
        showToast(data.error || 'VK авторизация недоступна', 'error');
        return;
      }
      window.location.href = data.loginUrl;
    } catch (err) {
      console.error('VK login error:', err);
      showToast('Ошибка при входе', 'removed');
    }
  }
};

/**
 * Handle MAX login — only available inside MAX Mini App.
 */
const handleMaxLogin = async () => {
  const initData = getMAXInitData();
  if (!initData) {
    showToast('Ошибка: данные MAX не найдены', 'removed');
    return;
  }

  try {
    const ok = await loginMAXMiniApp(initData);
    if (ok) {
      await onLoginSuccess();
    } else {
      showToast('Ошибка входа через MAX', 'removed');
    }
  } catch (err) {
    console.error('MAX login error:', err);
    showToast('Ошибка при входе', 'removed');
  }
};

/**
 * VK Mini App login flow: verify launch params HMAC server-side → authenticate.
 * No VK API calls needed; HMAC is verified against VK_APP_SECRET on the server.
 */
const handleVKMiniAppLogin = async () => {
  const launchParams = getVKLaunchParams();
  if (!launchParams) {
    showToast('Ошибка: параметры запуска VK не найдены', 'removed');
    return;
  }

  // Get user info from VK Bridge for the confirmation modal
  const bridgeUserInfo = await vkBridgeSend('VKWebAppGetUserInfo');

  const displayName = bridgeUserInfo
    ? [bridgeUserInfo.first_name, bridgeUserInfo.last_name].filter(Boolean).join(' ') || 'ВКонтакте'
    : 'ВКонтакте';

  const photoHtml = bridgeUserInfo?.photo_200 || bridgeUserInfo?.photo_100
    ? `<img src="${bridgeUserInfo.photo_200 || bridgeUserInfo.photo_100}" alt="" style="width:64px;height:64px;border-radius:50%;object-fit:cover;margin-bottom:12px;">`
    : `<div style="width:64px;height:64px;border-radius:50%;background:var(--bg-tertiary,#2a2a2a);display:flex;align-items:center;justify-content:center;margin:0 auto 12px;"><svg width="32" height="32" viewBox="0 0 24 24" fill="var(--text-secondary,#888)"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg></div>`;

  const confirmed = await showVKConfirmationModal(displayName);
  if (!confirmed) return;

  try {
    const success = await loginVKMiniApp(launchParams, bridgeUserInfo);
    if (success) {
      isUserLoggedIn = true;

      try { await loadProfileData(); } catch (_) {}
      updateProfileUI();

      if (typeof window.updateProfileButton === 'function') {
        window.updateProfileButton();
      }

      showToast('Вы успешно вошли в аккаунт');

      setTimeout(async () => {
        try {
          await requestVKNotifications();
        } catch (_) {}
      }, 1500);
    } else {
      showToast('Ошибка входа', 'removed');
    }
  } catch (err) {
    console.error('VK Mini App login error:', err);
    showToast(err.message || 'Ошибка входа', 'removed');
  }
};

/**
 * Show VK login confirmation modal
 */
const showVKConfirmationModal = (displayName) => {
  return confirm({
    title: 'Вход через ВКонтакте',
    message: `Войти как ${displayName}?\n\nНажимая «Войти», вы соглашаетесь с Политикой конфиденциальности и Публичной офертой на buy-tribute.com/legal`,
    confirmText: 'Войти',
    cancelText: 'Отмена',
    confirmStyle: 'primary'
  });
};

/**
 * Handle logout
 */
const handleLogout = async () => {
  showConfirmation('Выйти из аккаунта?', 'Ваши данные останутся в браузере', async () => {
    await logout();
    isUserLoggedIn = false;
    updateProfileUI();

    // Update header profile button
    if (typeof window.updateProfileButton === 'function') {
      window.updateProfileButton();
    }

    showToast('Вы вышли из аккаунта');
  });
};

// ============================================================
// INITIALIZATION
// ============================================================

/**
 * Handle OAuth callback (Yandex login with tokens in URL)
 */
async function handleAuthCallback() {
  const params = new URLSearchParams(window.location.search);

  // Check for errors first
  const error = params.get('error');
  if (error) {
    const details = params.get('details');
    console.error('OAuth error:', error, details);

    // Show user-friendly error message
    let errorMessage = 'Ошибка при входе';
    if (error === 'auth_failed' && details) {
      if (details.includes('duplicate key')) {
        errorMessage = 'Пользователь с таким именем уже существует. Пожалуйста, свяжитесь с поддержкой.';
      } else {
        errorMessage = `Ошибка: ${details}`;
      }
    } else if (error === 'account_deleted') {
      errorMessage = 'Ваш аккаунт был удален';
    } else if (error === 'no_code') {
      errorMessage = 'Ошибка аутентификации: код не получен';
    }

    showToast(errorMessage, 'removed');
    // Clean up URL
    window.history.replaceState({}, document.title, window.location.pathname);
    return false;
  }

  const accessToken = params.get('accessToken');
  const refreshToken = params.get('refreshToken');

  if (accessToken && refreshToken) {
    try {
      // Save tokens to localStorage
      localStorage.setItem('tributary_accessToken', accessToken);
      localStorage.setItem('tributary_refreshToken', refreshToken);

      // Fetch and save user info
      const userResponse = await fetch('/api/auth/user', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (userResponse.ok) {
        const user = await userResponse.json();
        localStorage.setItem('tributary_user', JSON.stringify(user));

        // Clean up URL by removing tokens
        window.history.replaceState({}, document.title, window.location.pathname);

        // Update header profile button
        if (typeof window.updateProfileButton === 'function') {
          window.updateProfileButton();
        }

        showToast('Вы успешно вошли в аккаунт');
        return true;
      }
    } catch (err) {
      console.error('OAuth callback error:', err);
      // Clean up URL even on error
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  return false;
}

/**
 * Handle payment return from T-Bank
 * Checks URL parameters for order ID and displays appropriate modal
 * Also refreshes order status to show updated payment state
 */
function handlePaymentReturn() {
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get('order');

  // If no order parameter, nothing to do
  if (!orderId) return;

  // Import modal utility
  import('/js/core/ui-helpers.js').then(({ showConfirmationModal }) => {
    // Show success modal - payment will be confirmed via webhook
    // The order status may take a moment to update
    showConfirmationModal(
      `Возвращаемся к вашему заказу #${orderId}. Статус оплаты обновится автоматически.`,
      'info',
      4000
    );

    // Scroll to orders section after a brief delay
    setTimeout(() => {
      const ordersSection = document.getElementById('profile-orders');
      if (ordersSection) {
        ordersSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 500);

    // Reload orders to get updated status (webhook may have already processed payment)
    setTimeout(() => {
      if (typeof loadOrders === 'function') {
        loadOrders();
      }
    }, 1000);

    // Clean up URL without reloading the page
    window.history.replaceState({}, document.title, '/profile');
  }).catch(err => {
    console.error('Failed to load modal utility:', err);
    // Fallback: just clean up URL
    window.history.replaceState({}, document.title, '/profile');
  });
}

/**
 * Initialize profile page
 */
async function initProfile() {
  // Refresh DOM references first (critical for SPA navigation)
  refreshDOMReferences();

  // Setup event listeners (must be after DOM refresh)
  setupProfileEventListeners();

  try {
    // First, handle OAuth callback if tokens are in URL
    await handleAuthCallback();

    // Fetch app config to determine which login buttons to show
    await setupLoginButtons();

    // Initialize DataSync
    const loggedIn = await initAuth();
    isUserLoggedIn = loggedIn;

    // Initialize FAQ popup
    initFAQPopup('profile');
    addFAQButton('.profile-title');

    // Load FAQ info boxes
    renderFaqInfoBoxes('profile', document.getElementById('profile-faq-info-boxes'));

    if (isUserLoggedIn && isLoggedIn()) {
      // Load profile data
      await loadProfileData();
      // Clear the profile updates counter now that the user is on the profile page
      if (typeof window.markProfileAsSeen === 'function') {
        window.markProfileAsSeen();
      }
    }

    // Update UI based on auth state
    await updateProfileUI();

    // Handle payment return from T-Bank
    handlePaymentReturn();

    // Load recently viewed products (works regardless of login status)
    loadRecentlyViewedProducts();

    // Initialize hide photo and notification toggles
    if (isUserLoggedIn && isLoggedIn()) {
      initHidePhotoToggle();
      initNotificationsSection();
    }

  } catch (err) {
    console.error('Error initializing profile:', err);
    // Show logged out state on error
    profileLoggedOut.style.display = 'block';
    profileLoggedIn.style.display = 'none';
  }
}

/**
 * Setup login buttons based on deployment mode and current platform context.
 *
 * Priority logic:
 *  - Inside VK Mini App → show only VK button
 *  - Inside Telegram Mini App → show only Telegram button
 *  - Yandex deployment (web) → show Yandex + VK (if enabled)
 */
async function setupLoginButtons() {
  const inVK = isVKMiniApp();
  const inMAX = isMAXMiniApp();
  const inTelegram = !inVK && !inMAX && isInsideTelegram();

  if (inMAX) {
    // Inside MAX Mini App — show only MAX button
    if (telegramLoginButton) telegramLoginButton.style.display = 'none';
    if (yandexLoginButton) yandexLoginButton.style.display = 'none';
    if (vkLoginButton) vkLoginButton.style.display = 'none';
    if (maxLoginButton) maxLoginButton.style.display = 'flex';
    return;
  }

  if (inVK) {
    // Inside VK Mini App — show only VK button regardless of server config
    if (telegramLoginButton) telegramLoginButton.style.display = 'none';
    if (yandexLoginButton) yandexLoginButton.style.display = 'none';
    if (vkLoginButton) vkLoginButton.style.display = 'flex';
    if (maxLoginButton) maxLoginButton.style.display = 'none';
    return;
  }

  if (inTelegram) {
    // Inside Telegram Mini App — show only Telegram button
    if (telegramLoginButton) telegramLoginButton.style.display = 'flex';
    if (yandexLoginButton) yandexLoginButton.style.display = 'none';
    if (vkLoginButton) vkLoginButton.style.display = 'none';
    if (maxLoginButton) maxLoginButton.style.display = 'none';
    return;
  }

  // Web browser — use server config
  try {
    const response = await fetch('/api/config');
    const appConfig = await response.json();

    if (appConfig.isTelegramMode) {
      // In telegram mode on a regular browser, use the Login Widget instead of mini-app button
      if (telegramLoginButton) telegramLoginButton.style.display = 'none';
      if (telegramWidgetContainer && appConfig.telegramBotUsername) {
        telegramWidgetContainer.style.display = 'flex';
        injectTelegramLoginWidget(appConfig.telegramBotUsername, telegramWidgetContainer);
      }
    } else {
      if (telegramLoginButton) telegramLoginButton.style.display = 'none';
      if (telegramWidgetContainer) telegramWidgetContainer.style.display = 'none';
    }

    if (yandexLoginButton) {
      yandexLoginButton.style.display = appConfig.isYandexMode ? 'flex' : 'none';
    }
    if (vkLoginButton) {
      vkLoginButton.style.display = appConfig.isVkEnabled ? 'flex' : 'none';
    }
    if (maxLoginButton) {
      maxLoginButton.style.display = 'none'; // MAX only available inside MAX Mini App
    }
  } catch (err) {
    console.error('Error fetching app config:', err);
    if (telegramLoginButton) telegramLoginButton.style.display = 'flex';
    if (yandexLoginButton) yandexLoginButton.style.display = 'flex';
    if (vkLoginButton) vkLoginButton.style.display = 'flex';
    if (maxLoginButton) maxLoginButton.style.display = 'none';
  }
}

/**
 * Dynamically inject the Telegram Login Widget script into a container.
 * Uses window.onTelegramWidgetAuth as the callback — must be globally accessible.
 */
function injectTelegramLoginWidget(botUsername, container) {
  if (container.dataset.widgetLoaded) return;
  container.dataset.widgetLoaded = '1';

  window.onTelegramWidgetAuth = async (user) => {
    try {
      const ok = await loginTelegramWidget(user);
      if (ok) {
        isUserLoggedIn = true;
        try { await loadProfileData(); } catch (_) {}
        updateProfileUI();
        if (typeof window.updateProfileButton === 'function') {
          window.updateProfileButton();
        }
        showToast('Вы успешно вошли в аккаунт');
      } else {
        showToast('Ошибка входа', 'removed');
      }
    } catch (err) {
      console.error('Telegram widget auth error:', err);
      showToast('Ошибка входа', 'removed');
    }
  };

  const script = document.createElement('script');
  script.src = 'https://telegram.org/js/telegram-widget.js?22';
  script.setAttribute('data-telegram-login', botUsername);
  script.setAttribute('data-size', 'large');
  script.setAttribute('data-radius', '10');
  script.setAttribute('data-lang', 'ru');
  script.setAttribute('data-onauth', 'window.onTelegramWidgetAuth(user)');
  script.setAttribute('data-request-access', 'write');
  script.async = true;
  container.appendChild(script);
}

// ============================================================
// EVENT LISTENERS
// ============================================================

/**
 * Setup event listeners for profile page buttons
 * Called during init to ensure DOM elements are available
 */
function setupProfileEventListeners() {
  // Login buttons
  if (telegramLoginButton) {
    telegramLoginButton.addEventListener('click', handleTelegramLogin);
  }

  if (yandexLoginButton) {
    yandexLoginButton.addEventListener('click', handleYandexLogin);
  }

  if (vkLoginButton) {
    vkLoginButton.addEventListener('click', handleVkLogin);
  }

  if (maxLoginButton) {
    maxLoginButton.addEventListener('click', handleMaxLogin);
  }

  // Logout button
  if (profileLogoutButton) {
    profileLogoutButton.addEventListener('click', handleLogout);
  }

  // Delete profile button
  const profileDeleteButton = document.getElementById('profile-delete-button');
  if (profileDeleteButton) {
    profileDeleteButton.addEventListener('click', handleDeleteProfile);
  }
}

/**
 * Handle profile deletion
 */
async function handleDeleteProfile() {
  showConfirmation(
    'Удалить профиль?',
    'Все ваши данные будут безвозвратно удалены. Это действие нельзя отменить.',
    async () => {
      try {
        const currentUser = getCurrentUser();
        if (!currentUser) {
          showToast('Ошибка: пользователь не найден', 'removed');
          return;
        }

        const response = await fetch('/api/auth/delete-account', {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${getAccessToken()}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          // Clear auth state
          await logout();
          isUserLoggedIn = false;

          // Update UI
          updateProfileUI();

          // Update header profile button
          if (typeof window.updateProfileButton === 'function') {
            window.updateProfileButton();
          }

          showToast('Профиль успешно удален');

          // Redirect to home page after a short delay
          setTimeout(() => {
            window.location.href = '/';
          }, 1500);
        } else {
          const errorData = await response.json().catch(() => ({}));
          console.error('Delete profile error:', response.status, errorData);
          showToast(`Ошибка при удалении: ${errorData.error || 'Неизвестная ошибка'}`, 'error');
        }
      } catch (error) {
        console.error('Error deleting profile:', error);
        showToast('Произошла ошибка при удалении профиля', 'error');
      }
    }
  );
}

// ============================================================
// NOTIFICATIONS SECTION
// ============================================================

/**
 * Render the per-login-method notification settings section.
 * - VK:       button to call VKWebAppAllowNotifications
 * - Telegram: toggle backed by PATCH /api/users/notifications-enabled
 * - Yandex:   same toggle
 */
function initNotificationsSection() {
  const section = document.getElementById('notification-settings-section');
  if (!section) return;

  const user = getCurrentUser();
  if (!user) return;

  const loginMethod = user.login_method;
  // Treat missing field as true (default for users before migration)
  const notificationsOn = user.notifications_enabled !== false;

  const methodDescriptions = {
    vk: 'Уведомления поступают в шторку уведомлений ВК',
    telegram: 'Уведомления поступают через нашего бота',
    yandex: 'Уведомления поступают на почту'
  };

  const methodDesc = methodDescriptions[loginMethod] || '';

  let controlHTML = '';

  if (loginMethod === 'vk') {
    controlHTML = `
      <div class="settings-item">
        <div class="settings-item-info">
          <svg class="settings-item-icon" width="16" height="16"><use href="#message"></use></svg>
          <span>Уведомления ВКонтакте</span>
        </div>
        <button id="vk-enable-notifications-btn" class="notification-enable-btn">Включить</button>
      </div>
    `;
  } else if (loginMethod === 'telegram' || loginMethod === 'yandex') {
    const stateAttr = notificationsOn ? 'true' : 'false';
    const label = loginMethod === 'telegram' ? 'Уведомления Telegram' : 'Email уведомления';
    controlHTML = `
      <div class="settings-item">
        <div class="settings-item-info">
          <svg class="settings-item-icon" width="16" height="16"><use href="#message"></use></svg>
          <span>${label}</span>
        </div>
        <button id="toggle-notifications" class="toggle-button" data-state="${stateAttr}">
          <span class="toggle-knob"></span>
        </button>
      </div>
    `;
  }

  if (!controlHTML) return;

  section.innerHTML = `
    <h3 class="settings-section-title">Уведомления</h3>
    <div class="settings-list">
      ${controlHTML}
    </div>
    <div class="notification-info">
      ${methodDesc ? `<p class="notification-info-method">${methodDesc}</p>` : ''}
      <p class="notification-info-payment">Уведомления об оплате поступают на указанную при оплате почту</p>
    </div>
  `;
  section.style.display = 'block';

  if (loginMethod === 'vk') {
    const btn = section.querySelector('#vk-enable-notifications-btn');
    if (btn) {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          const allowed = await requestVKNotifications();
          if (allowed) {
            showToast('Уведомления включены');
            btn.textContent = 'Включено';
          } else {
            showToast('Вы можете включить уведомления в настройках ВК', 'removed');
            btn.disabled = false;
          }
        } catch {
          showToast('Ошибка при включении уведомлений', 'removed');
          btn.disabled = false;
        }
      });
    }
  } else {
    const toggleBtn = section.querySelector('#toggle-notifications');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', async () => {
        if (!isLoggedIn()) return;
        const currentState = toggleBtn.getAttribute('data-state') === 'true';
        const newState = !currentState;

        try {
          const response = await fetch('/api/users/notifications-enabled', {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('tributary_accessToken')}`
            },
            body: JSON.stringify({ notifications_enabled: newState })
          });

          if (response.ok) {
            setToggleState(toggleBtn, newState);
            showToast(newState ? 'Уведомления включены' : 'Уведомления отключены');
            const cachedUser = getCurrentUser();
            if (cachedUser) {
              cachedUser.notifications_enabled = newState;
              localStorage.setItem('tributary_user', JSON.stringify(cachedUser));
            }
          } else {
            showToast('Ошибка при обновлении настроек', 'error');
          }
        } catch {
          showToast('Произошла ошибка', 'removed');
        }
      });
    }
  }
}

// ============================================================
// HIDE PHOTO TOGGLE
// ============================================================

/**
 * Initialize hide photo toggle
 */
function initHidePhotoToggle() {
  const toggleButton = document.getElementById('toggle-hide-photo');
  if (!toggleButton) return;

  // Load current state from user
  const user = getCurrentUser();
  if (user && user.hide_photo) {
    setToggleState(toggleButton, true);
  }

  // Handle toggle click
  toggleButton.addEventListener('click', async () => {
    if (!isLoggedIn()) return;

    const currentState = toggleButton.getAttribute('data-state') === 'true';
    const newState = !currentState;

    try {
      const response = await fetch('/api/users/hide-photo', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('tributary_accessToken')}`
        },
        body: JSON.stringify({ hide_photo: newState })
      });

      if (response.ok) {
        setToggleState(toggleButton, newState);
        showToast(newState ? 'Фото профиля скрыто' : 'Фото профиля отображается', 'success');

        // Update local user data
        const user = getCurrentUser();
        if (user) {
          user.hide_photo = newState;
          localStorage.setItem('tributary_user', JSON.stringify(user));

          // Update avatar display immediately
          const profileAvatar = document.getElementById('profile-avatar');
          if (profileAvatar) {
            const initials = (user.firstName?.[0] || user.username?.[0] || '?').toUpperCase();
            const defaultAvatar = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect fill='%23066fa3' width='40' height='40'/%3E%3Ctext x='20' y='25' text-anchor='middle' fill='%23fff' font-size='20' font-weight='bold'%3E${initials}%3C/text%3E%3C/svg%3E`;
            const avatarUrl = (newState || !user.photo_url) ? defaultAvatar : user.photo_url;
            const displayName = user.firstName || user.username || 'Пользователь';
            profileAvatar.innerHTML = `<img src="${avatarUrl}" alt="${displayName}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;"/>`;
          }
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('Hide photo error:', response.status, errorData);
        showToast(errorData.error || 'Ошибка при обновлении настроек', 'error');
      }
    } catch (error) {
      console.error('Error toggling hide photo:', error);
      showToast('Произошла ошибка', 'removed');
    }
  });
}

/**
 * Set toggle button state (CSS handles visual state via data-state attribute)
 */
function setToggleState(button, isActive) {
  button.setAttribute('data-state', isActive ? 'true' : 'false');
}

// ============================================================
// THEME TOGGLE
// ============================================================


// Page-level state for cleanup
let isProfilePageInitialized = false;

/**
 * Cleanup profile page (called when navigating away via SPA router)
 */
function cleanupProfilePage() {
  isProfilePageInitialized = false;
}

// Wrap initProfile with initialization guard
const originalInitProfile = initProfile;
initProfile = async function() {
  if (isProfilePageInitialized) {
    return;
  }
  isProfilePageInitialized = true;
  return originalInitProfile();
};

// Register with SPA router
if (typeof window.registerPage === 'function') {
  window.registerPage('/profile', {
    init: initProfile,
    cleanup: cleanupProfilePage
  });
}

// Auto-initialize when DOM is ready (for direct page visits only)
const isProfilePagePath = window.location.pathname === '/profile' || window.location.pathname === '/profile.html';
if (isProfilePagePath) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProfile);
  } else {
    initProfile();
  }
}
