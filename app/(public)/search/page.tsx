import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Поиск',
  description: 'Поиск статей, фильмов и персон',
};

export default function SearchPage() {
  return (
    <div className="container" style={{ paddingTop: 32 }}>
      <h1>Поиск</h1>
      <p style={{ color: 'var(--text-tertiary)', marginTop: 16 }}>
        Полнотекстовый поиск будет реализован в Phase 6
      </p>
    </div>
  );
}
