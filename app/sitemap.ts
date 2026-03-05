import { MetadataRoute } from 'next';
import { prisma } from '@/lib/db';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.APP_URL || 'https://cinefiles.ru';

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${baseUrl}/tags`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
    { url: `${baseUrl}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
  ];

  // Published articles
  let articlePages: MetadataRoute.Sitemap = [];
  try {
    const articles = await prisma.article.findMany({
      where: { status: 'published' },
      select: {
        slug: true,
        updatedAt: true,
        publishedAt: true,
        category: { select: { slug: true } },
      },
      orderBy: { publishedAt: 'desc' },
    });

    articlePages = articles.map((article) => ({
      url: `${baseUrl}/${article.category.slug}/${article.slug}`,
      lastModified: article.updatedAt || article.publishedAt || new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }));
  } catch {
    // DB not available during build — return static pages only
  }

  // Tag pages
  let tagPages: MetadataRoute.Sitemap = [];
  try {
    const tags = await prisma.tag.findMany({
      where: { articleCount: { gt: 0 } },
      select: { slug: true },
    });

    tagPages = tags.map((tag) => ({
      url: `${baseUrl}/tag/${tag.slug}`,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    }));
  } catch {
    // DB not available during build
  }

  return [...staticPages, ...articlePages, ...tagPages];
}
