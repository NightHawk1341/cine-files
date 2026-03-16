const { generateSlug } = require('../server/utils/transliterate');
const { config } = require('../lib/config');

/**
 * GET /api/articles
 */
function list({ pool }) {
  return async (req, res) => {
    try {
    const page = Math.max(1, parseInt(req.query.page || '1'));
    const limit = Math.min(parseInt(req.query.limit || '20'), 100);
    const offset = (page - 1) * limit;
    const category = req.query.category;
    const status = req.query.status || 'published';
    const featured = req.query.featured;
    const authorId = req.query.author_id;
    const tributeProductId = req.query.tribute_product_id;
    const tag = req.query.tag;

    const sort = req.query.sort;

    const conditions = ['a.status = $1'];
    const params = [status];
    let paramIdx = 2;
    let joinTag = '';

    if (category) {
      conditions.push(`c.slug = $${paramIdx}`);
      params.push(category);
      paramIdx++;
    }
    if (featured === 'true') {
      conditions.push('a.is_featured = true');
    }
    if (authorId) {
      conditions.push(`a.author_id = $${paramIdx}`);
      params.push(parseInt(authorId));
      paramIdx++;
    }
    if (tributeProductId) {
      conditions.push(`$${paramIdx} = ANY(a.tribute_product_ids)`);
      params.push(parseInt(tributeProductId));
      paramIdx++;
    }
    if (tag) {
      joinTag = `JOIN article_tags atg ON atg.article_id = a.id JOIN tags tg ON atg.tag_id = tg.id AND tg.slug = $${paramIdx}`;
      params.push(tag);
      paramIdx++;
    }

    const whereClause = conditions.join(' AND ');

    const [articlesResult, countResult] = await Promise.all([
      pool.query(
        `SELECT a.*, c.slug AS category_slug, c.name_ru AS category_name_ru, c.name_en AS category_name_en,
                u.id AS author_id_val, u.display_name AS author_display_name, u.avatar_url AS author_avatar_url
         FROM articles a
         JOIN categories c ON a.category_id = c.id
         JOIN users u ON a.author_id = u.id
         ${joinTag}
         WHERE ${whereClause}
         ORDER BY a.is_pinned DESC, ${sort === 'views' ? 'a.view_count DESC,' : ''} a.published_at DESC NULLS LAST
         LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        [...params, limit, offset]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total FROM articles a
         JOIN categories c ON a.category_id = c.id
         ${joinTag}
         WHERE ${whereClause}`,
        params
      ),
    ]);

    const total = countResult.rows[0].total;

    // Fetch tags for all articles
    const articleIds = articlesResult.rows.map(a => a.id);
    let tagsByArticle = {};
    if (articleIds.length > 0) {
      const tagsResult = await pool.query(
        `SELECT at.article_id, at.is_primary, t.slug, t.name_ru, t.name_en, t.tag_type
         FROM article_tags at
         JOIN tags t ON at.tag_id = t.id
         WHERE at.article_id = ANY($1)`,
        [articleIds]
      );
      for (const row of tagsResult.rows) {
        if (!tagsByArticle[row.article_id]) tagsByArticle[row.article_id] = [];
        tagsByArticle[row.article_id].push({
          slug: row.slug, nameRu: row.name_ru, nameEn: row.name_en, tagType: row.tag_type, isPrimary: row.is_primary,
        });
      }
    }

    let articles = articlesResult.rows.map(formatArticle(tagsByArticle));

    // When featured=true returns no results, fall back to recent published articles
    // so cross-site editorial strips always have content to display.
    // Callers can pass no_fallback=true to skip this (e.g. product pages that
    // should show nothing rather than unrelated articles).
    const noFallback = req.query.no_fallback === 'true';
    if (featured === 'true' && articles.length === 0 && page === 1 && !noFallback) {
      const fallbackResult = await pool.query(
        `SELECT a.*, c.slug AS category_slug, c.name_ru AS category_name_ru, c.name_en AS category_name_en,
                u.id AS author_id_val, u.display_name AS author_display_name, u.avatar_url AS author_avatar_url
         FROM articles a
         JOIN categories c ON a.category_id = c.id
         JOIN users u ON a.author_id = u.id
         WHERE a.status = 'published'
         ORDER BY a.published_at DESC NULLS LAST
         LIMIT $1`,
        [limit]
      );
      const fallbackIds = fallbackResult.rows.map(a => a.id);
      let fallbackTags = {};
      if (fallbackIds.length > 0) {
        const fbTagsResult = await pool.query(
          `SELECT at.article_id, at.is_primary, t.slug, t.name_ru, t.tag_type
           FROM article_tags at JOIN tags t ON at.tag_id = t.id
           WHERE at.article_id = ANY($1)`,
          [fallbackIds]
        );
        for (const row of fbTagsResult.rows) {
          if (!fallbackTags[row.article_id]) fallbackTags[row.article_id] = [];
          fallbackTags[row.article_id].push({
            slug: row.slug, nameRu: row.name_ru, nameEn: row.name_en, tagType: row.tag_type, isPrimary: row.is_primary,
          });
        }
      }
      articles = fallbackResult.rows.map(formatArticle(fallbackTags));
    }

    res.set('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
    res.json({
      articles,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
    } catch (err) {
      console.error('Articles list error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

/**
 * POST /api/articles
 */
function create({ pool }) {
  return async (req, res) => {
    try {
      const {
        title, categoryId, subtitle, lead, body, coverImageUrl,
        coverImageAlt, coverImageCredit, metaTitle, metaDescription,
        status = 'draft', tagIds, tributeProductIds,
      } = req.body;

      if (!title || !categoryId) {
        return res.status(400).json({ error: 'Title and category are required' });
      }

      let slug = generateSlug(title);

      // Ensure unique slug
      const { rows: existing } = await pool.query(
        'SELECT id FROM articles WHERE slug = $1', [slug]
      );
      if (existing.length > 0) slug = `${slug}-${Date.now()}`;

      const publishedAt = status === 'published' ? new Date() : null;

      const { rows } = await pool.query(
        `INSERT INTO articles (slug, title, category_id, author_id, subtitle, lead, body,
         cover_image_url, cover_image_alt, cover_image_credit, meta_title, meta_description,
         status, published_at, tribute_product_ids)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         RETURNING *`,
        [slug, title, categoryId, req.user.userId, subtitle || null, lead || null,
         JSON.stringify(body || []), coverImageUrl || null, coverImageAlt || null,
         coverImageCredit || null, metaTitle || null, metaDescription || null,
         status, publishedAt, tributeProductIds || []]
      );

      const articleId = rows[0].id;

      // Insert tags
      if (tagIds && tagIds.length > 0) {
        const tagValues = tagIds.map((tagId, i) =>
          `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`
        ).join(', ');
        const tagParams = tagIds.flatMap((tagId, i) =>
          [articleId, tagId, i === 0]
        );
        await pool.query(
          `INSERT INTO article_tags (article_id, tag_id, is_primary) VALUES ${tagValues}`,
          tagParams
        );
      }

      res.status(201).json({ article: rows[0] });
    } catch (err) {
      console.error('Create article error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

function formatArticle(tagsByArticle) {
  return (row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    lead: row.lead,
    body: row.body,
    coverImageUrl: row.cover_image_url,
    coverImageAlt: row.cover_image_alt,
    coverImageCredit: row.cover_image_credit,
    metaTitle: row.meta_title,
    metaDescription: row.meta_description,
    canonicalUrl: row.canonical_url,
    status: row.status,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
    viewCount: Number(row.view_count),
    commentCount: Number(row.comment_count),
    isFeatured: row.is_featured,
    isPinned: row.is_pinned,
    allowComments: row.allow_comments,
    tributeProductIds: row.tribute_product_ids || [],
    url: `${config.appUrl}/${row.category_slug}/${row.slug}`,
    category: {
      slug: row.category_slug,
      nameRu: row.category_name_ru,
      nameEn: row.category_name_en,
    },
    author: {
      id: row.author_id_val || row.author_id,
      displayName: row.author_display_name,
      avatarUrl: row.author_avatar_url,
    },
    tags: (tagsByArticle[row.id] || []),
  });
}

module.exports = { list, create, formatArticle };
