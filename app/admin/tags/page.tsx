'use client';

import { useState, useEffect, useCallback } from 'react';
import styles from '@/styles/pages/admin-tags.module.css';

interface Tag {
  id: number;
  slug: string;
  nameRu: string;
  nameEn: string | null;
  tagType: string;
  articleCount: number;
  tmdbEntity: { tmdbId: number; entityType: string; titleRu: string } | null;
}

interface TmdbResult {
  tmdbId: number;
  mediaType: string;
  title: string;
  originalTitle: string;
  overview: string;
  releaseDate: string | null;
}

const TAG_TYPES = [
  { value: 'movie', label: 'Фильм' },
  { value: 'tv', label: 'Сериал' },
  { value: 'person', label: 'Персона' },
  { value: 'genre', label: 'Жанр' },
  { value: 'franchise', label: 'Франшиза' },
  { value: 'studio', label: 'Студия' },
  { value: 'topic', label: 'Тема' },
  { value: 'game', label: 'Игра' },
  { value: 'anime', label: 'Аниме' },
];

export default function AdminTagsPage() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [filterType, setFilterType] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [newNameRu, setNewNameRu] = useState('');
  const [newNameEn, setNewNameEn] = useState('');
  const [newTagType, setNewTagType] = useState('movie');
  const [tmdbSearch, setTmdbSearch] = useState('');
  const [tmdbResults, setTmdbResults] = useState<TmdbResult[]>([]);
  const [selectedTmdb, setSelectedTmdb] = useState<TmdbResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchTags = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterType) params.set('type', filterType);
    if (search) params.set('q', search);
    params.set('limit', '100');

    const res = await fetch(`/api/tags?${params}`);
    const data = await res.json();
    setTags(data.tags || []);
    setLoading(false);
  }, [filterType, search]);

  useEffect(() => { fetchTags(); }, [fetchTags]);

  const searchTmdbApi = async (query: string) => {
    if (query.length < 2) { setTmdbResults([]); return; }
    const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(query)}`);
    if (res.ok) {
      const data = await res.json();
      setTmdbResults(data.results || []);
    }
  };

  const createTag = async () => {
    if (!newNameRu.trim()) { setError('Имя обязательно'); return; }
    setSaving(true);
    setError('');

    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nameRu: newNameRu,
          nameEn: newNameEn || undefined,
          tagType: newTagType,
          ...(selectedTmdb && {
            tmdbId: selectedTmdb.tmdbId,
            tmdbType: selectedTmdb.mediaType === 'tv' ? 'tv' : selectedTmdb.mediaType === 'person' ? 'person' : 'movie',
          }),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Ошибка создания');
      }

      setNewNameRu('');
      setNewNameEn('');
      setSelectedTmdb(null);
      setTmdbSearch('');
      setTmdbResults([]);
      setShowCreate(false);
      fetchTags();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  const deleteTag = async (id: number) => {
    if (!confirm('Удалить тег?')) return;
    await fetch(`/api/tags/${id}`, { method: 'DELETE' });
    fetchTags();
  };

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>Теги ({tags.length})</h1>
        <button className={styles.createBtn} onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? 'Отмена' : '+ Новый тег'}
        </button>
      </div>

      {showCreate && (
        <div className={styles.createForm}>
          <h3 className={styles.formTitle}>Создать тег</h3>
          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.formRow}>
            <select className={styles.input} value={newTagType} onChange={(e) => setNewTagType(e.target.value)}>
              {TAG_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div className={styles.formRow}>
            <input className={styles.input} value={newNameRu} onChange={(e) => setNewNameRu(e.target.value)} placeholder="Название (рус) *" />
            <input className={styles.input} value={newNameEn} onChange={(e) => setNewNameEn(e.target.value)} placeholder="Название (eng)" />
          </div>

          <div className={styles.tmdbSection}>
            <label className={styles.label}>Поиск TMDB (необязательно)</label>
            <input
              className={styles.input}
              value={tmdbSearch}
              onChange={(e) => { setTmdbSearch(e.target.value); searchTmdbApi(e.target.value); }}
              placeholder="Поиск фильма, сериала, персоны..."
            />
            {selectedTmdb && (
              <div className={styles.selectedTmdb}>
                Выбрано: {selectedTmdb.title} ({selectedTmdb.mediaType}, #{selectedTmdb.tmdbId})
                <button className={styles.clearBtn} onClick={() => setSelectedTmdb(null)}>×</button>
              </div>
            )}
            {tmdbResults.length > 0 && !selectedTmdb && (
              <div className={styles.tmdbResults}>
                {tmdbResults.map((r) => (
                  <button
                    key={`${r.mediaType}-${r.tmdbId}`}
                    className={styles.tmdbResult}
                    onClick={() => {
                      setSelectedTmdb(r);
                      if (!newNameRu) setNewNameRu(r.title);
                      if (!newNameEn) setNewNameEn(r.originalTitle);
                      if (r.mediaType === 'tv') setNewTagType('tv');
                      else if (r.mediaType === 'person') setNewTagType('person');
                      else setNewTagType('movie');
                      setTmdbResults([]);
                    }}
                  >
                    <span className={styles.tmdbType}>{r.mediaType}</span>
                    <span className={styles.tmdbTitle}>{r.title}</span>
                    {r.releaseDate && <span className={styles.tmdbYear}>{r.releaseDate.slice(0, 4)}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button className={styles.saveBtn} onClick={createTag} disabled={saving}>
            {saving ? 'Сохранение...' : 'Создать тег'}
          </button>
        </div>
      )}

      <div className={styles.filters}>
        <input
          className={styles.input}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск тегов..."
          style={{ maxWidth: 250 }}
        />
        <select className={styles.input} value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ maxWidth: 160 }}>
          <option value="">Все типы</option>
          {TAG_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      {loading ? (
        <p className={styles.placeholder}>Загрузка...</p>
      ) : tags.length === 0 ? (
        <p className={styles.placeholder}>Нет тегов</p>
      ) : (
        <div className={styles.tagList}>
          {tags.map((tag) => (
            <div key={tag.id} className={styles.tagItem}>
              <div className={styles.tagInfo}>
                <span className={styles.tagTypeBadge}>{tag.tagType}</span>
                <span className={styles.tagName}>{tag.nameRu}</span>
                {tag.nameEn && <span className={styles.tagNameEn}>{tag.nameEn}</span>}
                {tag.tmdbEntity && <span className={styles.tmdbBadge}>TMDB</span>}
              </div>
              <div className={styles.tagActions}>
                <span className={styles.articleCount}>{tag.articleCount} статей</span>
                <button className={styles.deleteBtn} onClick={() => deleteTag(tag.id)}>Удалить</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
