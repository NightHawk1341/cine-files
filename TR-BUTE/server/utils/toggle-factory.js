/**
 * Boolean Field Setter Factory
 * Creates handler functions for setting boolean fields in the orders table
 *
 * This eliminates duplicate code across toggle-urgent, toggle-processed,
 * and toggle-notion-sync handlers by providing a reusable pattern.
 */

const { getPool } = require('../../lib/db');

/**
 * Creates a handler function for setting a boolean field
 *
 * @param {Object} config - Configuration object
 * @param {string} config.field - Name of the boolean field to set
 * @param {string} config.paramName - Name of the parameter in request body
 * @param {string} [config.timestampField=null] - Optional timestamp field to update (set to NOW when true, NULL when false)
 * @param {string} [config.messageTrue] - Message when set to true
 * @param {string} [config.messageFalse] - Message when set to false
 * @returns {Function} Express handler function
 *
 * @example
 * // Create a handler for urgent status
 * const setUrgent = createBooleanFieldHandler({
 *   field: 'urgent',
 *   paramName: 'urgent',
 *   messageTrue: 'Order marked as urgent',
 *   messageFalse: 'Order marked as not urgent'
 * });
 *
 * @example
 * // Create a handler with timestamp tracking
 * const setProcessed = createBooleanFieldHandler({
 *   field: 'processed',
 *   paramName: 'processed',
 *   timestampField: 'processed_at',
 *   messageTrue: 'Order marked as processed',
 *   messageFalse: 'Order marked as unprocessed'
 * });
 */
function createBooleanFieldHandler(config) {
  const {
    field,
    paramName,
    timestampField = null,
    messageTrue = `${field} set to true`,
    messageFalse = `${field} set to false`
  } = config;

  // Validate configuration
  if (!field || typeof field !== 'string') {
    throw new Error('Handler configuration must include a valid field name');
  }
  if (!paramName || typeof paramName !== 'string') {
    throw new Error('Handler configuration must include a valid paramName');
  }

  /**
   * Express handler function for setting the field
   */
  return async function handler(req, res) {
    const pool = getPool();

    // Method validation
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const { order_id } = req.body;
      const value = req.body[paramName];

      // Validate input
      if (!order_id || value === undefined) {
        return res.status(400).json({
          error: `order_id and ${paramName} (boolean) are required`
        });
      }

      // Check if order exists
      const orderCheck = await pool.query(
        'SELECT id FROM orders WHERE id = $1',
        [order_id]
      );

      if (orderCheck.rows.length === 0) {
        return res.status(404).json({
          error: 'Order not found'
        });
      }

      const boolValue = value === true;

      // Build UPDATE query
      const updateFields = [`${field} = $1`, 'updated_at = NOW()'];
      const queryParams = [boolValue];

      if (timestampField) {
        if (boolValue) {
          updateFields.push(`${timestampField} = NOW()`);
        } else {
          updateFields.push(`${timestampField} = NULL`);
        }
      }

      // Update the field
      const result = await pool.query(`
        UPDATE orders
        SET ${updateFields.join(', ')}
        WHERE id = $2
        RETURNING *
      `, [...queryParams, order_id]);

      const updatedOrder = result.rows[0];

      // Build response
      const responseData = {
        success: true,
        message: boolValue ? messageTrue : messageFalse,
        order: {
          id: updatedOrder.id,
          [field]: updatedOrder[field],
          updated_at: updatedOrder.updated_at
        }
      };

      if (timestampField) {
        responseData.order[timestampField] = updatedOrder[timestampField];
      }

      return res.status(200).json(responseData);

    } catch (error) {
      console.error(`Error setting ${field}:`, error);
      return res.status(500).json({
        error: `Failed to set ${field}`,
        message: error.message
      });
    }
  };
}

module.exports = createBooleanFieldHandler;
