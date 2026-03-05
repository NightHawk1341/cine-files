import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Все теги',
  description: 'Обзор по фильмам, сериалам, персонам, жанрам и другим тегам',
};

export default function TagsPage() {
  return (
    <div className="container" style={{ paddingTop: 32 }}>
      <h1>Все теги</h1>
      <p style={{ color: 'var(--text-tertiary)', marginTop: 16 }}>
        Страница тегов будет реализована в Phase 3
      </p>
    </div>
  );
}
