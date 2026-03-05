import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Модерация комментариев' };

export default async function AdminCommentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const { status = 'visible', page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr || '1'));
  const limit = 30;

  const where = { status };

  const [comments, total] = await Promise.all([
    prisma.comment.findMany({
      where,
      include: {
        user: { select: { id: true, displayName: true } },
        article: { select: { id: true, title: true, slug: true, category: { select: { slug: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.comment.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);
  const statuses = [
    { value: 'visible', label: 'Видимые' },
    { value: 'hidden', label: 'Скрытые' },
    { value: 'deleted', label: 'Удалённые' },
  ];

  const formatDate = (date: Date) =>
    new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);

  return (
    <div>
      <h1 style={{ fontSize: 'var(--page-title-size)', marginBottom: 16 }}>Комментарии ({total})</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {statuses.map((s) => (
          <Link
            key={s.value}
            href={`/admin/comments?status=${s.value}`}
            style={{
              padding: '6px 14px',
              fontSize: 13,
              borderRadius: 40,
              textDecoration: 'none',
              backgroundColor: status === s.value ? 'var(--brand-primary)' : 'var(--bg-tertiary)',
              color: status === s.value ? 'var(--text-inverse)' : 'var(--text-secondary)',
            }}
          >
            {s.label}
          </Link>
        ))}
      </div>

      {comments.length === 0 ? (
        <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: '40px 0' }}>Нет комментариев</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {comments.map((c) => (
            <div
              key={c.id}
              style={{
                padding: '12px 16px',
                backgroundColor: 'var(--card-bg)',
                borderBottom: '1px solid var(--border-color)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                    {c.user.displayName || `User #${c.user.id}`}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 8 }}>
                    {formatDate(c.createdAt)}
                  </span>
                </div>
                <Link
                  href={`/${c.article.category.slug}/${c.article.slug}`}
                  style={{ fontSize: 12, color: 'var(--brand-primary)', textDecoration: 'none', flexShrink: 0, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {c.article.title}
                </Link>
              </div>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {c.body.length > 300 ? `${c.body.slice(0, 300)}...` : c.body}
              </p>
              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <ModerationAction commentId={c.id} action="hide" label="Скрыть" />
                <ModerationAction commentId={c.id} action="show" label="Показать" />
                <ModerationAction commentId={c.id} action="delete" label="Удалить" />
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, padding: '24px 0' }}>
          {page > 1 && (
            <Link href={`/admin/comments?status=${status}&page=${page - 1}`} style={{ fontSize: 14, color: 'var(--brand-primary)' }}>Назад</Link>
          )}
          <span style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>{page} / {totalPages}</span>
          {page < totalPages && (
            <Link href={`/admin/comments?status=${status}&page=${page + 1}`} style={{ fontSize: 14, color: 'var(--brand-primary)' }}>Далее</Link>
          )}
        </div>
      )}
    </div>
  );
}

function ModerationAction({ commentId, action, label }: { commentId: number; action: string; label: string }) {
  return (
    <form action={`/api/admin/comments/${commentId}/moderate`} method="POST">
      <input type="hidden" name="action" value={action} />
      <button
        type="submit"
        style={{
          fontSize: 12,
          color: action === 'delete' ? 'var(--status-error)' : 'var(--text-tertiary)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
        }}
      >
        {label}
      </button>
    </form>
  );
}
