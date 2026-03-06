/**
 * Create Product Endpoint
 * Creates a new product with basic fields
 * POST /api/products/create
 */

const { getPool } = require('../../lib/db');
const { success, error, badRequest, methodNotAllowed } = require('../../server/utils/response-helpers');
const pool = getPool();

/**
 * Main handler
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  try {
    const {
      title,
      genre,
      type,
      price,
      discount,
      description,
      triptych,
      release_date,
      created_at,
      status,
      alt,
      key_word,
      slug,
      author
    } = req.body;

    // Validate required fields
    if (!title || !genre || !type) {
      return badRequest(res, 'Missing required fields: title, genre, type');
    }

    // Validate slug uniqueness if provided
    let finalSlug = slug || null;
    if (finalSlug) {
      const slugCheck = await pool.query(
        'SELECT id FROM products WHERE slug = $1',
        [finalSlug]
      );
      if (slugCheck.rows.length > 0) {
        return badRequest(res, 'Slug already exists. Please choose a different slug.');
      }
    }

    // Get the current maximum sort_order among manual products
    const maxOrderResult = await pool.query(
      'SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM products WHERE is_manual_sort = true'
    );
    const newSortOrder = (maxOrderResult.rows[0].max_order ?? -1) + 1;

    // Insert product at bottom of manual section
    const result = await pool.query(`
      INSERT INTO products (
        title,
        genre,
        type,
        price,
        discount,
        description,
        triptych,
        release_date,
        status,
        alt,
        key_word,
        slug,
        created_at,
        author,
        sort_order,
        is_manual_sort
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, true)
      RETURNING *
    `, [
      title,
      genre,
      type,
      price || null,
      discount || false,
      description || null,
      triptych || false,
      release_date || null,
      status || 'available',
      alt || null,
      key_word || null,
      finalSlug,
      created_at || null,
      author || null,
      newSortOrder
    ]);

    const product = result.rows[0];

    cacheDelete('products:*').catch(() => {});
    cacheDelete('catalogs:*').catch(() => {});    

    return success(res, {
      message: 'Product created successfully',
      product: {
        id: product.id,
        title: product.title,
        genre: product.genre,
        type: product.type,
        price: product.price,
        status: product.status,
        created_at: product.created_at,
        author: product.author
      }
    }, 201);

  } catch (err) {
    console.error('Error creating product:', err);
    return error(res, 'Failed to create product', 500);
  }
};
