import type { Block } from '@/lib/types';
import type { ReactNode } from 'react';
import styles from '@/styles/components/article-body.module.css';

interface ArticleBodyProps {
  blocks: Block[];
  /** Map of block index to custom React node (e.g., server-rendered TributeProductsBlock) */
  customBlocks?: Map<number, ReactNode>;
}

export function ArticleBody({ blocks, customBlocks }: ArticleBodyProps) {
  return (
    <div className={styles.body}>
      {blocks.map((block, index) => {
        const custom = customBlocks?.get(index);
        if (custom) return <div key={index}>{custom}</div>;
        return <BlockRenderer key={index} block={block} />;
      })}
    </div>
  );
}

function BlockRenderer({ block }: { block: Block }) {
  switch (block.type) {
    case 'paragraph':
      return (
        <p
          className={styles.paragraph}
          dangerouslySetInnerHTML={{ __html: sanitizeInlineHtml(block.text) }}
        />
      );

    case 'heading': {
      const Tag = `h${block.level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
      return <Tag className={styles.heading}>{block.text}</Tag>;
    }

    case 'image':
      return (
        <figure className={styles.figure}>
          <img src={block.url} alt={block.alt} className={styles.image} loading="lazy" />
          {(block.caption || block.credit) && (
            <figcaption className={styles.figcaption}>
              {block.caption}
              {block.credit && (
                <span className={styles.credit}> {block.credit}</span>
              )}
            </figcaption>
          )}
        </figure>
      );

    case 'quote':
      return (
        <blockquote className={styles.quote}>
          <p dangerouslySetInnerHTML={{ __html: sanitizeInlineHtml(block.text) }} />
          {(block.author || block.source) && (
            <footer className={styles.quoteFooter}>
              {block.author && <cite>{block.author}</cite>}
              {block.source && <span>, {block.source}</span>}
            </footer>
          )}
        </blockquote>
      );

    case 'list': {
      const ListTag = block.style === 'ordered' ? 'ol' : 'ul';
      return (
        <ListTag className={styles.list}>
          {block.items.map((item, i) => (
            <li key={i} dangerouslySetInnerHTML={{ __html: sanitizeInlineHtml(item) }} />
          ))}
        </ListTag>
      );
    }

    case 'embed':
      return <VideoEmbed provider={block.provider} videoId={block.videoId} />;

    case 'divider':
      return <hr className={styles.divider} />;

    case 'spoiler':
      return (
        <details className={styles.spoiler}>
          <summary className={styles.spoilerTitle}>{block.title}</summary>
          <div className={styles.spoilerContent}>
            {block.blocks.map((b, i) => (
              <BlockRenderer key={i} block={b} />
            ))}
          </div>
        </details>
      );

    case 'infobox':
      return (
        <aside className={styles.infobox}>
          <div className={styles.infoboxTitle}>{block.title}</div>
          <div className={styles.infoboxContent}>
            {block.blocks.map((b, i) => (
              <BlockRenderer key={i} block={b} />
            ))}
          </div>
        </aside>
      );

    case 'tribute_products':
      return (
        <div className={styles.tributeBlock}>
          <p className={styles.tributePlaceholder}>
            Связанные товары TR-BUTE: {block.productIds.join(', ')}
          </p>
        </div>
      );

    case 'movie_card':
      return (
        <div className={styles.movieCard}>
          <p className={styles.movieCardPlaceholder}>
            Карточка фильма (TMDB Entity #{block.tmdbEntityId})
          </p>
        </div>
      );

    default:
      return null;
  }
}

function VideoEmbed({ provider, videoId }: { provider: string; videoId: string }) {
  const embedUrls: Record<string, string> = {
    youtube: `https://www.youtube.com/embed/${videoId}`,
    vk_video: `https://vk.com/video_ext.php?oid=${videoId}`,
    rutube: `https://rutube.ru/play/embed/${videoId}`,
  };

  const src = embedUrls[provider];
  if (!src) return null;

  return (
    <div className={styles.embedWrapper}>
      <iframe
        src={src}
        className={styles.embedIframe}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        loading="lazy"
        title={`${provider} video`}
      />
    </div>
  );
}

// Simple inline HTML sanitizer — allows only basic formatting tags
function sanitizeInlineHtml(html: string): string {
  return html.replace(/<(?!\/?(?:b|i|em|strong|a|s|u|code|br)\b)[^>]*>/gi, '');
}
