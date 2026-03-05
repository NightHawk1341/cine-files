'use client';

import { useState } from 'react';
import styles from '@/styles/components/comments.module.css';

interface CommentFormProps {
  articleId: number;
  parentId?: number;
  onSubmit: () => void;
  placeholder?: string;
  compact?: boolean;
}

export function CommentForm({ articleId, parentId, onSubmit, placeholder, compact }: CommentFormProps) {
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId, parentId, body: body.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        if (res.status === 401) {
          setError('Войдите, чтобы оставить комментарий');
        } else {
          throw new Error(data.error || 'Ошибка');
        }
        return;
      }

      setBody('');
      onSubmit();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка отправки');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={compact ? styles.formCompact : styles.form}>
      {error && <div className={styles.formError}>{error}</div>}
      <textarea
        className={styles.textarea}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder || 'Ваш комментарий...'}
        rows={compact ? 2 : 3}
        maxLength={2000}
      />
      <button
        type="submit"
        className={styles.submitBtn}
        disabled={submitting || !body.trim()}
      >
        {submitting ? 'Отправка...' : 'Отправить'}
      </button>
    </form>
  );
}
