'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArticleCard } from '@/components/article/ArticleCard';
import Link from 'next/link';
import styles from '@/styles/pages/search.module.css';

interface SearchArticle {
  id: number;
  slug: string;
  title: string;
  lead: string | null;
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  publishedAt: string | null;
  viewCount: number;
  commentCount: number;
  category: { slug: string; nameRu: string };
  author: { id: number; displayName: string | null; avatarUrl: string | null };
  tags: Array<{ tag: { slug: string; nameRu: string } }>;
}

interface SearchTag {
  slug: string;
  nameRu: string;
  tagType: string;
  articleCount: number;
}

function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialQuery = searchParams.get('q') || '';

  const [query, setQuery] = useState(initialQuery);
  const [articles, setArticles] = useState<SearchArticle[]>([]);
  const [tags, setTags] = useState<SearchTag[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const doSearch = async (q: string) => {
    if (q.length < 2) return;
    setLoading(true);
    setSearched(true);

    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    if (res.ok) {
      const data = await res.json();
      setArticles(data.articles);
      setTags(data.tags);
      setTotal(data.pagination.total);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (initialQuery.length >= 2) {
      doSearch(initialQuery);
    }
  }, [initialQuery]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.length >= 2) {
      router.push(`/search?q=${encodeURIComponent(query)}`);
      doSearch(query);
    }
  };

  return (
    <div className="container" style={{ paddingTop: 32, paddingBottom: 60 }}>
      <h1 className={styles.title}>Поиск</h1>

      <form onSubmit={handleSubmit} className={styles.form}>
        <input
          className={styles.input}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск статей, фильмов, персон..."
          autoFocus
        />
        <button type="submit" className={styles.searchBtn} disabled={query.length < 2}>
          Найти
        </button>
      </form>

      {loading ? (
        <p className={styles.placeholder}>Поиск...</p>
      ) : searched && articles.length === 0 && tags.length === 0 ? (
        <p className={styles.placeholder}>Ничего не найдено по запросу &laquo;{initialQuery}&raquo;</p>
      ) : (
        <>
          {tags.length > 0 && (
            <div className={styles.tagsSection}>
              <h2 className={styles.sectionTitle}>Теги</h2>
              <div className={styles.tagList}>
                {tags.map((tag) => (
                  <Link key={tag.slug} href={`/tag/${tag.slug}`} className={styles.tag}>
                    {tag.nameRu}
                    <span className={styles.tagCount}>{tag.articleCount}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {articles.length > 0 && (
            <div>
              <h2 className={styles.sectionTitle}>
                Статьи
                {total > 0 && <span className={styles.resultCount}>{total} результатов</span>}
              </h2>
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
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="container" style={{ paddingTop: 32, paddingBottom: 60 }}>
        <h1 className={styles.title}>Поиск</h1>
        <p className={styles.placeholder}>Загрузка...</p>
      </div>
    }>
      <SearchContent />
    </Suspense>
  );
}
