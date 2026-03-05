'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BlockEditor } from '@/components/editor/BlockEditor';
import type { Block } from '@/lib/types';

export default function NewArticlePage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [lead, setLead] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [coverImageAlt, setCoverImageAlt] = useState('');
  const [metaTitle, setMetaTitle] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const [blocks, setBlocks] = useState<Block[]>([{ type: 'paragraph', text: '' }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    fontSize: 14,
    color: 'var(--text-primary)',
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--border-color)',
    borderRadius: 8,
    fontFamily: 'inherit',
  } as const;

  const save = async (status: string) => {
    if (!title.trim()) { setError('Заголовок обязателен'); return; }
    if (!categoryId) { setError('Выберите категорию'); return; }

    setSaving(true);
    setError('');

    try {
      const res = await fetch('/api/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          subtitle: subtitle || undefined,
          lead: lead || undefined,
          categoryId: parseInt(categoryId),
          body: blocks,
          coverImageUrl: coverImageUrl || undefined,
          coverImageAlt: coverImageAlt || undefined,
          metaTitle: metaTitle || undefined,
          metaDescription: metaDescription || undefined,
          status,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Ошибка сохранения');
      }

      const { article } = await res.json();
      router.push(`/admin/articles/${article.id}/edit`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 'var(--page-title-size)' }}>Новая статья</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => save('draft')}
            disabled={saving}
            style={{ ...inputStyle, width: 'auto', cursor: 'pointer', backgroundColor: 'var(--bg-tertiary)' }}
          >
            Сохранить черновик
          </button>
          <button
            onClick={() => save('published')}
            disabled={saving}
            style={{
              padding: '8px 16px',
              backgroundColor: 'var(--brand-primary)',
              color: 'var(--text-inverse)',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              border: 'none',
            }}
          >
            Опубликовать
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          padding: '10px 16px',
          backgroundColor: 'var(--status-error-bg)',
          color: 'var(--status-error)',
          borderRadius: 8,
          marginBottom: 16,
          fontSize: 14,
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 800 }}>
        <Field label="Категория *">
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={inputStyle}>
            <option value="">Выберите категорию</option>
            <option value="1">Новости</option>
            <option value="2">Рецензии</option>
            <option value="3">Статьи</option>
            <option value="4">Интервью</option>
            <option value="5">Подборки</option>
            <option value="6">Разборы</option>
          </select>
        </Field>

        <Field label="Заголовок *">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Заголовок статьи..." style={{ ...inputStyle, fontSize: 18, fontWeight: 600 }} />
        </Field>

        <Field label="Подзаголовок">
          <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Подзаголовок..." style={inputStyle} />
        </Field>

        <Field label="Лид (краткое описание)">
          <textarea value={lead} onChange={(e) => setLead(e.target.value)} placeholder="Краткое описание для карточек и SEO..." rows={2} style={{ ...inputStyle, resize: 'vertical' as const }} />
        </Field>

        <Field label="URL обложки">
          <input value={coverImageUrl} onChange={(e) => setCoverImageUrl(e.target.value)} placeholder="https://storage.yandexcloud.net/..." style={inputStyle} />
        </Field>

        <Field label="Alt обложки">
          <input value={coverImageAlt} onChange={(e) => setCoverImageAlt(e.target.value)} placeholder="Описание изображения..." style={inputStyle} />
        </Field>

        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 13 }}>
            SEO настройки
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
            <input value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} placeholder="Meta title (до 70 символов)" maxLength={70} style={inputStyle} />
            <textarea value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} placeholder="Meta description (до 160 символов)" maxLength={160} rows={2} style={{ ...inputStyle, resize: 'vertical' as const }} />
          </div>
        </details>

        <div style={{ marginTop: 16 }}>
          <label style={{ display: 'block', fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 12 }}>
            Содержимое статьи
          </label>
          <BlockEditor initialBlocks={blocks} onChange={setBlocks} />
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  );
}
