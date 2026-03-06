/**
 * FAQ Items Management API (Admin)
 * CRUD operations for FAQ items
 * GET/POST/PUT/DELETE /api/admin/faq/items
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
 * GET - List items (optionally by category)
 */
async function handleGet(req, res) {
  try {
    const { category_id, search } = req.query;

    let query = `
      SELECT i.*, i.show_on_pages, c.title as category_title
      FROM faq_items i
      LEFT JOIN faq_categories c ON i.category_id = c.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    if (category_id) {
      query += ` AND i.category_id = $${paramCount++}`;
      params.push(category_id);
    }

    if (search) {
      query += ` AND (i.question ILIKE $${paramCount} OR i.answer ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    query += ` ORDER BY i.category_id, i.sort_order ASC`;

    const result = await pool.query(query, params);

    return success(res, { items: result.rows });
  } catch (err) {
    console.error('Error fetching FAQ items:', err);
    return error(res, 'Failed to fetch items', 500);
  }
}

/**
 * POST - Create a new item
 */
async function handleCreate(req, res) {
  try {
    const { category_id, question, answer, image_url, sort_order, show_on_pages } = req.body;

    if (!category_id) {
      return badRequest(res, 'category_id is required');
    }
    if (!question) {
      return badRequest(res, 'question is required');
    }
    if (!answer) {
      return badRequest(res, 'answer is required');
    }

    // Verify category exists
    const categoryCheck = await pool.query(
      'SELECT id FROM faq_categories WHERE id = $1',
      [category_id]
    );
    if (categoryCheck.rows.length === 0) {
      return badRequest(res, 'Category not found');
    }

    const pagesValue = Array.isArray(show_on_pages) && show_on_pages.length > 0 ? show_on_pages : null;

    const result = await pool.query(`
      INSERT INTO faq_items (category_id, question, answer, image_url, sort_order, show_on_pages)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [category_id, question, answer, image_url || null, sort_order || 999, pagesValue]);

    console.log(`[FAQ] Created item in category ${category_id}: ${question.substring(0, 50)}...`);

    return success(res, { item: result.rows[0] });
  } catch (err) {
    console.error('Error creating FAQ item:', err);
    return error(res, 'Failed to create item', 500);
  }
}

/**
 * PUT - Update an item
 */
async function handleUpdate(req, res) {
  try {
    const { id, category_id, question, answer, image_url, sort_order, show_on_pages } = req.body;

    if (!id) {
      return badRequest(res, 'id is required');
    }

    // Build dynamic update query
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (category_id !== undefined) {
      // Verify category exists
      const categoryCheck = await pool.query(
        'SELECT id FROM faq_categories WHERE id = $1',
        [category_id]
      );
      if (categoryCheck.rows.length === 0) {
        return badRequest(res, 'Category not found');
      }
      updates.push(`category_id = $${paramCount++}`);
      values.push(category_id);
    }

    if (question !== undefined) {
      updates.push(`question = $${paramCount++}`);
      values.push(question);
    }

    if (answer !== undefined) {
      updates.push(`answer = $${paramCount++}`);
      values.push(answer);
    }

    if (image_url !== undefined) {
      updates.push(`image_url = $${paramCount++}`);
      values.push(image_url);
    }

    if (sort_order !== undefined) {
      updates.push(`sort_order = $${paramCount++}`);
      values.push(sort_order);
    }

    if (show_on_pages !== undefined) {
      const pagesValue = Array.isArray(show_on_pages) && show_on_pages.length > 0 ? show_on_pages : null;
      updates.push(`show_on_pages = $${paramCount++}`);
      values.push(pagesValue);
    }

    if (updates.length === 0) {
      return badRequest(res, 'No fields to update');
    }

    values.push(id);

    const result = await pool.query(`
      UPDATE faq_items
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      return badRequest(res, 'Item not found');
    }

    console.log(`[FAQ] Updated item #${id}`);

    return success(res, { item: result.rows[0] });
  } catch (err) {
    console.error('Error updating FAQ item:', err);
    return error(res, 'Failed to update item', 500);
  }
}

/**
 * DELETE - Delete an item
 */
async function handleDelete(req, res) {
  try {
    const { id } = req.query;

    if (!id) {
      return badRequest(res, 'id is required');
    }

    const result = await pool.query(`
      DELETE FROM faq_items
      WHERE id = $1
      RETURNING id
    `, [id]);

    if (result.rows.length === 0) {
      return badRequest(res, 'Item not found');
    }

    console.log(`[FAQ] Deleted item #${id}`);

    return success(res, { deleted: true, id: parseInt(id) });
  } catch (err) {
    console.error('Error deleting FAQ item:', err);
    return error(res, 'Failed to delete item', 500);
  }
}
