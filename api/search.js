/**
 * GET /api/search?q=query
 */
function search({ pool }) {
  return async (req, res) => {
    const query = req.query.q;
    const page = Math.max(1, parseInt(req.query.page || '1'));
    const limit = Math.min(parseInt(req.query.limit || '20'), 50);
    const offset = (page - 1) * limit;

    if (!query || query.length < 2) {
      return res.status(400).json({ error: 'Query must be at least 2 characters' });
    }

    const searchPattern = `%${query}%`;

    const [articlesResult, countResult, tagsResult] = await Promise.all([
      pool.query(
        `SELECT a.*, c.slug AS category_slug, c.name_ru AS category_name_ru, c.name_en AS category_name_en,
                u.id AS author_id_val, u.display_name AS author_display_name, u.avatar_url AS author_avatar_url
         FROM articles a
         JOIN categories c ON a.category_id = c.id
         JOIN users u ON a.author_id = u.id
         WHERE a.status = 'published'
           AND (a.title ILIKE $1 OR a.lead ILIKE $1 OR a.subtitle ILIKE $1)
         ORDER BY a.published_at DESC
         LIMIT $2 OFFSET $3`,
        [searchPattern, limit, offset]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total FROM articles
         WHERE status = 'published'
           AND (title ILIKE $1 OR lead ILIKE $1 OR subtitle ILIKE $1)`,
        [searchPattern]
      ),
      pool.query(
        `SELECT id, slug, name_ru, name_en, tag_type, article_count
         FROM tags
         WHERE name_ru ILIKE $1 AND article_count > 0
         ORDER BY article_count DESC
         LIMIT 10`,
        [searchPattern]
      ),
    ]);

    const total = countResult.rows[0].total;

    // Fetch tags for articles
    const articleIds = articlesResult.rows.map(a => a.id);
    let tagsByArticle = {};
    if (articleIds.length > 0) {
      const atResult = await pool.query(
        `SELECT at.article_id, at.is_primary, t.slug, t.name_ru, t.tag_type
         FROM article_tags at JOIN tags t ON at.tag_id = t.id
         WHERE at.article_id = ANY($1)`,
        [articleIds]
      );
      for (const row of atResult.rows) {
        if (!tagsByArticle[row.article_id]) tagsByArticle[row.article_id] = [];
        tagsByArticle[row.article_id].push({
          slug: row.slug, nameRu: row.name_ru, tagType: row.tag_type, isPrimary: row.is_primary,
        });
      }
    }

    const { formatArticle } = require('./articles');
    const articles = articlesResult.rows.map(formatArticle(tagsByArticle));

    const tags = tagsResult.rows.map(r => ({
      id: r.id,
      slug: r.slug,
      nameRu: r.name_ru,
      nameEn: r.name_en,
      tagType: r.tag_type,
      articleCount: Number(r.article_count),
    }));

    res.json({
      articles,
      tags,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  };
}

module.exports = { search };
