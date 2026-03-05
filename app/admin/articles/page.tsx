import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/db';

export const metadata: Metadata = { title: 'Управление статьями' };

export default async function AdminArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const { status = 'all', page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr || '1'));
  const limit = 25;

  const where = status !== 'all' ? { status } : {};

  const [articles, total] = await Promise.all([
    prisma.article.findMany({
      where,
      include: {
        category: true,
        author: { select: { displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.article.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);
  const statusFilters = [
    { value: 'all', label: 'Все' },
    { value: 'draft', label: 'Черновики' },
    { value: 'review', label: 'На модерации' },
    { value: 'published', label: 'Опубликовано' },
    { value: 'archived', label: 'Архив' },
  ];

  const formatDate = (date: Date) =>
    new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);

  const statusBadge = (s: string) => {
    const colors: Record<string, string> = {
      draft: 'var(--text-tertiary)',
      review: 'var(--status-warning)',
      published: 'var(--status-success)',
      archived: 'var(--text-tertiary)',
    };
    return colors[s] || 'var(--text-tertiary)';
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 'var(--page-title-size)' }}>Статьи ({total})</h1>
        <Link
          href="/admin/articles/new"
          style={{
            padding: '8px 16px',
            backgroundColor: 'var(--brand-primary)',
            color: 'var(--text-inverse)',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 500,
            textDecoration: 'none',
          }}
        >
          Новая статья
        </Link>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {statusFilters.map((f) => (
          <Link
            key={f.value}
            href={`/admin/articles?status=${f.value}`}
            style={{
              padding: '6px 14px',
              fontSize: 13,
              borderRadius: 40,
              textDecoration: 'none',
              backgroundColor: status === f.value ? 'var(--brand-primary)' : 'var(--bg-tertiary)',
              color: status === f.value ? 'var(--text-inverse)' : 'var(--text-secondary)',
            }}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {articles.length === 0 ? (
        <p style={{ color: 'var(--text-tertiary)', padding: '40px 0', textAlign: 'center' }}>
          Нет статей
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {articles.map((article) => (
            <Link
              key={article.id}
              href={`/admin/articles/${article.id}/edit`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: '12px 16px',
                backgroundColor: 'var(--card-bg)',
                textDecoration: 'none',
                borderBottom: '1px solid var(--border-color)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
                  {article.title}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                  {article.category.nameRu} · {article.author.displayName || 'Без автора'} · {formatDate(article.createdAt)}
                </div>
              </div>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: statusBadge(article.status),
                  flexShrink: 0,
                }}
              >
                {article.status}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)', flexShrink: 0 }}>
                {article.viewCount} просм.
              </span>
            </Link>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, padding: '24px 0' }}>
          {page > 1 && (
            <Link
              href={`/admin/articles?status=${status}&page=${page - 1}`}
              style={{ fontSize: 14, color: 'var(--brand-primary)' }}
            >
              Назад
            </Link>
          )}
          <span style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>
            {page} / {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={`/admin/articles?status=${status}&page=${page + 1}`}
              style={{ fontSize: 14, color: 'var(--brand-primary)' }}
            >
              Далее
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
