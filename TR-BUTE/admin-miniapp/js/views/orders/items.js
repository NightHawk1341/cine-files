/**
 * orders/items.js
 * Order item management - local changes and pending changes system
 */

import { state } from '../../state.js';
import { API_BASE } from '../../config.js';
import { formatNumber, showToast } from '../../utils.js';
import { getPendingChangesManager, removePendingChangesManager } from '../../utils/pendingChanges.js';
import { apiGet, apiPost } from '../../utils/apiClient.js';

/**
 * Handle local quantity change (doesn't save to API)
 */
export function handleLocalQuantityChange(orderId, itemId, newQuantity, handleLocalItemDelete, updateOrderTotals, showSaveButtonIfNeeded) {
  if (newQuantity < 0) return;

  // If quantity reaches 0, delete the item instead
  if (newQuantity === 0) {
    handleLocalItemDelete(orderId, itemId);
    return;
  }

  const manager = getPendingChangesManager('order', orderId);
  manager.updateItemQuantity(itemId, newQuantity);

  // Update just the quantity display, not the whole modal
  const itemDiv = document.querySelector(`[data-item-id="${itemId}"]`);
  const quantityDisplay = itemDiv?.querySelector('.quantity-display');
  if (quantityDisplay) {
    quantityDisplay.textContent = newQuantity;
  }

  // Get current price and update total price display for this item
  const currentPrice = manager.getItemValue(itemId, 'price_at_purchase', null);
  if (currentPrice && itemDiv) {
    const totalPrice = currentPrice * newQuantity;
    const priceDiv = itemDiv.querySelector('.order-item-actions .font-semibold');
    if (priceDiv) {
      priceDiv.textContent = formatNumber(totalPrice) + '₽';
    }
  }

  // Update order totals in real-time
  updateOrderTotals(orderId);

  // Update the data attributes for +/- buttons
  if (itemDiv) {
    const allButtons = itemDiv.querySelectorAll('[data-action="update-item-quantity-local"]');
    allButtons.forEach(btn => {
      if (btn.textContent.trim() === '−') {
        btn.dataset.newQuantity = newQuantity - 1;
      } else if (btn.textContent.trim() === '+') {
        btn.dataset.newQuantity = newQuantity + 1;
      }
    });
  }

  // Update modified indicator based on whether item is actually modified
  if (itemDiv) {
    const isModified = manager.isItemModified(itemId);
    const titleDiv = itemDiv.querySelector('.font-semibold');
    const modifiedBadge = titleDiv?.querySelector('.modified-badge');

    if (isModified) {
      if (!itemDiv.classList.contains('modified-indicator')) {
        itemDiv.classList.add('modified-indicator');
      }
      if (titleDiv && !modifiedBadge) {
        titleDiv.insertAdjacentHTML('beforeend', '<span class="modified-badge">Изменено</span>');
      }
    } else {
      itemDiv.classList.remove('modified-indicator');
      modifiedBadge?.remove();
    }
  }

  // Show save button
  showSaveButtonIfNeeded(orderId, manager);
}

/**
 * Handle local property change (doesn't save to API)
 */
export async function handleLocalPropertyChange(orderId, itemId, newProperty, updateOrderTotals, showSaveButtonIfNeeded) {
  const manager = getPendingChangesManager('order', orderId);

  // Update property immediately
  manager.updateItemProperty(itemId, newProperty);

  // Get item div for UI updates
  const itemDiv = document.querySelector(`[data-item-id="${itemId}"]`);

  // Fetch product prices to recalculate price based on new property
  try {
    const pricesResponse = await apiGet(`/api/product-prices`);
    const prices = await pricesResponse.json();

    const productPricesById = {};
    prices.forEach(p => {
      if (p.id) {
        productPricesById[p.id] = p;
      }
    });

    const propertyToPriceId = {
      'A3 без рамки': 1,
      'A2 без рамки': 2,
      'A1 без рамки': 3,
      'A3 в рамке': 4,
      'A2 в рамке': 5
    };

    const getBaseProperty = (property) => {
      const reverseMapping = {
        '3 A3 без рамок': 'A3 без рамки',
        '3 A2 без рамок': 'A2 без рамки',
        '3 A1 без рамок': 'A1 без рамки',
        '3 A3 в рамках': 'A3 в рамке',
        '3 A2 в рамках': 'A2 в рамке'
      };
      return reverseMapping[property] || property;
    };

    const baseProperty = getBaseProperty(newProperty);
    const priceId = propertyToPriceId[baseProperty];

    if (priceId && productPricesById[priceId]) {
      const priceData = productPricesById[priceId];
      const newPrice = priceData.discount_price || priceData.base_price;

      if (newPrice > 0) {
        manager.updateItemPrice(itemId, newPrice);
        const currentQuantity = manager.getItemValue(itemId, 'quantity', 1);
        const totalPrice = newPrice * currentQuantity;

        const priceDiv = itemDiv?.querySelector('.order-item-actions .font-semibold');
        if (priceDiv) {
          priceDiv.textContent = formatNumber(totalPrice) + '₽';
        }

        updateOrderTotals(orderId);
      }
    }
  } catch (error) {
    console.error('Error fetching prices:', error);
  }

  // Update modified indicator
  if (itemDiv) {
    const isModified = manager.isItemModified(itemId);
    const titleDiv = itemDiv.querySelector('.font-semibold');
    const modifiedBadge = titleDiv?.querySelector('.modified-badge');

    if (isModified) {
      if (!itemDiv.classList.contains('modified-indicator')) {
        itemDiv.classList.add('modified-indicator');
      }
      if (titleDiv && !modifiedBadge) {
        titleDiv.insertAdjacentHTML('beforeend', '<span class="modified-badge">Изменено</span>');
      }
    } else {
      itemDiv.classList.remove('modified-indicator');
      modifiedBadge?.remove();
    }
  }

  showSaveButtonIfNeeded(orderId, manager);
}

/**
 * Handle local custom URL change
 */
export async function handleLocalCustomUrlChange(orderId, itemId, newUrl, showSaveButtonIfNeeded) {
  const manager = getPendingChangesManager('order', orderId);
  manager.updateItemCustomUrl(itemId, newUrl);

  const itemDiv = document.querySelector(`[data-item-id="${itemId}"]`);
  if (itemDiv && !itemDiv.classList.contains('modified-indicator')) {
    itemDiv.classList.add('modified-indicator');
    const titleDiv = itemDiv.querySelector('.font-semibold');
    if (titleDiv && !titleDiv.querySelector('.modified-badge')) {
      titleDiv.insertAdjacentHTML('beforeend', '<span class="modified-badge">Изменено</span>');
    }
  }

  // Update image preview if URL is valid
  const img = itemDiv?.querySelector('.order-item-image');
  if (img && newUrl) {
    img.src = newUrl;
    img.onerror = () => {
      const item = manager.getItems().find(i => i.id === itemId);
      if (item && item.image) {
        img.src = item.image;
      }
    };
  }

  showSaveButtonIfNeeded(orderId, manager);
}

/**
 * Show or update the save button
 */
export function showSaveButtonIfNeeded(orderId, manager) {
  if (!manager.hasUnsavedChanges()) return;

  let saveContainer = document.querySelector('.changes-actions');
  if (saveContainer) return;

  const rightColumn = document.querySelector('.modal-column-right');
  if (!rightColumn) return;

  const saveHTML = `
    <div class="changes-actions">
      <button class="btn btn-save-all" data-action="save-all-changes" data-order-id="${orderId}">
        💾 Сохранить все изменения
      </button>
      <button class="btn btn-discard" data-action="discard-changes" data-order-id="${orderId}">
        Отменить
      </button>
    </div>
  `;
  rightColumn.insertAdjacentHTML('beforeend', saveHTML);
}

/**
 * Recalculate and update total price display in real-time
 */
export function updateOrderTotals(orderId) {
  const itemDivs = document.querySelectorAll('.order-item-inline');
  let calculatedTotal = 0;

  itemDivs.forEach(itemDiv => {
    if (itemDiv.classList.contains('deleted-indicator')) {
      return;
    }

    const quantityDisplay = itemDiv.querySelector('.quantity-display');
    const quantity = quantityDisplay ? parseInt(quantityDisplay.textContent) || 0 : 0;

    const priceDiv = itemDiv.querySelector('.order-item-actions .font-semibold');
    if (priceDiv) {
      const priceText = priceDiv.textContent.replace(/[^\d]/g, '');
      const itemTotal = parseInt(priceText) || 0;
      calculatedTotal += itemTotal;
    }
  });

  const totalPriceEl = document.getElementById(`order-total-price-${orderId}`);
  const grandTotalEl = document.getElementById(`order-grand-total-${orderId}`);

  if (totalPriceEl) {
    totalPriceEl.textContent = formatNumber(calculatedTotal) + '₽';
  }

  if (grandTotalEl) {
    const deliveryText = document.querySelector('.modal-column-right .flex-between:has(.text-secondary) .font-semibold:not(#order-total-price-' + orderId + ')');
    let deliveryCost = 0;
    if (deliveryText && deliveryText.textContent.includes('₽')) {
      deliveryCost = parseInt(deliveryText.textContent.replace(/[^\d]/g, '')) || 0;
    }
    grandTotalEl.textContent = formatNumber(calculatedTotal + deliveryCost) + '₽';
  }
}

/**
 * Handle local item deletion (doesn't save to API)
 */
export function handleLocalItemDelete(orderId, itemId, updateOrderTotals, showSaveButtonIfNeeded) {
  const manager = getPendingChangesManager('order', orderId);
  manager.removeItem(itemId);

  const itemDiv = document.querySelector(`[data-item-id="${itemId}"]`);
  if (itemDiv) {
    itemDiv.classList.add('deleted-indicator');
    itemDiv.style.opacity = '0.5';
    itemDiv.style.pointerEvents = 'none';

    const titleDiv = itemDiv.querySelector('.font-semibold');
    if (titleDiv && !titleDiv.querySelector('.deleted-badge')) {
      titleDiv.insertAdjacentHTML('beforeend', '<span class="deleted-badge" style="background: #dc2626; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin-left: 8px;">Удалено</span>');
    }

    const modifiedBadge = titleDiv?.querySelector('.modified-badge');
    if (modifiedBadge) {
      modifiedBadge.remove();
    }
    itemDiv.classList.remove('modified-indicator');
  }

  updateOrderTotals(orderId);
  showSaveButtonIfNeeded(orderId, manager);
}

/**
 * Handle local item addition (doesn't save to API)
 */
export async function handleLocalItemAdd(orderId, productId, format, viewOrderDetails) {
  const manager = getPendingChangesManager('order', orderId);

  try {
    const [productsRes, pricesRes] = await Promise.all([
      apiGet(`/products?all=true`),
      apiGet(`/api/product-prices`)
    ]);

    const products = await productsRes.json();
    const prices = await pricesRes.json();

    const product = products.find(p => p.id === productId);
    if (!product) {
      showToast('Продукт не найден', 'error');
      return;
    }

    const productPricesById = {};
    prices.forEach(p => {
      if (p.id) {
        productPricesById[p.id] = p;
      }
    });

    const propertyToPriceId = {
      'A3 без рамки': 1,
      'A2 без рамки': 2,
      'A1 без рамки': 3,
      'A3 в рамке': 4,
      'A2 в рамке': 5
    };

    const getBaseProperty = (property) => {
      const reverseMapping = {
        '3 A3 без рамок': 'A3 без рамки',
        '3 A2 без рамок': 'A2 без рамки',
        '3 A1 без рамок': 'A1 без рамки',
        '3 A3 в рамках': 'A3 в рамке',
        '3 A2 в рамках': 'A2 в рамке'
      };
      return reverseMapping[property] || property;
    };

    let correctPrice = 0;

    if (product.price && product.price > 0) {
      correctPrice = product.price;
    } else {
      const baseProperty = getBaseProperty(format);
      const priceId = propertyToPriceId[baseProperty];

      if (priceId && productPricesById[priceId]) {
        const priceData = productPricesById[priceId];
        correctPrice = product.discount ? priceData.discount_price : priceData.base_price;
        if (product.triptych) correctPrice *= 3;
      }
    }

    if (product.variations && product.variations.length > 0) {
      const variation = product.variations.find(v => v.property === format);
      if (variation && variation.price && variation.price > 0) {
        correctPrice = variation.price;
      }
    }

    if (!correctPrice || correctPrice === 0) {
      console.error(`No price available for product ${productId}, format: ${format}`);
      showToast(`Цена не найдена для формата "${format}"`, 'error');
      return;
    }

    let imageUrl = null;
    if (product.images && product.images.length > 0) {
      imageUrl = product.images[0];
    }

    const tempItem = {
      id: `temp-${Date.now()}`,
      product_id: productId,
      title: product.title,
      property: format,
      price_at_purchase: correctPrice,
      quantity: 1,
      image: imageUrl,
      triptych: product.triptych,
      variation_num: product.variation_num
    };

    manager.addItem(tempItem);
    viewOrderDetails(orderId);
    showToast('Товар добавлен (не сохранено)', 'info');
  } catch (error) {
    console.error('Error adding product:', error);
    showToast('Ошибка при добавлении товара', 'error');
  }
}

/**
 * Handle local delivery field change (doesn't save to API)
 */
export function handleLocalDeliveryFieldChange(orderId, fieldName, value, showSaveButtonIfNeeded) {
  const manager = getPendingChangesManager('order', orderId);
  manager.updateField(fieldName, value);

  const field = document.getElementById(fieldName);
  if (field) {
    if (manager.isFieldModified(fieldName)) {
      field.classList.add('field-modified');
    } else {
      field.classList.remove('field-modified');
    }
  }

  showSaveButtonIfNeeded(orderId, manager);
}

/**
 * Save all pending changes to API
 */
export async function saveAllOrderChanges(orderId, loadOrders, viewOrderDetails) {
  const manager = getPendingChangesManager('order', orderId);

  if (!manager.hasUnsavedChanges()) {
    showToast('Нет изменений для сохранения', 'info');
    return;
  }

  const changes = manager.getAllChanges();

  try {
    // Save item modifications
    for (const mod of changes.itemModifications) {
      const payload = {
        order_id: orderId,
        item_id: mod.itemId
      };

      if ('quantity' in mod) payload.quantity = mod.quantity;
      if ('property' in mod) payload.property = mod.property;

      const response = await apiPost(`/api/orders/items/update`, payload);

      if (!response.ok) throw new Error('Failed to update item');
    }

    // Save item additions
    for (const item of changes.itemAdditions) {
      const response = await apiPost(`/api/orders/items/add`, {
          order_id: orderId,
          product_id: item.product_id,
          title: item.title,
          property: item.property,
          quantity: item.quantity,
          price_at_purchase: item.price_at_purchase,
          variation_num: item.variation_num || null,
          image: item.image || null
        });

      if (!response.ok) throw new Error('Failed to add item');
    }

    // Save item deletions
    for (const itemId of changes.itemRemovals) {
      if (String(itemId).startsWith('temp-')) continue;

      const response = await apiPost(`/api/orders/items/remove`, {
          order_id: orderId,
          item_id: itemId
        });

      if (!response.ok) throw new Error('Failed to delete item');
    }

    // Save delivery field updates
    if (Object.keys(changes.fieldUpdates).length > 0) {
      const processedField = Object.keys(changes.fieldUpdates).find(k => k.startsWith('notion-processed-'));
      const urgentField = Object.keys(changes.fieldUpdates).find(k => k.startsWith('urgent-'));

      if (processedField !== undefined) {
        const processedValue = changes.fieldUpdates[processedField];
        const response = await apiPost(`/api/orders/toggle-processed`, {
            order_id: orderId,
            processed: processedValue
          });
        if (!response.ok) throw new Error('Failed to update processed status');
      }

      if (urgentField !== undefined) {
        const urgentValue = changes.fieldUpdates[urgentField];
        const response = await apiPost(`/api/orders/toggle-urgent`, {
            order_id: orderId,
            urgent: urgentValue
          });
        if (!response.ok) throw new Error('Failed to update urgent status');
      }

      const regularFieldUpdates = { ...changes.fieldUpdates };
      if (processedField) delete regularFieldUpdates[processedField];
      if (urgentField) delete regularFieldUpdates[urgentField];

      // Status changes must go through update-status so notifications fire
      const statusFieldKey = `order-status-${orderId}`;
      const newStatus = regularFieldUpdates[statusFieldKey];
      if (newStatus !== undefined) {
        delete regularFieldUpdates[statusFieldKey];
        const statusResponse = await apiPost(`/api/orders/update-status`, {
          order_id: orderId,
          status: newStatus
        });
        if (!statusResponse.ok) {
          const errorData = await statusResponse.json().catch(() => ({}));
          throw new Error(errorData.message || 'Failed to update order status');
        }
      }

      if (Object.keys(regularFieldUpdates).length > 0) {
        const apiFieldMap = {
          [`delivery-type-${orderId}`]: 'delivery_type',
          [`delivery-cost-${orderId}`]: 'delivery_cost',
          [`shipment-date-${orderId}`]: 'shipment_date',
          [`delivery-timeframe-${orderId}`]: 'delivery_timeframe',
          [`delivery-notes-${orderId}`]: 'delivery_notes',
          [`receipt-url-${orderId}`]: 'receipt_url',
          [`address-surname-${orderId}`]: 'address_surname',
          [`address-name-${orderId}`]: 'address_name',
          [`address-phone-${orderId}`]: 'address_phone',
          [`address-postal-index-${orderId}`]: 'address_postal_index',
          [`address-address-${orderId}`]: 'address_address',
          [`address-comment-${orderId}`]: 'address_comment',
          [`address-pvz-code-${orderId}`]: 'address_pvz_code',
          [`address-pvz-address-${orderId}`]: 'address_pvz_address'
        };

        const apiPayload = { order_id: orderId };
        for (const [htmlFieldName, value] of Object.entries(regularFieldUpdates)) {
          const apiFieldName = apiFieldMap[htmlFieldName];
          if (apiFieldName) {
            apiPayload[apiFieldName] = value;
          }
        }

        const response = await apiPost(`/api/orders/update-delivery`, apiPayload);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || 'Failed to update delivery info');
        }
      }
    }

    // Mark items in local state
    const order = state.orders.find(o => o.id === orderId) || (state.feedOrders && state.feedOrders.find(o => o.id === orderId));
    if (order && order.items) {
      changes.itemModifications.forEach(mod => {
        const item = order.items.find(i => i.id === mod.itemId);
        if (item) {
          item.admin_modified = true;
        }
      });
    }

    manager.reset();
    removePendingChangesManager('order', orderId);

    await loadOrders();

    const updatedOrder = state.orders.find(o => o.id === orderId) || (state.feedOrders && state.feedOrders.find(o => o.id === orderId));
    if (updatedOrder && updatedOrder.items) {
      changes.itemModifications.forEach(mod => {
        const item = updatedOrder.items.find(i => i.id === mod.itemId);
        if (item && !item.admin_modified) {
          item.admin_modified = true;
        }
      });

      changes.itemAdditions.forEach(addedItem => {
        const item = updatedOrder.items.find(i =>
          i.product_id === addedItem.product_id &&
          i.property === addedItem.property &&
          !i.admin_added &&
          !i.admin_modified
        );
        if (item) {
          item.admin_added = true;
        }
      });
    }

    viewOrderDetails(orderId);
    showToast('Все изменения сохранены', 'success');

  } catch (error) {
    console.error('Error saving changes:', error);
    showToast('Ошибка при сохранении: ' + error.message, 'error');
  }
}

/**
 * Discard all pending changes
 */
export async function discardOrderChanges(orderId, viewOrderDetails) {
  const manager = getPendingChangesManager('order', orderId);

  if (!manager.hasUnsavedChanges()) {
    return;
  }

  const { confirmDiscard, clearModalState } = await import('../../utils/modalManager.js');
  const shouldDiscard = await confirmDiscard();

  if (!shouldDiscard) {
    return;
  }

  try {
    const response = await apiGet(`/api/orders/${orderId}`);
    if (!response.ok) {
      throw new Error('Failed to fetch fresh order data');
    }

    const freshOrder = await response.json();

    const orderIndex = state.orders.findIndex(o => o.id === orderId);
    if (orderIndex !== -1) {
      state.orders[orderIndex] = freshOrder;
    }

    if (state.feedOrders) {
      const feedOrderIndex = state.feedOrders.findIndex(o => o.id === orderId);
      if (feedOrderIndex !== -1) {
        state.feedOrders[feedOrderIndex] = freshOrder;
      }
    }

    manager.reset();
    removePendingChangesManager('order', orderId);
    clearModalState();
    viewOrderDetails(orderId);
    showToast('Изменения отменены', 'info');
  } catch (error) {
    console.error('Error discarding changes:', error);
    showToast('Ошибка при отмене изменений', 'error');
  }
}
