/**
 * orders/index.js
 * Main entry point for orders module - combines all sub-modules
 *
 * This module was refactored from a single 3163-line file into smaller,
 * focused modules for better maintainability:
 * - filters.js: Order filtering functionality
 * - rendering.js: Order list rendering
 * - status.js: Order status updates and actions
 * - items.js: Item management and pending changes
 * - toggles.js: Toggle functions (processed, urgent, refund)
 * - shipping.js: Shipping and parcel management
 * - product-search.js: Product search for adding items
 * - details.js: Order details modal view
 */

import { state, hasPermission, isAdmin } from '../../state.js';
import { SVGIcons, requireAuth, showToast, escapeHtml } from '../../utils.js';
import { apiGet } from '../../utils/apiClient.js';
import { createPageHeader } from '../../utils/templates.js';

// Import from sub-modules
import { applyOrderFilters, applyFilters, resetFilters, getFiltersHTML } from './filters.js';
import { renderOrders, renderOrderActions, updateOrdersBadge, toggleOrderCardDetails, toggleOrderSelection, getSelectedOrderIds, clearSelections } from './rendering.js';
import { showNotionExportModal } from './notion-export.js';
import { updateOrderStatus, addDeliveryCost, addTrackingNumber, cancelOrder, deleteOrderItem } from './status.js';
import {
  handleLocalQuantityChange,
  handleLocalPropertyChange,
  handleLocalCustomUrlChange,
  showSaveButtonIfNeeded,
  updateOrderTotals,
  handleLocalItemDelete,
  handleLocalItemAdd,
  handleLocalDeliveryFieldChange,
  saveAllOrderChanges,
  discardOrderChanges
} from './items.js';
import { toggleProcessed, toggleUrgent, approveCustomProduct, rejectCustomProduct, approveRefund, denyRefund } from './toggles.js';
import { showReceiptData, loadOrderParcels, getParcelStatusText, calculateParcels, showCreateShipmentModal, saveTrackingNumber } from './shipping.js';
import { searchProductsForOrderInline, addProductToOrderInline, showAddItemModal } from './product-search.js';
import { viewOrderDetails as viewOrderDetailsBase } from './details.js';
import { renderPromoCertificatesEmbedded, handlePromoCertificatesClick } from '../promo-certificates.js';

// ============================================================================
// SUBTAB STATE
// ============================================================================

let currentSubtab = 'orders'; // 'orders' | 'certificates' | 'promos' | 'templates'

// ============================================================================
// SUBTAB PERMISSIONS
// ============================================================================

/**
 * Check if user can access a specific subtab
 */
function canAccessSubtab(subtab) {
  // Admin can access everything
  if (isAdmin()) return true;

  // Map subtabs to permission keys
  const subtabPermissions = {
    'orders': 'canAccessOrders',
    'certificates': 'canAccessCertificates',
    'promos': 'canAccessPromos',
    'templates': 'canAccessTemplates'
  };

  const permKey = subtabPermissions[subtab];
  if (!permKey) return false;

  return hasPermission('orders', permKey);
}

/**
 * Get list of accessible subtabs for current user
 */
function getAccessibleSubtabs() {
  return ['orders', 'certificates', 'promos', 'templates'].filter(canAccessSubtab);
}

/**
 * Get first accessible subtab (for initial load)
 */
function getDefaultSubtab() {
  const accessible = getAccessibleSubtabs();
  return accessible.length > 0 ? accessible[0] : 'orders';
}

// ============================================================================
// MAIN RENDER FUNCTION
// ============================================================================

function renderOrdersView() {
  requireAuth();

  // Ensure current subtab is accessible
  if (!canAccessSubtab(currentSubtab)) {
    currentSubtab = getDefaultSubtab();
  }

  const content = document.getElementById('content');

  // Define all subtabs with their metadata
  const allSubtabs = [
    { id: 'orders',       label: 'Заказы',      icon: SVGIcons.package },
    { id: 'certificates', label: 'Сертификаты', icon: SVGIcons.monitor },
    { id: 'promos',       label: 'Промо-коды',  icon: SVGIcons.wallet },
    { id: 'templates',    label: 'Шаблоны',     icon: SVGIcons.layoutCard },
  ];

  // Filter subtabs based on permissions
  const visibleSubtabs = allSubtabs.filter(tab => canAccessSubtab(tab.id));

  // Render subtab buttons
  const subtabsHTML = visibleSubtabs.map(tab => `
    <button class="tab-btn ${currentSubtab === tab.id ? 'active' : ''}" data-action="switch-orders-subtab" data-subtab="${tab.id}">
      <span class="tab-icon">${tab.icon}</span>
      <span class="tab-label">${tab.label}</span>
    </button>
  `).join('');

  content.innerHTML = `
    ${createPageHeader({ title: 'Заказы', refreshAction: 'refresh-orders' })}

    <!-- Subtabs Navigation -->
    <div class="tabs-carousel" style="margin-bottom: var(--spacing-md);">
      <div class="tabs-container">
        ${subtabsHTML}
      </div>
    </div>

    <!-- Subtab Content -->
    <div id="orders-subtab-content">
      <div class="loading-spinner">
        <div class="spinner"></div>
        <p>Загрузка...</p>
      </div>
    </div>
  `;

  // Always attach event listeners immediately (fixes retry button not working)
  attachOrdersEventListeners();

  // Load the active subtab
  loadOrdersSubtabContent();
}

// ============================================================================
// SUBTAB CONTENT LOADING
// ============================================================================

function loadOrdersSubtabContent() {
  const container = document.getElementById('orders-subtab-content');
  if (!container) return;

  switch (currentSubtab) {
    case 'orders':
      loadOrdersList();
      break;
    case 'certificates':
      renderPromoCertificatesEmbedded(container, 'certificates', true);
      break;
    case 'promos':
      renderPromoCertificatesEmbedded(container, 'promo-codes', true);
      break;
    case 'templates':
      renderPromoCertificatesEmbedded(container, 'templates', true);
      break;
    default:
      loadOrdersList();
  }
}

// ============================================================================
// ORDERS LIST SUBTAB
// ============================================================================

async function loadOrdersList(searchQuery = '') {
  const container = document.getElementById('orders-subtab-content');
  if (!container) return;

  container.innerHTML = `
    ${getFiltersHTML(searchQuery)}

    <div id="orders-list">
      <div class="loading-spinner">
        <div class="spinner"></div>
        <p>Загрузка заказов...</p>
      </div>
    </div>
  `;

  // Add search listener
  const searchInput = document.getElementById('order-search');
  if (searchInput) {
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      const query = e.target.value.trim();

      if (query.length === 0 || query.length >= 2) {
        searchTimeout = setTimeout(() => {
          loadOrdersList(query);
        }, 400);
      }
    });
  }

  // Add filter change listeners
  const filterElements = ['filter-date-range', 'filter-status', 'filter-notion', 'filter-delivery', 'filter-edited', 'filter-shipment-date'];
  filterElements.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener('change', () => {
        if (id === 'filter-date-range' && element.value === 'custom') {
          document.getElementById('filter-date').style.display = 'block';
        } else if (id === 'filter-date-range') {
          document.getElementById('filter-date').style.display = 'none';
        }
        element.setAttribute('data-active', element.value !== '');
        applyFilters(renderOrders);
      });
    }
  });

  const customDateInput = document.getElementById('filter-date');
  if (customDateInput) {
    customDateInput.addEventListener('change', () => applyFilters(renderOrders));
  }

  try {
    const orders = await fetchOrders(searchQuery);
    state.orders = orders;
    state.orderFilters = state.orderFilters || {};

    const filteredOrders = applyOrderFilters(orders, state.orderFilters);
    renderOrders(filteredOrders);
    // Count new orders (awaiting_calculation + legacy 'created' and 'new')
    const newOrdersCount = orders.filter(o => ['awaiting_calculation', 'created', 'new'].includes(o.status)).length;
    updateOrdersBadge(newOrdersCount);
  } catch (error) {
    console.error('Error loading orders:', error);
    const container = document.getElementById('orders-list');
    if (container) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon" style="width: 64px; height: 64px; color: var(--text-tertiary); margin: 0 auto;">${SVGIcons.alert}</div>
          <h3>Ошибка загрузки</h3>
          <p>Не удалось загрузить заказы</p>
          <p style="color: var(--text-tertiary); font-size: 0.875rem; margin-top: 8px;">${escapeHtml(error.message)}</p>
          <button class="btn btn-primary" data-action="reload-orders" style="margin-top: var(--spacing-md);">Повторить</button>
        </div>
      `;
    }
  }
}

async function fetchOrders(query = '', limit = null) {
  requireAuth();

  // Use browser-admin fallback for web-based admin access
  const adminId = state.adminData?.telegram_id || 'browser-admin';

  const params = new URLSearchParams({ admin_id: adminId });
  if (query) {
    params.append('query', query);
  }
  if (limit) {
    params.append('limit', limit);
  }

  const response = await apiGet(`/api/orders/search?${params.toString()}`);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    console.error('Orders fetch failed:', response.status, errorData);
    throw new Error(errorData.error || errorData.message || 'Failed to fetch orders');
  }

  const data = await response.json();
  return data.orders || [];
}

/**
 * Force refresh orders data
 */
async function refreshOrders() {
  showToast('Обновление...', 'info');

  switch (currentSubtab) {
    case 'orders':
      state.orders = [];
      await loadOrdersList();
      showToast('Заказы обновлены', 'success');
      break;
    case 'certificates':
    case 'promos':
      // Trigger refresh of promo/certificates content
      const container = document.getElementById('orders-subtab-content');
      if (container) {
        loadOrdersSubtabContent();
      }
      showToast('Данные обновлены', 'success');
      break;
  }
}

// ============================================================================
// WRAPPER FOR VIEW ORDER DETAILS
// ============================================================================

function viewOrderDetails(orderId) {
  // Create handlers object with all necessary functions
  const handlers = {
    loadOrders: loadOrdersList,
    handleLocalQuantityChange,
    handleLocalItemDelete,
    handleLocalPropertyChange,
    handleLocalCustomUrlChange,
    handleLocalDeliveryFieldChange,
    saveAllOrderChanges,
    discardOrderChanges,
    updateOrderTotals,
    showSaveButtonIfNeeded,
    searchProductsForOrderInline,
    addProductToOrderInline,
    handleLocalItemAdd,
    approveCustomProduct,
    rejectCustomProduct,
    approveRefund,
    denyRefund,
    showReceiptData,
    calculateParcels,
    showCreateShipmentModal,
    saveTrackingNumber,
    loadOrderParcels
  };

  viewOrderDetailsBase(orderId, handlers);
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function attachOrdersEventListeners() {
  const content = document.getElementById('content');
  if (!content) return;

  const oldHandler = content._ordersClickHandler;
  if (oldHandler) {
    content.removeEventListener('click', oldHandler);
    content.removeEventListener('change', content._ordersChangeHandler);
    content.removeEventListener('input', content._ordersInputHandler);
  }

  const clickHandler = handleOrdersClick;
  const changeHandler = handleOrdersChange;
  const inputHandler = handleOrdersInput;

  content._ordersClickHandler = clickHandler;
  content._ordersChangeHandler = changeHandler;
  content._ordersInputHandler = inputHandler;

  content.addEventListener('click', clickHandler);
  content.addEventListener('change', changeHandler);
  content.addEventListener('input', inputHandler);

  // Bulk action bar lives outside #content, needs body-level listener
  const oldBulkHandler = document.body._bulkBarClickHandler;
  if (oldBulkHandler) {
    document.body.removeEventListener('click', oldBulkHandler);
  }
  const bulkBarHandler = (e) => {
    const bar = e.target.closest('#bulk-action-bar');
    if (!bar) return;
    const action = e.target.dataset.action || e.target.closest('[data-action]')?.dataset.action;
    if (action === 'bulk-deselect-all') {
      clearSelections();
    } else if (action === 'bulk-export-notion') {
      const selected = getSelectedOrderIds();
      if (selected.size > 0) {
        showNotionExportModal(selected, () => {
          clearSelections();
          loadOrdersList();
        });
      }
    }
  };
  document.body._bulkBarClickHandler = bulkBarHandler;
  document.body.addEventListener('click', bulkBarHandler);
}

async function handleOrdersClick(e) {
  const target = e.target;
  const action = target.dataset.action || target.closest('[data-action]')?.dataset.action;

  if (!action) return;

  const orderId = parseInt(target.dataset.orderId || target.closest('[data-order-id]')?.dataset.orderId);
  const itemId = parseInt(target.dataset.itemId || target.closest('[data-item-id]')?.dataset.itemId);
  const newQuantity = parseInt(target.dataset.newQuantity || target.closest('[data-new-quantity]')?.dataset.newQuantity);
  const processed = target.dataset.processed === 'true';

  if (['toggle-order-details', 'view-order-details'].includes(action)) {
    e.stopPropagation();
  }

  switch (action) {
    // Subtab switching
    case 'switch-orders-subtab': {
      const subtab = (target.dataset.subtab || target.closest('[data-subtab]')?.dataset.subtab);
      if (subtab && subtab !== currentSubtab) {
        // Check permission before switching
        if (!canAccessSubtab(subtab)) {
          showToast('Доступ к этому разделу ограничен', 'error');
          return;
        }
        currentSubtab = subtab;
        // Update tab active states
        document.querySelectorAll('[data-action="switch-orders-subtab"]').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.subtab === currentSubtab);
        });
        loadOrdersSubtabContent();
      }
      break;
    }

    case 'reload-orders':
      loadOrdersList();
      break;

    case 'refresh-orders':
      refreshOrders();
      break;

    case 'apply-filters':
      applyFilters(renderOrders);
      break;

    case 'reset-filters':
      resetFilters(renderOrders);
      break;

    case 'add-delivery-cost':
      if (orderId) addDeliveryCost(orderId, loadOrdersList);
      break;

    case 'cancel-order':
      if (orderId) cancelOrder(orderId, loadOrdersList);
      break;

    case 'add-tracking':
      if (orderId) addTrackingNumber(orderId, loadOrdersList);
      break;

    case 'view-order-details':
      if (orderId) viewOrderDetails(orderId);
      break;

    case 'toggle-order-details':
      if (orderId) toggleOrderCardDetails(orderId);
      break;

    case 'toggle-processed':
      if (orderId) toggleProcessed(orderId, processed, loadOrdersList, viewOrderDetails);
      break;

    case 'update-item-quantity-local':
      if (orderId && itemId && newQuantity !== undefined) {
        handleLocalQuantityChange(orderId, itemId, newQuantity,
          (oid, iid) => handleLocalItemDelete(oid, iid, updateOrderTotals, showSaveButtonIfNeeded),
          updateOrderTotals, showSaveButtonIfNeeded);
      }
      break;

    case 'delete-order-item-local':
      if (orderId && itemId) handleLocalItemDelete(orderId, itemId, updateOrderTotals, showSaveButtonIfNeeded);
      break;

    case 'save-all-changes':
      if (orderId) saveAllOrderChanges(orderId, loadOrdersList, viewOrderDetails);
      break;

    case 'discard-changes':
      if (orderId) await discardOrderChanges(orderId, viewOrderDetails);
      break;

    default:
      // Delegate to promo-certificates handler for subtab actions
      if (currentSubtab === 'certificates' || currentSubtab === 'promos' || currentSubtab === 'templates') {
        handlePromoCertificatesClick(e);
      }
      break;
  }
}

async function handleOrdersChange(e) {
  const target = e.target;
  const action = target.dataset.action || target.closest('[data-action]')?.dataset.action;

  if (!action) return;

  const orderId = parseInt(target.dataset.orderId || target.closest('[data-order-id]')?.dataset.orderId);
  const itemId = parseInt(target.dataset.itemId || target.closest('[data-item-id]')?.dataset.itemId);

  if (action === 'toggle-order-select' && orderId) {
    toggleOrderSelection(orderId);
  } else if (action === 'update-item-property-local' && orderId && itemId) {
    handleLocalPropertyChange(orderId, itemId, target.value, updateOrderTotals, showSaveButtonIfNeeded);
  }
}

function handleOrdersInput(e) {
  const target = e.target;
  const action = target.dataset.action;

  if (!action) return;

  const orderId = parseInt(target.dataset.orderId);
  const itemId = parseInt(target.dataset.itemId);

  if (action === 'update-custom-url-local' && orderId && itemId) {
    handleLocalCustomUrlChange(orderId, itemId, target.value, showSaveButtonIfNeeded);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  loadOrdersList as loadOrders,
  renderOrdersView,
  fetchOrders,
  updateOrderStatus,
  addDeliveryCost,
  addTrackingNumber,
  cancelOrder,
  viewOrderDetails,
  toggleProcessed
};
