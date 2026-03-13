'use client';

import { useEffect, useCallback } from 'react';
import styles from '@/styles/components/ui/confirmation-modal.module.css';

type ConfirmVariant = 'danger' | 'warning' | 'success' | 'info';

interface ConfirmationModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  variant?: ConfirmVariant;
  confirmLabel?: string;
  cancelLabel?: string;
}

const VARIANT_ICONS: Record<ConfirmVariant, string> = {
  danger: '!',
  warning: '!',
  success: '\u2713',
  info: 'i',
};

export function ConfirmationModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  variant = 'danger',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
}: ConfirmationModalProps) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, handleKeyDown]);

  if (!open) return null;

  const iconStyle = {
    danger: styles.iconDanger,
    warning: styles.iconWarning,
    success: styles.iconSuccess,
    info: styles.iconInfo,
  }[variant];

  const btnStyle = variant === 'danger' ? styles.btnDanger : styles.btnConfirm;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.modal}
        onClick={e => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
      >
        <div className={`${styles.icon} ${iconStyle}`}>
          {VARIANT_ICONS[variant]}
        </div>
        <div className={styles.title} id="confirm-title">{title}</div>
        <div className={styles.message} id="confirm-message">{message}</div>
        <div className={styles.actions}>
          <button className={`${styles.btn} ${styles.btnCancel}`} onClick={onClose}>
            {cancelLabel}
          </button>
          <button className={`${styles.btn} ${btnStyle}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
