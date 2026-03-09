import type { Metadata } from 'next';
import { supabase, camelizeKeys } from '@/lib/db';
import { notFound } from 'next/navigation';
import { ArticleCard } from '@/components/article/ArticleCard';
import Link from 'next/link';
import styles from '@/styles/pages/author.module.css';

interface AuthorPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}

interface AuthorData {
  id: number;
  displayName: string | null;
  avatarUrl: string | null;
  role: string;
  createdAt: string;
}

async function getAuthor(id: number): Promise<AuthorData | null> {
  const { data } = await supabase
    .from('users')
    .select('id, display_name, avatar_url, role, created_at')
    .eq('id', id)
    .single();
  return data ? camelizeKeys<AuthorData>(data) : null;
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

const ARTICLE_SELECT = `
  *,
  category:categories(*),
  author:users!author_id(id, display_name, avatar_url),
  tags:article_tags(*, tag:tags(*))
`;

export default async function AuthorPage({ params, searchParams }: AuthorPageProps) {
  const { id } = await params;
  const { page: pageStr } = await searchParams;
  const authorId = parseInt(id);
  const page = Math.max(1, parseInt(pageStr || '1'));
  const limit = 20;

  const author = await getAuthor(authorId);
  if (!author) notFound();

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const [articlesResult, countResult] = await Promise.all([
    supabase
      .from('articles')
      .select(ARTICLE_SELECT)
      .eq('author_id', authorId)
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .range(from, to),
    supabase
      .from('articles')
      .select('*', { count: 'exact', head: true })
      .eq('author_id', authorId)
      .eq('status', 'published'),
  ]);

  const articles = camelizeKeys<Array<{
    id: number; slug: string; title: string; lead: string | null;
    coverImageUrl: string | null; coverImageAlt: string | null;
    publishedAt: string | null; viewCount: number; commentCount: number;
    category: { slug: string };
    author: { displayName: string | null };
    tags: Array<{ tag: { slug: string; nameRu: string } }>;
  }>>(articlesResult.data || []);
  const total = countResult.count || 0;
  const totalPages = Math.ceil(total / limit);
  const memberSince = new Intl.DateTimeFormat('ru-RU', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(author.createdAt));

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
