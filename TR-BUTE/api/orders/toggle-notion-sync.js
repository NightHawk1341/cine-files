/**
 * Toggle Notion Sync Status Endpoint
 * Marks an order as synced/unsynced with Notion database
 * POST /api/orders/toggle-notion-sync
 */

const createBooleanFieldHandler = require('../../server/utils/toggle-factory');

module.exports = createBooleanFieldHandler({
  field: 'notion_synced',
  paramName: 'synced',
  timestampField: 'notion_synced_at',
  messageTrue: 'Order marked as synced with Notion',
  messageFalse: 'Order marked as unsynced with Notion'
});
