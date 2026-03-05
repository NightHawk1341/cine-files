import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Подборки',
  description: 'Тематические подборки статей',
};

export default function CollectionsPage() {
  return (
    <div className="container" style={{ paddingTop: 32 }}>
      <h1>Подборки</h1>
      <p style={{ color: 'var(--text-tertiary)', marginTop: 16 }}>
        Подборки будут реализованы в Phase 6
      </p>
    </div>
  );
}
