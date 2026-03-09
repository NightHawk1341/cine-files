import type { Metadata } from 'next';
import { supabase, camelizeKeys } from '@/lib/db';
import Link from 'next/link';
import styles from '@/styles/pages/collections.module.css';

export const metadata: Metadata = {
  title: 'Подборки — CineFiles',
  description: 'Тематические подборки статей о кино и сериалах',
};

export default async function CollectionsPage() {
  const { data: collectionsData } = await supabase
    .from('collections')
    .select('*')
    .eq('is_visible', true)
    .order('sort_order', { ascending: true });

  // Get article counts per collection
  const collections = await Promise.all(
    (collectionsData || []).map(async (c) => {
      const { count } = await supabase
        .from('collection_articles')
        .select('*', { count: 'exact', head: true })
        .eq('collection_id', c.id);

      const col = camelizeKeys<{
        slug: string; title: string; description: string | null; coverImageUrl: string | null;
      }>(c);

      return { ...col, articleCount: count || 0 };
    })
  );

  return (
    <div className="container" style={{ paddingTop: 32, paddingBottom: 60 }}>
      <h1 className={styles.pageTitle}>Подборки</h1>

      {collections.length === 0 ? (
        <p className={styles.empty}>Подборки скоро появятся</p>
      ) : (
        <div className={styles.grid}>
          {collections.map((col) => (
            <Link key={col.slug} href={`/collection/${col.slug}`} className={styles.card}>
              {col.coverImageUrl && (
                <div className={styles.imageWrapper}>
                  <img src={col.coverImageUrl} alt={col.title} className={styles.image} loading="lazy" />
                </div>
              )}
              <div className={styles.info}>
                <h2 className={styles.cardTitle}>{col.title}</h2>
                {col.description && <p className={styles.cardDesc}>{col.description}</p>}
                <span className={styles.articleCount}>
                  {col.articleCount} {col.articleCount === 1 ? 'статья' : col.articleCount < 5 ? 'статьи' : 'статей'}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
