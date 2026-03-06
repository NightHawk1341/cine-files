// ============================================================
// ORDER PAGE - Constants, Mappings & Utility Functions
// ============================================================

import { formatNumberRussian, addImageSize } from '../../core/formatters.js';
export { formatNumberRussian, addImageSize };

/**
 * Show styled alert modal using mobile-modal module
 * @param {string} message - Message to display
 * @param {string} type - Type: 'info', 'success', 'error', 'warning'
 */
export const showModal = (message, type = 'info') => {
  if (!window.mobileModal || !window.mobileModal.alert) {
    alert(message);
    return Promise.resolve();
  }
  return window.mobileModal.alert(message, {
    title: 'Уведомление',
    buttonText: 'OK',
    style: type === 'error' ? 'danger' : 'primary'
  });
};

/**
 * Show styled confirm modal using mobile-modal module
 */
export const showConfirm = (message, options = {}) => {
  const {
    confirmText = 'Да',
    cancelText = 'Отмена'
  } = options;

  if (!window.mobileModal || !window.mobileModal.confirm) {
    return Promise.resolve(confirm(message));
  }

  return window.mobileModal.confirm({
    title: 'Подтверждение',
    message,
    confirmText,
    cancelText,
    confirmStyle: 'primary'
  });
};

/**
 * Show styled prompt modal using mobile-modal module
 */
export const showPrompt = (message, options = {}) => {
  const {
    placeholder = '',
    defaultValue = '',
    confirmText = 'OK',
    cancelText = 'Отмена'
  } = options;

  if (!window.mobileModal || !window.mobileModal.prompt) {
    return Promise.resolve(prompt(message, defaultValue));
  }

  return window.mobileModal.prompt(message, {
    title: 'Введите данные',
    placeholder,
    defaultValue,
    confirmText,
    cancelText
  });
};

/**
 * Format date in Russian locale
 */
export const formatDate = (dateString) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

/**
 * Detect tracking provider from delivery_type or tracking number format
 */
export const detectTrackingProvider = (deliveryType, trackingNumber) => {
  // First check delivery_type
  if (deliveryType) {
    if (deliveryType.startsWith('cdek')) return 'cdek';
    if (deliveryType.startsWith('pochta') || deliveryType === 'courier_ems') return 'pochta';
  }

  // Fall back to tracking number pattern detection
  if (!trackingNumber) return null;

  const cleaned = trackingNumber.trim().toUpperCase();

  // Pochta patterns: 14 digits, 13 digits, S10 format (2 letters + 9 digits + 2 letters)
  if (/^[0-9]{14}$/.test(cleaned) ||
      /^[0-9]{13}$/.test(cleaned) ||
      /^[A-Z]{2}[0-9]{9}[A-Z]{2}$/.test(cleaned)) {
    return 'pochta';
  }

  // CDEK patterns: 10 digits, alphanumeric 8-12 chars
  if (/^[0-9]{10}$/.test(cleaned) ||
      /^[A-Z0-9]{8,12}$/.test(cleaned)) {
    return 'cdek';
  }

  return null;
};

/**
 * Get tracking URL for provider
 */
export const getTrackingUrlForProvider = (provider, trackingNumber) => {
  if (!trackingNumber) return null;

  switch (provider) {
    case 'pochta':
      return `https://www.pochta.ru/tracking#${trackingNumber}`;
    case 'cdek':
      return `https://www.cdek.ru/ru/tracking?order_id=${trackingNumber}`;
    default:
      return null;
  }
};

// ============================================================
// ORDER STATUS MAPPING
// ============================================================

// User-facing status names — derived from STATUS_DISPLAY_NAMES_USER in server/utils/order-constants.js.
// If server constants change, update this map to match.
export const STATUS_NAMES = {
  // Current statuses
  'awaiting_calculation': 'Ожидает расчёт',
  'awaiting_payment': 'Ожидает оплаты',
  'paid': 'Оплачен',
  'awaiting_certificate': 'Ожидает сертификат',
  'shipped': 'В пути',
  'delivered': 'Доставлен',
  'on_hold': 'Требуется связь с поддержкой',
  'refund_requested': 'Запрос возврата',
  'refunded': 'Возвращён',
  'cancelled': 'Отменён',
  // Legacy statuses (for backwards compatibility)
  'created': 'Оформлен',
  'confirmed': 'Подтверждён',
  'new': 'Оформлен',
  'evaluation': 'Рассчитывается доставка',
  'reviewed': 'Ожидает подтверждения',
  'accepted': 'Ожидает оплаты',
  'in_work': 'Готовится',
  'parcel_pending': 'Готовится к отправке',
  'parcel_ready': 'Передан в службу доставки',
  'suggested': 'Предложен'
};

export const DELIVERY_TYPE_NAMES = {
  'pochta': 'До отделения Почты России',
  'pochta_standard': 'До отделения Почты России',
  'pochta_courier': 'Курьером EMS (Почты России)',
  'pochta_first_class': 'До отделения Почты России (1-й класс)',
  'courier_ems': 'Курьером EMS (Почты России)',
  'international': 'Международная доставка',
  'cdek_pvz': 'До пункта выдачи CDEK',
  'cdek_pvz_express': 'До пункта выдачи CDEK (экспресс)',
  'cdek_courier': 'Курьером CDEK',
  'pickup': 'Самовывоз',
  'pdf': 'Изображение сертификата'
};

// Delivery types available for user selection
export const USER_DELIVERY_TYPES = [
  { value: 'pochta', label: 'Почта России' },
  { value: 'pochta_first_class', label: 'До отделения Почты - 1 класс' },
  { value: 'cdek_pvz', label: 'До ПВЗ CDEK' },
  { value: 'cdek_courier', label: 'Курьером CDEK' }
];

// Mirrors server/utils/order-constants.js — keep in sync
export const REVIEW_ALLOWED_STATUSES = ['shipped', 'delivered'];
const REFUND_ALLOWED_STATUSES = ['paid', 'awaiting_certificate', 'shipped', 'delivered'];

// Legacy → new status mapping (subset of server STATUS_MIGRATION)
const STATUS_MIGRATION = {
  'created': 'awaiting_calculation',
  'confirmed': 'paid',
  'new': 'awaiting_calculation',
  'evaluation': 'awaiting_calculation',
  'reviewed': 'awaiting_calculation',
  'accepted': 'awaiting_payment',
  'in_work': 'paid',
  'parcel_pending': 'paid',
  'parcel_ready': 'paid',
  'suggested': 'awaiting_calculation'
};

const VALID_STATUSES = [
  'awaiting_calculation', 'awaiting_payment', 'paid', 'awaiting_certificate',
  'shipped', 'delivered', 'on_hold', 'refund_requested',
  'refunded', 'cancelled'
];

/**
 * Map legacy status to its modern equivalent.
 * Returns the status unchanged if it's already a current status.
 */
export function getMigratedStatus(status) {
  if (VALID_STATUSES.includes(status)) return status;
  return STATUS_MIGRATION[status] || status;
}

// ============================================================
// PRODUCT FORMAT OPTIONS
// ============================================================

export const FORMAT_OPTIONS = [
  { value: 'A3 без рамки', label: 'A3 без рамки', dimensions: '29,7 × 42,0 см' },
  { value: 'A2 без рамки', label: 'A2 без рамки', dimensions: '42,0 × 59,4 см' },
  { value: 'A1 без рамки', label: 'A1 без рамки', dimensions: '59,4 × 84,1 см' },
  { value: 'A3 в рамке', label: 'A3 в рамке', dimensions: '29,7 × 42,0 см' },
  { value: 'A2 в рамке', label: 'A2 в рамке', dimensions: '42,0 × 59,4 см' }
];

// ============================================================
// STATUS HELPER FUNCTIONS
// ============================================================

/**
 * Helper function to check if order is ready for payment
 */
export function isPaymentStatus(status) {
  return getMigratedStatus(status) === 'awaiting_payment';
}

/**
 * Helper function to check if refund can be requested
 */
export function isRefundableStatus(status) {
  return REFUND_ALLOWED_STATUSES.includes(getMigratedStatus(status));
}

/**
 * Check if delivery type is courier-based
 */
export function isCourierDelivery(deliveryType) {
  return deliveryType === 'cdek_courier' || deliveryType === 'pochta_courier' || deliveryType === 'courier_ems';
}
