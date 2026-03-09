import { supabase, camelizeKeys } from '@/lib/db';
import { config } from '@/lib/config';

export async function GET() {
  const baseUrl = config.appUrl;

  const { data } = await supabase
    .from('articles')
    .select(`
      slug, title, lead, cover_image_url, published_at, created_at,
      category:categories(slug, name_ru),
      author:users!author_id(display_name)
    `)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(50);

  const articles = camelizeKeys<Array<{
    slug: string; title: string; lead: string | null;
    coverImageUrl: string | null; publishedAt: string | null; createdAt: string;
    category: { slug: string; nameRu: string };
    author: { displayName: string | null };
  }>>(data || []);

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
