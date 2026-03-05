import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import { ArticleCard } from '@/components/article/ArticleCard';
import Link from 'next/link';
import styles from '@/styles/pages/author.module.css';

interface AuthorPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}

async function getAuthor(id: number) {
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      displayName: true,
      avatarUrl: true,
      role: true,
      createdAt: true,
    },
  });
}

export async function generateMetadata({ params }: AuthorPageProps): Promise<Metadata> {
  const { id } = await params;
  const author = await getAuthor(parseInt(id));
  if (!author) return { title: 'Автор не найден' };

  return {
    title: `${author.displayName || 'Автор'} — CineFiles`,
    description: `Статьи автора ${author.displayName || ''}`,
  };
}

export default async function AuthorPage({ params, searchParams }: AuthorPageProps) {
  const { id } = await params;
  const { page: pageStr } = await searchParams;
  const authorId = parseInt(id);
  const page = Math.max(1, parseInt(pageStr || '1'));
  const limit = 20;

  const author = await getAuthor(authorId);
  if (!author) notFound();

  const [articles, total] = await Promise.all([
    prisma.article.findMany({
      where: { authorId, status: 'published' },
      include: {
        category: true,
        author: { select: { id: true, displayName: true, avatarUrl: true } },
        tags: { include: { tag: true } },
      },
      orderBy: { publishedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.article.count({ where: { authorId, status: 'published' } }),
  ]);

  const totalPages = Math.ceil(total / limit);
  const memberSince = new Intl.DateTimeFormat('ru-RU', {
    month: 'long',
    year: 'numeric',
  }).format(author.createdAt);

  return (
    <div className="container" style={{ paddingTop: 32, paddingBottom: 60 }}>
      <div className={styles.profile}>
        {author.avatarUrl ? (
          <img src={author.avatarUrl} alt="" className={styles.avatar} />
        ) : (
          <div className={styles.avatarPlaceholder}>
            {(author.displayName || '?')[0].toUpperCase()}
          </div>
        )}
        <div>
          <h1 className={styles.name}>{author.displayName || `Автор #${author.id}`}</h1>
          <p className={styles.meta}>
            {author.role === 'admin' ? 'Администратор' : author.role === 'editor' ? 'Редактор' : 'Автор'}
            {' · '}на сайте с {memberSince}
          </p>
          <p className={styles.stats}>{total} {total === 1 ? 'статья' : total < 5 ? 'статьи' : 'статей'}</p>
        </div>
      </div>

      {articles.length === 0 ? (
        <p className={styles.empty}>Пока нет опубликованных статей</p>
      ) : (
        <>
          <div className={styles.grid}>
            {articles.map((article) => (
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
                <Link href={`/author/${authorId}?page=${page - 1}`} className={styles.pageLink}>Назад</Link>
              )}
              <span className={styles.pageInfo}>Страница {page} из {totalPages}</span>
              {page < totalPages && (
                <Link href={`/author/${authorId}?page=${page + 1}`} className={styles.pageLink}>Далее</Link>
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
