'use client';

import { useState, useEffect, useCallback } from 'react';
import styles from '@/styles/components/ui/image-zoom.module.css';

interface ImageZoomProps {
  images: { src: string; alt?: string }[];
  initialIndex?: number;
  onClose: () => void;
}

export function ImageZoom({ images, initialIndex = 0, onClose }: ImageZoomProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [loaded, setLoaded] = useState(false);
  const hasMultiple = images.length > 1;

  const goNext = useCallback(() => {
    setLoaded(false);
    setCurrentIndex(i => (i + 1) % images.length);
  }, [images.length]);

  const goPrev = useCallback(() => {
    setLoaded(false);
    setCurrentIndex(i => (i - 1 + images.length) % images.length);
  }, [images.length]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowRight' && hasMultiple) goNext();
    if (e.key === 'ArrowLeft' && hasMultiple) goPrev();
  }, [onClose, hasMultiple, goNext, goPrev]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [handleKeyDown]);

  const current = images[currentIndex];

  return (
    <div className={styles.overlay} onClick={onClose}>
      <button className={styles.closeButton} onClick={onClose} aria-label="Close">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>

      {hasMultiple && (
        <button
          className={`${styles.navButton} ${styles.navPrev}`}
          onClick={e => { e.stopPropagation(); goPrev(); }}
          aria-label="Previous"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      )}

      <div className={styles.imageContainer} onClick={e => e.stopPropagation()}>
        {!loaded && <span className={styles.loading}>Loading...</span>}
        <img
          className={styles.image}
          src={current.src}
          alt={current.alt || ''}
          onLoad={() => setLoaded(true)}
          style={{ display: loaded ? 'block' : 'none' }}
          draggable={false}
        />
      </div>

      {hasMultiple && (
        <button
          className={`${styles.navButton} ${styles.navNext}`}
          onClick={e => { e.stopPropagation(); goNext(); }}
          aria-label="Next"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      )}

      {hasMultiple && (
        <div className={styles.indicators}>
          {images.map((_, i) => (
            <button
              key={i}
              className={`${styles.dot}${i === currentIndex ? ` ${styles.dotActive}` : ''}`}
              onClick={e => { e.stopPropagation(); setLoaded(false); setCurrentIndex(i); }}
              aria-label={`Image ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
