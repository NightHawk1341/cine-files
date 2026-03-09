import type { Metadata } from 'next';
import { supabase, camelizeKeys } from '@/lib/db';
import { notFound } from 'next/navigation';
import { ArticleCard } from '@/components/article/ArticleCard';
import styles from '@/styles/pages/collections.module.css';

interface CollectionPageProps {
  params: Promise<{ slug: string }>;
}

interface CollectionData {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  articles: Array<{
    sortOrder: number;
    article: {
      id: number; slug: string; title: string; lead: string | null; status: string;
      coverImageUrl: string | null; coverImageAlt: string | null;
      publishedAt: string | null; viewCount: number; commentCount: number;
      category: { slug: string };
      author: { id: number; displayName: string | null; avatarUrl: string | null };
      tags: Array<{ tag: { slug: string; nameRu: string } }>;
    };
  }>;
}

async function getCollection(slug: string): Promise<CollectionData | null> {
  const { data } = await supabase
    .from('collections')
    .select(`
      *,
      articles:collection_articles(
        sort_order,
        article:articles(
          *,
          category:categories(*),
          author:users!author_id(id, display_name, avatar_url),
          tags:article_tags(*, tag:tags(*))
        )
      )
    `)
    .eq('slug', slug)
    .single();

  if (!data) return null;
  return camelizeKeys<CollectionData>(data);
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
              publishedAt={article.publishedAt}
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
