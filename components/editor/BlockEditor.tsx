'use client';

import { useState, useCallback } from 'react';
import type { Block } from '@/lib/types';
import styles from '@/styles/components/editor/blocks.module.css';

interface BlockEditorProps {
  initialBlocks?: Block[];
  onChange: (blocks: Block[]) => void;
}

const BLOCK_TYPES = [
  { type: 'paragraph', label: 'Параграф' },
  { type: 'heading', label: 'Заголовок' },
  { type: 'image', label: 'Изображение' },
  { type: 'quote', label: 'Цитата' },
  { type: 'list', label: 'Список' },
  { type: 'embed', label: 'Видео' },
  { type: 'divider', label: 'Разделитель' },
  { type: 'spoiler', label: 'Спойлер' },
  { type: 'infobox', label: 'Инфобокс' },
] as const;

function createEmptyBlock(type: string): Block {
  switch (type) {
    case 'paragraph': return { type: 'paragraph', text: '' };
    case 'heading': return { type: 'heading', level: 2, text: '' };
    case 'image': return { type: 'image', url: '', alt: '' };
    case 'quote': return { type: 'quote', text: '' };
    case 'list': return { type: 'list', style: 'unordered', items: [''] };
    case 'embed': return { type: 'embed', provider: 'youtube', videoId: '' };
    case 'divider': return { type: 'divider' };
    case 'spoiler': return { type: 'spoiler', title: '', blocks: [{ type: 'paragraph', text: '' }] };
    case 'infobox': return { type: 'infobox', title: '', blocks: [{ type: 'paragraph', text: '' }] };
    default: return { type: 'paragraph', text: '' };
  }
}

export function BlockEditor({ initialBlocks = [], onChange }: BlockEditorProps) {
  const [blocks, setBlocks] = useState<Block[]>(
    initialBlocks.length > 0 ? initialBlocks : [{ type: 'paragraph', text: '' }]
  );

  const updateBlocks = useCallback((newBlocks: Block[]) => {
    setBlocks(newBlocks);
    onChange(newBlocks);
  }, [onChange]);

  const addBlock = (type: string, afterIndex: number) => {
    const newBlock = createEmptyBlock(type);
    const updated = [...blocks];
    updated.splice(afterIndex + 1, 0, newBlock);
    updateBlocks(updated);
  };

  const removeBlock = (index: number) => {
    if (blocks.length <= 1) return;
    const updated = blocks.filter((_, i) => i !== index);
    updateBlocks(updated);
  };

  const updateBlock = (index: number, block: Block) => {
    const updated = [...blocks];
    updated[index] = block;
    updateBlocks(updated);
  };

  const moveBlock = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= blocks.length) return;
    const updated = [...blocks];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    updateBlocks(updated);
  };

  return (
    <div className={styles.editor}>
      {blocks.map((block, index) => (
        <div key={index} className={styles.blockWrapper}>
          <div className={styles.blockControls}>
            <button
              className={styles.controlBtn}
              onClick={() => moveBlock(index, 'up')}
              disabled={index === 0}
              title="Вверх"
            >
              ↑
            </button>
            <button
              className={styles.controlBtn}
              onClick={() => moveBlock(index, 'down')}
              disabled={index === blocks.length - 1}
              title="Вниз"
            >
              ↓
            </button>
            <button
              className={styles.controlBtn}
              onClick={() => removeBlock(index)}
              disabled={blocks.length <= 1}
              title="Удалить"
            >
              ×
            </button>
          </div>

          <div className={styles.blockContent}>
            <span className={styles.blockType}>{block.type}</span>
            <BlockInput block={block} onChange={(b) => updateBlock(index, b)} />
          </div>

          <div className={styles.addBlock}>
            <AddBlockMenu onSelect={(type) => addBlock(type, index)} />
          </div>
        </div>
      ))}
    </div>
  );
}

function BlockInput({ block, onChange }: { block: Block; onChange: (b: Block) => void }) {
  switch (block.type) {
    case 'paragraph':
      return (
        <textarea
          className={styles.textInput}
          value={block.text}
          onChange={(e) => onChange({ ...block, text: e.target.value })}
          placeholder="Введите текст..."
          rows={3}
        />
      );

    case 'heading':
      return (
        <div className={styles.headingInput}>
          <select
            className={styles.select}
            value={block.level}
            onChange={(e) => onChange({ ...block, level: parseInt(e.target.value) as 2 | 3 | 4 })}
          >
            <option value={2}>H2</option>
            <option value={3}>H3</option>
            <option value={4}>H4</option>
          </select>
          <input
            className={styles.textInput}
            value={block.text}
            onChange={(e) => onChange({ ...block, text: e.target.value })}
            placeholder="Заголовок..."
          />
        </div>
      );

    case 'image':
      return (
        <div className={styles.fieldGroup}>
          <input
            className={styles.textInput}
            value={block.url}
            onChange={(e) => onChange({ ...block, url: e.target.value })}
            placeholder="URL изображения..."
          />
          <input
            className={styles.textInput}
            value={block.alt}
            onChange={(e) => onChange({ ...block, alt: e.target.value })}
            placeholder="Alt текст..."
          />
          <input
            className={styles.textInput}
            value={block.caption || ''}
            onChange={(e) => onChange({ ...block, caption: e.target.value })}
            placeholder="Подпись (необязательно)"
          />
          <input
            className={styles.textInput}
            value={block.credit || ''}
            onChange={(e) => onChange({ ...block, credit: e.target.value })}
            placeholder="Источник (необязательно)"
          />
        </div>
      );

    case 'quote':
      return (
        <div className={styles.fieldGroup}>
          <textarea
            className={styles.textInput}
            value={block.text}
            onChange={(e) => onChange({ ...block, text: e.target.value })}
            placeholder="Текст цитаты..."
            rows={2}
          />
          <input
            className={styles.textInput}
            value={block.author || ''}
            onChange={(e) => onChange({ ...block, author: e.target.value })}
            placeholder="Автор (необязательно)"
          />
        </div>
      );

    case 'list':
      return (
        <div className={styles.fieldGroup}>
          <select
            className={styles.select}
            value={block.style}
            onChange={(e) => onChange({ ...block, style: e.target.value as 'ordered' | 'unordered' })}
          >
            <option value="unordered">Маркированный</option>
            <option value="ordered">Нумерованный</option>
          </select>
          {block.items.map((item, i) => (
            <div key={i} className={styles.listItem}>
              <input
                className={styles.textInput}
                value={item}
                onChange={(e) => {
                  const items = [...block.items];
                  items[i] = e.target.value;
                  onChange({ ...block, items });
                }}
                placeholder={`Пункт ${i + 1}...`}
              />
              <button
                className={styles.smallBtn}
                onClick={() => {
                  const items = block.items.filter((_, idx) => idx !== i);
                  onChange({ ...block, items: items.length ? items : [''] });
                }}
              >
                ×
              </button>
            </div>
          ))}
          <button
            className={styles.addItemBtn}
            onClick={() => onChange({ ...block, items: [...block.items, ''] })}
          >
            + Добавить пункт
          </button>
        </div>
      );

    case 'embed':
      return (
        <div className={styles.fieldGroup}>
          <select
            className={styles.select}
            value={block.provider}
            onChange={(e) => onChange({ ...block, provider: e.target.value as 'youtube' | 'vk_video' | 'rutube' })}
          >
            <option value="youtube">YouTube</option>
            <option value="vk_video">VK Video</option>
            <option value="rutube">Rutube</option>
          </select>
          <input
            className={styles.textInput}
            value={block.videoId}
            onChange={(e) => onChange({ ...block, videoId: e.target.value })}
            placeholder="ID видео..."
          />
        </div>
      );

    case 'divider':
      return <div className={styles.dividerPreview}>— Разделитель —</div>;

    case 'spoiler':
      return (
        <div className={styles.fieldGroup}>
          <input
            className={styles.textInput}
            value={block.title}
            onChange={(e) => onChange({ ...block, title: e.target.value })}
            placeholder="Заголовок спойлера..."
          />
          <p className={styles.hint}>Содержимое спойлера редактируется вложенно (будет в будущей версии)</p>
        </div>
      );

    case 'infobox':
      return (
        <div className={styles.fieldGroup}>
          <input
            className={styles.textInput}
            value={block.title}
            onChange={(e) => onChange({ ...block, title: e.target.value })}
            placeholder="Заголовок инфобокса..."
          />
          <p className={styles.hint}>Содержимое инфобокса редактируется вложенно (будет в будущей версии)</p>
        </div>
      );

    default:
      return <p className={styles.hint}>Неизвестный тип блока</p>;
  }
}

function AddBlockMenu({ onSelect }: { onSelect: (type: string) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.addBlockWrapper}>
      <button
        className={styles.addBlockBtn}
        onClick={() => setOpen(!open)}
      >
        +
      </button>
      {open && (
        <div className={styles.addBlockMenu}>
          {BLOCK_TYPES.map((bt) => (
            <button
              key={bt.type}
              className={styles.addBlockOption}
              onClick={() => {
                onSelect(bt.type);
                setOpen(false);
              }}
            >
              {bt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
