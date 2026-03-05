import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Правовая информация',
  description: 'Политика конфиденциальности и условия использования',
};

export default function LegalPage() {
  return (
    <div className="container-narrow" style={{ paddingTop: 32 }}>
      <h1>Правовая информация</h1>
      <p style={{ color: 'var(--text-secondary)', marginTop: 16, lineHeight: 1.7 }}>
        Содержание данной страницы будет дополнено.
      </p>
    </div>
  );
}
