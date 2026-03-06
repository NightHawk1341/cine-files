/**
 * Toggle Urgent Status Endpoint
 * Marks an order as urgent or not urgent
 * POST /api/orders/toggle-urgent
 */

const createBooleanFieldHandler = require('../../server/utils/toggle-factory');

module.exports = createBooleanFieldHandler({
  field: 'urgent',
  paramName: 'urgent',
  messageTrue: 'Order marked as urgent',
  messageFalse: 'Order marked as not urgent'
});
