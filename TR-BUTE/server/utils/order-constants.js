/**
 * Order-related Constants
 * Centralized location for all order business rules and valid values
 *
 * Updated Order Flow (2024-12-20):
 * - Simplified from 15 to 10 statuses
 * - Added color coding for statuses
 * - Added batch management for shipments
 */

/**
 * Valid order statuses (10 statuses)
 * @type {string[]}
 */
const VALID_STATUSES = [
  'awaiting_calculation',
  'awaiting_payment',
  'paid',
  'awaiting_certificate',
  'shipped',
  'delivered',
  'on_hold',
  'refund_requested',
  'refunded',
  'cancelled'
];

/**
 * Legacy statuses for backwards compatibility during migration
 * @type {string[]}
 */
const LEGACY_STATUSES = [
  'created',
  'confirmed',
  'new',
  'evaluation',
  'reviewed',
  'accepted',
  'in_work',
  'parcel_pending',
  'parcel_ready',
  'suggested'
];

/**
 * All valid statuses (new + legacy for transition period)
 * @type {string[]}
 */
const ALL_VALID_STATUSES = [...VALID_STATUSES, ...LEGACY_STATUSES];

/**
 * Status migration mapping (old -> new)
 * @type {Object.<string, string>}
 */
const STATUS_MIGRATION = {
  'created': 'awaiting_calculation',
  'confirmed': 'paid',
  'new': 'awaiting_calculation',
  'evaluation': 'awaiting_calculation',
  'reviewed': 'awaiting_calculation',
  'accepted': 'awaiting_payment',
  'paid': 'paid',
  'on_hold': 'on_hold',
  'cancelled': 'cancelled',
  'refunded': 'refunded',
  'refund_requested': 'refund_requested',
  'in_work': 'paid',
  'parcel_pending': 'paid',
  'parcel_ready': 'paid',
  'shipped': 'shipped',
  'delivered': 'delivered',
  'suggested': 'awaiting_calculation'
};

/**
 * Valid delivery types
 * @type {string[]}
 */
const VALID_DELIVERY_TYPES = [
  'pochta',
  'pochta_standard',
  'pochta_courier',
  'pochta_first_class',
  'courier_ems',
  'international',
  'cdek_pvz',
  'cdek_pvz_express',
  'cdek_courier',
  'pickup'
];

/**
 * Status display names for admin (Russian)
 * @type {Object.<string, string>}
 */
const STATUS_DISPLAY_NAMES = {
  awaiting_calculation: 'Ожидает расчёт',
  awaiting_payment: 'Ожидает оплаты',
  paid: 'Оплачен',
  awaiting_certificate: 'Ожидает сертификат',
  shipped: 'Отправлен',
  delivered: 'Доставлен',
  on_hold: 'В ожидании',
  refund_requested: 'Запрос возврата',
  refunded: 'Возвращён',
  cancelled: 'Отменён',
  // Legacy status display names (for transition)
  created: 'Ожидает расчёт (устар.)',
  confirmed: 'Подтверждён (устар.)',
  new: 'Новый (устар.)',
  evaluation: 'На оценке (устар.)',
  reviewed: 'Проверен (устар.)',
  accepted: 'Ожидает оплаты (устар.)',
  in_work: 'В работе (устар.)',
  parcel_pending: 'Готовится к отправке (устар.)',
  parcel_ready: 'Передан в доставку (устар.)',
  suggested: 'Предложен (устар.)'
};

/**
 * Status display names for users (may differ from admin view)
 * @type {Object.<string, string>}
 */
const STATUS_DISPLAY_NAMES_USER = {
  awaiting_calculation: 'Ожидает расчёт',
  awaiting_payment: 'Ожидает оплаты',
  paid: 'Оплачен',
  awaiting_certificate: 'Ожидает сертификат',
  shipped: 'В пути',
  delivered: 'Доставлен',
  on_hold: 'Требуется связь с поддержкой',
  refund_requested: 'Запрос возврата',
  refunded: 'Возвращён',
  cancelled: 'Отменён',
  // Legacy status display names (for transition)
  created: 'Оформлен',
  confirmed: 'Подтверждён',
  new: 'Оформлен',
  evaluation: 'Рассчитывается доставка',
  reviewed: 'Ожидает подтверждения',
  accepted: 'Ожидает оплаты',
  in_work: 'Готовится',
  parcel_pending: 'Готовится к отправке',
  parcel_ready: 'Передан в службу доставки',
  suggested: 'Предложен'
};

/**
 * Status colors (CSS)
 * @type {Object.<string, {bg: string, text: string}>}
 */
const STATUS_COLORS = {
  awaiting_calculation: { bg: '#FFC107', text: '#000000' }, // Yellow
  awaiting_payment: { bg: '#FF9800', text: '#FFFFFF' },     // Orange
  paid: { bg: '#81C784', text: '#000000' },                 // Light Green
  awaiting_certificate: { bg: '#64B5F6', text: '#000000' }, // Light Blue
  shipped: { bg: '#2196F3', text: '#FFFFFF' },              // Blue
  delivered: { bg: '#4CAF50', text: '#FFFFFF' },            // Green
  on_hold: { bg: '#9E9E9E', text: '#FFFFFF' },              // Grey
  refund_requested: { bg: '#CE93D8', text: '#000000' },     // Purple
  refunded: { bg: '#9C27B0', text: '#FFFFFF' },             // Saturated Purple
  cancelled: { bg: '#F44336', text: '#FFFFFF' },            // Red
  // Legacy statuses use their new equivalent colors
  created: { bg: '#FFC107', text: '#000000' },
  confirmed: { bg: '#64B5F6', text: '#000000' },
  new: { bg: '#FFC107', text: '#000000' },
  evaluation: { bg: '#FFC107', text: '#000000' },
  reviewed: { bg: '#FFC107', text: '#000000' },
  accepted: { bg: '#FF9800', text: '#FFFFFF' },
  in_work: { bg: '#81C784', text: '#000000' },
  parcel_pending: { bg: '#81C784', text: '#000000' },
  parcel_ready: { bg: '#81C784', text: '#000000' },
  suggested: { bg: '#FFC107', text: '#000000' }
};

/**
 * Batch status values (internal, admin only)
 * @type {string[]}
 */
const BATCH_STATUSES = ['ready', 'not_ready'];

/**
 * Statuses where reviews can be left
 * @type {string[]}
 */
const REVIEW_ALLOWED_STATUSES = ['shipped', 'delivered'];

/**
 * Statuses where user can request refund
 * @type {string[]}
 */
const REFUND_ALLOWED_STATUSES = ['paid', 'awaiting_certificate', 'shipped', 'delivered'];

/**
 * Status groups for UI organization
 * @type {Object}
 */
const STATUS_GROUPS = {
  awaiting_delivery_calc: ['awaiting_calculation'],
  awaiting_action: ['awaiting_payment'],
  successful: ['paid', 'delivered'],
  processing: ['awaiting_certificate'],
  in_progress: ['shipped'],
  attention_required: ['on_hold'],
  refund: ['refund_requested', 'refunded'],
  negative: ['cancelled']
};

/**
 * Allowed status transitions (automatic)
 * @type {Object.<string, string[]>}
 */
const STATUS_TRANSITIONS = {
  awaiting_calculation: ['awaiting_payment', 'cancelled'],
  awaiting_payment: ['paid', 'cancelled'],
  paid: ['awaiting_certificate', 'shipped', 'on_hold', 'refund_requested'],
  awaiting_certificate: ['paid', 'delivered', 'on_hold', 'refund_requested'],
  shipped: ['delivered', 'on_hold', 'refund_requested'],
  delivered: ['refund_requested'],
  refund_requested: ['refunded', 'on_hold'],
  on_hold: VALID_STATUSES, // Admin can transition to any status from on_hold
  refunded: [],
  cancelled: []
};

/**
 * Delivery type display names (Russian)
 * @type {Object.<string, string>}
 */
const DELIVERY_TYPE_DISPLAY_NAMES = {
  pochta: 'Почта России',
  pochta_standard: 'До отделения Почты',
  pochta_courier: 'Курьером Почты',
  pochta_first_class: 'До отделения Почты - 1 класс',
  courier_ems: 'Курьером EMS',
  international: 'Международная доставка',
  cdek_pvz: 'До ПВЗ CDEK',
  cdek_pvz_express: 'До ПВЗ CDEK - Экспресс',
  cdek_courier: 'Курьером CDEK',
  pickup: 'Самовывоз'
};

/**
 * Delivery type labels for fiscal receipts (T-Bank 54-ФЗ)
 * Full human-readable strings used as the delivery line item name.
 * @type {Object.<string, string>}
 */
const RECEIPT_DELIVERY_NAMES = {
  pochta_standard: 'Доставка до отделения Почты России',
  pochta_courier: 'Доставка курьером EMS',
  pochta_first_class: 'Доставка 1-м классом до отделения Почты России',
  cdek_pvz: 'Доставка до ПВЗ СДЭК',
  cdek_pvz_express: 'Экспресс-доставка до ПВЗ СДЭК',
  cdek_courier: 'Доставка курьером СДЭК',
  international: 'Международная доставка Почтой России'
};

/**
 * Delivery providers
 * @type {string[]}
 */
const DELIVERY_PROVIDERS = ['cdek', 'pochta'];

/**
 * Payment providers
 * @type {Object}
 */
const PAYMENT_PROVIDERS = {
  TBANK: 'tbank'
};

/**
 * Shipping providers
 * @type {Object}
 */
const SHIPPING_PROVIDERS = {
  POCHTA: 'pochta',
  CDEK: 'cdek'
};

/**
 * Parcel statuses
 * @type {string[]}
 */
const PARCEL_STATUSES = [
  'pending',
  'approved',
  'created',
  'shipped',
  'delivered',
  'returned'
];

/**
 * Parcel status display names
 * @type {Object.<string, string>}
 */
const PARCEL_STATUS_DISPLAY_NAMES = {
  pending: 'Ожидает подтверждения',
  approved: 'Подтверждён',
  created: 'Создан в службе доставки',
  shipped: 'Отправлен',
  delivered: 'Доставлен',
  returned: 'Возвращён'
};

/**
 * Order edit types for history tracking
 * @type {string[]}
 */
const ORDER_EDIT_TYPES = [
  'item_added',
  'item_removed',
  'item_modified',
  'quantity_changed',
  'address_changed',
  'delivery_changed',
  'status_changed'
];

/**
 * Helper function to get migrated status
 * @param {string} status - Original status
 * @returns {string} - Migrated status (same if already new, or mapped if legacy)
 */
function getMigratedStatus(status) {
  if (VALID_STATUSES.includes(status)) {
    return status;
  }
  return STATUS_MIGRATION[status] || status;
}

/**
 * Helper function to check if user can leave review
 * @param {string} status - Order status
 * @returns {boolean}
 */
function canLeaveReview(status) {
  const migratedStatus = getMigratedStatus(status);
  return REVIEW_ALLOWED_STATUSES.includes(migratedStatus);
}

/**
 * Helper function to check if user can request refund
 * @param {string} status - Order status
 * @returns {boolean}
 */
function canRequestRefund(status) {
  const migratedStatus = getMigratedStatus(status);
  return REFUND_ALLOWED_STATUSES.includes(migratedStatus);
}

module.exports = {
  VALID_STATUSES,
  LEGACY_STATUSES,
  ALL_VALID_STATUSES,
  STATUS_MIGRATION,
  VALID_DELIVERY_TYPES,
  STATUS_DISPLAY_NAMES,
  STATUS_DISPLAY_NAMES_USER,
  STATUS_COLORS,
  BATCH_STATUSES,
  REVIEW_ALLOWED_STATUSES,
  REFUND_ALLOWED_STATUSES,
  STATUS_GROUPS,
  STATUS_TRANSITIONS,
  DELIVERY_TYPE_DISPLAY_NAMES,
  RECEIPT_DELIVERY_NAMES,
  DELIVERY_PROVIDERS,
  PAYMENT_PROVIDERS,
  SHIPPING_PROVIDERS,
  PARCEL_STATUSES,
  PARCEL_STATUS_DISPLAY_NAMES,
  ORDER_EDIT_TYPES,
  getMigratedStatus,
  canLeaveReview,
  canRequestRefund
};
