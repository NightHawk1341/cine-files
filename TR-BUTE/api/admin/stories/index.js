/**
 * Admin Stories Management
 * CRUD operations for stories
 *
 * GET /api/admin/stories - List all stories
 * POST /api/admin/stories - Create a story
 * PUT /api/admin/stories - Update a story
 * DELETE /api/admin/stories - Delete a story
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
      return getStories(req, res);
    case 'POST':
      return createStory(req, res);
    case 'PUT':
      return updateStory(req, res);
    case 'DELETE':
      return deleteStory(req, res);
    default:
      return methodNotAllowed(res, ['GET', 'POST', 'PUT', 'DELETE']);
  }
};

/**
 * Get all stories (including inactive)
 */
async function getStories(req, res) {
  try {
    const result = await pool.query(`
      SELECT
        id,
        title,
        image_url,
        link_url,
        link_text,
        duration,
        is_active,
        starts_at,
        ends_at,
        sort_order,
        created_at,
        updated_at
      FROM stories
      ORDER BY sort_order ASC, created_at DESC
    `);

    return success(res, { stories: result.rows });

  } catch (err) {
    console.error('Error fetching stories:', err);
    return error(res, 'Failed to fetch stories', 500);
  }
}

/**
 * Create a new story
 */
async function createStory(req, res) {
  try {
    const {
      title,
      image_url = '',
      link_url,
      link_text,
      duration = 5000,
      is_active = false,
      starts_at,
      ends_at
    } = req.body;

    // Get max sort_order
    const maxOrderResult = await pool.query(
      'SELECT COALESCE(MAX(sort_order), 0) as max_order FROM stories'
    );
    const newSortOrder = maxOrderResult.rows[0].max_order + 1;

    const result = await pool.query(`
      INSERT INTO stories (
        title,
        image_url,
        link_url,
        link_text,
        duration,
        is_active,
        starts_at,
        ends_at,
        sort_order
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      title || null,
      image_url,
      link_url || null,
      link_text || null,
      duration,
      is_active,
      starts_at || null,
      ends_at || null,
      newSortOrder
    ]);

    return success(res, {
      message: 'Story created successfully',
      story: result.rows[0]
    });

  } catch (err) {
    console.error('Error creating story:', err);
    return error(res, 'Failed to create story', 500);
  }
}

/**
 * Update an existing story
 */
async function updateStory(req, res) {
  try {
    const {
      id,
      title,
      image_url,
      link_url,
      link_text,
      duration,
      is_active,
      starts_at,
      ends_at
    } = req.body;

    if (!id) {
      return badRequest(res, 'Story ID is required');
    }

    // Build dynamic update query
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      values.push(title || null);
    }
    if (image_url !== undefined) {
      updates.push(`image_url = $${paramIndex++}`);
      values.push(image_url);
    }
    if (link_url !== undefined) {
      updates.push(`link_url = $${paramIndex++}`);
      values.push(link_url || null);
    }
    if (link_text !== undefined) {
      updates.push(`link_text = $${paramIndex++}`);
      values.push(link_text || null);
    }
    if (duration !== undefined) {
      updates.push(`duration = $${paramIndex++}`);
      values.push(duration);
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(is_active);
    }
    if (starts_at !== undefined) {
      updates.push(`starts_at = $${paramIndex++}`);
      values.push(starts_at || null);
    }
    if (ends_at !== undefined) {
      updates.push(`ends_at = $${paramIndex++}`);
      values.push(ends_at || null);
    }

    if (updates.length === 0) {
      return badRequest(res, 'No fields to update');
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const result = await pool.query(`
      UPDATE stories
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      return error(res, 'Story not found', 404);
    }

    return success(res, {
      message: 'Story updated successfully',
      story: result.rows[0]
    });

  } catch (err) {
    console.error('Error updating story:', err);
    return error(res, 'Failed to update story', 500);
  }
}

/**
 * Delete a story
 */
async function deleteStory(req, res) {
  try {
    const { id } = req.body;

    if (!id) {
      return badRequest(res, 'Story ID is required');
    }

    const result = await pool.query(
      'DELETE FROM stories WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return error(res, 'Story not found', 404);
    }

    return success(res, {
      message: 'Story deleted successfully',
      deleted_id: id
    });

  } catch (err) {
    console.error('Error deleting story:', err);
    return error(res, 'Failed to delete story', 500);
  }
}
