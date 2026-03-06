/**
 * views/feed.js
 * Extracted from admin-miniapp/script.js
 */

import { state, updateState, isAdmin, isEditor, hasPermission } from '../state.js';
import { API_BASE, tg, isBrowserMode } from '../config.js';
import { SVGIcons, requireAuth, formatDate, formatTime, formatPrice, formatNumber, getStatusText, getStatusClass, showToast, showError, copyToClipboard, showModal, hideModal, addImageSize, escapeHtml } from '../utils.js';
import { apiGet, apiPost } from '../utils/apiClient.js';
import { updateOrdersBadge } from './orders/rendering.js';
import { fetchOrders } from './orders.js';
import { fetchReviews, fetchComments, fetchSuggestions, respondToFeedback, submitInlineResponse, hideFeedback, isHostedImage, getStorageProvider, generateDownloadFilename, downloadImage } from './feedback.js';

// ============================================================================
// ACTIVITY FEED VIEW
// ============================================================================

/**
 * Check if current user can see orders in feed
 * Admin can always see orders, editor depends on permissions
 */
function canShowOrders() {
  if (isAdmin()) return true;
  // Editor can see orders in feed only if explicitly allowed (default: false)
  return hasPermission('feed', 'showOrders');
}

async function loadFeed() {
  requireAuth();
  const content = document.getElementById('content');

  // Reset event listener flags since we're recreating the DOM
  feedEventListenersAttached = false;
  feedItemEventListenersAttached = false;

  // Initialize feedFilter to 'all' if not set
  if (!state.feedFilter) {
    state.feedFilter = 'all';
  }

  // Check if current role can see orders
  const showOrdersTab = canShowOrders();

  content.innerHTML = `
    <div class="page-header">
      <h2 class="page-title">Лента активности</h2>
      <div class="page-header-actions">
        <button class="btn btn-secondary btn-sm btn-icon-only" data-action="mark-all-read" title="Отметить все прочитанными">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        </button>
        <button class="btn btn-secondary btn-sm btn-icon-only" data-action="refresh-feed" title="Обновить">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 4v6h-6M1 20v-6h6"/>
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
          </svg>
        </button>
      </div>
    </div>

    <div class="tabs-carousel">
      <div class="tabs-container">
        <button class="tab-btn ${state.feedFilter === 'all' ? 'active' : ''}" data-action="filter-feed" data-filter="all" title="Все">
          <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 6h16M4 12h16M4 18h16"/>
          </svg>
          <span class="tab-label">Все</span>
        </button>
        ${showOrdersTab ? `
        <button class="tab-btn ${state.feedFilter === 'orders' ? 'active' : ''}" data-action="filter-feed" data-filter="orders" title="Заказы">
          <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M3 9h18M9 3v18"/>
          </svg>
          <span class="tab-label">Заказы</span>
        </button>
        ` : ''}
        <button class="tab-btn ${state.feedFilter === 'reviews' ? 'active' : ''}" data-action="filter-feed" data-filter="reviews" title="Отзывы">
          <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
          <span class="tab-label">Отзывы</span>
        </button>
        <button class="tab-btn ${state.feedFilter === 'comments' ? 'active' : ''}" data-action="filter-feed" data-filter="comments" title="Комментарии">
          <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
          <span class="tab-label">Комментарии</span>
        </button>
        <button class="tab-btn ${state.feedFilter === 'suggestions' ? 'active' : ''}" data-action="filter-feed" data-filter="suggestions" title="Предложения">
          <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01"/>
          </svg>
          <span class="tab-label">Предложения</span>
        </button>
        ${isAdmin() ? `
        <button class="tab-btn ${state.feedFilter === 'uploads' ? 'active' : ''}" data-action="filter-feed" data-filter="uploads" title="Загрузки">
          <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <span class="tab-label">Загрузки</span>
        </button>
        ` : ''}
      </div>
    </div>

    <div id="feed-list">
      <div class="loading-spinner">
        <div class="spinner"></div>
        <p>Загрузка ленты...</p>
      </div>
    </div>
  `;

  // Attach event listeners
  attachFeedEventListeners();

  try {
    // Fetch orders and feedback in parallel with optimized limits for initial load
    // For editors, skip fetching orders if they don't have permission
    const fetchPromises = [
      showOrdersTab ? fetchOrders('', 30) : Promise.resolve([]), // Skip orders for editor
      fetchReviews(),
      fetchComments(),
      fetchSuggestions()
    ];

    const [ordersResult, reviews, comments, suggestions] = await Promise.all(fetchPromises);

    // fetchOrders returns {orders: [...], total: N} or just array
    const orders = showOrdersTab
      ? (Array.isArray(ordersResult) ? ordersResult : (ordersResult?.orders || []))
      : [];

    state.feedOrders = orders;
    state.feedReviews = reviews;
    state.feedComments = comments;
    state.feedSuggestions = suggestions;

    // Count unread items
    const unreadCount = countUnreadFeedItems();
    updateFeedBadge(unreadCount);

    renderFeed();
    attachFeedItemEventListeners(); // Attach after rendering feed items
  } catch (error) {
    console.error('Error loading feed:', error);
    const feedList = document.getElementById('feed-list');
    if (feedList) {
      feedList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">${SVGIcons.alert}</div>
          <h3>Ошибка загрузки</h3>
          <p>Не удалось загрузить ленту активности</p>
          <p class="text-tertiary text-sm mt-xs">${escapeHtml(error.message)}</p>
          <button class="btn btn-primary mt-sm" data-action="reload-feed">Повторить</button>
        </div>
      `;
      attachFeedEventListeners(); // Re-attach for retry button
    }
  }
}

// Track if event listeners have been attached to prevent duplicates
let feedEventListenersAttached = false;
let feedItemEventListenersAttached = false;

/**
 * Attach event listeners for feed controls
 */
function attachFeedEventListeners() {
  if (feedEventListenersAttached) return;

  const content = document.getElementById('content');
  if (!content) return;

  // Use event delegation for all feed controls
  content.addEventListener('click', handleFeedControlClick);
  feedEventListenersAttached = true;
}

/**
 * Handle clicks on feed control buttons
 */
function handleFeedControlClick(e) {
  const actionEl = e.target.closest('[data-action]');
  const action = e.target.dataset.action || actionEl?.dataset.action;

  if (!action) return;

  switch (action) {
    case 'mark-all-read':
      markAllAsRead();
      break;

    case 'filter-feed':
      // Get filter from the clicked element or its closest parent with data-filter
      const filter = e.target.dataset.filter || actionEl?.dataset.filter;
      if (filter) filterFeedType(filter);
      break;

    case 'reload-feed':
      loadFeed();
      break;

    case 'refresh-feed':
      refreshFeed();
      break;
  }
}

/**
 * Attach event listeners for feed items
 */
function attachFeedItemEventListeners() {
  if (feedItemEventListenersAttached) return;

  const feedList = document.getElementById('feed-list');
  if (!feedList) return;

  // Use event delegation for feed item interactions
  feedList.addEventListener('click', handleFeedItemInteraction);
  feedItemEventListenersAttached = true;
}

/**
 * Handle clicks on feed items
 */
function handleFeedItemInteraction(e) {
  const actionEl = e.target.closest('[data-action]');
  const action = e.target.dataset.action || actionEl?.dataset.action;

  // Handle toggle read/unread
  if (action === 'toggle-feed-read') {
    e.stopPropagation();
    e.preventDefault();
    const actionBtn = e.target.closest('[data-action="toggle-feed-read"]');
    const feedType = actionBtn?.dataset.feedType;
    const feedIdStr = actionBtn?.dataset.feedId;
    const feedId = feedIdStr ? parseInt(feedIdStr, 10) : null;
    if (feedType && feedId !== null && !isNaN(feedId)) {
      toggleFeedItemRead(feedType, feedId);
    }
    return;
  }

  // Handle respond to feedback
  if (action === 'respond-feedback') {
    e.stopPropagation();
    const feedbackType = actionEl?.dataset.feedbackType;
    const feedbackId = parseInt(actionEl?.dataset.feedbackId);
    if (feedbackType && feedbackId) {
      // Don't reload after opening form - respondToFeedback creates inline form
      // The form submission handler will reload data after response is sent
      respondToFeedback(feedbackType, feedbackId);
    }
    return;
  }

  // Handle submit inline response (from respondToFeedback form)
  if (action === 'submit-inline-response') {
    e.stopPropagation();
    const feedbackType = actionEl?.dataset.feedbackType;
    const feedbackId = parseInt(actionEl?.dataset.feedbackId);
    if (feedbackType && feedbackId) {
      submitInlineResponse(feedbackType, feedbackId).then(() => {
        loadFeed(); // Reload to show updated data
      });
    }
    return;
  }

  // Handle cancel inline response
  if (action === 'cancel-inline-response') {
    e.stopPropagation();
    document.querySelectorAll('.inline-response-form').forEach(form => form.remove());
    return;
  }

  // Handle hide feedback
  if (action === 'hide-feedback') {
    e.stopPropagation();
    const feedbackType = actionEl?.dataset.feedbackType;
    const feedbackId = parseInt(actionEl?.dataset.feedbackId);
    if (feedbackType && feedbackId) {
      hideFeedback(feedbackType, feedbackId).then(() => {
        loadFeed(); // Reload to show updated data
      });
    }
    return;
  }

  // Handle image actions in feed
  if (action === 'download-feed-image') {
    e.stopPropagation();
    handleFeedImageDownload(e.target);
    return;
  }

  if (action === 'replace-feed-image') {
    e.stopPropagation();
    handleFeedImageReplace(e.target);
    return;
  }

  if (action === 'delete-feed-image') {
    e.stopPropagation();
    handleFeedImageDelete(e.target);
    return;
  }

  // Handle upload tab actions
  if (action === 'download-upload') {
    e.stopPropagation();
    handleUploadDownload(e.target);
    return;
  }

  if (action === 'replace-upload') {
    e.stopPropagation();
    handleUploadReplace(e.target);
    return;
  }

  if (action === 'delete-upload') {
    e.stopPropagation();
    handleUploadDelete(e.target);
    return;
  }

  // Handle feed item actions (legacy)
  if (action === 'mark-feedback-read') {
    e.stopPropagation();
    const feedbackId = parseInt(e.target.dataset.feedbackId || e.target.closest('[data-feedback-id]')?.dataset.feedbackId);
    if (feedbackId) markFeedbackAsRead(feedbackId);
    return;
  }

  // Handle toggle order details in feed
  if (action === 'toggle-feed-order-details') {
    e.stopPropagation();
    const orderId = actionEl?.dataset.orderId;
    if (orderId) toggleFeedOrderDetails(orderId);
    return;
  }

  // Handle view order details (open full modal)
  if (action === 'view-order-details') {
    e.stopPropagation();
    const orderId = parseInt(actionEl?.dataset.orderId, 10);
    if (orderId) {
      import('./orders.js').then(module => {
        module.viewOrderDetails(orderId);
      });
    }
    return;
  }

  // Handle feed item click (for orders)
  const feedItem = e.target.closest('[data-feed-type]');
  if (feedItem && !e.target.closest('[data-action]') && !e.target.closest('button')) {
    const type = feedItem.dataset.feedType;
    const id = parseInt(feedItem.dataset.feedId);
    if (type && id) handleFeedItemClick(type, id);
  }
}

/**
 * Toggle feed order details visibility
 */
function toggleFeedOrderDetails(orderId) {
  const detailsDiv = document.getElementById(`feed-order-details-${orderId}`);
  const toggleBtn = document.querySelector(`[data-action="toggle-feed-order-details"][data-order-id="${orderId}"] .collapse-arrow`);

  if (!detailsDiv) return;

  if (detailsDiv.style.display === 'none') {
    detailsDiv.style.display = 'block';
    if (toggleBtn) {
      toggleBtn.style.transform = 'rotate(180deg)';
    }
  } else {
    detailsDiv.style.display = 'none';
    if (toggleBtn) {
      toggleBtn.style.transform = 'rotate(0deg)';
    }
  }
}

function filterFeedType(type) {
  if (!state) state = {};
  state.feedFilter = type;

  // Update active tab buttons immediately
  document.querySelectorAll('.tabs-container .tab-btn').forEach(btn => {
    const btnFilter = btn.dataset.filter;
    if (btnFilter === type) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Uploads tab has its own rendering
  if (type === 'uploads') {
    loadUploadsView();
    return;
  }

  // If data already loaded, just re-render without reloading
  if (state.feedOrders !== undefined || state.feedReviews !== undefined ||
      state.feedComments !== undefined || state.feedSuggestions !== undefined) {
    renderFeed();
    attachFeedItemEventListeners();
  } else {
    // No data yet, load everything
    loadFeed();
  }
}

function renderFeed() {
  const container = document.getElementById('feed-list');

  if (!container) {
    console.error('feed-list container not found in DOM');
    return;
  }

  const filter = state.feedFilter || 'all';
  const showOrders = canShowOrders();

  // Build combined feed items
  let feedItems = [];

  // Add orders to feed (only if user has permission)
  if (showOrders && (filter === 'all' || filter === 'orders')) {
    const readOrders = JSON.parse(localStorage.getItem('readOrders') || '[]');
    // Ensure readOrders contains numbers for proper comparison
    const readOrdersSet = new Set(readOrders.map(id => parseInt(id, 10)));

    (state.feedOrders || []).forEach(order => {
      // Get user delivery name (surname + name)
      const deliveryName = [order.address?.surname, order.address?.name].filter(Boolean).join(' ') || 'Не указано';
      const orderId = parseInt(order.id, 10);
      const isRead = readOrdersSet.has(orderId);

      // Calculate total items and price for order display
      const totalItems = order.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;
      const totalWithDelivery = (parseFloat(order.total_price) || 0) + (parseFloat(order.delivery_cost) || 0);

      feedItems.push({
        type: 'order',
        id: orderId,
        created_at: order.created_at,
        icon: '',
        title: `Заказ #${order.id}`,
        description: deliveryName,
        status: order.status,
        isRead: isRead,
        totalItems: totalItems,
        totalPrice: totalWithDelivery,
        data: order
      });
    });
  }

  // Add reviews to feed
  if (filter === 'all' || filter === 'reviews') {
    (state.feedReviews || []).forEach(review => {
      // Use product_title if available, otherwise show product_id or 'без товара'
      const productInfo = review.product_title
        ? review.product_title
        : (review.product_id ? `#${review.product_id}` : 'без товара');
      feedItems.push({
        type: 'review',
        id: review.id,
        created_at: review.created_at,
        icon: '',
        title: `Отзыв: ${productInfo}`,
        description: `${review.user?.first_name || review.user_name || 'Пользователь'}: "${(review.review_text || '').substring(0, 60)}${(review.review_text || '').length > 60 ? '...' : ''}"`,
        hasResponse: !!review.admin_response,
        isRead: review.is_read,
        rating: review.rating,
        data: review
      });
    });
  }

  // Add comments to feed
  if (filter === 'all' || filter === 'comments') {
    (state.feedComments || []).forEach(comment => {
      // Use product_title if available
      const productInfo = comment.product_title
        ? comment.product_title
        : (comment.product_id ? `#${comment.product_id}` : 'общий');
      feedItems.push({
        type: 'comment',
        id: comment.id,
        created_at: comment.created_at,
        icon: '',
        title: `Комментарий: ${productInfo}`,
        description: `${comment.user?.first_name || comment.user_name || 'Пользователь'}: "${(comment.comment_text || '').substring(0, 60)}${(comment.comment_text || '').length > 60 ? '...' : ''}"`,
        hasResponse: !!comment.admin_response,
        isRead: comment.is_read,
        data: comment
      });
    });
  }

  // Add suggestions to feed
  if (filter === 'all' || filter === 'suggestions') {
    (state.feedSuggestions || []).forEach(suggestion => {
      feedItems.push({
        type: 'suggestion',
        id: suggestion.id,
        created_at: suggestion.created_at,
        icon: '',
        title: 'Предложение',
        description: `${suggestion.user?.first_name || suggestion.user_name || 'Пользователь'}: "${(suggestion.suggestion_text || '').substring(0, 60)}${(suggestion.suggestion_text || '').length > 60 ? '...' : ''}"`,
        hasResponse: !!suggestion.admin_response,
        isRead: suggestion.is_read,
        data: suggestion
      });
    });
  }

  // Sort by date (newest first)
  feedItems.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  if (feedItems.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"></div>
        <h3>Лента пуста</h3>
        <p>Новых событий нет</p>
      </div>
    `;
    return;
  }

  // Render feed items
  container.innerHTML = feedItems.map(item => {
    // For orders, render a card similar to orders tab
    if (item.type === 'order') {
      return renderOrderFeedItem(item);
    }

    // Get user profile image
    const userPhoto = item.data?.photo_url || item.data?.user?.photo_url;
    const userName = item.data?.user?.first_name || item.data?.user_name || 'Пользователь';
    const userInitial = (userName[0] || '?').toUpperCase();

    // Rating stars for reviews
    const ratingStars = item.rating
      ? `<div class="feed-item-rating">${'★'.repeat(item.rating)}${'☆'.repeat(5 - item.rating)}</div>`
      : '';

    return `
    <div class="feed-item ${item.isRead === false ? 'unread' : ''}"
         data-feed-type="${item.type}"
         data-feed-id="${item.data.id || item.id}">
      <div class="feed-item-content" style="align-items: flex-start;">
        <button class="feed-eye-btn ${item.isRead !== false ? 'read' : ''}"
                data-action="toggle-feed-read"
                data-feed-type="${item.type}"
                data-feed-id="${item.id}"
                title="${item.isRead !== false ? 'Отметить непрочитанным' : 'Отметить прочитанным'}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${item.isRead !== false ? 'var(--text-tertiary)' : 'var(--primary)'}" stroke-width="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        </button>
        ${userPhoto ? `
          <img src="${userPhoto}" alt="${escapeHtml(userName)}" class="user-avatar" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
          <div class="user-avatar-initials" style="display:none;">${userInitial}</div>
        ` : `
          <div class="user-avatar-initials">${userInitial}</div>
        `}
        <div class="feed-item-body" style="flex: 1; min-width: 0;">
          <div class="feed-item-title">
            ${item.title}
            ${item.isRead === false ? '<span class="new-badge">NEW</span>' : ''}
          </div>
          ${ratingStars}
          <div class="feed-item-description">${item.description}</div>
          <div class="feed-item-date">${formatDate(item.created_at)}</div>
          ${item.hasResponse !== undefined ? `
            <div class="mt-xs text-xs ${item.hasResponse ? 'text-success' : 'text-tertiary'}">
              ${item.hasResponse ? 'Ответ дан' : 'Ожидает ответа'}
            </div>
          ` : ''}
          ${item.data?.images && item.data.images.length > 0 ? `
            <div class="feed-images-grid">
              ${item.data.images.map((img, idx) => {
                const hosted = isHostedImage(img.image_url);
                const provider = getStorageProvider(img.image_url);
                const providerLabel = provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : 'URL';
                const downloadName = generateDownloadFilename(item.created_at, item.data?.user_name || userName, idx, img.image_url);

                return `
                  <div class="feed-image-item ${hosted ? 'feed-image-item--hosted' : 'feed-image-item--external'}"
                       data-image-id="${img.id}"
                       data-image-url="${img.image_url}"
                       data-review-id="${item.id}"
                       data-download-name="${downloadName}"
                       data-is-hosted="${hosted}"
                       data-user-name="${item.data?.user_name || userName}">
                    <img src="${addImageSize(img.image_url, '120x0')}" alt=""
                         onerror="this.src='${img.image_url}'">
                    <span class="image-storage-badge image-storage-badge--${hosted ? 'hosted' : 'external'}">${hosted ? providerLabel : 'URL'}</span>
                    <div class="feed-image-actions">
                      <button class="img-action-btn" data-action="download-feed-image" title="Скачать">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                      </button>
                      <button class="img-action-btn" data-action="replace-feed-image" title="Заменить">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button class="img-action-btn img-action-btn--delete" data-action="delete-feed-image" title="Удалить">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18m-2 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                      </button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          ` : ''}
          <div class="feed-item-actions" style="display: flex; gap: var(--spacing-xs); margin-top: var(--spacing-sm);">
            ${!item.hasResponse ? `
              <button class="btn btn-sm btn-primary" data-action="respond-feedback" data-feedback-type="${item.type}" data-feedback-id="${item.id}">
                Ответить
              </button>
            ` : ''}
            <button class="btn btn-sm btn-secondary" data-action="hide-feedback" data-feedback-type="${item.type}" data-feedback-id="${item.id}">
              Скрыть
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
  }).join('');
}

/**
 * Render an order feed item similar to order card in orders tab
 */
function renderOrderFeedItem(item) {
  const order = item.data;
  const userName = order.address?.surname && order.address?.name
    ? `${order.address.surname} ${order.address.name}`
    : order.user?.first_name
    ? `${order.user.first_name} ${order.user.last_name || ''}`.trim()
    : order.user?.username || 'Пользователь';
  const userPhoto = order.user?.photo_url;
  const userInitial = (userName[0] || '?').toUpperCase();

  const totalItems = order.items?.reduce((sum, itm) => sum + itm.quantity, 0) || 0;
  const totalWithDelivery = (parseFloat(order.total_price) || 0) + (parseFloat(order.delivery_cost) || 0);

  // Build products table with images
  const productsTableHTML = order.items && order.items.length > 0 ? `
    <table class="order-products-table" style="width: 100%; border-collapse: collapse; font-size: 0.813rem;">
      <thead>
        <tr style="border-bottom: 1px solid var(--border-color);">
          <th style="text-align: left; padding: var(--spacing-xs); color: var(--text-secondary);">Товар</th>
          <th style="text-align: center; padding: var(--spacing-xs); color: var(--text-secondary);">Кол-во</th>
          <th style="text-align: right; padding: var(--spacing-xs); color: var(--text-secondary);">Цена</th>
        </tr>
      </thead>
      <tbody>
        ${order.items.map(orderItem => {
          const itemTotal = (orderItem.price_at_purchase || 0) * orderItem.quantity;
          const itemImage = orderItem.image ? addImageSize(orderItem.image, '80x0') : '';
          return `
            <tr style="border-bottom: 1px solid var(--border-color);">
              <td style="padding: var(--spacing-sm) var(--spacing-xs);">
                <div style="display: flex; align-items: center; gap: var(--spacing-sm);">
                  ${itemImage ? `<img src="${itemImage}" alt="" style="width: 40px; height: 40px; border-radius: var(--radius-sm); object-fit: cover; flex-shrink: 0;">` : ''}
                  <div style="min-width: 0;">
                    <div style="font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(orderItem.title || 'Товар')}</div>
                    ${orderItem.property ? `<div style="font-size: 0.75rem; color: var(--text-tertiary);">${escapeHtml(orderItem.property)}</div>` : ''}
                  </div>
                </div>
              </td>
              <td style="text-align: center; padding: var(--spacing-xs);">${orderItem.quantity}</td>
              <td style="text-align: right; padding: var(--spacing-xs);">${formatNumber(itemTotal)}₽</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  ` : '<p style="color: var(--text-tertiary); font-size: 0.813rem;">Нет товаров</p>';

  return `
    <div class="feed-item order-card-new ${item.isRead === false ? 'unread' : ''}"
         data-feed-type="${item.type}"
         data-feed-id="${item.id}"
         style="padding: 0; margin-bottom: var(--spacing-md);">
      <!-- Order Header -->
      <div class="order-card-header" style="display: flex; justify-content: space-between; align-items: flex-start; padding: var(--spacing-md); gap: var(--spacing-md);">
        <div style="display: flex; gap: var(--spacing-sm); align-items: flex-start; flex: 1; min-width: 0;">
          <button class="feed-eye-btn ${item.isRead !== false ? 'read' : ''}"
                  data-action="toggle-feed-read"
                  data-feed-type="${item.type}"
                  data-feed-id="${item.id}"
                  title="${item.isRead !== false ? 'Отметить непрочитанным' : 'Отметить прочитанным'}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="${item.isRead !== false ? 'none' : 'var(--primary)'}" stroke="${item.isRead !== false ? 'var(--text-tertiary)' : 'var(--primary)'}" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
          ${userPhoto ? `
            <img src="${userPhoto}" alt="${escapeHtml(userName)}" class="user-avatar" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
            <div class="user-avatar-initials" style="display:none;">${userInitial}</div>
          ` : `
            <div class="user-avatar-initials">${userInitial}</div>
          `}
          <div class="order-card-main-info" style="flex: 1; min-width: 0;">
            <div style="display: flex; align-items: center; gap: var(--spacing-sm); flex-wrap: wrap;">
              <h4 class="mb-0" style="font-size: 1rem;">Заказ #${order.id}</h4>
              ${item.isRead === false ? '<span class="new-badge">NEW</span>' : ''}
              ${order.edited ? '<span class="edited-badge" style="font-size: 0.625rem; padding: 2px 6px; background: var(--warning-bg); color: var(--warning); border-radius: var(--radius-sm);">изменен</span>' : ''}
              ${order.processed ? '<span class="notion-badge">N</span>' : ''}
            </div>
            <div class="order-card-meta" style="display: flex; flex-wrap: wrap; gap: var(--spacing-xs); font-size: 0.813rem; color: var(--text-secondary); margin-top: var(--spacing-xs);">
              <span>${formatDate(order.created_at)}</span>
              <span>•</span>
              <span>${escapeHtml(userName)}</span>
              <span>•</span>
              <span>${totalItems} шт.</span>
              <span>•</span>
              <span style="font-weight: 600;">${formatNumber(totalWithDelivery)}₽</span>
            </div>
          </div>
        </div>
        <div class="order-card-header-right" style="display: flex; align-items: center; gap: var(--spacing-sm); flex-shrink: 0;">
          <span class="status-badge ${getStatusClass(order.status)}">${getStatusText(order.status)}</span>
          <button class="collapse-toggle-btn" data-action="toggle-feed-order-details" data-order-id="${order.id}" style="background: none; border: none; cursor: pointer; padding: var(--spacing-xs);">
            <svg class="collapse-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18" style="transition: transform 0.2s;">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
          <button class="btn btn-secondary btn-xs" data-action="view-order-details" data-order-id="${order.id}" style="font-size: 0.75rem; padding: 4px 8px;">
            Открыть
          </button>
        </div>
      </div>

      <!-- Collapsible Details -->
      <div class="feed-order-details" id="feed-order-details-${order.id}" style="display: none; padding: 0 var(--spacing-md) var(--spacing-md); border-top: 1px solid var(--border-color);">
        <div style="padding-top: var(--spacing-md);">
          <h5 style="font-size: 0.875rem; font-weight: 600; margin-bottom: var(--spacing-sm); color: var(--text-secondary);">Товары</h5>
          ${productsTableHTML}
        </div>
      </div>
    </div>
  `;
}

function handleFeedItemClick(type, id) {
  // Navigate to the appropriate detail view based on item type
  switch (type) {
    case 'order':
      // Import dynamically to avoid circular dependency
      import('./orders.js').then(module => {
        module.viewOrderDetails(id);
      });
      break;
  }
}

function countUnreadFeedItems() {
  // Count unread feedback items
  const reviews = (state.feedReviews || []).filter(r => !r.is_read).length;
  const comments = (state.feedComments || []).filter(c => !c.is_read).length;
  const suggestions = (state.feedSuggestions || []).filter(s => !s.is_read).length;
  return reviews + comments + suggestions;
}

function updateFeedBadge(count) {
  const badge = document.getElementById('feed-badge');
  const headerBadge = document.getElementById('feed-badge-header');

  [badge, headerBadge].forEach(el => {
    if (el) {
      if (count > 0) {
        el.textContent = count;
        el.classList.add('show');
      } else {
        el.classList.remove('show');
      }
    }
  });
}

/**
 * Toggle read/unread status for a feed item
 */
async function toggleFeedItemRead(type, id) {
  if (type === 'order') {
    // For orders, use localStorage to track read state
    const readOrders = JSON.parse(localStorage.getItem('readOrders') || '[]');
    const index = readOrders.indexOf(id);

    if (index > -1) {
      // Mark as unread
      readOrders.splice(index, 1);
      showToast('Отмечено как непрочитанное', 'success');
    } else {
      // Mark as read
      readOrders.push(id);
      showToast('Отмечено как прочитанное', 'success');
    }

    localStorage.setItem('readOrders', JSON.stringify(readOrders));
    renderFeed(); // Re-render to update UI
  } else {
    // For feedback items, use API to toggle read state
    const feedbackItem = getFeedbackItem(type, id);
    if (!feedbackItem) return;

    const isCurrentlyRead = feedbackItem.is_read;

    try {
      // Use browser-admin fallback for web-based admin access
      const adminId = state.adminData?.telegram_id || 'browser-admin';

      const response = await apiPost(`/api/feedback/${isCurrentlyRead ? 'mark-unread' : 'mark-read'}`, {
        feedbackIds: [id],
        admin_id: adminId
      });

      if (!response.ok) {
        throw new Error('Failed to toggle read status');
      }

      // Update local state instead of reloading everything
      feedbackItem.is_read = !isCurrentlyRead;

      showToast(isCurrentlyRead ? 'Отмечено как непрочитанное' : 'Отмечено как прочитанное', 'success');

      // Re-render feed to update UI
      renderFeed();

      // Update unread count
      const unreadCount = countUnreadFeedItems();
      updateFeedBadge(unreadCount);
    } catch (error) {
      console.error('Error toggling read status:', error);
      showToast('Ошибка при изменении статуса', 'error');
    }
  }
}

/**
 * Get feedback item by type and ID
 */
function getFeedbackItem(type, id) {
  // Convert id to number for comparison (API may return string or number IDs)
  const numId = parseInt(id, 10);
  switch (type) {
    case 'review':
      return state.feedReviews?.find(r => parseInt(r.id, 10) === numId);
    case 'comment':
      return state.feedComments?.find(c => parseInt(c.id, 10) === numId);
    case 'suggestion':
      return state.feedSuggestions?.find(s => parseInt(s.id, 10) === numId);
    default:
      return null;
  }
}

async function markFeedbackAsRead(feedbackId) {
  try {
    // Use browser-admin fallback for web-based admin access
    const adminId = state.adminData?.telegram_id || 'browser-admin';

    const response = await apiPost('/api/feedback/mark-read', {
      feedbackIds: [feedbackId],
      admin_id: adminId
    });

    if (!response.ok) {
      throw new Error('Failed to mark feedback as read');
    }

    showToast('Отмечено как прочитанное', 'success');
    loadFeed(); // Reload feed to reflect changes
  } catch (error) {
    console.error('Error marking feedback as read:', error);
    showToast('Ошибка при отметке', 'error');
  }
}

async function markAllAsRead() {
  try {
    // Use browser-admin fallback for web-based admin access
    const adminId = state.adminData?.telegram_id || 'browser-admin';

    const filter = state.feedFilter || 'all';
    let orderCount = 0;
    let feedbackCount = 0;

    // Mark all orders as read in localStorage
    if (filter === 'all' || filter === 'orders') {
      const readOrders = JSON.parse(localStorage.getItem('readOrders') || '[]');
      const unreadOrders = (state.feedOrders || []).filter(order => !readOrders.includes(order.id));

      if (unreadOrders.length > 0) {
        unreadOrders.forEach(order => {
          if (!readOrders.includes(order.id)) {
            readOrders.push(order.id);
          }
        });
        localStorage.setItem('readOrders', JSON.stringify(readOrders));
        orderCount = unreadOrders.length;
      }
    }

    // Mark all feedback items as read via API
    if (filter === 'all' || filter !== 'orders') {
      const response = await apiPost('/api/feedback/mark-read', {
        markAll: true,
        admin_id: adminId
      });

      if (response.ok) {
        const data = await response.json();
        feedbackCount = data.count || 0;
      }
    }

    const totalCount = orderCount + feedbackCount;
    showToast(`${totalCount} элементов отмечено как прочитанные`, 'success');
    loadFeed(); // Reload feed to reflect changes
  } catch (error) {
    console.error('Error marking all as read:', error);
    showToast('Ошибка при отметке', 'error');
  }
}


/**
 * Force refresh the feed data
 */
async function refreshFeed() {
  showToast('Обновление...', 'info');
  // Clear cached data to force reload
  state.feedOrders = undefined;
  state.feedReviews = undefined;
  state.feedComments = undefined;
  state.feedSuggestions = undefined;
  state.feedUploads = undefined;

  if (state.feedFilter === 'uploads') {
    await loadUploadsView();
  } else {
    await loadFeed();
  }
  showToast('Лента обновлена', 'success');
}

/**
 * Load activity feed with caching
 * Only fetches data if not already cached
 */
async function loadActivityFeed() {
  requireAuth();
  const content = document.getElementById('content');

  // Reset event listener flags since we're recreating the DOM
  feedEventListenersAttached = false;
  feedItemEventListenersAttached = false;

  // Initialize feedFilter to 'all' if not set
  if (!state.feedFilter) {
    state.feedFilter = 'all';
  }

  // Check if we already have cached data
  const hasCachedData = state.feedOrders !== undefined ||
                        state.feedReviews !== undefined ||
                        state.feedComments !== undefined ||
                        state.feedSuggestions !== undefined;

  // Render the UI shell
  content.innerHTML = `
    <div class="page-header">
      <h2 class="page-title">Лента активности</h2>
      <div class="page-header-actions">
        <button class="btn btn-secondary btn-sm btn-icon-only" data-action="mark-all-read" title="Отметить все прочитанными">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        </button>
        <button class="btn btn-secondary btn-sm btn-icon-only" data-action="refresh-feed" title="Обновить">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 4v6h-6M1 20v-6h6"/>
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
          </svg>
        </button>
      </div>
    </div>

    <div class="tabs-carousel">
      <div class="tabs-container">
        <button class="tab-btn ${state.feedFilter === 'all' ? 'active' : ''}" data-action="filter-feed" data-filter="all" title="Все">
          <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 6h16M4 12h16M4 18h16"/>
          </svg>
          <span class="tab-label">Все</span>
        </button>
        <button class="tab-btn ${state.feedFilter === 'orders' ? 'active' : ''}" data-action="filter-feed" data-filter="orders" title="Заказы">
          <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M3 9h18M9 3v18"/>
          </svg>
          <span class="tab-label">Заказы</span>
        </button>
        <button class="tab-btn ${state.feedFilter === 'reviews' ? 'active' : ''}" data-action="filter-feed" data-filter="reviews" title="Отзывы">
          <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
          <span class="tab-label">Отзывы</span>
        </button>
        <button class="tab-btn ${state.feedFilter === 'comments' ? 'active' : ''}" data-action="filter-feed" data-filter="comments" title="Комментарии">
          <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
          <span class="tab-label">Комментарии</span>
        </button>
        <button class="tab-btn ${state.feedFilter === 'suggestions' ? 'active' : ''}" data-action="filter-feed" data-filter="suggestions" title="Предложения">
          <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01"/>
          </svg>
          <span class="tab-label">Предложения</span>
        </button>
        ${isAdmin() ? `
        <button class="tab-btn ${state.feedFilter === 'uploads' ? 'active' : ''}" data-action="filter-feed" data-filter="uploads" title="Загрузки">
          <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <span class="tab-label">Загрузки</span>
        </button>
        ` : ''}
      </div>
    </div>

    <div id="feed-list">
      ${hasCachedData ? '' : `
        <div class="loading-spinner">
          <div class="spinner"></div>
          <p>Загрузка ленты...</p>
        </div>
      `}
    </div>
  `;

  // Attach event listeners
  attachFeedEventListeners();

  // If we have cached data, just render it
  if (hasCachedData) {
    renderFeed();
    attachFeedItemEventListeners();
    return;
  }

  // Otherwise, fetch fresh data
  try {
    const [ordersResult, reviews, comments, suggestions] = await Promise.all([
      fetchOrders('', 30),
      fetchReviews(),
      fetchComments(),
      fetchSuggestions()
    ]);

    const orders = Array.isArray(ordersResult) ? ordersResult : (ordersResult?.orders || []);

    state.feedOrders = orders;
    state.feedReviews = reviews;
    state.feedComments = comments;
    state.feedSuggestions = suggestions;

    const unreadCount = countUnreadFeedItems();
    updateFeedBadge(unreadCount);

    const newOrdersCount = orders.filter(o => ['created', 'new'].includes(o.status)).length;
    updateOrdersBadge(newOrdersCount);

    renderFeed();
    attachFeedItemEventListeners();
  } catch (error) {
    console.error('Error loading feed:', error);
    const feedList = document.getElementById('feed-list');
    if (feedList) {
      feedList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">${SVGIcons.alert}</div>
          <h3>Ошибка загрузки</h3>
          <p>Не удалось загрузить ленту активности</p>
          <p class="text-tertiary text-sm mt-xs">${escapeHtml(error.message)}</p>
          <button class="btn btn-primary mt-sm" data-action="reload-feed">Повторить</button>
        </div>
      `;
      attachFeedEventListeners();
    }
  }
}

// ============================================================================
// UPLOADS VIEW (admin-only segment for managing all uploaded images)
// ============================================================================

/**
 * Fetch and render the uploads management view
 */
async function loadUploadsView() {
  const container = document.getElementById('feed-list');
  if (!container) return;

  // Show loading if no cached data
  if (!state.feedUploads) {
    container.innerHTML = `
      <div class="loading-spinner">
        <div class="spinner"></div>
        <p>Загрузка изображений...</p>
      </div>
    `;
  }

  try {
    const response = await apiGet('/api/admin/uploads/list');
    if (!response.ok) throw new Error('Failed to fetch uploads');

    const data = await response.json();
    state.feedUploads = data.uploads || [];

    renderUploadsView(container, data);
    attachFeedItemEventListeners();
  } catch (error) {
    console.error('Error loading uploads:', error);
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">${SVGIcons.alert}</div>
        <h3>Ошибка загрузки</h3>
        <p>${error.message}</p>
        <button class="btn btn-primary mt-sm" data-action="refresh-feed">Повторить</button>
      </div>
    `;
  }
}

/**
 * Render the uploads management grid
 */
function renderUploadsView(container, data) {
  const uploads = data.uploads || [];
  const counts = data.counts || {};

  if (uploads.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" stroke-width="1.5">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </div>
        <h3>Нет загруженных изображений</h3>
        <p>Пользовательские загрузки появятся здесь</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div style="display: flex; gap: var(--spacing-sm); margin-bottom: var(--spacing-md); flex-wrap: wrap; align-items: center;">
      <span class="badge" style="background: var(--bg-tertiary); padding: 4px 10px; border-radius: var(--radius-sm); font-size: 0.813rem;">
        Всего: ${counts.total || 0}
      </span>
      <span class="badge" style="background: var(--primary-bg); color: var(--primary); padding: 4px 10px; border-radius: var(--radius-sm); font-size: 0.813rem;">
        Отзывы: ${counts.review || 0}
      </span>
      <span class="badge" style="background: var(--warning-bg); color: var(--warning); padding: 4px 10px; border-radius: var(--radius-sm); font-size: 0.813rem;">
        Кастом: ${counts.custom || 0}
      </span>
    </div>

    <div class="uploads-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: var(--spacing-md);">
      ${uploads.map(upload => renderUploadCard(upload)).join('')}
    </div>

    <style>
      .upload-card { transition: box-shadow 0.2s; }
      .upload-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
      .upload-actions-bar { opacity: 0; transition: opacity 0.2s; }
      .upload-card:hover .upload-actions-bar { opacity: 1; }
    </style>
  `;
}

/**
 * Render a single upload card
 */
function renderUploadCard(upload) {
  const hosted = isHostedImage(upload.image_url);
  const provider = getStorageProvider(upload.image_url);
  const providerLabel = provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : 'URL';
  const typeLabel = upload.upload_type === 'review' ? 'Отзыв' : 'Кастом';
  const typeColor = upload.upload_type === 'review' ? 'var(--primary)' : 'var(--warning)';
  const userName = upload.user_name || 'Пользователь';
  const userInitial = (userName[0] || '?').toUpperCase();
  const downloadName = generateDownloadFilename(upload.created_at, userName, 0, upload.image_url);
  const contextInfo = upload.upload_type === 'review'
    ? (upload.context_text ? `"${upload.context_text}${upload.context_text.length >= 60 ? '...' : ''}"` : 'Отзыв')
    : (upload.product_title || `Товар #${upload.context_id}`);

  return `
    <div class="upload-card card"
         data-upload-id="${upload.id}"
         data-upload-type="${upload.upload_type}"
         data-image-url="${escapeHtml(upload.image_url)}"
         data-download-name="${escapeHtml(downloadName)}"
         data-is-hosted="${hosted}"
         style="padding: 0; overflow: hidden;">
      <!-- Image preview -->
      <div style="position: relative; width: 100%; height: 160px; background: var(--bg-tertiary);">
        <img src="${addImageSize(upload.image_url, '400x0')}" alt=""
             style="width: 100%; height: 100%; object-fit: cover;"
             onerror="this.src='${escapeHtml(upload.image_url)}'">
        <!-- Type badge -->
        <div style="position: absolute; top: 8px; left: 8px; background: ${typeColor}; color: white; font-size: 0.688rem; padding: 2px 8px; border-radius: var(--radius-sm); font-weight: 600;">
          ${typeLabel}
        </div>
        <!-- Storage badge -->
        <div style="position: absolute; top: 8px; right: 8px; background: ${hosted ? 'var(--primary)' : 'var(--success)'}; color: white; font-size: 0.688rem; padding: 2px 8px; border-radius: var(--radius-sm); font-weight: 600;">
          ${hosted ? providerLabel : 'URL'}
        </div>
        <!-- Hover actions overlay -->
        <div class="upload-actions-bar" style="position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.8); display: flex; justify-content: center; gap: var(--spacing-sm); padding: var(--spacing-sm);">
          <button class="btn btn-xs" data-action="download-upload" title="Скачать" style="background: rgba(255,255,255,0.2); color: white; border: none; padding: 4px 12px; font-size: 0.75rem;">
            Скачать
          </button>
          <button class="btn btn-xs" data-action="replace-upload" title="Заменить URL" style="background: rgba(255,255,255,0.2); color: white; border: none; padding: 4px 12px; font-size: 0.75rem;">
            Заменить
          </button>
          <button class="btn btn-xs" data-action="delete-upload" title="Удалить" style="background: rgba(255,100,100,0.4); color: white; border: none; padding: 4px 12px; font-size: 0.75rem;">
            Удалить
          </button>
        </div>
      </div>
      <!-- Info -->
      <div style="padding: var(--spacing-sm) var(--spacing-md);">
        <div style="display: flex; align-items: center; gap: var(--spacing-sm); margin-bottom: 4px;">
          ${upload.user_photo
            ? `<img src="${upload.user_photo}" alt="" style="width: 20px; height: 20px; border-radius: 50%; object-fit: cover;" onerror="this.style.display='none'">`
            : `<div style="width: 20px; height: 20px; border-radius: 50%; background: var(--primary); display: flex; align-items: center; justify-content: center; color: white; font-size: 0.625rem; font-weight: 600;">${userInitial}</div>`
          }
          <span style="font-size: 0.813rem; font-weight: 500;">${escapeHtml(userName)}</span>
          <span style="font-size: 0.75rem; color: var(--text-tertiary); margin-left: auto;">${formatDate(upload.created_at)}</span>
        </div>
        <div style="font-size: 0.75rem; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(contextInfo)}">
          ${escapeHtml(contextInfo)}
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// UPLOAD ACTION HANDLERS (for uploads tab)
// ============================================================================

function handleUploadDownload(target) {
  const card = target.closest('.upload-card');
  if (!card) return;
  const imageUrl = card.dataset.imageUrl;
  const downloadName = card.dataset.downloadName;
  if (imageUrl && downloadName) {
    downloadImage(imageUrl, downloadName);
  }
}

function handleUploadReplace(target) {
  const card = target.closest('.upload-card');
  if (!card) return;

  const uploadId = card.dataset.uploadId;
  const uploadType = card.dataset.uploadType;
  const isHostedVal = card.dataset.isHosted === 'true';

  showModal('Заменить на внешний URL', `
    <p style="color: var(--text-secondary); margin-bottom: var(--spacing-md);">
      ${isHostedVal ? 'Текущее изображение загружено на сервер. После замены оно будет удалено из хранилища и заменено ссылкой.' : 'Текущее изображение уже является внешним URL.'}
    </p>
    <div class="form-group">
      <label class="form-label">Новый URL (VK CDN и т.д.)</label>
      <input type="url" id="upload-new-url" class="form-input" placeholder="https://..." style="width: 100%;">
    </div>
    <div id="upload-url-preview" style="margin-top: var(--spacing-sm); display: none;">
      <p style="font-size: 0.75rem; color: var(--text-tertiary); margin-bottom: 4px;">Предпросмотр:</p>
      <img id="upload-preview-img" src="" alt="Preview" style="max-width: 200px; max-height: 150px; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
      <p id="upload-preview-error" style="color: var(--error); font-size: 0.75rem; display: none;">Не удалось загрузить изображение</p>
    </div>
  `, [
    { text: 'Отменить', className: 'btn btn-secondary', onClick: hideModal },
    {
      text: 'Заменить',
      className: 'btn btn-primary',
      onClick: async () => {
        const newUrl = document.getElementById('upload-new-url').value.trim();
        if (!newUrl) { showToast('Введите URL', 'error'); return; }
        try { new URL(newUrl); } catch { showToast('Некорректный URL', 'error'); return; }

        try {
          const response = await apiPost('/api/admin/uploads/manage', {
            action: 'replace',
            uploadId: parseInt(uploadId),
            uploadType,
            newUrl
          });
          if (!response.ok) throw new Error('Failed to replace');
          showToast('Изображение заменено', 'success');
          hideModal();
          state.feedUploads = undefined;
          await loadUploadsView();
        } catch (error) {
          console.error('Error replacing upload:', error);
          showToast('Ошибка при замене', 'error');
        }
      }
    }
  ]);

  // Preview
  setTimeout(() => {
    const urlInput = document.getElementById('upload-new-url');
    const previewContainer = document.getElementById('upload-url-preview');
    const previewImg = document.getElementById('upload-preview-img');
    const previewError = document.getElementById('upload-preview-error');
    if (urlInput) {
      urlInput.addEventListener('input', () => {
        const url = urlInput.value.trim();
        if (!url) { previewContainer.style.display = 'none'; return; }
        try {
          new URL(url);
          previewContainer.style.display = 'block';
          previewImg.style.display = 'block';
          previewError.style.display = 'none';
          previewImg.src = url;
          previewImg.onerror = () => { previewImg.style.display = 'none'; previewError.style.display = 'block'; };
        } catch { previewContainer.style.display = 'none'; }
      });
    }
  }, 100);
}

function handleUploadDelete(target) {
  const card = target.closest('.upload-card');
  if (!card) return;

  const uploadId = card.dataset.uploadId;
  const uploadType = card.dataset.uploadType;
  const isHostedVal = card.dataset.isHosted === 'true';

  showModal('Удалить изображение', `
    <p style="color: var(--text-secondary); margin-bottom: var(--spacing-md);">
      Вы уверены, что хотите удалить это изображение?
      ${isHostedVal ? ' Оно также будет удалено из хранилища.' : ''}
    </p>
  `, [
    { text: 'Отменить', className: 'btn btn-secondary', onClick: hideModal },
    {
      text: 'Удалить',
      className: 'btn btn-danger',
      onClick: async () => {
        try {
          const response = await apiPost('/api/admin/uploads/manage', {
            action: 'delete',
            uploadId: parseInt(uploadId),
            uploadType
          });
          if (!response.ok) throw new Error('Failed to delete');
          showToast('Изображение удалено', 'success');
          hideModal();
          state.feedUploads = undefined;
          await loadUploadsView();
        } catch (error) {
          console.error('Error deleting upload:', error);
          showToast('Ошибка при удалении', 'error');
        }
      }
    }
  ]);
}

// ============================================================================
// FEED IMAGE ACTION HANDLERS
// ============================================================================

/**
 * Handle download image in feed
 */
function handleFeedImageDownload(target) {
  const imageItem = target.closest('.feed-image-item');
  if (!imageItem) return;

  const imageUrl = imageItem.dataset.imageUrl;
  const downloadName = imageItem.dataset.downloadName;

  if (imageUrl && downloadName) {
    downloadImage(imageUrl, downloadName);
  }
}

/**
 * Handle replace image in feed
 */
function handleFeedImageReplace(target) {
  const imageItem = target.closest('.feed-image-item');
  if (!imageItem) return;

  const imageId = imageItem.dataset.imageId;
  const isHosted = imageItem.dataset.isHosted === 'true';

  showModal('Заменить изображение на URL', `
    <p style="color: var(--text-secondary); margin-bottom: var(--spacing-md);">
      ${isHosted ? 'Текущее изображение загружено на наш сервер. После замены на внешний URL оно будет удалено из хранилища.' : 'Текущее изображение уже является внешним URL.'}
    </p>
    <div class="form-group">
      <label class="form-label">Новый URL изображения (VK CDN и т.д.)</label>
      <input type="url" id="feed-new-image-url" class="form-input" placeholder="https://..." style="width: 100%;">
    </div>
    <div id="feed-image-preview" style="margin-top: var(--spacing-sm); display: none;">
      <p style="font-size: 0.75rem; color: var(--text-tertiary); margin-bottom: 4px;">Предпросмотр:</p>
      <img id="feed-preview-img" src="" alt="Preview" style="max-width: 200px; max-height: 150px; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
      <p id="feed-preview-error" style="color: var(--error); font-size: 0.75rem; display: none;">Не удалось загрузить изображение по этому URL</p>
    </div>
  `, [
    {
      text: 'Отменить',
      className: 'btn btn-secondary',
      onClick: hideModal
    },
    {
      text: 'Заменить',
      className: 'btn btn-primary',
      onClick: async () => {
        const newUrl = document.getElementById('feed-new-image-url').value.trim();
        if (!newUrl) {
          showToast('Введите URL изображения', 'error');
          return;
        }

        try {
          new URL(newUrl);
        } catch (e) {
          showToast('Некорректный URL', 'error');
          return;
        }

        try {
          const response = await apiPost('/api/admin/reviews/images', {
            action: 'replace',
            imageId: parseInt(imageId),
            newUrl
          });

          if (!response.ok) {
            throw new Error('Failed to replace image');
          }

          showToast('Изображение заменено', 'success');
          hideModal();
          await loadFeed();
        } catch (error) {
          console.error('Error replacing image:', error);
          showToast('Ошибка при замене изображения', 'error');
        }
      }
    }
  ]);

  // Add preview functionality
  setTimeout(() => {
    const urlInput = document.getElementById('feed-new-image-url');
    const previewContainer = document.getElementById('feed-image-preview');
    const previewImg = document.getElementById('feed-preview-img');
    const previewError = document.getElementById('feed-preview-error');

    if (urlInput) {
      urlInput.addEventListener('input', () => {
        const url = urlInput.value.trim();
        if (!url) {
          previewContainer.style.display = 'none';
          return;
        }

        try {
          new URL(url);
          previewContainer.style.display = 'block';
          previewImg.style.display = 'block';
          previewError.style.display = 'none';
          previewImg.src = url;
          previewImg.onerror = () => {
            previewImg.style.display = 'none';
            previewError.style.display = 'block';
          };
        } catch (e) {
          previewContainer.style.display = 'none';
        }
      });
    }
  }, 100);
}

/**
 * Handle delete image in feed
 */
function handleFeedImageDelete(target) {
  const imageItem = target.closest('.feed-image-item');
  if (!imageItem) return;

  const imageId = imageItem.dataset.imageId;
  const isHosted = imageItem.dataset.isHosted === 'true';

  showModal('Удалить изображение', `
    <p style="color: var(--text-secondary); margin-bottom: var(--spacing-md);">
      Вы уверены, что хотите удалить это изображение?
      ${isHosted ? ' Оно также будет удалено из хранилища.' : ''}
    </p>
  `, [
    {
      text: 'Отменить',
      className: 'btn btn-secondary',
      onClick: hideModal
    },
    {
      text: 'Удалить',
      className: 'btn btn-danger',
      onClick: async () => {
        try {
          const response = await apiPost('/api/admin/reviews/images', {
            action: 'delete',
            imageId: parseInt(imageId)
          });

          if (!response.ok) {
            throw new Error('Failed to delete image');
          }

          showToast('Изображение удалено', 'success');
          hideModal();
          await loadFeed();
        } catch (error) {
          console.error('Error deleting image:', error);
          showToast('Ошибка при удалении изображения', 'error');
        }
      }
    }
  ]);
}

// Exports
export {
  renderFeed as renderActivityFeed,
  loadActivityFeed,
  filterFeedType,
  handleFeedItemClick
};
