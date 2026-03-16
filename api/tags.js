const { generateSlug } = require('../server/utils/transliterate');
const { syncTmdbEntity } = require('../server/services/tmdb');

/**
 * GET /api/tags
 */
function list({ pool }) {
  return async (req, res) => {
    const type = req.query.type;
    const search = req.query.q;
    const limit = Math.min(parseInt(req.query.limit || '50'), 200);
    const page = Math.max(1, parseInt(req.query.page || '1'));
    const offset = (page - 1) * limit;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (type) {
      conditions.push(`t.tag_type = $${idx}`);
      params.push(type);
      idx++;
    }
    if (search) {
      conditions.push(`t.name_ru ILIKE $${idx}`);
      params.push(`%${search}%`);
      idx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [tagsResult, countResult] = await Promise.all([
      pool.query(
        `SELECT t.*, te.tmdb_id, te.entity_type AS tmdb_entity_type, te.title_ru AS tmdb_title_ru
         FROM tags t
         LEFT JOIN tmdb_entities te ON t.tmdb_entity_id = te.id
         ${whereClause}
         ORDER BY t.article_count DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit, offset]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total FROM tags t ${whereClause}`,
        params
      ),
    ]);

    const total = countResult.rows[0].total;

    const tags = tagsResult.rows.map(r => ({
      id: r.id,
      slug: r.slug,
      nameRu: r.name_ru,
      nameEn: r.name_en,
      tagType: r.tag_type,
      articleCount: Number(r.article_count),
      tmdbEntity: r.tmdb_id ? {
        tmdbId: r.tmdb_id,
        entityType: r.tmdb_entity_type,
        titleRu: r.tmdb_title_ru,
      } : null,
    }));

    res.json({
      tags,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  };
}

/**
 * POST /api/tags
 */
function create({ pool }) {
  return async (req, res) => {
    try {
      const { nameRu, nameEn, tagType, tmdbId, tmdbType } = req.body;

      if (!nameRu || !tagType) {
        return res.status(400).json({ error: 'nameRu and tagType are required' });
      }

      // Sync TMDB entity first so we can use its English title for the slug
      let tmdbEntityId = null;
      let tmdbTitleEn = null;
      if (tmdbId && tmdbType) {
        const entity = await syncTmdbEntity(tmdbType, tmdbId);
        if (entity) {
          tmdbEntityId = entity.id;
          tmdbTitleEn = entity.title_en;
        }
      }

      // Prefer English name for slug (proper "arcane" instead of transliterated "arkeyn")
      const resolvedNameEn = nameEn || tmdbTitleEn || null;
      const slug = generateSlug(resolvedNameEn || nameRu);

      const { rows: existing } = await pool.query(
        'SELECT id FROM tags WHERE slug = $1', [slug]
      );
      if (existing.length > 0) {
        return res.status(409).json({ error: 'Tag with this name already exists' });
      }

      const { rows } = await pool.query(
        `INSERT INTO tags (slug, name_ru, name_en, tag_type, tmdb_entity_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [slug, nameRu, resolvedNameEn, tagType, tmdbEntityId]
      );

      res.status(201).json({ tag: formatTag(rows[0]) });
    } catch (err) {
      console.error('Create tag error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

function formatTag(row) {
  return {
    id: row.id,
    slug: row.slug,
    nameRu: row.name_ru,
    nameEn: row.name_en,
    tagType: row.tag_type,
    articleCount: Number(row.article_count),
  };
}

module.exports = { list, create };
