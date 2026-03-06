/**
 * orders/toggles.js
 * Toggle functions for order properties (processed, urgent, refund, custom products)
 */

import { state } from '../../state.js';
import { API_BASE } from '../../config.js';
import { showToast, showConfirmModal } from '../../utils.js';
import { apiGet, apiPost } from '../../utils/apiClient.js';

/**
 * Toggle processed status for order
 */
export async function toggleProcessed(orderId, processed, loadOrders, viewOrderDetails) {
  try {
    const response = await apiPost(`/api/orders/toggle-processed`, {
        order_id: orderId,
        processed: !processed
      });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to toggle processed status');
    }

    // Update local state
    const order = state.orders.find(o => o.id === orderId);
    if (order) {
      order.processed = !processed;
    }

    showToast(
      !processed ? 'Заказ отмечен как обработанный' : 'Метка обработки снята',
      'success'
    );

    // Refresh the orders list
    loadOrders();

  } catch (error) {
    console.error('Error toggling processed:', error);
    showToast(`Ошибка: ${error.message}`, 'error');
  }
}

/**
 * Toggle urgent status for order
 */
export async function toggleUrgent(orderId, urgent, viewOrderDetails) {
  try {
    const response = await apiPost(`/api/orders/toggle-urgent`, {
        order_id: orderId,
        urgent: !urgent
      });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to toggle urgent status');
    }

    // Update local state
    const order = state.orders.find(o => o.id === orderId);
    if (order) {
      order.urgent = !urgent;
    }

    showToast(
      !urgent ? 'Заказ отмечен как срочный' : 'Метка срочности снята',
      'success'
    );

    // Refresh order details
    viewOrderDetails(orderId);

  } catch (error) {
    console.error('Error toggling urgent:', error);
    showToast(`Ошибка: ${error.message}`, 'error');
  }
}

/**
 * Approve custom product for order
 */
export async function approveCustomProduct(orderId, viewOrderDetails, loadOrders) {
  try {
    const confirmed = await showConfirmModal(
      'Вы уверены, что хотите одобрить кастомный постер?',
      'Одобрение кастомного постера'
    );

    if (!confirmed) return;

    // Update status to awaiting_payment if it was pending_approval
    const order = state.orders.find(o => o.id === orderId);
    if (order && order.status === 'pending_approval') {
      const response = await apiPost(`/api/orders/update-status`, {
          order_id: orderId,
          status: 'awaiting_payment'
        });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to approve custom product');
      }

      showToast('Кастомный постер одобрен, ожидание оплаты', 'success');

      viewOrderDetails(orderId);
      loadOrders();
    }
  } catch (error) {
    console.error('Error approving custom product:', error);
    showToast(`Ошибка: ${error.message}`, 'error');
  }
}

/**
 * Reject custom product for order
 */
export async function rejectCustomProduct(orderId, viewOrderDetails, loadOrders) {
  try {
    const confirmed = await showConfirmModal(
      'Вы уверены, что хотите отклонить кастомный постер? Заказ будет отменен.',
      'Отклонение кастомного постера'
    );

    if (!confirmed) return;

    const response = await apiPost(`/api/orders/update-status`, {
        order_id: orderId,
        status: 'cancelled'
      });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to reject custom product');
    }

    showToast('Кастомный постер отклонен, заказ отменен', 'warning');

    viewOrderDetails(orderId);
    loadOrders();

  } catch (error) {
    console.error('Error rejecting custom product:', error);
    showToast(`Ошибка: ${error.message}`, 'error');
  }
}

/**
 * Approve refund for order
 */
export async function approveRefund(orderId, viewOrderDetails, loadOrders) {
  try {
    const confirmed = await showConfirmModal(
      'Вы уверены, что хотите одобрить возврат средств?',
      'Одобрение возврата'
    );

    if (!confirmed) return;

    // Update status to refunded
    const response = await apiPost(`/api/orders/update-status`, {
        order_id: orderId,
        status: 'refunded'
      });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to approve refund');
    }

    // Add note to delivery_notes
    const order = state.orders.find(o => o.id === orderId);
    if (order) {
      const currentNotes = order.delivery_notes || '';
      const approvalNote = `\n\n[ОДОБРЕНО] ВОЗВРАТ ОДОБРЕН администратором\nДата: ${new Date().toLocaleString('ru-RU')}\n`;

      await apiPost(`/api/orders/update-delivery`, {
          order_id: orderId,
          delivery_notes: currentNotes + approvalNote
        });
    }

    showToast('Возврат одобрен', 'success');

    viewOrderDetails(orderId);
    loadOrders();

  } catch (error) {
    console.error('Error approving refund:', error);
    showToast(`Ошибка: ${error.message}`, 'error');
  }
}

/**
 * Deny refund for order
 */
export async function denyRefund(orderId, viewOrderDetails, loadOrders) {
  try {
    const confirmed = await showConfirmModal(
      'Вы уверены, что хотите отклонить запрос на возврат?',
      'Отклонение возврата'
    );

    if (!confirmed) return;

    // Add denial note to delivery_notes
    const order = state.orders.find(o => o.id === orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    const currentNotes = order.delivery_notes || '';
    const denialNote = `\n\n[ОТКЛОНЕНО] ЗАПРОС НА ВОЗВРАТ ОТКЛОНЕН администратором\nДата: ${new Date().toLocaleString('ru-RU')}\n`;

    const response = await apiPost(`/api/orders/update-delivery`, {
        order_id: orderId,
        delivery_notes: currentNotes + denialNote
      });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to deny refund');
    }

    showToast('Запрос на возврат отклонен', 'warning');

    viewOrderDetails(orderId);
    loadOrders();
  } catch (error) {
    console.error('Error denying refund:', error);
    showToast(`Ошибка: ${error.message}`, 'error');
  }
}
