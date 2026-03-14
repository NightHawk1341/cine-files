/**
 * GET /api/categories
 */
function list({ pool }) {
  return async (req, res) => {
    const { rows } = await pool.query(
      `SELECT c.id, c.slug, c.name_ru, c.name_en, c.description,
              COUNT(a.id) FILTER (WHERE a.status = 'published')::int AS article_count
       FROM categories c
       LEFT JOIN articles a ON a.category_id = c.id
       GROUP BY c.id
       ORDER BY c.sort_order ASC`
    );

    res.json({
      categories: rows.map(r => ({
        id: r.id,
        slug: r.slug,
        nameRu: r.name_ru,
        nameEn: r.name_en,
        description: r.description,
        articleCount: r.article_count,
      })),
    });
  };
}

module.exports = { list };
