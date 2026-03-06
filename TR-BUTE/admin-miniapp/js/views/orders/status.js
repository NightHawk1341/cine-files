/**
 * orders/status.js
 * Order status update and action functions
 */

import { API_BASE } from '../../config.js';
import { showModal, hideModal, showToast } from '../../utils.js';
import { apiPost } from '../../utils/apiClient.js';

/**
 * Update order status via API
 */
export async function updateOrderStatus(orderId, status, deliveryCost = null, trackingNumber = null, shipmentDate = null, deliveryTimeframe = null, deliveryNotes = null, deliveryType = null) {
  const body = { order_id: orderId };
  if (status !== null) body.status = status;
  if (deliveryCost !== null) body.delivery_cost = deliveryCost;
  if (trackingNumber !== null) body.tracking_number = trackingNumber;
  if (shipmentDate !== null) body.shipment_date = shipmentDate;
  if (deliveryTimeframe !== null) body.delivery_timeframe = deliveryTimeframe;
  if (deliveryNotes !== null) body.delivery_notes = deliveryNotes;
  if (deliveryType !== null) body.delivery_type = deliveryType;

  const response = await apiPost(`/api/orders/update-status`, body);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to update order');
  }

  return response.json();
}

/**
 * Add delivery cost to order
 * @param {number} orderId - Order ID
 * @param {Function} loadOrders - Callback to reload orders
 */
export function addDeliveryCost(orderId, loadOrders) {
  showModal('Стоимость доставки', `
    <div class="form-group">
      <label class="form-label">Введите стоимость доставки (₽)</label>
      <input type="number" id="delivery-cost-input" class="form-input" placeholder="500" min="0">
    </div>
  `, [
    {
      text: 'Отменить',
      className: 'btn btn-secondary',
      onClick: hideModal
    },
    {
      text: 'Подтвердить',
      className: 'btn btn-primary',
      onClick: async () => {
        const cost = parseInt(document.getElementById('delivery-cost-input').value);
        if (!cost || cost < 0) {
          showToast('Введите корректную стоимость', 'error');
          return;
        }

        try {
          await updateOrderStatus(orderId, 'awaiting_payment', cost);
          showToast('Стоимость доставки добавлена', 'success');
          hideModal();
          loadOrders();
        } catch (error) {
          showToast('Ошибка при обновлении заказа', 'error');
        }
      }
    }
  ]);

  // Focus input
  setTimeout(() => document.getElementById('delivery-cost-input').focus(), 100);
}

/**
 * Add tracking number to order
 * @param {number} orderId - Order ID
 * @param {Function} loadOrders - Callback to reload orders
 */
export function addTrackingNumber(orderId, loadOrders) {
  showModal('Трек-номер', `
    <div class="form-group">
      <label class="form-label">Введите трек-номер отправления</label>
      <input type="text" id="tracking-input" class="form-input" placeholder="RA123456789RU">
    </div>
  `, [
    {
      text: 'Отменить',
      className: 'btn btn-secondary',
      onClick: hideModal
    },
    {
      text: 'Отправить',
      className: 'btn btn-primary',
      onClick: async () => {
        const tracking = document.getElementById('tracking-input').value.trim();
        if (!tracking) {
          showToast('Введите трек-номер', 'error');
          return;
        }

        try {
          await updateOrderStatus(orderId, 'shipped', null, tracking);
          showToast('Трек-номер добавлен, клиент уведомлен', 'success');
          hideModal();
          loadOrders();
        } catch (error) {
          showToast('Ошибка при обновлении заказа', 'error');
        }
      }
    }
  ]);

  setTimeout(() => document.getElementById('tracking-input').focus(), 100);
}

/**
 * Cancel an order
 * @param {number} orderId - Order ID
 * @param {Function} loadOrders - Callback to reload orders
 */
export function cancelOrder(orderId, loadOrders) {
  showModal('Отмена заказа', `
    <p style="color: var(--text-secondary);">Вы уверены, что хотите отменить заказ #${orderId}?</p>
    <p style="color: var(--text-tertiary); font-size: 0.875rem; margin-top: var(--spacing-sm);">Клиент получит уведомление об отмене.</p>
  `, [
    {
      text: 'Нет',
      className: 'btn btn-secondary',
      onClick: hideModal
    },
    {
      text: 'Да, отменить',
      className: 'btn btn-danger',
      onClick: async () => {
        try {
          await updateOrderStatus(orderId, 'cancelled');
          showToast('Заказ отменен', 'success');
          hideModal();
          loadOrders();
        } catch (error) {
          showToast('Ошибка при отмене заказа', 'error');
        }
      }
    }
  ]);
}

/**
 * Delete an item from order (with confirmation)
 * @param {number} orderId - Order ID
 * @param {number} itemId - Item ID
 * @param {Function} loadOrders - Callback to reload orders
 * @param {Function} viewOrderDetails - Callback to view order details
 */
export async function deleteOrderItem(orderId, itemId, loadOrders, viewOrderDetails) {
  if (!confirm('Вы уверены, что хотите удалить этот товар из заказа?')) {
    return;
  }

  try {
    const response = await apiPost(`/api/orders/items/remove`, {
        order_id: orderId,
        item_id: itemId
      });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to delete item');
    }

    showToast('Товар удален из заказа', 'success');
    loadOrders();
    // Reopen the order details
    setTimeout(() => viewOrderDetails(orderId), 300);
  } catch (error) {
    console.error('Error deleting item:', error);
    showToast('Ошибка при удалении товара', 'error');
  }
}
