import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import { ArticleCard } from '@/components/article/ArticleCard';
import styles from '@/styles/pages/category.module.css';
import Link from 'next/link';

interface CategoryPageProps {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { category: slug } = await params;
  const cat = await prisma.category.findUnique({ where: { slug } });
  if (!cat) return { title: 'Категория не найдена' };

  return {
    title: `${cat.nameRu} — CineFiles`,
    description: cat.description || `Статьи в категории ${cat.nameRu}`,
    openGraph: {
      title: `${cat.nameRu} — CineFiles`,
      description: cat.description || undefined,
    },
  };
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const { category: slug } = await params;
  const { page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr || '1'));
  const limit = 20;

  const cat = await prisma.category.findUnique({ where: { slug } });
  if (!cat) notFound();

  const [articles, total] = await Promise.all([
    prisma.article.findMany({
      where: { categoryId: cat.id, status: 'published' },
      include: {
        category: true,
        author: { select: { id: true, displayName: true, avatarUrl: true } },
        tags: { include: { tag: true } },
      },
      orderBy: [{ isPinned: 'desc' }, { publishedAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.article.count({ where: { categoryId: cat.id, status: 'published' } }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="container" style={{ paddingTop: 32 }}>
      <h1 className={styles.title}>{cat.nameRu}</h1>
      {cat.description && <p className={styles.description}>{cat.description}</p>}

      {articles.length === 0 ? (
        <p className={styles.empty}>Пока нет статей в этой категории</p>
      ) : (
        <>
          <div className={styles.grid}>
            {articles.map((article) => (
              <ArticleCard
                key={article.id}
                slug={article.slug}
                categorySlug={cat.slug}
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
                <Link href={`/${slug}?page=${page - 1}`} className={styles.pageLink}>
                  Назад
                </Link>
              )}
              <span className={styles.pageInfo}>
                Страница {page} из {totalPages}
              </span>
              {page < totalPages && (
                <Link href={`/${slug}?page=${page + 1}`} className={styles.pageLink}>
                  Далее
                </Link>
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
