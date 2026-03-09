import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import { ArticleCard } from '@/components/article/ArticleCard';
import Link from 'next/link';
import styles from '@/styles/pages/category.module.css';

interface TagPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

async function getTag(slug: string) {
  return prisma.tag.findUnique({
    where: { slug },
    include: {
      tmdbEntity: {
        select: { tmdbId: true, entityType: true, titleRu: true, titleEn: true, metadata: true },
      },
    },
  });
}

export async function generateMetadata({ params }: TagPageProps): Promise<Metadata> {
  const { slug } = await params;
  const tag = await getTag(slug);
  if (!tag) return { title: 'Тег не найден' };

  return {
    title: `${tag.nameRu} — CineFiles`,
    description: `Статьи по теме: ${tag.nameRu}`,
    openGraph: {
      title: `${tag.nameRu} — CineFiles`,
      description: `Статьи по теме: ${tag.nameRu}`,
    },
  };
}

const TAG_TYPE_LABELS: Record<string, string> = {
  movie: 'Фильм',
  tv: 'Сериал',
  person: 'Персона',
  genre: 'Жанр',
  franchise: 'Франшиза',
  studio: 'Студия',
  topic: 'Тема',
  game: 'Игра',
  anime: 'Аниме',
};

export default async function TagPage({ params, searchParams }: TagPageProps) {
  const { slug } = await params;
  const { page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr || '1'));
  const limit = 20;

  const tag = await getTag(slug);
  if (!tag) notFound();

  const [articleTags, total] = await Promise.all([
    prisma.articleTag.findMany({
      where: { tagId: tag.id, article: { status: 'published' } },
      include: {
        article: {
          include: {
            category: true,
            author: { select: { id: true, displayName: true, avatarUrl: true } },
            tags: { include: { tag: true } },
          },
        },
      },
      orderBy: { article: { publishedAt: 'desc' } },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.articleTag.count({
      where: { tagId: tag.id, article: { status: 'published' } },
    }),
  ]);

  const totalPages = Math.ceil(total / limit);
  const tmdb = tag.tmdbEntity;
  const meta = tmdb?.metadata as Record<string, unknown> | null;

  return (
    <div className="container" style={{ paddingTop: 32 }}>
      <div style={{ marginBottom: 24 }}>
        <span style={{ fontSize: 12, color: 'var(--brand-primary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {TAG_TYPE_LABELS[tag.tagType] || tag.tagType}
        </span>
        <h1 className={styles.title}>{tag.nameRu}</h1>
        {tag.nameEn && tag.nameEn !== tag.nameRu && (
          <p style={{ fontSize: 14, color: 'var(--text-tertiary)', marginTop: 4 }}>{tag.nameEn}</p>
        )}
        {typeof meta?.overview === 'string' && meta.overview && (
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginTop: 12, maxWidth: 700, lineHeight: 1.6 }}>
            {meta.overview.slice(0, 300)}
            {meta.overview.length > 300 && '...'}
          </p>
        )}
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 8 }}>
          {total} {total === 1 ? 'статья' : total < 5 ? 'статьи' : 'статей'}
        </p>
      </div>

      {articleTags.length === 0 ? (
        <p className={styles.empty}>Пока нет статей с этим тегом</p>
      ) : (
        <>
          <div className={styles.grid}>
            {articleTags.map(({ article }) => (
              <ArticleCard
                key={article.id}
                slug={article.slug}
                categorySlug={article.category.slug}
                title={article.title}
                lead={article.lead}
                coverImageUrl={article.coverImageUrl}
                coverImageAlt={article.coverImageAlt}
                publishedAt={article.publishedAt?.toISOString()}
                authorName={article.author.displayName}
                viewCount={article.viewCount}
                commentCount={article.commentCount}
                tags={article.tags.map((at) => ({
                  slug: at.tag.slug,
                  nameRu: at.tag.nameRu,
                }))}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <nav className={styles.pagination}>
              {page > 1 && (
                <Link href={`/tag/${slug}?page=${page - 1}`} className={styles.pageLink}>Назад</Link>
              )}
              <span className={styles.pageInfo}>Страница {page} из {totalPages}</span>
              {page < totalPages && (
                <Link href={`/tag/${slug}?page=${page + 1}`} className={styles.pageLink}>Далее</Link>
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
