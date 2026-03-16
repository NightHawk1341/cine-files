const { fetchTributeProducts, searchTributeProductsByTags } = require('../lib/tribute-api');

/**
 * GET /api/articles/:id/products
 * Returns TR-BUTE products for an article.
 * Uses manual tribute_product_ids if set, otherwise auto-matches by tag names.
 */
function get({ pool }) {
  return async (req, res) => {
    try {
      const { id } = req.params;
      const isNumeric = /^\d+$/.test(id);

      const { rows } = await pool.query(
        `SELECT a.id, a.tribute_product_ids,
                COALESCE(
                  json_agg(
                    json_build_object('slug', t.slug, 'nameRu', t.name_ru, 'nameEn', t.name_en, 'tagType', t.tag_type)
                  ) FILTER (WHERE t.id IS NOT NULL),
                  '[]'
                ) AS tags
         FROM articles a
         LEFT JOIN article_tags at ON at.article_id = a.id
         LEFT JOIN tags t ON at.tag_id = t.id
         WHERE ${isNumeric ? 'a.id = $1' : 'a.slug = $1'}
         GROUP BY a.id
         LIMIT 1`,
        [isNumeric ? parseInt(id, 10) : id]
      );

      if (!rows[0]) return res.status(404).json({ error: 'Not found' });

      const row = rows[0];
      const manualIds = row.tribute_product_ids || [];

      if (manualIds.length > 0) {
        const products = await fetchTributeProducts(manualIds);
        return res.json({ products, source: 'manual' });
      }

      const tags = row.tags || [];
      const products = await searchTributeProductsByTags(tags);
      res.json({ products, source: 'auto' });
    } catch (err) {
      console.error('Article products error:', err);
      res.json({ products: [], source: 'auto' });
    }
  };
}

module.exports = { get };
