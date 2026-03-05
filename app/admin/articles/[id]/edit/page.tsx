import type { Metadata } from 'next';

interface EditArticlePageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: EditArticlePageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: `Редактировать статью #${id}` };
}

export default async function EditArticlePage({ params }: EditArticlePageProps) {
  const { id } = await params;

  return (
    <div>
      <h1 style={{ fontSize: 'var(--page-title-size)', marginBottom: 16 }}>
        Редактировать статью #{id}
      </h1>
      <p style={{ color: 'var(--text-tertiary)' }}>
        Редактор будет реализован в Phase 2.
      </p>
    </div>
  );
}
