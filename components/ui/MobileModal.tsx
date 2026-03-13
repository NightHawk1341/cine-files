'use client';

import { useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import styles from '@/styles/components/ui/mobile-modal.module.css';

interface MobileModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function MobileModal({ open, onClose, title, children, footer }: MobileModalProps) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    document.body.classList.add('sheet-open');
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.classList.remove('sheet-open');
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.modal}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className={styles.handle} />
        {title && (
          <div className={styles.header}>
            <span className={styles.headerTitle}>{title}</span>
            <button className={styles.closeButton} onClick={onClose} aria-label="Close">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        <div className={styles.body}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  );
}

interface ActionItemProps {
  label: string;
  onClick: () => void;
  variant?: 'default' | 'primary' | 'danger';
}

export function MobileModalAction({ label, onClick, variant = 'default' }: ActionItemProps) {
  const className = [
    styles.actionItem,
    variant === 'danger' ? styles.actionItemDanger : '',
    variant === 'primary' ? styles.actionItemPrimary : '',
  ].filter(Boolean).join(' ');

  return (
    <button className={className} onClick={onClick}>{label}</button>
  );
}
