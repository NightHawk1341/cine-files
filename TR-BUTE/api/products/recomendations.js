const { getPool } = require('../../lib/db');
const { success, error, badRequest, methodNotAllowed } = require('../../server/utils/response-helpers');
const { withCache } = require('../../lib/cache');
const pool = getPool();

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET']);
  }

  try {
    const { productId, limit = 8 } = req.query;
    if (!productId) return badRequest(res, 'productId is required');

    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 8, 1), 20);
    const cached = await withCache(`recs:${productId}:${parsedLimit}`, 900, async () => {
      return await fetchRecommendations(productId, parsedLimit);
    });
    return success(res, { products: cached });
  } catch (err) {
    console.error('Error fetching recommendations:', err);
    return error(res, 'Failed to fetch recommendations', 500);
  }
};

async function fetchRecommendations(productId, parsedLimit) {
  // Get the source product's attributes
  const sourceResult = await pool.query(
    `SELECT id, genre, author, catalog_ids, type FROM products WHERE id = $1`,
    [productId]
  );

  if (sourceResult.rows.length === 0) return [];

  const source = sourceResult.rows[0];
  const { genre, author, catalog_ids: catalogIds } = source;

  // Build scoring query: products matching on genre, author, or catalog_ids
  const params = [productId];
  let paramIdx = 2;

  const conditions = [];
  const scoreExpressions = [];

  if (genre) {
    params.push(genre);
    conditions.push(`p.genre = $${paramIdx}`);
    scoreExpressions.push(`CASE WHEN p.genre = $${paramIdx} THEN 1 ELSE 0 END`);
    paramIdx++;
  }

  if (author) {
    params.push(author);
    conditions.push(`p.author = $${paramIdx}`);
    scoreExpressions.push(`CASE WHEN p.author = $${paramIdx} THEN 1 ELSE 0 END`);
    paramIdx++;
  }

  if (catalogIds && catalogIds.length > 0) {
    params.push(catalogIds);
    // catalog_ids is jsonb; cast to int[] for overlap check with &&
    conditions.push(`ARRAY(SELECT value::int FROM jsonb_array_elements_text(p.catalog_ids)) && $${paramIdx}::int[]`);
    scoreExpressions.push(`CASE WHEN ARRAY(SELECT value::int FROM jsonb_array_elements_text(p.catalog_ids)) && $${paramIdx}::int[] THEN 1 ELSE 0 END`);
    paramIdx++;
  }

  if (conditions.length === 0) return [];

  const scoreExpr = scoreExpressions.length > 0
    ? scoreExpressions.join(' + ')
    : '0';

  const whereClause = `(${conditions.join(' OR ')})`;

  params.push(parsedLimit);
  const result = await pool.query(`
    SELECT
      p.id, p.title, p.slug, p.price, p.old_price, p.discount,
      p.status, p.genre, p.type, p.triptych, p.alt,
      pi.url AS image_url,
      (${scoreExpr}) AS score
    FROM products p
    LEFT JOIN LATERAL (
      SELECT url FROM product_images
      WHERE product_id = p.id
      ORDER BY sort_order ASC NULLS LAST, id ASC
      LIMIT 1
    ) pi ON true
    WHERE p.id != $1
      AND p.status NOT IN ('test', 'not_for_sale')
      AND ${whereClause}
    ORDER BY score DESC, random()
    LIMIT $${paramIdx}
  `, params);

  return result.rows.map(r => ({
    id: r.id,
    title: r.title,
    slug: r.slug,
    price: r.price,
    old_price: r.old_price,
    discount: r.discount,
    status: r.status,
    genre: r.genre,
    type: r.type,
    triptych: r.triptych,
    alt: r.alt,
    image: r.image_url
  }));
}
