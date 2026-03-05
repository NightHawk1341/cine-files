import { MetadataRoute } from 'next';
import { prisma } from '@/lib/db';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.APP_URL || 'https://cinefiles.ru';

  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${baseUrl}/tags`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
    { url: `${baseUrl}/collections`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
    { url: `${baseUrl}/search`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
  ];

  try {
    const categories = await prisma.category.findMany({ select: { slug: true } });
    const categoryPages: MetadataRoute.Sitemap = categories.map((cat) => ({
      url: `${baseUrl}/${cat.slug}`,
      changeFrequency: 'daily',
      priority: 0.9,
    }));

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
    const articlePages: MetadataRoute.Sitemap = articles.map((article) => ({
      url: `${baseUrl}/${article.category.slug}/${article.slug}`,
      lastModified: article.updatedAt || article.publishedAt || new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
    }));

    const tags = await prisma.tag.findMany({
      where: { articleCount: { gt: 0 } },
      select: { slug: true },
    });
    const tagPages: MetadataRoute.Sitemap = tags.map((tag) => ({
      url: `${baseUrl}/tag/${tag.slug}`,
      changeFrequency: 'weekly',
      priority: 0.6,
    }));

    const collections = await prisma.collection.findMany({
      where: { isVisible: true },
      select: { slug: true },
    });
    const collectionPages: MetadataRoute.Sitemap = collections.map((col) => ({
      url: `${baseUrl}/collection/${col.slug}`,
      changeFrequency: 'weekly',
      priority: 0.6,
    }));

    return [...staticPages, ...categoryPages, ...articlePages, ...tagPages, ...collectionPages];
  } catch {
    return staticPages;
  }
}
