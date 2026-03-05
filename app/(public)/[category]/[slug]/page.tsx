import type { Metadata } from 'next';

interface ArticlePageProps {
  params: Promise<{ category: string; slug: string }>;
}

export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: slug,
  };
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { category, slug } = await params;

  return (
    <div className="container" style={{ paddingTop: 32 }}>
      <p style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>{category}</p>
      <h1>{slug}</h1>
      <p style={{ color: 'var(--text-tertiary)', marginTop: 16 }}>
        Страница статьи будет реализована в Phase 2
      </p>
    </div>
  );
}
