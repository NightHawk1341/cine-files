import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Управление подборками' };

export default function AdminCollectionsPage() {
  return (
    <div>
      <h1 style={{ fontSize: 'var(--page-title-size)', marginBottom: 16 }}>Подборки</h1>
      <p style={{ color: 'var(--text-tertiary)' }}>
        Управление подборками будет реализовано в Phase 6.
      </p>
    </div>
  );
}
