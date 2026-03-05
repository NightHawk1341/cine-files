import type { Metadata } from 'next';

interface CollectionPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: CollectionPageProps): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `Подборка: ${slug}`,
  };
}

export default async function CollectionPage({ params }: CollectionPageProps) {
  const { slug } = await params;

  return (
    <div className="container" style={{ paddingTop: 32 }}>
      <h1>Подборка: {slug}</h1>
      <p style={{ color: 'var(--text-tertiary)', marginTop: 16 }}>
        Страница подборки будет реализована в Phase 6
      </p>
    </div>
  );
}
