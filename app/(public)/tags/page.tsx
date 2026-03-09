import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import Link from 'next/link';
import styles from '@/styles/pages/tags.module.css';

export const metadata: Metadata = {
  title: 'Все теги — CineFiles',
  description: 'Обзор по фильмам, сериалам, персонам, жанрам и другим тегам',
};

const TAG_TYPE_LABELS: Record<string, string> = {
  movie: 'Фильмы',
  tv: 'Сериалы',
  person: 'Персоны',
  genre: 'Жанры',
  franchise: 'Франшизы',
  studio: 'Студии',
  topic: 'Темы',
  game: 'Игры',
  anime: 'Аниме',
};

const TAG_TYPE_ORDER = ['movie', 'tv', 'person', 'genre', 'franchise', 'studio', 'topic', 'game', 'anime'];

export default async function TagsPage() {
  const tags = await prisma.tag.findMany({
    where: { articleCount: { gt: 0 } },
    orderBy: { articleCount: 'desc' },
  });

  // Group by type
  const grouped = new Map<string, typeof tags>();
  for (const tag of tags) {
    const group = grouped.get(tag.tagType) || [];
    group.push(tag);
    grouped.set(tag.tagType, group);
  }

  const orderedTypes = TAG_TYPE_ORDER.filter((t) => grouped.has(t));

  return (
    <div className="container" style={{ paddingTop: 32, paddingBottom: 60 }}>
      <h1 className={styles.pageTitle}>Все теги</h1>

      {orderedTypes.length === 0 ? (
        <p className={styles.empty}>Пока нет тегов со статьями</p>
      ) : (
        orderedTypes.map((type) => {
          const typeTags = grouped.get(type)!;
          return (
            <section key={type} className={styles.section}>
              <h2 className={styles.sectionTitle}>
                {TAG_TYPE_LABELS[type] || type}
                <span className={styles.count}>{typeTags.length}</span>
              </h2>
              <div className={styles.tagCloud}>
                {typeTags.map((tag) => (
                  <Link key={tag.slug} href={`/tag/${tag.slug}`} className={styles.tag}>
                    {tag.nameRu}
                    <span className={styles.tagCount}>{tag.articleCount}</span>
                  </Link>
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
