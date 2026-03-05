import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import { ArticleCard } from '@/components/article/ArticleCard';
import styles from '@/styles/pages/collections.module.css';

interface CollectionPageProps {
  params: Promise<{ slug: string }>;
}

async function getCollection(slug: string) {
  return prisma.collection.findUnique({
    where: { slug },
    include: {
      articles: {
        orderBy: { sortOrder: 'asc' },
        include: {
          article: {
            include: {
              category: true,
              author: { select: { id: true, displayName: true, avatarUrl: true } },
              tags: { include: { tag: true } },
            },
          },
        },
      },
    },
  });
}

export async function generateMetadata({ params }: CollectionPageProps): Promise<Metadata> {
  const { slug } = await params;
  const collection = await getCollection(slug);
  if (!collection) return { title: 'Подборка не найдена' };

  return {
    title: `${collection.title} — CineFiles`,
    description: collection.description || `Подборка: ${collection.title}`,
    openGraph: {
      title: collection.title,
      description: collection.description || undefined,
      images: collection.coverImageUrl ? [collection.coverImageUrl] : undefined,
    },
  };
}

export default async function CollectionPage({ params }: CollectionPageProps) {
  const { slug } = await params;
  const collection = await getCollection(slug);
  if (!collection) notFound();

  const publishedArticles = collection.articles.filter((ca) => ca.article.status === 'published');

  return (
    <div className="container" style={{ paddingTop: 32, paddingBottom: 60 }}>
      {collection.coverImageUrl && (
        <div className={styles.collectionCover}>
          <img src={collection.coverImageUrl} alt={collection.title} className={styles.collectionCoverImage} />
        </div>
      )}

      <h1 className={styles.pageTitle}>{collection.title}</h1>
      {collection.description && (
        <p className={styles.collectionDesc}>{collection.description}</p>
      )}

      {publishedArticles.length === 0 ? (
        <p className={styles.empty}>В этой подборке пока нет статей</p>
      ) : (
        <div className={styles.grid}>
          {publishedArticles.map(({ article }) => (
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
      )}
    </div>
  );
}
