import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Управление тегами' };

export default function AdminTagsPage() {
  return (
    <div>
      <h1 style={{ fontSize: 'var(--page-title-size)', marginBottom: 16 }}>Теги</h1>
      <p style={{ color: 'var(--text-tertiary)' }}>
        Управление тегами и TMDB-поиск будут реализованы в Phase 3.
      </p>
    </div>
  );
}
