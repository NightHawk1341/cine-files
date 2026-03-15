const { config } = require('../lib/config');

/**
 * GET /api/articles/related
 * Called by TR-BUTE to show related CineFiles articles.
 */
function list({ pool }) {
  return async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    const validKey = config.cinefilesApi.apiKey || config.tribute.apiKey;
    if (validKey && apiKey !== validKey) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const tributeProductId = req.query.tribute_product_id;
    const tagSlug = req.query.tag_slug;
    const limit = Math.min(parseInt(req.query.limit || '5'), 20);

    if (!tributeProductId && !tagSlug) {
      return res.status(400).json({ error: 'Provide tribute_product_id or tag_slug' });
    }

    let rows;

    if (tributeProductId) {
      const result = await pool.query(
        `SELECT a.slug, a.title, a.lead, a.cover_image_url, a.published_at,
                c.slug AS category_slug, c.name_ru AS category_name_ru
         FROM articles a
         JOIN categories c ON a.category_id = c.id
         WHERE a.status = 'published' AND $1 = ANY(a.tribute_product_ids)
         ORDER BY a.published_at DESC
         LIMIT $2`,
        [parseInt(tributeProductId), limit]
      );
      rows = result.rows;
    } else {
      const result = await pool.query(
        `SELECT a.slug, a.title, a.lead, a.cover_image_url, a.published_at,
                c.slug AS category_slug, c.name_ru AS category_name_ru
         FROM articles a
         JOIN categories c ON a.category_id = c.id
         JOIN article_tags at ON at.article_id = a.id
         JOIN tags t ON at.tag_id = t.id
         WHERE a.status = 'published' AND t.slug = $1
         ORDER BY a.published_at DESC
         LIMIT $2`,
        [tagSlug, limit]
      );
      rows = result.rows;
    }

    const articles = rows.map(a => ({
      title: a.title,
      lead: a.lead,
      coverImageUrl: a.cover_image_url,
      publishedAt: a.published_at,
      url: `${config.appUrl}/${a.category_slug}/${a.slug}`,
      category: a.category_name_ru,
    }));

    res.json({ articles });
  };
}

module.exports = { list };
