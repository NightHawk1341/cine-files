// ============================================================
// PROFILE UTILITIES
// Shared helper functions used across profile sub-modules
// ============================================================

import { confirm as confirmModal } from '../../modules/mobile-modal.js';
import { formatNumberRussian, addImageSize } from '../../core/formatters.js';
export { formatNumberRussian, addImageSize };

/**
 * Shows toast notification using global toast module
 */
export const showToast = (message, type = 'success') => {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
  }
};

/**
 * Shows confirmation dialog using unified mobile modal
 */
export const showConfirmation = async (title, text, onConfirm) => {
  // Use danger style for delete confirmations
  const isDanger = title.toLowerCase().includes('удалить');
  const confirmed = await confirmModal({
    title,
    message: text,
    confirmText: isDanger ? 'Удалить' : 'Подтвердить',
    cancelText: 'Отмена',
    confirmStyle: isDanger ? 'danger' : 'primary'
  });

  if (confirmed && onConfirm) {
    onConfirm();
  }
};
