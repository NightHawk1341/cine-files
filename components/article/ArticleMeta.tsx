import Link from 'next/link';
import styles from '@/styles/components/article-meta.module.css';

interface ArticleMetaProps {
  categorySlug: string;
  categoryName: string;
  title: string;
  subtitle?: string | null;
  authorName?: string | null;
  authorId?: number;
  publishedAt?: string | null;
  updatedAt?: string | null;
  viewCount?: number;
  commentCount?: number;
}

export function ArticleMeta({
  categorySlug,
  categoryName,
  title,
  subtitle,
  authorName,
  authorId,
  publishedAt,
  updatedAt,
  viewCount,
  commentCount,
}: ArticleMetaProps) {
  const formatDate = (date: string) =>
    new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(date));

  return (
    <header className={styles.header}>
      <Link href={`/${categorySlug}`} className={styles.category}>
        {categoryName}
      </Link>
      <h1 className={styles.title}>{title}</h1>
      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      <div className={styles.meta}>
        {authorName && authorId && (
          <Link href={`/author/${authorId}`} className={styles.author}>
            {authorName}
          </Link>
        )}
        {publishedAt && (
          <time className={styles.date} dateTime={publishedAt}>
            {formatDate(publishedAt)}
          </time>
        )}
        {updatedAt && updatedAt !== publishedAt && (
          <span className={styles.updated}>
            (обновлено {formatDate(updatedAt)})
          </span>
        )}
        {typeof viewCount === 'number' && viewCount > 0 && (
          <span className={styles.stat}>{viewCount} просм.</span>
        )}
        {typeof commentCount === 'number' && commentCount > 0 && (
          <span className={styles.stat}>{commentCount} комм.</span>
        )}
      </div>
    </header>
  );
}
