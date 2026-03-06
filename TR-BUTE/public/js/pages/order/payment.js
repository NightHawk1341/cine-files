// ============================================================
// ORDER PAGE - Payment System
// T-Bank iframe, SpeedPay, polling, email collection
// ============================================================

import { getAccessToken } from '../../core/auth.js';
import { formatNumberRussian, showModal, showPrompt } from './constants.js';
import { isVKMiniApp, vkOpenLink } from '../../core/vk-miniapp.js';

// Active SpeedPay polling interval — kept at module scope to avoid stacking
// when the user clicks multiple payment buttons before a payment completes.
let _speedpayPollInterval = null;

/**
 * Check if user needs to provide email for payment
 */
export async function checkAndCollectEmail() {
  try {
    const token = getAccessToken();
    const response = await fetch('/api/user/profile', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) return null;

    const data = await response.json();
    const user = data.user;

    if (!user) {
      console.log('[payment] User profile not available, proceeding without email check');
      return null;
    }

    // Use payment_email if available, otherwise fall back to account email
    const existingEmail = user.payment_email || user.email || '';

    // Always prompt so the user can confirm or update the receipt email
    const email = await showPrompt(
      'Укажите email для получения чека:\n(Это требование закона 54-ФЗ)',
      {
        placeholder: 'your@email.com',
        defaultValue: existingEmail,
        inputType: 'email',
        confirmText: 'Продолжить'
      }
    );

    if (!email || !email.includes('@')) {
      throw new Error('Необходимо указать корректный email адрес');
    }

    // Save if changed or not yet stored as payment_email
    if (email !== user.payment_email) {
      console.log('[payment] Saving payment email:', email);

      const updateResponse = await fetch('/api/user/update-email', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email })
      });

      if (!updateResponse.ok) {
        const errorData = await updateResponse.json().catch(() => ({}));
        console.error('[payment] Failed to save email:', errorData);
        throw new Error(errorData.error || 'Не удалось сохранить email');
      }

      console.log('[payment] Payment email saved successfully');
    }

    return email;
  } catch (error) {
    console.error('Error checking email:', error);
    throw error;
  }
}

/**
 * Handle payment button click
 * Creates T-Bank payment link and opens it in a fullscreen iframe overlay
 */
export async function handlePayment(order) {
  try {
    // Show loading state
    const payButton = document.getElementById('order-pay-button');
    if (payButton) {
      payButton.disabled = true;
      payButton.textContent = 'Проверка данных...';
    }

    // Check and collect email if needed
    await checkAndCollectEmail();

    if (payButton) {
      payButton.textContent = 'Создание платежа...';
    }

    const token = getAccessToken();
    const inTelegram = typeof isTelegramBrowser === 'function' && isTelegramBrowser();
    const inVK = isVKMiniApp();

    // Determine context for result page (controls which "return" button appears)
    let context = 'browser';
    if (inTelegram) context = 'telegram';
    else if (inVK) context = 'vk';

    // Create payment via T-Bank Init API
    const response = await fetch('/api/payment/tbank/create-link', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        order_id: order.id,
        context
      })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || data.message || 'Не удалось создать платеж');
    }

    if (!data.data?.paymentUrl) {
      throw new Error('Платежная система не настроена');
    }

    if (inTelegram && window.Telegram?.WebApp?.openLink) {
      window.Telegram.WebApp.openLink(data.data.paymentUrl);
      startPaymentPolling(order);

      const totalAmount = (order.total_price || 0) + (order.delivery_cost || 0) + (order.packaging_cost || 0);
      if (payButton) {
        payButton.disabled = false;
        payButton.textContent = `Оплатить картой ${formatNumberRussian(totalAmount)} ₽`;
      }
    } else if (inVK) {
      // Open in VK's browser; polling detects completion in the background
      await vkOpenLink(data.data.paymentUrl);
      startPaymentPolling(order);

      const totalAmount = (order.total_price || 0) + (order.delivery_cost || 0) + (order.packaging_cost || 0);
      if (payButton) {
        payButton.disabled = false;
        payButton.textContent = `Оплатить картой ${formatNumberRussian(totalAmount)} ₽`;
      }
    } else if (window.matchMedia('(pointer: coarse)').matches) {
      window.location.href = data.data.paymentUrl;
    } else {
      // Desktop: open in new tab to avoid iframe cookie restrictions (SameSite)
      window.open(data.data.paymentUrl, '_blank');
      startPaymentPolling(order);
      const totalAmount = (order.total_price || 0) + (order.delivery_cost || 0) + (order.packaging_cost || 0);
      if (payButton) {
        payButton.disabled = false;
        payButton.textContent = `Оплатить картой ${formatNumberRussian(totalAmount)} ₽`;
      }
    }

  } catch (error) {
    console.error('Error creating payment:', error);

    const payButton = document.getElementById('order-pay-button');
    if (payButton) {
      payButton.disabled = false;
      const totalAmount = (order.total_price || 0) + (order.delivery_cost || 0) + (order.packaging_cost || 0);
      payButton.textContent = `Оплатить ${formatNumberRussian(totalAmount)} ₽`;
    }

    await showModal(
      `Ошибка при создании платежа:\n${error.message}\n\nПожалуйста, попробуйте позже или свяжитесь с поддержкой.`,
      'error'
    );
  }
}

/**
 * Confirm payment via server-side T-Bank GetState API check.
 * Returns true if the order has reached any post-payment status.
 * The webhook may have already advanced the order past 'paid' (e.g. to 'delivered'
 * or 'on_hold' for cert-only orders) by the time the client polls.
 */
export async function confirmPaymentStatus(orderId) {
  const POST_PAYMENT_STATUSES = ['paid', 'confirmed', 'shipped', 'delivered', 'on_hold'];
  try {
    const res = await fetch('/api/payment/tbank/check-status', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getAccessToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ order_id: orderId })
    });
    const data = await res.json();
    return data.success && POST_PAYMENT_STATUSES.includes(data.status);
  } catch (err) {
    return false;
  }
}

/**
 * Open T-Bank payment form as fullscreen iframe overlay.
 */
export function openTBankPayment(paymentData, order) {
  const payButton = document.getElementById('order-pay-button');

  function resetPayButton() {
    if (payButton) {
      payButton.disabled = false;
      const totalAmount = (order.total_price || 0) + (order.delivery_cost || 0) + (order.packaging_cost || 0);
      payButton.textContent = `Оплатить ${formatNumberRussian(totalAmount)} ₽`;
    }
  }

  async function handlePaymentSuccess() {
    await confirmPaymentStatus(order.id);
    showModal('Оплата прошла успешно! Спасибо за заказ.', 'success').then(() => {
      window.location.reload();
    });
  }

  const overlay = document.createElement('div');
  overlay.className = 'tbank-payment-overlay';

  const header = document.createElement('div');
  header.className = 'tbank-payment-header';

  const title = document.createElement('span');
  title.className = 'tbank-payment-title';
  title.textContent = `Оплата заказа #${order.id}`;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'tbank-payment-close';
  closeBtn.innerHTML = '&times;';
  closeBtn.setAttribute('aria-label', 'Закрыть');

  header.appendChild(title);
  header.appendChild(closeBtn);

  const iframe = document.createElement('iframe');
  iframe.src = paymentData.paymentUrl;
  iframe.className = 'tbank-payment-iframe';
  iframe.allow = 'payment';

  overlay.appendChild(header);
  overlay.appendChild(iframe);
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  requestAnimationFrame(() => overlay.classList.add('active'));

  let overlayRemoved = false;
  function cleanupOverlay() {
    if (overlayRemoved) return;
    overlayRemoved = true;
    overlay.classList.remove('active');
    document.body.style.overflow = '';
    setTimeout(() => overlay.remove(), 300);
  }

  function onPaymentMessage(event) {
    if (event.origin !== window.location.origin) return;
    if (event.data?.type !== 'tbank-payment-result') return;

    window.removeEventListener('message', onPaymentMessage);
    clearInterval(pollInterval);

    setTimeout(async () => {
      cleanupOverlay();
      if (event.data.status === 'success') {
        await handlePaymentSuccess();
      } else {
        resetPayButton();
      }
    }, 1500);
  }
  window.addEventListener('message', onPaymentMessage);

  closeBtn.addEventListener('click', async () => {
    window.removeEventListener('message', onPaymentMessage);
    cleanupOverlay();
    clearInterval(pollInterval);

    const paid = await confirmPaymentStatus(order.id);
    if (paid) {
      showModal('Оплата прошла успешно! Спасибо за заказ.', 'success').then(() => {
        window.location.reload();
      });
    } else {
      resetPayButton();
    }
  });

  if (payButton) {
    payButton.textContent = 'Ожидание оплаты...';
    payButton.disabled = true;
  }

  let pollCount = 0;
  const maxPolls = 60;
  const pollInterval = setInterval(async () => {
    pollCount++;
    if (pollCount > maxPolls) {
      clearInterval(pollInterval);
      resetPayButton();
      return;
    }

    try {
      const statusResponse = await fetch(`/api/orders/get-order?id=${order.id}`, {
        headers: { 'Authorization': `Bearer ${getAccessToken()}` }
      });
      const statusData = await statusResponse.json();

      if (statusData.success && statusData.data?.status === 'paid') {
        clearInterval(pollInterval);
        cleanupOverlay();
        showModal('Оплата прошла успешно! Спасибо за заказ.', 'success').then(() => {
          window.location.reload();
        });
      }
    } catch (err) {
      // Silently continue polling
    }
  }, 5000);
}

/**
 * Wait for a global variable to become defined.
 */
function waitForGlobal(name, timeoutMs = 10000) {
  return new Promise(resolve => {
    if (window[name]) return resolve(window[name]);
    const interval = 200;
    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed += interval;
      if (window[name]) {
        clearInterval(timer);
        resolve(window[name]);
      } else if (elapsed >= timeoutMs) {
        clearInterval(timer);
        resolve(null);
      }
    }, interval);
  });
}

/**
 * Initialize T-Bank SpeedPay buttons (SBP, T-Pay, etc.)
 */
export async function initSpeedPay(order) {
  const container = document.getElementById('speedpay-container');
  if (!container) return;

  if (!window.PaymentIntegration) {
    const script = document.createElement('script');
    script.src = 'https://integrationjs.tbank.ru/integration.js';
    document.body.appendChild(script);
  }

  if (!window.__TBANK_TERMINAL_KEY) {
    fetch('/api/config/client')
      .then(r => r.json())
      .then(d => {
        if (d.success && d.config?.tbankTerminalKey) {
          window.__TBANK_TERMINAL_KEY = d.config.tbankTerminalKey;
        }
      })
      .catch(() => {});
  }

  const sdk = await waitForGlobal('PaymentIntegration', 10000);
  if (!sdk) {
    console.log('[speedpay] SDK did not load in time');
    return;
  }

  const terminalKey = await waitForGlobal('__TBANK_TERMINAL_KEY', 5000);
  if (!terminalKey) {
    console.log('[speedpay] No terminal key configured');
    return;
  }

  try {
    const settingsRes = await fetch(
      `https://securepay.tinkoff.ru/platform/api/v1/widget/settings/${encodeURIComponent(terminalKey)}`
    );
    const settings = await settingsRes.json();
    const methods = settings?.payMethods ?? settings?.paymentTypes ?? [];
    console.log('[speedpay] Terminal widget methods:', methods.length ? methods : '(none — check T-Bank terminal settings)');
  } catch (e) {
    console.warn('[speedpay] Could not fetch widget settings:', e.message);
  }

  const onPaymentStart = async (widgetType) => {
    await checkAndCollectEmail();

    const token = getAccessToken();
    const res = await fetch('/api/payment/tbank/create-link', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        order_id: order.id,
        context: 'widget',
        widget_type: widgetType
      })
    });
    const data = await res.json();

    if (!data.success || !data.data?.paymentUrl) {
      throw new Error(data.error || 'Failed to create payment');
    }

    startPaymentPolling(order);
    return data.data.paymentUrl;
  };

  try {
    const integration = await PaymentIntegration.init({
      terminalKey,
      product: 'eacq',
      features: {
        payment: {
          container,
          paymentStartCallback: onPaymentStart,
          config: {
            dialog: {
              closedCallback: () => {
                if (_speedpayPollInterval) {
                  clearInterval(_speedpayPollInterval);
                  _speedpayPollInterval = null;
                }
              }
            }
          }
        }
      }
    });

    container.style.display = '';
    console.log('[speedpay] Widget mounted');

    try {
      if (typeof integration?.payments?.setPaymentStartCallback === 'function') {
        await integration.payments.setPaymentStartCallback(onPaymentStart);
        console.log('[speedpay] setPaymentStartCallback wired');
      }
    } catch (cbErr) {
      console.warn('[speedpay] setPaymentStartCallback unavailable:', cbErr.message);
    }

  } catch (err) {
    console.error('[speedpay] Init error:', err);
    container.style.display = 'none';
  }
}

/**
 * Poll order status after SpeedPay payment is initiated.
 */
export function startPaymentPolling(order) {
  if (_speedpayPollInterval) {
    clearInterval(_speedpayPollInterval);
    _speedpayPollInterval = null;
  }

  let pollCount = 0;
  const maxPolls = 60;
  _speedpayPollInterval = setInterval(async () => {
    pollCount++;
    if (pollCount > maxPolls) {
      clearInterval(_speedpayPollInterval);
      _speedpayPollInterval = null;
      return;
    }

    try {
      const paid = await confirmPaymentStatus(order.id);
      if (paid) {
        clearInterval(_speedpayPollInterval);
        _speedpayPollInterval = null;
        showModal('Оплата прошла успешно! Спасибо за заказ.', 'success').then(() => {
          window.location.reload();
        });
      }
    } catch (err) {
      // Continue polling
    }
  }, 5000);
}
