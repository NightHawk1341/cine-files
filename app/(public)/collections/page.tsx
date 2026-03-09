import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import Link from 'next/link';
import styles from '@/styles/pages/collections.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Подборки — CineFiles',
  description: 'Тематические подборки статей о кино и сериалах',
};

export default async function CollectionsPage() {
  const collections = await prisma.collection.findMany({
    where: { isVisible: true },
    include: {
      _count: { select: { articles: true } },
    },
    orderBy: { sortOrder: 'asc' },
  });

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
                  {col._count.articles} {col._count.articles === 1 ? 'статья' : col._count.articles < 5 ? 'статьи' : 'статей'}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
