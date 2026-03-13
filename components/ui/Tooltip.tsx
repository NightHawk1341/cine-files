'use client';

import type { ReactNode } from 'react';
import styles from '@/styles/components/ui/tooltip.module.css';

interface TooltipProps {
  text: string;
  children: ReactNode;
}

export function Tooltip({ text, children }: TooltipProps) {
  return (
    <span className={styles.wrapper}>
      {children}
      <span className={styles.tooltip} role="tooltip">{text}</span>
    </span>
  );
}
