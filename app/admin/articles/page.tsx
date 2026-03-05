import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Управление статьями' };

export default function AdminArticlesPage() {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 'var(--page-title-size)' }}>Статьи</h1>
        <Link
          href="/admin/articles/new"
          style={{
            padding: '8px 16px',
            backgroundColor: 'var(--brand-primary)',
            color: 'var(--text-inverse)',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          Новая статья
        </Link>
      </div>
      <p style={{ color: 'var(--text-tertiary)' }}>
        Список статей будет реализован в Phase 2.
      </p>
    </div>
  );
}
