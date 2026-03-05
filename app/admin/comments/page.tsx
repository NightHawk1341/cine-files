import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Модерация комментариев' };

export default function AdminCommentsPage() {
  return (
    <div>
      <h1 style={{ fontSize: 'var(--page-title-size)', marginBottom: 16 }}>Комментарии</h1>
      <p style={{ color: 'var(--text-tertiary)' }}>
        Модерация комментариев будет реализована в Phase 5.
      </p>
    </div>
  );
}
