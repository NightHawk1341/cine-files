const { config } = require('../lib/config');

/**
 * GET /feed/rss.xml
 */
function rss({ pool }) {
  return async (req, res) => {
    const baseUrl = config.appUrl;

    const { rows: articles } = await pool.query(
      `SELECT a.slug, a.title, a.lead, a.cover_image_url, a.published_at, a.created_at,
              c.slug AS category_slug, c.name_ru AS category_name_ru,
              u.display_name AS author_name
       FROM articles a
       JOIN categories c ON a.category_id = c.id
       JOIN users u ON a.author_id = u.id
       WHERE a.status = 'published'
       ORDER BY a.published_at DESC
       LIMIT 50`
    );

    const escapeXml = (str) =>
      str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
         .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

    const items = articles.map((a) => {
      const link = `${baseUrl}/${a.category_slug}/${a.slug}`;
      const pubDate = a.published_at
        ? new Date(a.published_at).toUTCString()
        : new Date(a.created_at).toUTCString();

      return `    <item>
      <title>${escapeXml(a.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${pubDate}</pubDate>
      <category>${escapeXml(a.category_name_ru)}</category>
      ${a.author_name ? `<dc:creator>${escapeXml(a.author_name)}</dc:creator>` : ''}
      ${a.lead ? `<description>${escapeXml(a.lead)}</description>` : ''}
      ${a.cover_image_url ? `<enclosure url="${escapeXml(a.cover_image_url)}" type="image/jpeg" />` : ''}
    </item>`;
    }).join('\n');

    const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
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

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.send(rssXml);
  };
}

module.exports = { rss };
