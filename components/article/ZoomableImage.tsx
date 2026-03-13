'use client';

import { useState } from 'react';
import { ImageZoom } from '@/components/ui/ImageZoom';

interface ZoomableImageProps {
  src: string;
  alt: string;
  className?: string;
}

export function ZoomableImage({ src, alt, className }: ZoomableImageProps) {
  const [zoomed, setZoomed] = useState(false);

  return (
    <>
      <img
        src={src}
        alt={alt}
        className={className}
        loading="lazy"
        onClick={() => setZoomed(true)}
        style={{ cursor: 'zoom-in' }}
      />
      {zoomed && (
        <ImageZoom
          images={[{ src, alt }]}
          onClose={() => setZoomed(false)}
        />
      )}
    </>
  );
}
