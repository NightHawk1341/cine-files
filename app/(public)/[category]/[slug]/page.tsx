import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { supabase, camelizeKeys } from '@/lib/db';
import { notFound } from 'next/navigation';
import { ArticleMeta } from '@/components/article/ArticleMeta';
import { ArticleBody } from '@/components/article/ArticleBody';
import { TributeProductsBlock } from '@/components/tribute/TributeProductsBlock';
import { CommentList } from '@/components/comments/CommentList';
import type { Block } from '@/lib/types';
import styles from '@/styles/pages/article.module.css';

interface ArticlePageProps {
  params: Promise<{ category: string; slug: string }>;
}

const ARTICLE_SELECT = `
  *,
  category:categories(*),
  author:users!author_id(id, display_name, avatar_url),
  tags:article_tags(*, tag:tags(*))
`;

interface ArticleData {
  id: number;
  slug: string;
  title: string;
  subtitle: string | null;
  lead: string | null;
  body: Block[];
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  coverImageCredit: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  status: string;
  publishedAt: string | null;
  updatedAt: string | null;
  viewCount: number;
  commentCount: number;
  allowComments: boolean;
  category: { slug: string; nameRu: string };
  author: { id: number; displayName: string | null; avatarUrl: string | null };
  tags: Array<{ tag: { slug: string; nameRu: string } }>;
}

async function getArticle(slug: string): Promise<ArticleData | null> {
  const { data } = await supabase
    .from('articles')
    .select(ARTICLE_SELECT)
    .eq('slug', slug)
    .eq('status', 'published')
    .single();

  return data ? camelizeKeys<ArticleData>(data) : null;
}

export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticle(slug);
  if (!article) return { title: 'Статья не найдена' };

  const title = article.metaTitle || article.title;
  const description = article.metaDescription || article.lead || undefined;

  return {
    title: `${title} — CineFiles`,
    description,
    openGraph: {
      title,
      description,
      type: 'article',
      publishedTime: article.publishedAt || undefined,
      modifiedTime: article.updatedAt || undefined,
      authors: article.author.displayName ? [article.author.displayName] : undefined,
      images: article.coverImageUrl ? [article.coverImageUrl] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: article.coverImageUrl ? [article.coverImageUrl] : undefined,
    },
    ...(article.canonicalUrl && { alternates: { canonical: article.canonicalUrl } }),
  };
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params;
  const article = await getArticle(slug);
  if (!article) notFound();

  // Increment view count (fire-and-forget)
  supabase
    .from('articles')
    .select('view_count')
    .eq('id', article.id)
    .single()
    .then(({ data }) => {
      if (data) {
        supabase
          .from('articles')
          .update({ view_count: data.view_count + 1 })
          .eq('id', article.id)
          .then();
      }
    })
    .catch(() => {});

  const blocks = article.body as Block[];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    ...(article.lead && { description: article.lead }),
    ...(article.coverImageUrl && { image: article.coverImageUrl }),
    datePublished: article.publishedAt,
    ...(article.updatedAt && { dateModified: article.updatedAt }),
    author: {
      '@type': 'Person',
      name: article.author.displayName || 'CineFiles',
    },
    publisher: {
      '@type': 'Organization',
      name: 'CineFiles',
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `/${article.category.slug}/${article.slug}`,
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <article className={`container ${styles.article}`}>
        {article.coverImageUrl && (
          <div className={styles.cover}>
            <img
              src={article.coverImageUrl}
              alt={article.coverImageAlt || article.title}
              className={styles.coverImage}
            />
            {article.coverImageCredit && (
              <p className={styles.coverCredit}>{article.coverImageCredit}</p>
            )}
          </div>
        )}

        <ArticleMeta
          categorySlug={article.category.slug}
          categoryName={article.category.nameRu}
          title={article.title}
          subtitle={article.subtitle}
          authorName={article.author.displayName}
          authorId={article.author.id}
          publishedAt={article.publishedAt}
          updatedAt={article.updatedAt}
          viewCount={article.viewCount}
          commentCount={article.commentCount}
        />

        {article.lead && <p className={styles.lead}>{article.lead}</p>}

        <ArticleBody blocks={blocks} customBlocks={buildCustomBlocks(blocks)} />

        {article.tags.length > 0 && (
          <div className={styles.tags}>
            {article.tags.map((at) => (
              <a
                key={at.tag.slug}
                href={`/tag/${at.tag.slug}`}
                className={styles.tag}
              >
                {at.tag.nameRu}
              </a>
            ))}
          </div>
        )}

        <CommentList articleId={article.id} allowComments={article.allowComments} />
      </article>
    </>
  );
}

function buildCustomBlocks(blocks: Block[]): Map<number, ReactNode> {
  const map = new Map<number, ReactNode>();
  blocks.forEach((block, index) => {
    if (block.type === 'tribute_products') {
      map.set(index, <TributeProductsBlock productIds={block.productIds} />);
    }
  });
  return map;
}
