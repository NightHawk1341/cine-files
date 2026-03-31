/**
 * Article analytics endpoints.
 *
 * POST /api/articles/:id/view — increment view count
 * GET  /api/admin/analytics    — dashboard stats
 */

/**
 * POST /api/articles/:id/view
 * Increments article view_count. Fire-and-forget from the client.
 */
function viewArticle({ pool }) {
  return async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (!id || isNaN(id)) return res.status(400).json({ error: 'Invalid article ID' });

      await pool.query(
        'UPDATE articles SET view_count = view_count + 1 WHERE id = $1',
        [id]
      );
      res.json({ ok: true });
    } catch (err) {
      console.error('View increment error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

/**
 * GET /api/admin/analytics
 * Returns dashboard statistics for the admin panel.
 */
function dashboard({ pool }) {
  return async (req, res) => {
    try {
      const [
        articlesResult,
        viewsResult,
        commentsResult,
        usersResult,
        topArticlesResult,
        byCategoryResult,
        recentResult,
        topAuthorsResult,
      ] = await Promise.all([
        pool.query(`SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'published')::int AS published,
          COUNT(*) FILTER (WHERE status = 'draft')::int AS drafts
          FROM articles`),
        pool.query('SELECT COALESCE(SUM(view_count), 0)::int AS total_views FROM articles'),
        pool.query(`SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'visible')::int AS visible
          FROM comments`),
        pool.query('SELECT COUNT(*)::int AS total FROM users'),
        pool.query(
          `SELECT a.id, a.title, a.slug, a.view_count, a.comment_count,
                  c.slug AS category_slug, c.name_ru AS category_name
           FROM articles a
           JOIN categories c ON a.category_id = c.id
           WHERE a.status = 'published'
           ORDER BY a.view_count DESC
           LIMIT 10`
        ),
        pool.query(
          `SELECT c.name_ru AS category, COUNT(*)::int AS count,
                  COALESCE(SUM(a.view_count), 0)::int AS views
           FROM articles a
           JOIN categories c ON a.category_id = c.id
           WHERE a.status = 'published'
           GROUP BY c.name_ru
           ORDER BY views DESC`
        ),
        pool.query(
          `SELECT a.id, a.title, a.slug, a.status, a.created_at,
                  u.display_name AS author_name, c.slug AS category_slug
           FROM articles a
           JOIN users u ON a.author_id = u.id
           JOIN categories c ON a.category_id = c.id
           ORDER BY a.created_at DESC
           LIMIT 5`
        ),
        pool.query(
          `SELECT u.id, u.display_name,
                  COUNT(a.id)::int AS article_count,
                  COALESCE(SUM(a.view_count), 0)::int AS total_views
           FROM users u
           JOIN articles a ON a.author_id = u.id
           WHERE a.status = 'published'
           GROUP BY u.id, u.display_name
           ORDER BY total_views DESC
           LIMIT 10`
        ),
      ]);

      res.json({
        articles: articlesResult.rows[0],
        totalViews: viewsResult.rows[0].total_views,
        comments: commentsResult.rows[0],
        userCount: usersResult.rows[0].total,
        topArticles: topArticlesResult.rows.map(function (r) {
          return {
            id: r.id,
            title: r.title,
            slug: r.slug,
            categorySlug: r.category_slug,
            category: r.category_name,
            viewCount: Number(r.view_count),
            commentCount: Number(r.comment_count),
          };
        }),
        byCategory: byCategoryResult.rows,
        recentArticles: recentResult.rows.map(function (r) {
          return {
            id: r.id,
            title: r.title,
            slug: r.slug,
            status: r.status,
            createdAt: r.created_at,
            authorName: r.author_name,
            categorySlug: r.category_slug,
          };
        }),
        topAuthors: topAuthorsResult.rows.map(function (r) {
          return {
            id: r.id,
            displayName: r.display_name,
            articleCount: r.article_count,
            totalViews: r.total_views,
          };
        }),
      });
    } catch (err) {
      console.error('Analytics dashboard error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

module.exports = { viewArticle, dashboard };
