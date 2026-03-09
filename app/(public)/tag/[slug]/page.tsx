import type { Metadata } from 'next';
import { supabase, camelizeKeys } from '@/lib/db';
import { notFound } from 'next/navigation';
import { ArticleCard } from '@/components/article/ArticleCard';
import Link from 'next/link';
import styles from '@/styles/pages/category.module.css';

interface TagPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

interface TagData {
  id: number;
  slug: string;
  nameRu: string;
  nameEn: string | null;
  tagType: string;
  tmdbEntity: {
    tmdbId: number;
    entityType: string;
    titleRu: string | null;
    titleEn: string | null;
    metadata: Record<string, unknown> | null;
  } | null;
}

async function getTag(slug: string): Promise<TagData | null> {
  const { data } = await supabase
    .from('tags')
    .select(`
      *,
      tmdb_entity:tmdb_entities(tmdb_id, entity_type, title_ru, title_en, metadata)
    `)
    .eq('slug', slug)
    .single();

  return data ? camelizeKeys<TagData>(data) : null;
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

const ARTICLE_SELECT = `
  article:articles(
    *,
    category:categories(*),
    author:users!author_id(id, display_name, avatar_url),
    tags:article_tags(*, tag:tags(*))
  )
`;

export default async function TagPage({ params, searchParams }: TagPageProps) {
  const { slug } = await params;
  const { page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr || '1'));
  const limit = 20;

  const tag = await getTag(slug);
  if (!tag) notFound();

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const [articleTagsResult, countResult] = await Promise.all([
    supabase
      .from('article_tags')
      .select(ARTICLE_SELECT)
      .eq('tag_id', tag.id)
      .range(from, to),
    supabase
      .from('article_tags')
      .select('*', { count: 'exact', head: true })
      .eq('tag_id', tag.id),
  ]);

  // Filter to published articles and camelize
  const allArticleTags = camelizeKeys<Array<{
    article: {
      id: number; slug: string; title: string; lead: string | null; status: string;
      coverImageUrl: string | null; coverImageAlt: string | null;
      publishedAt: string | null; viewCount: number; commentCount: number;
      category: { slug: string };
      author: { displayName: string | null };
      tags: Array<{ tag: { slug: string; nameRu: string } }>;
    };
  }>>(articleTagsResult.data || []);

  const articleTags = allArticleTags.filter((at) => at.article.status === 'published');
  const total = countResult.count || 0;
  const totalPages = Math.ceil(total / limit);
  const meta = tag.tmdbEntity?.metadata;

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
        {meta?.overview && (
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginTop: 12, maxWidth: 700, lineHeight: 1.6 }}>
            {String(meta.overview).slice(0, 300)}
            {String(meta.overview).length > 300 && '...'}
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
