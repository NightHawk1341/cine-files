import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Медиатека' };

export default function AdminMediaPage() {
  return (
    <div>
      <h1 style={{ fontSize: 'var(--page-title-size)', marginBottom: 16 }}>Медиатека</h1>
      <p style={{ color: 'var(--text-tertiary)' }}>
        Загрузка и управление изображениями в S3 будут реализованы в Phase 2.
      </p>
    </div>
  );
}
