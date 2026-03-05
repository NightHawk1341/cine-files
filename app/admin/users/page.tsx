import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Управление пользователями' };

export default function AdminUsersPage() {
  return (
    <div>
      <h1 style={{ fontSize: 'var(--page-title-size)', marginBottom: 16 }}>Пользователи</h1>
      <p style={{ color: 'var(--text-tertiary)' }}>
        Управление пользователями и ролями будет реализовано в Phase 5.
      </p>
    </div>
  );
}
