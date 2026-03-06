/**
 * orders/shipping.js
 * Shipping and parcel management functions
 */

import { state } from '../../state.js';
import { API_BASE } from '../../config.js';
import { showModal, hideModal, showToast, formatNumber, escapeHtml } from '../../utils.js';
import { apiGet, apiPost } from '../../utils/apiClient.js';

/**
 * Show receipt data for order
 */
export async function showReceiptData(orderId) {
  const order = state.orders.find(o => o.id === orderId);
  if (!order) {
    showToast('Заказ не найден', 'error');
    return;
  }

  // Build receipt data from order items
  const items = order.items || [];
  const receiptData = {
    orderId: orderId,
    items: items.map(item => ({
      name: item.title,
      quantity: item.quantity,
      price: item.price_at_purchase,
      total: item.quantity * item.price_at_purchase
    })),
    subtotal: order.total_price || 0,
    deliveryCost: order.delivery_cost || 0,
    total: (parseFloat(order.total_price) || 0) + (parseFloat(order.delivery_cost) || 0)
  };

  const itemsHTML = receiptData.items.map(item => `
    <tr>
      <td>${escapeHtml(item.name)}</td>
      <td style="text-align: center;">${item.quantity}</td>
      <td style="text-align: right;">${formatNumber(item.price)}₽</td>
      <td style="text-align: right;">${formatNumber(item.total)}₽</td>
    </tr>
  `).join('');

  const modalContent = `
    <div class="receipt-data">
      <table class="receipt-table" style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr>
            <th style="text-align: left;">Товар</th>
            <th style="text-align: center;">Кол-во</th>
            <th style="text-align: right;">Цена</th>
            <th style="text-align: right;">Сумма</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHTML}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3" style="text-align: right;"><strong>Товары:</strong></td>
            <td style="text-align: right;">${formatNumber(receiptData.subtotal)}₽</td>
          </tr>
          <tr>
            <td colspan="3" style="text-align: right;"><strong>Доставка:</strong></td>
            <td style="text-align: right;">${formatNumber(receiptData.deliveryCost)}₽</td>
          </tr>
          <tr>
            <td colspan="3" style="text-align: right;"><strong>Итого:</strong></td>
            <td style="text-align: right;"><strong>${formatNumber(receiptData.total)}₽</strong></td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;

  showModal(`Чек для заказа #${orderId}`, modalContent, [
    {
      text: 'Закрыть',
      className: 'btn btn-secondary',
      onClick: hideModal
    }
  ]);
}

/**
 * Load order parcels (shipments)
 */
export async function loadOrderParcels(orderId) {
  try {
    const response = await apiGet(`/api/orders/parcels?order_id=${orderId}`);
    if (!response.ok) {
      throw new Error('Failed to load parcels');
    }

    const parcels = await response.json();
    return parcels;
  } catch (error) {
    console.error('Error loading parcels:', error);
    return [];
  }
}

/**
 * Get parcel status text
 */
export function getParcelStatusText(status) {
  const statusMap = {
    'created': 'Создано',
    'accepted': 'Принято',
    'in_transit': 'В пути',
    'delivered': 'Доставлено',
    'returned': 'Возврат',
    'cancelled': 'Отменено'
  };
  return statusMap[status] || status;
}

/**
 * Calculate parcels for order
 */
export async function calculateParcels(orderId) {
  try {
    const order = state.orders.find(o => o.id === orderId);
    if (!order || !order.items) {
      throw new Error('Order not found or has no items');
    }

    // Simple calculation: group items by size/weight
    const parcels = [];
    let currentParcel = { items: [], weight: 0 };
    const maxWeight = 5000; // 5kg max per parcel

    for (const item of order.items) {
      const itemWeight = item.weight || 500; // Default 500g per item
      const totalItemWeight = itemWeight * item.quantity;

      if (currentParcel.weight + totalItemWeight > maxWeight && currentParcel.items.length > 0) {
        parcels.push(currentParcel);
        currentParcel = { items: [], weight: 0 };
      }

      currentParcel.items.push(item);
      currentParcel.weight += totalItemWeight;
    }

    if (currentParcel.items.length > 0) {
      parcels.push(currentParcel);
    }

    return parcels;
  } catch (error) {
    console.error('Error calculating parcels:', error);
    showToast('Ошибка при расчете посылок', 'error');
    return [];
  }
}

/**
 * Show create shipment modal
 */
export async function showCreateShipmentModal(orderId, loadOrderParcels) {
  const order = state.orders.find(o => o.id === orderId);
  if (!order) {
    showToast('Заказ не найден', 'error');
    return;
  }

  const modalContent = `
    <div class="shipment-form">
      <div class="form-group">
        <label class="form-label">Служба доставки</label>
        <select id="shipment-provider" class="form-input">
          <option value="">Выберите службу</option>
          <option value="cdek">СДЭК</option>
          <option value="pochta">Почта России</option>
        </select>
      </div>

      <div id="cdek-options" style="display: none;">
        <div class="form-group">
          <label class="form-label">Тариф СДЭК</label>
          <select id="cdek-tariff" class="form-input">
            <option value="136">До двери (курьер)</option>
            <option value="137">До пункта выдачи</option>
            <option value="138">До постамата</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Пункт выдачи</label>
          <input type="text" id="cdek-pickup-point" class="form-input" placeholder="Код ПВЗ">
        </div>
      </div>

      <div id="pochta-options" style="display: none;">
        <div class="form-group">
          <label class="form-label">Тариф Почты России</label>
          <select id="pochta-tariff" class="form-input">
            <option value="23030">Посылка 1 класса</option>
            <option value="23020">Посылка обычная</option>
            <option value="27030">EMS</option>
          </select>
        </div>
      </div>

      <div class="form-group">
        <button id="btn-create-shipment" class="btn btn-primary" style="width: 100%;">
          Создать отправление
        </button>
      </div>
    </div>
  `;

  showModal('Создание отправления', modalContent, [
    {
      text: 'Отмена',
      className: 'btn btn-secondary',
      onClick: hideModal
    }
  ]);

  // Setup event listeners after modal is shown
  setTimeout(() => {
    const providerSelect = document.getElementById('shipment-provider');
    const cdekOptions = document.getElementById('cdek-options');
    const pochtaOptions = document.getElementById('pochta-options');
    const createBtn = document.getElementById('btn-create-shipment');

    providerSelect?.addEventListener('change', () => {
      const provider = providerSelect.value;
      cdekOptions.style.display = provider === 'cdek' ? 'block' : 'none';
      pochtaOptions.style.display = provider === 'pochta' ? 'block' : 'none';
    });

    createBtn?.addEventListener('click', async () => {
      const provider = providerSelect.value;
      if (!provider) {
        showToast('Выберите службу доставки', 'error');
        return;
      }

      const serviceCode = provider === 'cdek'
        ? document.getElementById('cdek-tariff').value
        : document.getElementById('pochta-tariff').value;

      const pickupPoint = provider === 'cdek'
        ? document.getElementById('cdek-pickup-point').value
        : null;

      createBtn.disabled = true;
      createBtn.textContent = 'Создание...';

      try {
        const response = await apiPost(`/api/orders/create-shipment`, {
            order_id: orderId,
            provider,
            service_code: serviceCode,
            pickup_point: pickupPoint
          });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Failed to create shipment');
        }

        showToast(`Отправление создано! Трек: ${result.tracking_number}`, 'success');
        hideModal();

        // Update tracking number field
        const trackingInput = document.getElementById(`tracking-number-${orderId}`);
        if (trackingInput) {
          trackingInput.value = result.tracking_number;
        }

        // Reload parcels
        await loadOrderParcels(orderId);

      } catch (error) {
        console.error('Error creating shipment:', error);
        showToast(`Ошибка создания отправления: ${error.message}`, 'error');
        createBtn.disabled = false;
        createBtn.textContent = 'Создать';
      }
    });
  }, 100);
}

/**
 * Save tracking number for order.
 * If a tracking number is being added and the order is not yet shipped/delivered,
 * automatically advances status to 'shipped' (sends user notification).
 */
export async function saveTrackingNumber(orderId) {
  const trackingInput = document.getElementById(`tracking-number-${orderId}`);
  if (!trackingInput) return;

  const trackingNumber = trackingInput.value.trim();

  const order = state.orders.find(o => o.id === orderId)
    || (state.feedOrders && state.feedOrders.find(o => o.id === orderId));
  const notYetShipped = order && !['shipped', 'delivered', 'completed', 'cancelled'].includes(order.status);
  const shouldAutoShip = trackingNumber && notYetShipped;

  try {
    if (shouldAutoShip) {
      // Use update-status so the user gets the shipped notification
      const response = await apiPost(`/api/orders/update-status`, {
        order_id: orderId,
        status: 'shipped',
        tracking_number: trackingNumber
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save tracking number');
      }
      showToast('Трек-номер сохранён, статус изменён на «Отправлен»', 'success');
    } else {
      const response = await apiPost(`/api/orders/update`, {
        order_id: orderId,
        tracking_number: trackingNumber
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save tracking number');
      }
      showToast('Трек-номер сохранён', 'success');
    }
  } catch (error) {
    console.error('Error saving tracking number:', error);
    showToast(`Ошибка сохранения трек-номера: ${error.message}`, 'error');
  }
}
