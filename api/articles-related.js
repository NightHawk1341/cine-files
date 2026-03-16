const { config } = require('../lib/config');

/**
 * GET /api/articles/related
 * Public endpoint — called by TR-BUTE to show related CineFiles articles.
 *
 * Query params:
 *   tribute_product_id — integer, find articles linked to this TR-BUTE product
 *   tag_slug           — comma-separated search terms (Russian names, English names, slugs)
 *                        Each term is matched against tag slug (exact + prefix), name_ru, name_en
 *   limit              — max results (1–20, default 5)
 */
function list({ pool }) {
  return async (req, res) => {
    try {
      const tributeProductId = req.query.tribute_product_id;
      const tagSlug = req.query.tag_slug;
      const limit = Math.min(Math.max(parseInt(req.query.limit || '5', 10), 1), 20);

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
        // Parse comma-separated search terms (slugs, Russian names, English names)
        const terms = tagSlug
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
          .slice(0, 10);

        if (terms.length === 0) {
          return res.json({ articles: [] });
        }

        // Match each search term against tags via:
        //   1. Exact slug match
        //   2. Slug prefix match (e.g. "dyuna" matches "dyuna-chast-vtoraya")
        //   3. Tag name_ru contains term (ILIKE)
        //   4. Tag name_en contains term (ILIKE)
        //   5. Term contains tag name_ru (reverse ILIKE)
        //   6. Term contains tag name_en (reverse ILIKE)
        // CROSS JOIN unnest handles multiple terms in a single query.
        // DISTINCT prevents duplicate articles when multiple tags/terms match.
        const result = await pool.query(
          `SELECT DISTINCT a.slug, a.title, a.lead, a.cover_image_url, a.published_at,
                  c.slug AS category_slug, c.name_ru AS category_name_ru
           FROM articles a
           JOIN categories c ON a.category_id = c.id
           JOIN article_tags at2 ON at2.article_id = a.id
           JOIN tags t ON at2.tag_id = t.id
           CROSS JOIN unnest($1::text[]) AS search_term
           WHERE a.status = 'published' AND (
             t.slug = search_term
             OR t.slug LIKE search_term || '-%'
             OR t.name_ru ILIKE '%' || search_term || '%'
             OR t.name_en ILIKE '%' || search_term || '%'
             OR search_term ILIKE '%' || t.name_ru || '%'
             OR search_term ILIKE '%' || t.name_en || '%'
           )
           ORDER BY a.published_at DESC
           LIMIT $2`,
          [terms, limit]
        );
        rows = result.rows;
      }

      const articles = rows.map(a => ({
        title: a.title,
        lead: a.lead,
        coverImageUrl: a.cover_image_url,
        publishedAt: a.published_at,
        url: `${config.appUrl}/${a.category_slug}/${a.slug}`,
        slug: a.slug,
        category: {
          slug: a.category_slug,
          nameRu: a.category_name_ru,
        },
      }));

      res.set('Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=3600');
      res.json({ articles });
    } catch (err) {
      console.error('Articles related error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

module.exports = { list };
