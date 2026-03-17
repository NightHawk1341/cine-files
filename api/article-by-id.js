const { config } = require('../lib/config');

/**
 * GET /api/articles/:id — get article by numeric ID or slug
 */
function get({ pool }) {
  return async (req, res) => {
    try {
      const { id } = req.params;
      const isNumeric = /^\d+$/.test(id);

      const { rows } = await pool.query(
        `SELECT a.*, c.slug AS category_slug, c.name_ru AS category_name_ru, c.name_en AS category_name_en,
                u.id AS author_id_val, u.display_name AS author_display_name, u.avatar_url AS author_avatar_url
         FROM articles a
         JOIN categories c ON a.category_id = c.id
         JOIN users u ON a.author_id = u.id
         WHERE ${isNumeric ? 'a.id = $1' : 'a.slug = $1'}
         LIMIT 1`,
        [isNumeric ? parseInt(id) : id]
      );

      if (!rows[0]) return res.status(404).json({ error: 'Article not found' });

      // Fetch tags
      const tagsResult = await pool.query(
        `SELECT t.id, at.is_primary, t.slug, t.name_ru, t.name_en, t.tag_type
         FROM article_tags at JOIN tags t ON at.tag_id = t.id
         WHERE at.article_id = $1`,
        [rows[0].id]
      );

      const article = formatRow(rows[0], tagsResult.rows);
      res.set('Cache-Control', 'public, max-age=60, s-maxage=600, stale-while-revalidate=3600');
      res.json({ article });
    } catch (err) {
      console.error('Article get error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

/**
 * PUT /api/articles/:id
 */
function update({ pool }) {
  return async (req, res) => {
    try {
      const articleId = parseInt(req.params.id);

      const { rows: existing } = await pool.query(
        'SELECT author_id, status FROM articles WHERE id = $1', [articleId]
      );
      if (!existing[0]) return res.status(404).json({ error: 'Article not found' });

      if (req.user.role === 'editor' && existing[0].author_id !== req.user.userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const {
        title, categoryId, subtitle, lead, body, coverImageUrl,
        coverImageAlt, coverImageCredit, metaTitle, metaDescription,
        status, tagIds, tributeProductIds, isFeatured, isPinned, allowComments,
      } = req.body;

      const isPublishing = status === 'published' && existing[0].status !== 'published';

      // Build dynamic UPDATE
      const sets = [];
      const params = [];
      let idx = 1;

      const addField = (col, val) => {
        if (val !== undefined) {
          sets.push(`${col} = $${idx}`);
          params.push(val);
          idx++;
        }
      };

      addField('title', title);
      addField('category_id', categoryId);
      addField('subtitle', subtitle);
      addField('lead', lead);
      if (body !== undefined) { addField('body', JSON.stringify(body)); }
      addField('cover_image_url', coverImageUrl);
      addField('cover_image_alt', coverImageAlt);
      addField('cover_image_credit', coverImageCredit);
      addField('meta_title', metaTitle);
      addField('meta_description', metaDescription);
      addField('status', status);
      if (tributeProductIds !== undefined) { addField('tribute_product_ids', tributeProductIds); }
      addField('is_featured', isFeatured);
      addField('is_pinned', isPinned);
      addField('allow_comments', allowComments);
      if (isPublishing) { addField('published_at', new Date()); }

      sets.push(`updated_at = NOW()`);

      if (sets.length === 1) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      params.push(articleId);
      const { rows } = await pool.query(
        `UPDATE articles SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
        params
      );

      // Replace tags if provided
      if (tagIds !== undefined) {
        await pool.query('DELETE FROM article_tags WHERE article_id = $1', [articleId]);
        if (tagIds.length > 0) {
          const tagValues = tagIds.map((_, i) =>
            `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`
          ).join(', ');
          const tagParams = tagIds.flatMap((tagId, i) => [articleId, tagId, i === 0]);
          await pool.query(
            `INSERT INTO article_tags (article_id, tag_id, is_primary) VALUES ${tagValues}`,
            tagParams
          );
        }
      }

      // Fetch updated tags
      const tagsResult = await pool.query(
        `SELECT t.id, at.is_primary, t.slug, t.name_ru, t.name_en, t.tag_type
         FROM article_tags at JOIN tags t ON at.tag_id = t.id
         WHERE at.article_id = $1`,
        [articleId]
      );

      res.json({ article: formatRow(rows[0], tagsResult.rows) });
    } catch (err) {
      console.error('Update article error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

/**
 * DELETE /api/articles/:id
 */
function remove({ pool }) {
  return async (req, res) => {
    try {
      const articleId = parseInt(req.params.id);

      const { rows: existing } = await pool.query(
        'SELECT author_id FROM articles WHERE id = $1', [articleId]
      );
      if (!existing[0]) return res.status(404).json({ error: 'Article not found' });

      if (req.user.role !== 'admin' && existing[0].author_id !== req.user.userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      await pool.query('DELETE FROM articles WHERE id = $1', [articleId]);
      res.json({ message: 'Article deleted' });
    } catch (err) {
      console.error('Delete article error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

function formatRow(row, tags) {
  return {
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
    categoryId: row.category_id,
    tags: (tags || []).map(t => ({
      id: t.id, slug: t.slug, nameRu: t.name_ru, nameEn: t.name_en,
      tagType: t.tag_type, isPrimary: t.is_primary,
    })),
  };
}

module.exports = { get, update, remove };
