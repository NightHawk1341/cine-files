/**
 * Toggle Processed Status Endpoint
 * Marks an order as processed (moved to order management database)
 * POST /api/orders/toggle-processed
 */

const createBooleanFieldHandler = require('../../server/utils/toggle-factory');

module.exports = createBooleanFieldHandler({
  field: 'processed',
  paramName: 'processed',
  timestampField: 'processed_at',
  messageTrue: 'Order marked as processed',
  messageFalse: 'Order marked as unprocessed'
});
