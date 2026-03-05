import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import { ArticleMeta } from '@/components/article/ArticleMeta';
import { ArticleBody } from '@/components/article/ArticleBody';
import { TributeProductsBlock } from '@/components/tribute/TributeProductsBlock';
import type { Block } from '@/lib/types';
import styles from '@/styles/pages/article.module.css';

interface ArticlePageProps {
  params: Promise<{ category: string; slug: string }>;
}

async function getArticle(slug: string) {
  return prisma.article.findFirst({
    where: { slug, status: 'published' },
    include: {
      category: true,
      author: { select: { id: true, displayName: true, avatarUrl: true } },
      tags: { include: { tag: true } },
    },
  });
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
      publishedTime: article.publishedAt?.toISOString(),
      modifiedTime: article.updatedAt?.toISOString() || undefined,
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
  prisma.article.update({
    where: { id: article.id },
    data: { viewCount: { increment: 1 } },
  }).catch(() => {});

  const blocks = article.body as Block[];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    ...(article.lead && { description: article.lead }),
    ...(article.coverImageUrl && { image: article.coverImageUrl }),
    datePublished: article.publishedAt?.toISOString(),
    ...(article.updatedAt && { dateModified: article.updatedAt.toISOString() }),
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
          publishedAt={article.publishedAt?.toISOString()}
          updatedAt={article.updatedAt?.toISOString()}
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
