import styles from '@/styles/components/ui/skeleton.module.css';

type SkeletonVariant = 'text' | 'textShort' | 'heading' | 'avatar' | 'thumbnail' | 'block';

interface SkeletonProps {
  variant?: SkeletonVariant;
  width?: string;
  height?: string;
  className?: string;
}

export function Skeleton({ variant = 'text', width, height, className }: SkeletonProps) {
  const variantClass = styles[variant] || '';
  const combinedClass = [styles.skeleton, variantClass, className].filter(Boolean).join(' ');

  return (
    <div
      className={combinedClass}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

interface SkeletonCardProps {
  lines?: number;
  showThumbnail?: boolean;
}

export function SkeletonCard({ lines = 3, showThumbnail = true }: SkeletonCardProps) {
  return (
    <div className={`${styles.skeleton} ${styles.card}`}>
      {showThumbnail && <Skeleton variant="thumbnail" />}
      <div style={{ padding: showThumbnail ? '12px 0 0' : undefined }}>
        <Skeleton variant="heading" />
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton key={i} variant={i === lines - 1 ? 'textShort' : 'text'} />
        ))}
      </div>
    </div>
  );
}

interface SkeletonGridProps {
  count?: number;
  showThumbnail?: boolean;
}

export function SkeletonGrid({ count = 6, showThumbnail = true }: SkeletonGridProps) {
  return (
    <div className={styles.grid}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} showThumbnail={showThumbnail} />
      ))}
    </div>
  );
}

interface SkeletonListProps {
  count?: number;
}

export function SkeletonList({ count = 5 }: SkeletonListProps) {
  return (
    <div>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={styles.row}>
          <Skeleton variant="avatar" />
          <div style={{ flex: 1 }}>
            <Skeleton variant="text" />
            <Skeleton variant="textShort" />
          </div>
        </div>
      ))}
    </div>
  );
}
