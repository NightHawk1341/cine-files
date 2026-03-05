import Link from 'next/link';
import styles from '@/styles/components/article-card.module.css';

interface ArticleCardProps {
  slug: string;
  categorySlug: string;
  title: string;
  lead?: string | null;
  coverImageUrl?: string | null;
  coverImageAlt?: string | null;
  publishedAt?: string | null;
  authorName?: string | null;
  viewCount?: number;
  commentCount?: number;
  tags?: Array<{ slug: string; nameRu: string }>;
}

export function ArticleCard({
  slug,
  categorySlug,
  title,
  lead,
  coverImageUrl,
  coverImageAlt,
  publishedAt,
  authorName,
  viewCount,
  commentCount,
  tags,
}: ArticleCardProps) {
  const href = `/${categorySlug}/${slug}`;
  const formattedDate = publishedAt
    ? new Intl.DateTimeFormat('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date(publishedAt))
    : null;

  return (
    <article className={styles.card}>
      <Link href={href} className={styles.link}>
        {coverImageUrl && (
          <div className={styles.imageWrapper}>
            <img
              src={coverImageUrl}
              alt={coverImageAlt || title}
              className={styles.image}
              loading="lazy"
            />
          </div>
        )}
        <div className={styles.content}>
          <h3 className={styles.title}>{title}</h3>
          {lead && <p className={styles.lead}>{lead}</p>}
          <div className={styles.meta}>
            {authorName && <span className={styles.author}>{authorName}</span>}
            {formattedDate && <time className={styles.date}>{formattedDate}</time>}
            {typeof viewCount === 'number' && viewCount > 0 && (
              <span className={styles.stat}>{viewCount} просм.</span>
            )}
            {typeof commentCount === 'number' && commentCount > 0 && (
              <span className={styles.stat}>{commentCount} комм.</span>
            )}
          </div>
        </div>
      </Link>
      {tags && tags.length > 0 && (
        <div className={styles.tags}>
          {tags.slice(0, 3).map((tag) => (
            <Link key={tag.slug} href={`/tag/${tag.slug}`} className={styles.tag}>
              {tag.nameRu}
            </Link>
          ))}
        </div>
      )}
    </article>
  );
}
