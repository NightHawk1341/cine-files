/**
 * views/orders.js
 * Backward-compatible re-export from modular structure
 *
 * This file was refactored from a 3163-line monolith into smaller modules:
 * - orders/filters.js (filtering)
 * - orders/rendering.js (list rendering)
 * - orders/status.js (status updates)
 * - orders/items.js (item management)
 * - orders/toggles.js (toggle functions)
 * - orders/shipping.js (shipping/parcels)
 * - orders/product-search.js (product search)
 * - orders/details.js (order details modal)
 * - orders/index.js (main entry point)
 */

export {
  loadOrders,
  renderOrdersView,
  fetchOrders,
  updateOrderStatus,
  addDeliveryCost,
  addTrackingNumber,
  cancelOrder,
  viewOrderDetails,
  toggleProcessed
} from './orders/index.js';
