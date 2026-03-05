import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Новая статья' };

export default function NewArticlePage() {
  return (
    <div>
      <h1 style={{ fontSize: 'var(--page-title-size)', marginBottom: 16 }}>
        Новая статья
      </h1>
      <p style={{ color: 'var(--text-tertiary)' }}>
        Блочный редактор контента будет реализован в Phase 2.
      </p>
    </div>
  );
}
