/**
 * FAQ Categories Management API (Admin)
 * CRUD operations for FAQ categories
 * GET/POST/PUT/DELETE /api/admin/faq/categories
 *
 * Note: Admin auth is handled by middleware in routes
 */

const { getPool } = require('../../../lib/db');
const { success, error, badRequest, methodNotAllowed } = require('../../../server/utils/response-helpers');

const pool = getPool();

/**
 * Main handler
 */
module.exports = async function handler(req, res) {
  switch (req.method) {
    case 'GET':
      return handleGet(req, res);
    case 'POST':
      return handleCreate(req, res);
    case 'PUT':
      return handleUpdate(req, res);
    case 'DELETE':
      return handleDelete(req, res);
    default:
      return methodNotAllowed(res, ['GET', 'POST', 'PUT', 'DELETE']);
  }
};

/**
 * GET - List all categories
 */
async function handleGet(req, res) {
  try {
    const { search } = req.query;

    let query = `
      SELECT c.*,
             (SELECT COUNT(*) FROM faq_items WHERE category_id = c.id) as item_count
      FROM faq_categories c
    `;
    const params = [];

    if (search) {
      query += ` WHERE c.title ILIKE $1`;
      params.push(`%${search}%`);
    }

    query += ` ORDER BY c.sort_order ASC`;

    const result = await pool.query(query, params);

    return success(res, { categories: result.rows });
  } catch (err) {
    console.error('Error fetching FAQ categories:', err);
    return error(res, 'Failed to fetch categories', 500);
  }
}

/**
 * POST - Create a new category
 */
async function handleCreate(req, res) {
  try {
    const { title, icon, sort_order } = req.body;

    if (!title) {
      return badRequest(res, 'title is required');
    }

    const result = await pool.query(`
      INSERT INTO faq_categories (title, icon, sort_order)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [title, icon || null, sort_order || 999]);

    console.log(`[FAQ] Created category: ${title}`);

    return success(res, { category: result.rows[0] });
  } catch (err) {
    console.error('Error creating FAQ category:', err);
    return error(res, 'Failed to create category', 500);
  }
}

/**
 * PUT - Update a category
 */
async function handleUpdate(req, res) {
  try {
    const { id, title, icon, sort_order } = req.body;

    if (!id) {
      return badRequest(res, 'id is required');
    }

    // Build dynamic update query
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (title !== undefined) {
      updates.push(`title = $${paramCount++}`);
      values.push(title);
    }

    if (icon !== undefined) {
      updates.push(`icon = $${paramCount++}`);
      values.push(icon);
    }

    if (sort_order !== undefined) {
      updates.push(`sort_order = $${paramCount++}`);
      values.push(sort_order);
    }

    if (updates.length === 0) {
      return badRequest(res, 'No fields to update');
    }

    values.push(id);

    const result = await pool.query(`
      UPDATE faq_categories
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      return badRequest(res, 'Category not found');
    }

    console.log(`[FAQ] Updated category #${id}`);

    return success(res, { category: result.rows[0] });
  } catch (err) {
    console.error('Error updating FAQ category:', err);
    return error(res, 'Failed to update category', 500);
  }
}

/**
 * DELETE - Delete a category
 */
async function handleDelete(req, res) {
  try {
    const { id } = req.query;

    if (!id) {
      return badRequest(res, 'id is required');
    }

    // Check if category has items
    const itemsResult = await pool.query(
      'SELECT COUNT(*) FROM faq_items WHERE category_id = $1',
      [id]
    );

    const itemCount = parseInt(itemsResult.rows[0].count);
    if (itemCount > 0) {
      return badRequest(res, `Cannot delete category with ${itemCount} items. Delete items first.`);
    }

    const result = await pool.query(`
      DELETE FROM faq_categories
      WHERE id = $1
      RETURNING id
    `, [id]);

    if (result.rows.length === 0) {
      return badRequest(res, 'Category not found');
    }

    console.log(`[FAQ] Deleted category #${id}`);

    return success(res, { deleted: true, id: parseInt(id) });
  } catch (err) {
    console.error('Error deleting FAQ category:', err);
    return error(res, 'Failed to delete category', 500);
  }
}
