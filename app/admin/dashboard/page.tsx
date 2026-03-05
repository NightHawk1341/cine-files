import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Панель управления' };

export default function DashboardPage() {
  return (
    <div>
      <h1 style={{ fontSize: 'var(--page-title-size)', marginBottom: 16 }}>
        Панель управления
      </h1>
      <p style={{ color: 'var(--text-tertiary)' }}>
        Статистика и последняя активность будут здесь.
      </p>
    </div>
  );
}
