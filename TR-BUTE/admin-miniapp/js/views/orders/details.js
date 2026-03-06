/**
 * orders/details.js
 * Order details modal view
 */

import { state } from '../../state.js';
import { API_BASE } from '../../config.js';
import { showModal, hideModal, forceHideModal, escapeHtml, formatNumber, copyToClipboard, addImageSize } from '../../utils.js';
import { getPendingChangesManager, removePendingChangesManager, warnUnsavedChanges } from '../../utils/pendingChanges.js';
import { buildAddressHTML, buildModalContent } from './detail-template.js';
import { searchProductsForOrderInline as _searchProductsForOrderInline, addProductToOrderInline as _addProductToOrderInline } from './product-search.js';

// Delivery type <-> provider/subtype mapping
const DELIVERY_TYPE_MAP = {
  pochta_standard:  { provider: 'pochta', subtype: 'standard' },
  pochta_first_class: { provider: 'pochta', subtype: 'express' },
  pochta_courier:   { provider: 'pochta', subtype: 'courier' },
  pochta:           { provider: 'pochta', subtype: 'standard' }, // legacy
  courier_ems:      { provider: 'pochta', subtype: 'express' },  // legacy
  cdek_pvz:         { provider: 'cdek', subtype: 'standard' },
  cdek_pvz_express: { provider: 'cdek', subtype: 'express' },
  cdek_courier:     { provider: 'cdek', subtype: 'courier' },
  international:    { provider: 'international', subtype: null },
  pickup:           { provider: 'pickup', subtype: null }
};

function getProviderAndSubtype(deliveryType) {
  return DELIVERY_TYPE_MAP[deliveryType] || { provider: 'pochta', subtype: 'standard' };
}

function getDeliveryTypeValue(provider, subtype) {
  if (provider === 'pickup') return 'pickup';
  if (provider === 'international') return 'international';
  if (provider === 'pochta') {
    if (subtype === 'express') return 'pochta_first_class';
    if (subtype === 'courier') return 'pochta_courier';
    return 'pochta_standard';
  }
  if (provider === 'cdek') {
    if (subtype === 'express') return 'cdek_pvz_express';
    if (subtype === 'courier') return 'cdek_courier';
    return 'cdek_pvz';
  }
  return 'pochta_standard';
}

/**
 * View full order details in a modal
 * @param {number} orderId - Order ID
 * @param {Object} handlers - Object with handler functions
 */
export async function viewOrderDetails(orderId, handlers) {
  const {
    loadOrders,
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
    approveCustomProduct,
    rejectCustomProduct,
    approveRefund,
    denyRefund,
    showReceiptData,
    calculateParcels,
    showCreateShipmentModal,
    saveTrackingNumber,
    loadOrderParcels
  } = handlers;

  // Convert to number for comparison
  const numOrderId = typeof orderId === 'string' ? parseInt(orderId) : orderId;

  // Try to find order in both state.orders and state.feedOrders
  let order = state.orders.find(o => o.id === numOrderId || o.id == numOrderId);
  if (!order && state.feedOrders) {
    order = state.feedOrders.find(o => o.id === numOrderId || o.id == numOrderId);
  }

  if (!order) {
    console.error('Order not found:', orderId, 'Available orders:', state.orders.map(o => o.id));
    const { showToast } = await import('../../utils.js');
    showToast('Заказ не найден', 'error');
    return;
  }

  // Auto-mark order as read when opening popup
  markOrderAsRead(numOrderId);

  // Get or create pending changes manager
  const manager = getPendingChangesManager('order', numOrderId);

  // Store original data on first view
  if (!manager.originalData) {
    manager.setOriginalData(order);
    // Register HTML-keyed originals so updateField can detect reverts
    manager.setFieldOriginal(`delivery-type-${numOrderId}`, order.delivery_type || '');
    manager.setFieldOriginal(`delivery-cost-${numOrderId}`, order.delivery_cost ?? 0);
    manager.setFieldOriginal(`shipment-date-${numOrderId}`, order.shipment_date || '');
    manager.setFieldOriginal(`delivery-timeframe-${numOrderId}`, order.delivery_timeframe || '');
    manager.setFieldOriginal(`delivery-notes-${numOrderId}`, order.delivery_notes || '');
    manager.setFieldOriginal(`order-status-${numOrderId}`, order.status || '');
    manager.setFieldOriginal(`notion-processed-${numOrderId}`, order.processed ?? false);
    manager.setFieldOriginal(`address-surname-${numOrderId}`, order.address?.surname || '');
    manager.setFieldOriginal(`address-name-${numOrderId}`, order.address?.name || '');
    manager.setFieldOriginal(`address-phone-${numOrderId}`, order.address?.phone || '');
    manager.setFieldOriginal(`address-postal-index-${numOrderId}`, order.address?.postal_index || '');
    manager.setFieldOriginal(`address-address-${numOrderId}`, order.address?.address || '');
    manager.setFieldOriginal(`address-comment-${numOrderId}`, order.address?.comment || '');
    manager.setFieldOriginal(`address-pvz-code-${numOrderId}`, order.address?.pvz_code || '');
    manager.setFieldOriginal(`address-pvz-address-${numOrderId}`, order.address?.pvz_address || '');
  }

  // Get format options based on whether product is triptych
  const getFormatOptions = (isTriptych) => {
    const singleOptions = ['A3 без рамки', 'A2 без рамки', 'A1 без рамки', 'A3 в рамке', 'A2 в рамке'];
    const triptychOptions = ['3 A3 без рамок', '3 A2 без рамок', '3 A1 без рамок', '3 A3 в рамках', '3 A2 в рамках'];
    return isTriptych ? triptychOptions : singleOptions;
  };

  // Build combined items list
  let allItems = [];

  if (order.items) {
    allItems = order.items.map(item => {
      const isDeleted = item.deleted_by_admin || manager.changes.items.removed.has(item.id);
      const isModified = !isDeleted && manager.isItemModified(item.id);
      const currentQuantity = manager.getItemValue(item.id, 'quantity', item.quantity);
      const currentProperty = manager.getItemValue(item.id, 'property', item.property);
      const currentPrice = manager.getItemValue(item.id, 'price_at_purchase', item.price_at_purchase);

      return {
        ...item,
        quantity: currentQuantity,
        property: currentProperty,
        price_at_purchase: currentPrice,
        _isModified: isModified,
        _isNew: false,
        _isDeleted: isDeleted
      };
    });
  }

  // Add new items
  manager.changes.items.added.forEach(item => {
    if (manager.changes.items.removed.has(item.id)) {
      return;
    }
    allItems.push({
      ...item,
      _isModified: false,
      _isNew: true,
      _isDeleted: false
    });
  });

  // Calculate total price
  const calculatedTotalPrice = allItems
    .filter(item => !item._isDeleted)
    .reduce((sum, item) => sum + (item.price_at_purchase * item.quantity), 0);

  // Render items HTML
  const itemsHTML = allItems.map(item => {
    const isTriptych = item.triptych || item.property?.startsWith('3 ');
    const formatOptions = getFormatOptions(isTriptych);

    const itemClasses = ['order-item-inline'];
    if (item._isDeleted) itemClasses.push('deleted-indicator');
    if (item._isModified) itemClasses.push('modified-indicator');
    if (item._isNew) itemClasses.push('item-new');
    if (item.custom_url) itemClasses.push('custom-product');

    let badgeHTML = '';
    if (item._isDeleted) {
      badgeHTML = '<span class="deleted-badge" style="background: #dc2626; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin-left: 8px;">Удалено</span>';
    } else if (item._isNew) {
      badgeHTML = '<span class="new-badge">Новый</span>';
    } else if (item._isModified) {
      badgeHTML = '<span class="modified-badge">Изменено</span>';
    } else {
      if (item.admin_added) {
        badgeHTML = '<span class="history-badge" style="background: rgba(34, 197, 94, 0.15); color: #22c55e; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin-left: 8px;">Добавлено</span>';
      } else if (item.admin_modified) {
        badgeHTML = '<span class="history-badge" style="background: rgba(251, 191, 36, 0.15); color: #f59e0b; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin-left: 8px;">Изменено ранее</span>';
      } else if (item.deleted_by_admin) {
        badgeHTML = '<span class="history-badge" style="background: rgba(220, 38, 38, 0.15); color: #dc2626; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin-left: 8px;">Удалено ранее</span>';
      }
    }

    const itemStyle = item._isDeleted ? 'opacity: 0.5; pointer-events: none;' : '';
    const selectDisabled = item._isDeleted ? 'disabled' : '';
    const buttonDisabled = item._isDeleted ? 'disabled style="pointer-events: none; opacity: 0.5;"' : '';
    const displayImage = item.custom_url || item.image;

    const customUrlHTML = item.custom_url ? `
      <div class="text-xs text-tertiary mb-xs">
        <strong>Ссылка на постер:</strong>
        <div style="margin-top: 4px;">
          <img src="${item.custom_url}" alt="Custom poster" style="max-width: 100px; max-height: 100px; border-radius: 4px; border: 1px solid var(--border-color);" onerror="this.style.display='none'"/>
        </div>
        <div style="margin-top: 4px;">
          <input type="text" class="form-input text-xs" data-action="update-custom-url-local" data-order-id="${order.id}" data-item-id="${item.id}" value="${escapeHtml(item.custom_url)}" placeholder="Введите URL изображения постера"/>
        </div>
      </div>
    ` : '';

    return `
    <div class="${itemClasses.join(' ')}" data-item-id="${item.id}" style="${itemStyle}">
      ${displayImage ? `<img src="${addImageSize(displayImage, '480x0')}" alt="${escapeHtml(item.title)}" class="order-item-image" onerror="this.src='${addImageSize(item.image, '480x0')}'">` : ''}
      <div class="flex-1">
        <div class="font-semibold mb-xs">${escapeHtml(item.title)}${badgeHTML}</div>
        <select class="form-input text-sm mb-xs" data-action="update-item-property-local" data-order-id="${order.id}" data-item-id="${item.id}" ${selectDisabled}>
          ${formatOptions.map(opt => `<option value="${escapeHtml(opt)}" ${opt === item.property ? 'selected' : ''}>${escapeHtml(opt)}</option>`).join('')}
        </select>
        ${item.variation_num ? `<div class="text-xs text-tertiary">вар.: ${escapeHtml(item.variation_num)}</div>` : ''}
        ${customUrlHTML}
      </div>
      <div class="order-item-actions">
        <div class="font-semibold">${formatNumber(item.price_at_purchase * item.quantity)}₽</div>
        <div class="quantity-controls">
          <button class="btn btn-secondary btn-xs quantity-btn" data-action="update-item-quantity-local" data-order-id="${order.id}" data-item-id="${item.id}" data-new-quantity="${item.quantity - 1}" ${buttonDisabled}>−</button>
          <span class="quantity-display">${item.quantity}</span>
          <button class="btn btn-secondary btn-xs quantity-btn" data-action="update-item-quantity-local" data-order-id="${order.id}" data-item-id="${item.id}" data-new-quantity="${item.quantity + 1}" ${buttonDisabled}>+</button>
        </div>
        <button class="btn btn-danger btn-xs quantity-btn text-xs" data-action="delete-order-item-local" data-order-id="${order.id}" data-item-id="${item.id}" title="Удалить" ${buttonDisabled}>×</button>
      </div>
    </div>
  `;
  }).join('') || '<p>Нет товаров</p>';

  // Get current address values
  const addressSurname = manager.getFieldValue(`address-surname-${order.id}`, order.address?.surname || '');
  const addressName = manager.getFieldValue(`address-name-${order.id}`, order.address?.name || '');
  const addressPhone = manager.getFieldValue(`address-phone-${order.id}`, order.address?.phone || '');
  const addressPostalIndex = manager.getFieldValue(`address-postal-index-${order.id}`, order.address?.postal_index || '');
  const addressAddress = manager.getFieldValue(`address-address-${order.id}`, order.address?.address || '');
  const addressComment = manager.getFieldValue(`address-comment-${order.id}`, order.address?.comment || '');
  const addressPvzCode = manager.getFieldValue(`address-pvz-code-${order.id}`, order.address?.pvz_code || '');
  const addressPvzAddress = manager.getFieldValue(`address-pvz-address-${order.id}`, order.address?.pvz_address || '');

  const addressHTML = buildAddressHTML(order, addressSurname, addressName, addressPhone, addressPostalIndex, addressAddress, addressComment, addressPvzCode, addressPvzAddress, order.delivery_type);

  // Inline product search
  const addProductSearchHTML = `
    <div class="info-box mt-md">
      <div class="font-semibold mb-sm">Добавить товар</div>
      <input type="text" id="order-product-search-inline-${order.id}" class="form-input w-full" placeholder="Поиск товара по названию, alt или ключевым словам..." data-order-id="${order.id}">
      <div id="product-search-results-${order.id}" style="max-height: 200px; overflow-y: auto; margin-top: 8px;"></div>
    </div>
  `;

  // Get current delivery values
  const deliveryType = manager.getFieldValue(`delivery-type-${order.id}`, order.delivery_type);
  const deliveryCost = manager.getFieldValue(`delivery-cost-${order.id}`, order.delivery_cost || 0);
  const shipmentDate = manager.getFieldValue(`shipment-date-${order.id}`, order.shipment_date || '');
  const deliveryTimeframe = manager.getFieldValue(`delivery-timeframe-${order.id}`, order.delivery_timeframe || '');
  const deliveryNotes = manager.getFieldValue(`delivery-notes-${order.id}`, order.delivery_notes || '');
  const { provider: deliveryProvider, subtype: deliverySubtype } = getProviderAndSubtype(deliveryType);

  // Check for custom products
  const customProductItems = allItems.filter(item => item.custom_url);
  const hasCustomProducts = customProductItems.length > 0;

  // Build modal content
  const modalContent = buildModalContent(
    order, numOrderId, itemsHTML, addressHTML, addProductSearchHTML,
    deliveryType, deliveryProvider, deliverySubtype, deliveryCost, shipmentDate, deliveryTimeframe, deliveryNotes,
    hasCustomProducts, customProductItems, calculatedTotalPrice, manager, allItems
  );

  // Check if modal is already open - if so, skip stacking (this is a refresh, not a nested modal)
  const overlay = document.getElementById('modal-overlay');
  const isRefresh = overlay && overlay.classList.contains('active');
  showModal(`Заказ #${orderId}`, modalContent, [], { skipStack: isRefresh });

  // Register modal state
  import('../../utils/modalManager.js').then(({ setModalState }) => {
    setModalState('order', numOrderId, () => getPendingChangesManager('order', numOrderId));
  });

  // Handle X button close
  setupCloseHandler(numOrderId, manager);

  // Setup event listeners
  setupModalEventListeners(numOrderId, order, manager, handlers);
}


function setupCloseHandler(orderId, manager) {
  const modalClose = document.getElementById('modal-close');
  if (modalClose) {
    const oldHandler = modalClose._closeHandler;
    if (oldHandler) {
      modalClose.removeEventListener('click', oldHandler);
    }

    const closeHandler = async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const shouldClose = await warnUnsavedChanges(manager);
      if (!shouldClose) {
        return;
      }
      removePendingChangesManager('order', orderId);
      // Use forceHideModal to bypass stack restoration — the confirm dialog already
      // popped the order modal back onto the visible layer, so a plain hideModal()
      // would restore it from the stack instead of closing.
      forceHideModal();
    };

    modalClose._closeHandler = closeHandler;
    modalClose.addEventListener('click', closeHandler);
  }
}

function setupModalEventListeners(orderId, order, manager, handlers) {
  const {
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
    approveCustomProduct,
    rejectCustomProduct,
    approveRefund,
    denyRefund,
    showReceiptData,
    calculateParcels,
    showCreateShipmentModal,
    saveTrackingNumber,
    loadOrderParcels
  } = handlers;

  requestAnimationFrame(() => {
    const modalBody = document.getElementById('modal-body');
    if (!modalBody) return;

    // Delivery provider/subtype cascading selects
    const providerSelect = document.getElementById(`delivery-provider-${orderId}`);
    const subtypeSelect = document.getElementById(`delivery-subtype-${orderId}`);
    const deliveryTypeHidden = document.getElementById(`delivery-type-${orderId}`);

    function updateDeliveryTypeFromSelects() {
      const provider = providerSelect?.value;
      const subtype = subtypeSelect?.value;
      if (subtypeSelect) {
        subtypeSelect.style.display = (provider === 'international' || provider === 'pickup') ? 'none' : '';
      }
      const newType = getDeliveryTypeValue(provider, subtype);
      if (deliveryTypeHidden) deliveryTypeHidden.value = newType;
      handleLocalDeliveryFieldChange(orderId, `delivery-type-${orderId}`, newType, showSaveButtonIfNeeded);
    }

    providerSelect?.addEventListener('change', updateDeliveryTypeFromSelects);
    subtypeSelect?.addEventListener('change', updateDeliveryTypeFromSelects);

    // Remove previous event listeners
    if (modalBody._modalClickHandler) {
      modalBody.removeEventListener('click', modalBody._modalClickHandler);
    }
    if (modalBody._modalChangeHandler) {
      modalBody.removeEventListener('change', modalBody._modalChangeHandler);
    }

    // Delivery field change listeners
    const deliveryFields = modalBody.querySelectorAll('[data-field-name]');
    deliveryFields.forEach(field => {
      const fieldName = field.dataset.fieldName;
      const getValue = () => field.type === 'checkbox' ? field.checked : field.value;
      const changeHandler = () => handleLocalDeliveryFieldChange(orderId, fieldName, getValue(), showSaveButtonIfNeeded);
      const inputHandler = () => handleLocalDeliveryFieldChange(orderId, fieldName, getValue(), showSaveButtonIfNeeded);

      field.addEventListener('change', changeHandler);
      field.addEventListener('input', inputHandler);
    });

    // Click event delegation
    const clickHandler = async (e) => {
      const target = e.target;
      const action = target.dataset.action || target.closest('[data-action]')?.dataset.action;
      if (!action) return;

      const clickOrderId = parseInt(target.dataset.orderId || target.closest('[data-order-id]')?.dataset.orderId);
      const itemId = parseInt(target.dataset.itemId || target.closest('[data-item-id]')?.dataset.itemId);
      const newQuantity = parseInt(target.dataset.newQuantity || target.closest('[data-new-quantity]')?.dataset.newQuantity);
      const productId = parseInt(target.dataset.productId || target.closest('[data-product-id]')?.dataset.productId);

      switch (action) {
        case 'update-item-quantity-local':
          if (clickOrderId && itemId && newQuantity !== undefined) {
            handleLocalQuantityChange(clickOrderId, itemId, newQuantity,
              (oid, iid) => handleLocalItemDelete(oid, iid, updateOrderTotals, showSaveButtonIfNeeded),
              updateOrderTotals, showSaveButtonIfNeeded);
          }
          break;

        case 'delete-order-item-local':
          if (clickOrderId && itemId) handleLocalItemDelete(clickOrderId, itemId, updateOrderTotals, showSaveButtonIfNeeded);
          break;

        case 'save-all-changes':
          if (clickOrderId) await saveAllOrderChanges(clickOrderId, handlers.loadOrders,
            (oid) => viewOrderDetails(oid, handlers));
          break;

        case 'discard-changes':
          if (clickOrderId) await discardOrderChanges(clickOrderId,
            (oid) => viewOrderDetails(oid, handlers));
          break;

        case 'copy-field':
          const copyText = target.dataset.copyText || target.closest('[data-copy-text]')?.dataset.copyText;
          if (copyText) copyToClipboard(copyText);
          break;

        case 'add-product-to-order-inline':
          if (clickOrderId && productId) {
            const formatSelect = document.getElementById(`format-select-${productId}`);
            if (formatSelect) {
              addProductToOrderInline(clickOrderId, productId, formatSelect.value);
            }
          }
          break;

        case 'select-product-for-order':
          if (clickOrderId && productId) {
            const handleItemAdd = (oid, pid, format) => handlers.handleLocalItemAdd(oid, pid, format,
              (oid2) => viewOrderDetails(oid2, handlers));
            _addProductToOrderInline(clickOrderId, productId, handleItemAdd);
          }
          break;

        case 'back-to-search': {
          const searchEl = document.getElementById(`order-product-search-inline-${clickOrderId}`);
          const query = searchEl?.value || '';
          const handleItemAddBack = (oid, pid, format) => handlers.handleLocalItemAdd(oid, pid, format,
            (oid2) => viewOrderDetails(oid2, handlers));
          _searchProductsForOrderInline(clickOrderId, query, handleItemAddBack);
          break;
        }

        case 'add-product-with-format': {
          const format = target.dataset.format || target.closest('[data-format]')?.dataset.format;
          if (clickOrderId && productId && format) {
            await handlers.handleLocalItemAdd(clickOrderId, productId, format,
              (oid2) => viewOrderDetails(oid2, handlers));
          }
          break;
        }

        case 'approve-custom-product':
          if (clickOrderId) await approveCustomProduct(clickOrderId,
            (oid) => viewOrderDetails(oid, handlers), handlers.loadOrders);
          break;

        case 'reject-custom-product':
          if (clickOrderId) await rejectCustomProduct(clickOrderId,
            (oid) => viewOrderDetails(oid, handlers), handlers.loadOrders);
          break;

        case 'approve-refund':
          if (clickOrderId) await approveRefund(clickOrderId,
            (oid) => viewOrderDetails(oid, handlers), handlers.loadOrders);
          break;

        case 'deny-refund':
          if (clickOrderId) await denyRefund(clickOrderId,
            (oid) => viewOrderDetails(oid, handlers), handlers.loadOrders);
          break;

        case 'show-receipt-data':
          if (clickOrderId) await showReceiptData(clickOrderId);
          break;

        case 'calculate-parcels':
          if (clickOrderId) await calculateParcels(clickOrderId);
          break;

        case 'create-shipment':
          if (clickOrderId) await showCreateShipmentModal(clickOrderId, loadOrderParcels);
          break;

        case 'save-tracking':
          if (clickOrderId) await saveTrackingNumber(clickOrderId);
          break;

      }
    };

    // Change event delegation
    const changeHandler = (e) => {
      const target = e.target;
      const action = target.dataset.action || target.closest('[data-action]')?.dataset.action;
      if (!action) return;

      const changeOrderId = parseInt(target.dataset.orderId || target.closest('[data-order-id]')?.dataset.orderId);
      const itemId = parseInt(target.dataset.itemId || target.closest('[data-item-id]')?.dataset.itemId);

      if (action === 'update-item-property-local' && changeOrderId && itemId) {
        handleLocalPropertyChange(changeOrderId, itemId, target.value, updateOrderTotals, showSaveButtonIfNeeded);
      } else if (action === 'update-custom-url-local' && changeOrderId && itemId) {
        handleLocalCustomUrlChange(changeOrderId, itemId, target.value, showSaveButtonIfNeeded);
      }
    };

    const inputHandler = (e) => {
      const target = e.target;
      const action = target.dataset.action;
      if (!action) return;

      const inputOrderId = parseInt(target.dataset.orderId);
      const itemId = parseInt(target.dataset.itemId);

      if (action === 'update-custom-url-local' && inputOrderId && itemId) {
        handleLocalCustomUrlChange(inputOrderId, itemId, target.value, showSaveButtonIfNeeded);
      }
    };

    modalBody._modalClickHandler = clickHandler;
    modalBody._modalChangeHandler = changeHandler;
    modalBody._modalInputHandler = inputHandler;

    modalBody.addEventListener('click', clickHandler);
    modalBody.addEventListener('change', changeHandler);
    modalBody.addEventListener('input', inputHandler);

    // Setup inline product search
    const searchInput = document.getElementById(`order-product-search-inline-${orderId}`);
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const handleItemAdd = (oid, pid, format) => handlers.handleLocalItemAdd(oid, pid, format,
          (oid2) => viewOrderDetails(oid2, handlers));
        _searchProductsForOrderInline(orderId, e.target.value, handleItemAdd);
      });
    }
  });
}

/**
 * Mark an order as read in localStorage
 * @param {number} orderId - Order ID to mark as read
 */
function markOrderAsRead(orderId) {
  try {
    const readOrders = JSON.parse(localStorage.getItem('readOrders') || '[]');
    if (!readOrders.includes(orderId)) {
      readOrders.push(orderId);
      localStorage.setItem('readOrders', JSON.stringify(readOrders));
    }
  } catch (err) {
    console.error('Error marking order as read:', err);
  }
}


