import type { Metadata } from 'next';

interface TagPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: TagPageProps): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `Тег: ${slug}`,
  };
}

export default async function TagPage({ params }: TagPageProps) {
  const { slug } = await params;

  return (
    <div className="container" style={{ paddingTop: 32 }}>
      <h1>Тег: {slug}</h1>
      <p style={{ color: 'var(--text-tertiary)', marginTop: 16 }}>
        Страница тега будет реализована в Phase 3
      </p>
    </div>
  );
}
