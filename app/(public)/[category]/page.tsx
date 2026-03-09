import type { Metadata } from 'next';
import { supabase, camelizeKeys } from '@/lib/db';
import { notFound } from 'next/navigation';
import { ArticleCard } from '@/components/article/ArticleCard';
import styles from '@/styles/pages/category.module.css';
import Link from 'next/link';

interface CategoryPageProps {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ page?: string }>;
}

interface CategoryRow {
  id: number;
  slug: string;
  nameRu: string;
  description: string | null;
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { category: slug } = await params;
  const { data } = await supabase.from('categories').select('*').eq('slug', slug).single();
  if (!data) return { title: 'Категория не найдена' };
  const cat = camelizeKeys<CategoryRow>(data);

  return {
    title: `${cat.nameRu} — CineFiles`,
    description: cat.description || `Статьи в категории ${cat.nameRu}`,
    openGraph: {
      title: `${cat.nameRu} — CineFiles`,
      description: cat.description || undefined,
    },
  };
}

const ARTICLE_SELECT = `
  *,
  category:categories(*),
  author:users!author_id(id, display_name, avatar_url),
  tags:article_tags(*, tag:tags(*))
`;

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const { category: slug } = await params;
  const { page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr || '1'));
  const limit = 20;

  const { data: catData } = await supabase.from('categories').select('*').eq('slug', slug).single();
  if (!catData) notFound();
  const cat = camelizeKeys<CategoryRow>(catData);

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const [articlesResult, countResult] = await Promise.all([
    supabase
      .from('articles')
      .select(ARTICLE_SELECT)
      .eq('category_id', cat.id)
      .eq('status', 'published')
      .order('is_pinned', { ascending: false })
      .order('published_at', { ascending: false })
      .range(from, to),
    supabase
      .from('articles')
      .select('*', { count: 'exact', head: true })
      .eq('category_id', cat.id)
      .eq('status', 'published'),
  ]);

  const articles = camelizeKeys<Array<{
    id: number; slug: string; title: string; lead: string | null;
    coverImageUrl: string | null; coverImageAlt: string | null;
    publishedAt: string | null; viewCount: number; commentCount: number;
    author: { displayName: string | null };
    tags: Array<{ tag: { slug: string; nameRu: string } }>;
  }>>(articlesResult.data || []);
  const total = countResult.count || 0;
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
