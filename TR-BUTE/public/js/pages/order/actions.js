// ============================================================
// ORDER PAGE - Order Actions
// Cancel, refund, received confirmation, contact support, confirm order
// ============================================================

import { getAccessToken } from '../../core/auth.js';
import { showModal, showConfirm, showPrompt, addImageSize } from './constants.js';

/**
 * Handle order cancellation with optional reason
 */
export async function handleCancellation(order) {
  const confirmed = await showConfirm(
    'Вы уверены, что хотите отменить заказ?',
    {
      confirmText: 'Да, отменить',
      cancelText: 'Нет',
      confirmStyle: 'background: #ef4444; color: white;'
    }
  );

  if (!confirmed) return;

  const shouldAskReason = order.status === 'new';

  let cancellationReason = '';
  if (shouldAskReason) {
    cancellationReason = prompt('Пожалуйста, укажите причину отмены (необязательно):') || '';
  }

  try {
    const token = getAccessToken();
    const response = await fetch('/api/orders/cancel', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        order_id: order.id,
        cancellation_reason: cancellationReason
      })
    });

    if (!response.ok) {
      let errorMessage = 'Не удалось отменить заказ';
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        }
      } catch (parseError) {
        if (response.status === 400) {
          errorMessage = 'Заказ не может быть отменен в текущем статусе';
        } else if (response.status === 401) {
          errorMessage = 'Пожалуйста, войдите в аккаунт';
        } else if (response.status === 403) {
          errorMessage = 'Нет доступа к этому заказу';
        } else if (response.status === 404) {
          errorMessage = 'Заказ не найден';
        }
      }
      throw new Error(errorMessage);
    }

    await showModal('Заказ успешно отменен', 'success');
    window.location.reload();
  } catch (error) {
    console.error('Error cancelling order:', error);
    await showModal(error.message || 'Ошибка при отмене заказа. Пожалуйста, попробуйте позже.', 'error');
  }
}

/**
 * Handle refund request
 */
export async function handleRefundRequest(order) {
  if (order.status === 'shipped') {
    const action = await showRefundWarningModal(
      'Ваш заказ уже отправлен',
      'Ваш заказ уже отправлен. Для возврата средств рекомендуется связаться с администратором.',
      order
    );

    if (action === 'contact') {
      showContactSupport(order);
      return;
    } else if (action !== 'proceed') {
      return;
    }
  }

  if (order.status === 'delivered') {
    const action = await showRefundWarningModal(
      'Заказ уже доставлен',
      'Согласно нашей политике возврата, для оформления возврата уже доставленного заказа рекомендуется связаться с администратором.',
      order
    );

    if (action === 'contact') {
      showContactSupport(order);
      return;
    } else if (action !== 'proceed') {
      return;
    }
  }

  const confirmed = await showConfirm(
    'Вы уверены, что хотите запросить возврат средств?',
    {
      confirmText: 'Да, запросить возврат',
      cancelText: 'Отмена',
      confirmStyle: 'background: #f59e0b; color: white;'
    }
  );

  if (!confirmed) return;

  const refundReason = await showPrompt(
    'Пожалуйста, укажите причину возврата:',
    {
      placeholder: 'Например: получил товар с браком',
      confirmText: 'Отправить'
    }
  );

  if (!refundReason || refundReason.trim() === '') {
    await showModal('Необходимо указать причину возврата', 'error');
    return;
  }

  try {
    const token = getAccessToken();
    const response = await fetch('/api/orders/request-refund', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        order_id: order.id,
        refund_reason: refundReason
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Не удалось отправить запрос на возврат');
    }

    await showModal('Запрос на возврат отправлен. Администратор свяжется с вами в ближайшее время.', 'success');
    window.location.reload();
  } catch (error) {
    console.error('Error requesting refund:', error);
    await showModal(`Ошибка при отправке запроса: ${error.message}`, 'error');
  }
}

/**
 * Show refund warning modal with two action buttons
 */
export function showRefundWarningModal(title, message, order) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'order-modal-overlay faq-popup-overlay active';

    overlay.innerHTML = `
      <div class="order-modal-content faq-popup-content">
        <div class="faq-popup-header">
          <div class="faq-popup-title">${title}</div>
          <button class="order-modal-close faq-popup-close btn-icon">
            <svg width="12" height="12"><use href="#x"></use></svg>
          </button>
        </div>
        <div class="faq-textbox" style="margin-bottom: 16px;">
          <p>${message}</p>
        </div>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <button class="order-modal-button" id="contact-support-btn" style="background: var(--primary-color, #3b82f6); color: white;">
            Связаться с поддержкой
          </button>
          <button class="order-modal-button" id="proceed-refund-btn" style="background: transparent; color: #f59e0b; border: 1px solid #f59e0b;">
            Все равно запросить возврат
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    const closeModal = (action) => {
      overlay.classList.remove('active');
      document.body.style.overflow = '';
      setTimeout(() => overlay.remove(), 300);
      resolve(action);
    };

    overlay.querySelector('#contact-support-btn').addEventListener('click', () => closeModal('contact'));
    overlay.querySelector('#proceed-refund-btn').addEventListener('click', () => closeModal('proceed'));
    overlay.querySelector('.order-modal-close').addEventListener('click', () => closeModal('cancel'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal('cancel');
    });
  });
}

/**
 * Handle user confirmation of order receipt
 */
export async function handleReceivedConfirmation(order) {
  const confirmed = await showConfirm(
    'Вы подтверждаете, что получили заказ?',
    {
      confirmText: 'Да, получил',
      cancelText: 'Нет'
    }
  );

  if (!confirmed) return;

  try {
    const token = getAccessToken();
    const response = await fetch('/api/orders/confirm-delivery', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        order_id: order.id
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Не удалось подтвердить получение');
    }

    await showModal('Спасибо! Заказ помечен как доставленный. Если вам понравился товар, оставьте отзыв на странице товара.', 'success');
    window.location.reload();
  } catch (error) {
    console.error('Error confirming delivery:', error);
    await showModal(`Ошибка: ${error.message}`, 'error');
  }
}

/**
 * Show contact support modal for delivered orders with issues.
 * Uses the shared mobile-modal infrastructure for proper styling.
 */
export function showContactSupport(order) {
  const contentHTML = `
    <div style="margin-bottom: 16px;">
      <p style="margin-bottom: 12px; color: var(--text-primary);">Если у вас возникли проблемы с заказом #${order.id}, свяжитесь с нами:</p>
      <ul style="list-style: none; padding: 0; margin: 0;">
        <li style="margin-bottom: 10px;">
          <a href="https://t.me/buy_tribute" target="_blank" rel="noopener noreferrer" style="display: flex; align-items: center; gap: 8px; color: var(--link-color); text-decoration: none; font-size: 0.9rem;">
            <svg width="20" height="20"><use href="#socials-telegram"></use></svg>
            Telegram
          </a>
        </li>
        <li style="margin-bottom: 10px;">
          <a href="https://vk.com/buy_tribute" target="_blank" rel="noopener noreferrer" style="display: flex; align-items: center; gap: 8px; color: var(--link-color); text-decoration: none; font-size: 0.9rem;">
            <svg width="20" height="20"><use href="#socials-vk"></use></svg>
            ВКонтакте
          </a>
        </li>
        <li>
          <a href="mailto:buy-tribute@yandex.ru" style="display: flex; align-items: center; gap: 8px; color: var(--link-color); text-decoration: none; font-size: 0.9rem;">
            <svg width="20" height="20"><use href="#copy"></use></svg>
            Email: buy-tribute@yandex.ru
          </a>
        </li>
      </ul>
      <p style="margin-top: 12px; font-size: 0.85rem; color: var(--text-tertiary);">
        При обращении укажите номер заказа: <strong>#${order.id}</strong>
      </p>
    </div>
  `;

  if (window.mobileModal && window.mobileModal.show) {
    window.mobileModal.show({
      type: 'content',
      title: 'Связаться с поддержкой',
      content: contentHTML
    });
  } else {
    showModal(contentHTML, 'info');
  }
}

/**
 * Handle reorder: add non-certificate items from order to cart
 */
export async function handleReorder(order) {
  const items = order.items || [];
  const reorderItems = items.filter(i => !i.is_certificate && !i.is_redemption && !i.deleted_by_admin);

  if (reorderItems.length === 0) {
    await showModal('В этом заказе нет товаров для повторного заказа.', 'info');
    return;
  }

  let addedCount = 0;

  for (const item of reorderItems) {
    const property = item.property || '';
    const key = `${item.product_id}_${property}`;

    let imageUrl = '';
    const posterUrl = item.custom_url || (item.variation_num && item.variation_num.startsWith('http') ? item.variation_num : null);
    if (posterUrl) {
      imageUrl = addImageSize(posterUrl, '480x0');
    } else {
      imageUrl = addImageSize(item.image || '/placeholder.png', '480x0');
    }

    if (window.cart[key]) {
      window.cart[key].quantity += item.quantity;
    } else {
      window.cart[key] = {
        productId: item.product_id,
        title: item.title,
        property,
        quantity: item.quantity,
        triptych: item.triptych || false,
        image: imageUrl,
        checked: true,
        addedAt: Date.now(),
        unitPrice: item.price_at_purchase || 0
      };
    }
    addedCount++;
  }

  try {
    localStorage.setItem('tributeCart', JSON.stringify(window.cart));
    window.dispatchEvent(new Event('cartUpdated'));
  } catch (e) {
    console.error('Error saving cart:', e);
  }

  if (typeof window.showToast === 'function') {
    window.showToast(`Добавлено в <a href="/cart">корзину</a>: ${addedCount} шт.`, 'success', 3000, true);
  }

  // Navigate to cart
  setTimeout(() => {
    window.location.href = '/cart';
  }, 800);
}

