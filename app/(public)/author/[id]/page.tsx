import type { Metadata } from 'next';

interface AuthorPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: AuthorPageProps): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Автор #${id}`,
  };
}

export default async function AuthorPage({ params }: AuthorPageProps) {
  const { id } = await params;

  return (
    <div className="container" style={{ paddingTop: 32 }}>
      <h1>Автор #{id}</h1>
      <p style={{ color: 'var(--text-tertiary)', marginTop: 16 }}>
        Страница автора будет реализована в Phase 5
      </p>
    </div>
  );
}
