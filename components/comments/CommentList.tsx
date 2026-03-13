'use client';

import { useState, useEffect, useCallback } from 'react';
import { CommentItem } from './CommentItem';
import { CommentForm } from './CommentForm';
import { SkeletonList } from '@/components/ui/Skeleton';
import styles from '@/styles/components/comments.module.css';

interface Comment {
  id: number;
  body: string;
  createdAt: string;
  updatedAt: string | null;
  user: { id: number; displayName: string | null; avatarUrl: string | null };
  replies: Comment[];
}

interface CommentListProps {
  articleId: number;
  allowComments: boolean;
}

export function CommentList({ articleId, allowComments }: CommentListProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const fetchComments = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/comments?article_id=${articleId}&page=${page}`);
    if (res.ok) {
      const data = await res.json();
      setComments(data.comments);
      setTotal(data.pagination.total);
      setTotalPages(data.pagination.pages);
    }
    setLoading(false);
  }, [articleId, page]);

  useEffect(() => { fetchComments(); }, [fetchComments]);

  const handleNewComment = () => {
    setPage(1);
    fetchComments();
  };

  return (
    <section className={styles.section}>
      <h2 className={styles.title}>
        Комментарии
        {total > 0 && <span className={styles.count}>{total}</span>}
      </h2>

      {allowComments && (
        <CommentForm articleId={articleId} onSubmit={handleNewComment} />
      )}

      {loading ? (
        <SkeletonList count={3} />
      ) : comments.length === 0 ? (
        <p className={styles.placeholder}>
          {allowComments ? 'Пока нет комментариев. Будьте первым!' : 'Комментарии отключены.'}
        </p>
      ) : (
        <>
          <div className={styles.list}>
            {comments.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                articleId={articleId}
                allowComments={allowComments}
                onUpdate={fetchComments}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className={styles.pagination}>
              {page > 1 && (
                <button className={styles.pageBtn} onClick={() => setPage(page - 1)}>Назад</button>
              )}
              <span className={styles.pageInfo}>{page} / {totalPages}</span>
              {page < totalPages && (
                <button className={styles.pageBtn} onClick={() => setPage(page + 1)}>Далее</button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
