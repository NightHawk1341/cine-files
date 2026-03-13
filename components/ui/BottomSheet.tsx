'use client';

import { useEffect, useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import styles from '@/styles/components/ui/bottom-sheet.module.css';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  const [leaving, setLeaving] = useState(false);

  const handleClose = useCallback(() => {
    setLeaving(true);
    setTimeout(() => {
      setLeaving(false);
      onClose();
    }, 200);
  }, [onClose]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') handleClose();
  }, [handleClose]);

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    document.body.classList.add('sheet-open');
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.classList.remove('sheet-open');
    };
  }, [open, handleKeyDown]);

  if (!open && !leaving) return null;

  return (
    <>
      <div className={styles.overlay} onClick={handleClose} />
      <div
        className={`${styles.sheet}${leaving ? ` ${styles.leaving}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className={styles.handle} />
        {title && (
          <div className={styles.header}>
            <span className={styles.headerTitle}>{title}</span>
            <button className={styles.closeButton} onClick={handleClose} aria-label="Close">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        <div className={styles.body}>{children}</div>
      </div>
    </>
  );
}
