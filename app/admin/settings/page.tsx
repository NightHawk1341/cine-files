import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Настройки сайта' };

export default function AdminSettingsPage() {
  return (
    <div>
      <h1 style={{ fontSize: 'var(--page-title-size)', marginBottom: 16 }}>Настройки</h1>
      <p style={{ color: 'var(--text-tertiary)' }}>
        SEO-настройки и интеграции будут реализованы в Phase 6.
      </p>
    </div>
  );
}
