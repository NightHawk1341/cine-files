'use client';

import { useState } from 'react';
import { CommentForm } from './CommentForm';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import styles from '@/styles/components/comments.module.css';

interface Comment {
  id: number;
  body: string;
  createdAt: string;
  updatedAt: string | null;
  user: { id: number; displayName: string | null; avatarUrl: string | null };
  replies: Comment[];
}

interface CommentItemProps {
  comment: Comment;
  articleId: number;
  allowComments: boolean;
  onUpdate: () => void;
  depth?: number;
}

export function CommentItem({ comment, articleId, allowComments, onUpdate, depth = 0 }: CommentItemProps) {
  const [showReply, setShowReply] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const maxDepth = 3;

  const formattedDate = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(comment.createdAt));

  const handleDelete = async () => {
    await fetch(`/api/comments/${comment.id}`, { method: 'DELETE' });
    setShowDeleteConfirm(false);
    onUpdate();
  };

  return (
    <div className={styles.comment} style={{ marginLeft: depth > 0 ? Math.min(depth, maxDepth) * 24 : 0 }}>
      <div className={styles.commentHeader}>
        {comment.user.avatarUrl ? (
          <img src={comment.user.avatarUrl} alt="" className={styles.avatar} />
        ) : (
          <div className={styles.avatarPlaceholder}>
            {(comment.user.displayName || '?')[0].toUpperCase()}
          </div>
        )}
        <div>
          <span className={styles.userName}>{comment.user.displayName || 'Аноним'}</span>
          <time className={styles.date}>{formattedDate}</time>
          {comment.updatedAt && <span className={styles.edited}>(ред.)</span>}
        </div>
      </div>

      <p className={styles.commentBody}>{comment.body}</p>

      <div className={styles.commentActions}>
        {allowComments && depth < maxDepth && (
          <button className={styles.actionBtn} onClick={() => setShowReply(!showReply)}>
            {showReply ? 'Отмена' : 'Ответить'}
          </button>
        )}
        <button className={styles.actionBtn} onClick={() => setShowDeleteConfirm(true)}>
          Удалить
        </button>
      </div>

      <ConfirmationModal
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Удалить комментарий?"
        message="Это действие нельзя отменить."
        variant="danger"
        confirmLabel="Удалить"
        cancelLabel="Отмена"
      />

      {showReply && (
        <div className={styles.replyForm}>
          <CommentForm
            articleId={articleId}
            parentId={comment.id}
            onSubmit={() => { setShowReply(false); onUpdate(); }}
            placeholder="Ваш ответ..."
            compact
          />
        </div>
      )}

      {comment.replies?.map((reply) => (
        <CommentItem
          key={reply.id}
          comment={reply}
          articleId={articleId}
          allowComments={allowComments}
          onUpdate={onUpdate}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}
