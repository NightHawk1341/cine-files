const { config } = require('../lib/config');

/**
 * GET /sitemap.xml
 */
function sitemap({ pool }) {
  return async (req, res) => {
    const baseUrl = config.appUrl;

    try {
      const [categoriesResult, articlesResult, tagsResult, collectionsResult] = await Promise.all([
        pool.query('SELECT slug FROM categories'),
        pool.query(
          `SELECT a.slug, a.updated_at, a.published_at, c.slug AS category_slug
           FROM articles a JOIN categories c ON a.category_id = c.id
           WHERE a.status = 'published'
           ORDER BY a.published_at DESC`
        ),
        pool.query('SELECT slug FROM tags WHERE article_count > 0'),
        pool.query("SELECT slug FROM collections WHERE is_visible = true"),
      ]);

      const urls = [
        `<url><loc>${baseUrl}</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
        `<url><loc>${baseUrl}/tags</loc><changefreq>daily</changefreq><priority>0.8</priority></url>`,
        `<url><loc>${baseUrl}/collections</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>`,
        `<url><loc>${baseUrl}/search</loc><changefreq>monthly</changefreq><priority>0.5</priority></url>`,
        `<url><loc>${baseUrl}/about</loc><changefreq>monthly</changefreq><priority>0.3</priority></url>`,
      ];

      for (const cat of categoriesResult.rows) {
        urls.push(`<url><loc>${baseUrl}/${cat.slug}</loc><changefreq>daily</changefreq><priority>0.9</priority></url>`);
      }

      for (const a of articlesResult.rows) {
        const lastmod = a.updated_at || a.published_at;
        urls.push(`<url><loc>${baseUrl}/${a.category_slug}/${a.slug}</loc>${lastmod ? `<lastmod>${new Date(lastmod).toISOString()}</lastmod>` : ''}<changefreq>weekly</changefreq><priority>0.7</priority></url>`);
      }

      for (const tag of tagsResult.rows) {
        urls.push(`<url><loc>${baseUrl}/tag/${tag.slug}</loc><changefreq>weekly</changefreq><priority>0.6</priority></url>`);
      }

      for (const col of collectionsResult.rows) {
        urls.push(`<url><loc>${baseUrl}/collection/${col.slug}</loc><changefreq>weekly</changefreq><priority>0.6</priority></url>`);
      }

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;

      res.set('Content-Type', 'application/xml; charset=utf-8');
      res.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
      res.send(xml);
    } catch (err) {
      console.error('Sitemap error:', err);
      res.status(500).send('Error generating sitemap');
    }
  };
}

module.exports = { sitemap };
