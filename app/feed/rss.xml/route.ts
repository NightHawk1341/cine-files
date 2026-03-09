import { prisma } from '@/lib/db';
import { config } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function GET() {
  const baseUrl = config.appUrl;

  const articles = await prisma.article.findMany({
    where: { status: 'published' },
    include: {
      category: { select: { slug: true, nameRu: true } },
      author: { select: { displayName: true } },
    },
    orderBy: { publishedAt: 'desc' },
    take: 50,
  });

  const escapeXml = (str: string) =>
    str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

  const items = articles
    .map((article) => {
      const link = `${baseUrl}/${article.category.slug}/${article.slug}`;
      const pubDate = article.publishedAt
        ? new Date(article.publishedAt).toUTCString()
        : new Date(article.createdAt).toUTCString();

      return `    <item>
      <title>${escapeXml(article.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${pubDate}</pubDate>
      <category>${escapeXml(article.category.nameRu)}</category>
      ${article.author.displayName ? `<dc:creator>${escapeXml(article.author.displayName)}</dc:creator>` : ''}
      ${article.lead ? `<description>${escapeXml(article.lead)}</description>` : ''}
      ${article.coverImageUrl ? `<enclosure url="${escapeXml(article.coverImageUrl)}" type="image/jpeg" />` : ''}
    </item>`;
    })
    .join('\n');

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>CineFiles</title>
    <link>${baseUrl}</link>
    <description>Кино, сериалы, обзоры и новости</description>
    <language>ru</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${baseUrl}/feed/rss.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

  return new Response(rss, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
