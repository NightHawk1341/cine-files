/**
 * Main Router Configuration
 *
 * Aggregates all modularized routes and provides a single entry point
 * for mounting into the Express application
 */

const createAuthRouter = require('./auth');
const createSyncRouter = require('./sync');
const createStaticRouter = require('./static');
const createAdminRouter = require('./admin');
const createProductRouter = require('./products');
const createFeedbackRouter = require('./feedback');

/**
 * Configures and mounts all application routes
 *
 * @param {express.Application} app - Express application instance
 * @param {Object} deps - Dependencies needed by routes
 * @param {Object} deps.pool - PostgreSQL connection pool
 * @param {Object} deps.auth - Auth module (verifyToken, generateTokens, etc.)
 * @param {Object} deps.config - Application configuration
 * @param {Function} deps.authenticateToken - JWT authentication middleware
 * @param {Function} deps.requireAdminAuth - Admin authentication middleware
 */
module.exports = function setupRoutes(app, deps) {
  const { pool, auth, config, authenticateToken, requireAdminAuth } = deps;

  // ============ STATIC PAGE ROUTES ============
  // Serve HTML pages - must be mounted first to catch root path
  app.use(createStaticRouter({ pool, config }));

  // ============ AUTHENTICATION ROUTES ============
  // Mount API auth routes at /api/auth
  const authRouter = createAuthRouter({ pool, auth, config, authenticateToken });
  app.use('/api/auth', authRouter);

  // Yandex OAuth callback (special case - different base path)
  app.get('/auth/yandex/callback', createAuthRouter.yandexCallback({ pool, auth, config }));

  // VK ID OAuth callback — Yandex Cloud only (website login via VK ID)
  if (config.isYandexMode) {
    app.get('/auth/vk/callback', createAuthRouter.vkCallback({ pool, auth, config }));
  }

  // VK Mini App auth — Vercel/Telegram mode only (native vk_user_id + signature)
  if (config.isTelegramMode) {
    const vkMiniAppHandler = require('../../api/auth/vk-miniapp');
    const vkMiniAppAuth = vkMiniAppHandler({ pool, auth, config });
    app.post('/api/auth/vk-miniapp', vkMiniAppAuth);
    app.post('/api/auth/vk-miniapp/preview', (req, res) => vkMiniAppHandler.previewUser(req, res, config));
  }

  // MAX Mini App auth — enabled when MAX_BOT_TOKEN is configured (Vercel deployment)
  if (config.maxBotToken) {
    const maxMiniAppHandler = require('../../api/auth/max-miniapp');
    app.post('/api/auth/max-miniapp', maxMiniAppHandler({ pool, auth, config }));
  }

  // ============ DATA SYNC ROUTES ============
  // Mount sync routes at /api/sync
  const syncRouter = createSyncRouter({ pool, authenticateToken });
  app.use('/api/sync', syncRouter);

  // Favorite tag update (mounted separately due to different path)
  app.patch('/api/favorites/tag', ...createSyncRouter.updateFavoriteTag({ pool, authenticateToken }));

  // Wishlist sharing
  const wishlistShareHandler = require('../../api/favorites/share');
  const wishlistSharedHandler = require('../../api/favorites/shared');
  app.post('/api/favorites/share', authenticateToken, wishlistShareHandler);
  app.get('/api/favorites/shared/:token', wishlistSharedHandler);

  // ============ ADMIN ROUTES ============
  // Admin API routes at /api/admin
  const adminRouter = createAdminRouter({ pool, auth, config, requireAdminAuth });
  app.use('/api/admin', adminRouter);

  // Admin login page (mounted at /admin/login)
  app.get('/admin/login', createAdminRouter.loginPage({ auth }));

  // Protect admin miniapp routes
  app.use('/admin-miniapp', createAdminRouter.protectAdminMiniapp({ auth }));

  // ============ PRODUCT-SPECIFIC ROUTES (before catch-all router) ============
  // These must be registered BEFORE the product router to avoid being caught by /:idOrSlug
  const productSearchHandler = require('../../api/products/search');
  const subscribedProductsHandler = require('../../api/products/subscribed');
  const checkSubscriptionHandler = require('../../api/products/check-subscription');
  const subscribeReleaseHandler = require('../../api/products/subscribe-release');
  const sendReleaseNotificationsHandler = require('../../api/products/send-release-notifications');
  const productAuthorsHandler = require('../../api/products/authors');
  const productKeywordsHandler = require('../../api/products/keywords');
  const productSlugsHandler = require('../../api/products/slugs');
  const productIpNamesHandler = require('../../api/products/ip-names');

  app.get('/api/products/search', productSearchHandler);
  app.get('/api/products/authors', productAuthorsHandler);
  app.get('/api/products/keywords', productKeywordsHandler);
  app.get('/api/products/slugs', productSlugsHandler);
  app.get('/api/products/ip-names', productIpNamesHandler);
  app.get('/api/products/subscribed', authenticateToken, subscribedProductsHandler);
  app.post('/api/products/check-subscription', authenticateToken, checkSubscriptionHandler);
  app.post('/api/products/subscribe-release', authenticateToken, subscribeReleaseHandler);
  app.post('/api/products/send-release-notifications', sendReleaseNotificationsHandler);

  const productRecommendationsHandler = require('../../api/products/recomendations');
  const productComingSoonHandler = require('../../api/products/coming-soon');
  app.get('/api/products/recommendations', productRecommendationsHandler);
  app.get('/api/products/coming-soon', productComingSoonHandler);

  // ============ PRODUCT ROUTES ============
  // Main product API routes at /api/products
  // This has a catch-all /:idOrSlug route, so it must come AFTER specific routes above
  const productRouter = createProductRouter({ pool, requireAdminAuth });
  app.use('/api/products', productRouter);

  // ============ USER FEEDBACK ROUTES ============
  // Reviews, comments, and suggestions at /api/*
  const feedbackRouter = createFeedbackRouter({ pool, authenticateToken, config });
  app.use('/api', feedbackRouter);

  // Product-related routes with different base paths
  // Redirect browser navigation to home; API/fetch requests proceed normally
  app.get('/products', (req, res, next) => {
    if (req.headers.accept && req.headers.accept.includes('text/html')) {
      return res.redirect('/');
    }
    next();
  }, createProductRouter.publicProductList({ pool }));
  app.get('/products/:id/images', createProductRouter.getProductImages({ pool }));
  app.get('/products/:id/images-2', createProductRouter.getProductImages2({ pool }));
  app.get('/api/all-images', createProductRouter.getAllImages({ pool }));
  app.get('/api/all-images-2', createProductRouter.getAllImages2({ pool }));
  app.get('/api/catalogs', createProductRouter.getCatalogs({ pool }));
  app.get('/api/catalog/:idOrSlug', createProductRouter.getCatalogDetails({ pool }));

  // Catalog management (admin only)
  const createCatalogHandler = require('../../api/catalogs/create');
  const updateCatalogHandler = require('../../api/catalogs/update');
  const deleteCatalogHandler = require('../../api/catalogs/delete');
  const reorderCatalogsHandler = require('../../api/catalogs/reorder');
  const addProductToCatalogHandler = require('../../api/catalogs/add-product');
  const removeProductFromCatalogHandler = require('../../api/catalogs/remove-product');

  app.post('/api/catalogs/create', requireAdminAuth, createCatalogHandler);
  app.post('/api/catalogs/update', requireAdminAuth, updateCatalogHandler);
  app.post('/api/catalogs/delete', requireAdminAuth, deleteCatalogHandler);
  app.post('/api/catalogs/reorder', requireAdminAuth, reorderCatalogsHandler);
  app.post('/api/catalogs/add-product', requireAdminAuth, addProductToCatalogHandler);
  app.post('/api/catalogs/remove-product', requireAdminAuth, removeProductFromCatalogHandler);
  app.get('/api/product-prices', createProductRouter.getProductPrices({ pool }));

  // ============ EXTERNAL API HANDLERS ============
  // These handlers are already modularized in /api directory

  // Order management
  const createOrderHandler = require('../../api/orders/create');
  const updateOrderStatusHandler = require('../../api/orders/update-status');
  const updateOrderDeliveryHandler = require('../../api/orders/update-delivery');
  const updateOrderHandler = require('../../api/orders/update');
  const getUserOrdersHandler = require('../../api/orders/get-user-orders');
  const getOrderHandler = require('../../api/orders/get-order');
  const getOrderByIdHandler = require('../../api/orders/get-by-id');
  const getOrderCountsHandler = require('../../api/orders/get-order-counts');
  const searchOrdersHandler = require('../../api/orders/search');
  const removeOrderItemHandler = require('../../api/orders/items/remove');
  const addOrderItemHandler = require('../../api/orders/items/add');
  const updateOrderItemHandler = require('../../api/orders/items/update');
  const toggleProcessedHandler = require('../../api/orders/toggle-processed');
  const toggleUrgentHandler = require('../../api/orders/toggle-urgent');
  const toggleNotionSyncHandler = require('../../api/orders/toggle-notion-sync');
  const cancelOrderHandler = require('../../api/orders/cancel');
  const requestRefundHandler = require('../../api/orders/request-refund');
  const processRefundHandler = require('../../api/orders/process-refund');
  const statusHistoryHandler = require('../../api/orders/status-history');

  app.post('/api/orders/create', authenticateToken, createOrderHandler);
  app.post('/api/orders/update-status', requireAdminAuth, updateOrderStatusHandler);
  app.post('/api/orders/update-delivery', requireAdminAuth, updateOrderDeliveryHandler);
  app.post('/api/orders/update', requireAdminAuth, updateOrderHandler);
  app.get('/api/orders/get-user-orders', authenticateToken, getUserOrdersHandler);
  app.get('/api/orders/get-order', authenticateToken, getOrderHandler);
  app.get('/api/orders/get-by-id', requireAdminAuth, getOrderByIdHandler);
  app.get('/api/orders/get-order-counts', requireAdminAuth, getOrderCountsHandler);
  app.get('/api/orders/search', requireAdminAuth, searchOrdersHandler);
  app.post('/api/orders/items/remove', requireAdminAuth, removeOrderItemHandler);
  app.post('/api/orders/items/add', requireAdminAuth, addOrderItemHandler);
  app.post('/api/orders/items/update', requireAdminAuth, updateOrderItemHandler);
  app.post('/api/orders/toggle-processed', requireAdminAuth, toggleProcessedHandler);
  app.post('/api/orders/toggle-urgent', requireAdminAuth, toggleUrgentHandler);
  app.post('/api/orders/toggle-notion-sync', requireAdminAuth, toggleNotionSyncHandler);
  app.post('/api/orders/cancel', authenticateToken, cancelOrderHandler);
  app.post('/api/orders/request-refund', authenticateToken, requestRefundHandler);
  app.post('/api/orders/process-refund', requireAdminAuth, processRefundHandler);
  app.get('/api/orders/status-history', authenticateToken, statusHistoryHandler);
  // Dynamic route must come LAST to avoid catching specific routes above
  app.get('/api/orders/:orderId', requireAdminAuth, getOrderByIdHandler);

  // Payment integration (T-Bank EACQ)
  const createPaymentLinkHandler = require('../../api/payment/create-link');
  const paymentWebhookHandler = require('../../api/payment/webhook');
  const paymentResultHandler = require('../../api/payment/tbank/result');
  const paymentCheckStatusHandler = require('../../api/payment/tbank/check-status');

  app.post('/api/payment/create-link', createPaymentLinkHandler);
  app.post('/api/payment/tbank/create-link', createPaymentLinkHandler);
  app.post('/api/payment/webhook', paymentWebhookHandler);
  app.post('/api/payment/tbank/webhook', paymentWebhookHandler);
  app.get('/api/payment/tbank/result', paymentResultHandler);
  app.post('/api/payment/tbank/check-status', authenticateToken, paymentCheckStatusHandler);

  // Notifications
  const sendNotificationHandler = require('../../api/notifications/send');
  app.post('/api/notifications/send', sendNotificationHandler);

  // Sharing configuration
  const sharingConfigHandler = require('../../api/sharing-config');
  app.get('/api/sharing-config', sharingConfigHandler);

  // App configuration (deployment mode, etc.)
  app.get('/api/config', (req, res) => {
    res.json({
      deploymentMode: config.deploymentMode,
      isTelegramMode: config.isTelegramMode,
      isYandexMode: config.isYandexMode,
      isVkEnabled: config.auth.vk.enabled,
      isMaxEnabled: !!config.maxBotToken,
      telegramBotUsername: config.telegramBotUsername || null
    });
  });

  // Client-safe configuration (API keys for frontend widgets)
  const clientConfigHandler = require('../../api/config/client');
  app.get('/api/config/client', clientConfigHandler);

  // FAQ system (public)
  const getFaqCategoriesHandler = require('../../api/faq/get-categories');
  const getFaqItemsHandler = require('../../api/faq/get-items');

  const getFaqPageItemsHandler = require('../../api/faq/get-page-items');

  app.get('/api/faq/get-categories', getFaqCategoriesHandler);
  app.get('/api/faq/get-items', getFaqItemsHandler);
  app.get('/api/faq/get-page-items', getFaqPageItemsHandler);

  // FAQ admin endpoints
  const adminFaqCategoriesHandler = require('../../api/admin/faq/categories');
  const adminFaqItemsHandler = require('../../api/admin/faq/items');

  app.get('/api/admin/faq/categories', requireAdminAuth, adminFaqCategoriesHandler);
  app.post('/api/admin/faq/categories', requireAdminAuth, adminFaqCategoriesHandler);
  app.put('/api/admin/faq/categories', requireAdminAuth, adminFaqCategoriesHandler);
  app.delete('/api/admin/faq/categories', requireAdminAuth, adminFaqCategoriesHandler);

  app.get('/api/admin/faq/items', requireAdminAuth, adminFaqItemsHandler);
  app.post('/api/admin/faq/items', requireAdminAuth, adminFaqItemsHandler);
  app.put('/api/admin/faq/items', requireAdminAuth, adminFaqItemsHandler);
  app.delete('/api/admin/faq/items', requireAdminAuth, adminFaqItemsHandler);

  // FAQ reorder endpoints
  const faqCategoriesReorderHandler = require('../../api/admin/faq/categories/reorder');
  const faqItemsReorderHandler = require('../../api/admin/faq/items/reorder');
  app.post('/api/admin/faq/categories/reorder', requireAdminAuth, faqCategoriesReorderHandler);
  app.post('/api/admin/faq/items/reorder', requireAdminAuth, faqItemsReorderHandler);

  // Public promo code validation
  const validatePromoCodeHandler = require('../../api/promo-codes/validate');
  app.get('/api/promo-codes/validate', validatePromoCodeHandler);

  // Promo codes admin endpoints
  const adminPromoCodesHandler = require('../../api/admin/promo-codes/index');

  app.get('/api/admin/promo-codes', requireAdminAuth, adminPromoCodesHandler);
  app.post('/api/admin/promo-codes', requireAdminAuth, adminPromoCodesHandler);
  app.put('/api/admin/promo-codes', requireAdminAuth, adminPromoCodesHandler);
  app.delete('/api/admin/promo-codes', requireAdminAuth, adminPromoCodesHandler);

  // Certificates admin endpoints
  const adminCertificatesHandler = require('../../api/admin/certificates/index');

  app.get('/api/admin/certificates', requireAdminAuth, adminCertificatesHandler.listCertificates);
  app.post('/api/admin/certificates', requireAdminAuth, adminCertificatesHandler.createCertificate);
  app.put('/api/admin/certificates/image', requireAdminAuth, adminCertificatesHandler.updateCertificateImage);
  app.get('/api/admin/certificates/templates', requireAdminAuth, adminCertificatesHandler.templatesHandler);
  app.post('/api/admin/certificates/templates', requireAdminAuth, adminCertificatesHandler.templatesHandler);
  app.put('/api/admin/certificates/templates', requireAdminAuth, adminCertificatesHandler.templatesHandler);
  app.delete('/api/admin/certificates/templates', requireAdminAuth, adminCertificatesHandler.templatesHandler);
  app.post('/api/admin/certificates/:id/regenerate-image', requireAdminAuth, adminCertificatesHandler.regenerateImage);
  app.put('/api/admin/certificates/:id', requireAdminAuth, adminCertificatesHandler.updateCertificate);
  app.delete('/api/admin/certificates/:id', requireAdminAuth, adminCertificatesHandler.deleteCertificate);

  // Stories system (public)
  const getActiveStoriesHandler = require('../../api/stories/active');
  app.get('/api/stories/active', getActiveStoriesHandler);

  // Stories admin endpoints
  const adminStoriesHandler = require('../../api/admin/stories/index');
  const adminStoriesReorderHandler = require('../../api/admin/stories/reorder');

  app.get('/api/admin/stories', requireAdminAuth, adminStoriesHandler);
  app.post('/api/admin/stories', requireAdminAuth, adminStoriesHandler);
  app.put('/api/admin/stories', requireAdminAuth, adminStoriesHandler);
  app.delete('/api/admin/stories', requireAdminAuth, adminStoriesHandler);
  app.post('/api/admin/stories/reorder', requireAdminAuth, adminStoriesReorderHandler);

  // Shipments calendar endpoint
  const shipmentsCalendarHandler = require('../../api/admin/shipments/calendar');
  app.get('/api/admin/shipments/calendar', requireAdminAuth, shipmentsCalendarHandler);
  app.post('/api/admin/shipments/calendar', requireAdminAuth, shipmentsCalendarHandler);

  // User endpoints
  const hidePhotoHandler = require('../../api/users/hide-photo');
  const notificationsEnabledHandler = require('../../api/users/notifications-enabled');
  const getUserProfileHandler = require('../../api/user/profile');
  const updateUserEmailHandler = require('../../api/user/update-email');

  app.patch('/api/users/hide-photo', authenticateToken, hidePhotoHandler);
  app.patch('/api/users/notifications-enabled', authenticateToken, notificationsEnabledHandler);
  app.get('/api/user/profile', authenticateToken, getUserProfileHandler);
  app.post('/api/user/update-email', authenticateToken, updateUserEmailHandler);

  const addressesHandler = require('../../api/user/addresses');
  app.get('/api/user/addresses', authenticateToken, addressesHandler.listAddresses);
  app.post('/api/user/addresses', authenticateToken, addressesHandler.createAddress);
  app.put('/api/user/addresses/:id', authenticateToken, addressesHandler.updateAddress);
  app.delete('/api/user/addresses/:id', authenticateToken, addressesHandler.deleteAddress);

  // Review system (external handlers)
  const verifyPurchaseHandler = require('../../api/reviews/verify-purchase');
  const uploadReviewImageHandler = require('../../api/reviews/upload-image');
  const pendingReviewsHandler = require('../../api/reviews/pending');
  const reviewImageHandler = require('../../api/reviews/[reviewId]/image');

  app.get('/api/reviews/verify-purchase', verifyPurchaseHandler);
  app.post('/api/reviews/upload-image', uploadReviewImageHandler);
  app.get('/api/reviews/pending', pendingReviewsHandler);
  app.post('/api/reviews/:reviewId/image', authenticateToken, reviewImageHandler);

  // ============ IMAGE UPLOAD ROUTES ============
  // Universal image upload API (supports Vercel Blob, Yandex S3, Supabase)
  const imageUploadHandler = require('../../api/uploads/image');
  app.post('/api/uploads/image', imageUploadHandler);

  // Storage stats for admin dashboard
  const storageStatsHandler = require('../../api/admin/storage/stats');
  app.get('/api/admin/storage/stats', requireAdminAuth, storageStatsHandler);

  // Service usage stats (email, APIShip)
  const serviceStatsHandler = require('../../api/admin/service-stats');
  app.get('/api/admin/service-stats', requireAdminAuth, serviceStatsHandler);

  // Admin review images management
  const adminReviewImagesHandler = require('../../api/admin/reviews/images');
  app.post('/api/admin/reviews/images', requireAdminAuth, adminReviewImagesHandler);

  // Admin uploads management (unified: review + custom product images)
  const adminUploadsListHandler = require('../../api/admin/uploads/list');
  const adminUploadsManageHandler = require('../../api/admin/uploads/manage');
  app.get('/api/admin/uploads/list', requireAdminAuth, adminUploadsListHandler);
  app.post('/api/admin/uploads/manage', requireAdminAuth, adminUploadsManageHandler);

  // Comments and suggestions (external handlers)
  const allCommentsHandler = require('../../api/comments/all');
  const allSuggestionsHandler = require('../../api/suggestions/all');
  const userCommentsHandler = require('../../api/comments/user');
  const userSuggestionsHandler = require('../../api/suggestions/user');

  app.get('/api/comments/all', allCommentsHandler);
  app.get('/api/suggestions/all', allSuggestionsHandler);
  app.get('/api/comments/user', authenticateToken, userCommentsHandler);
  app.get('/api/suggestions/user', authenticateToken, userSuggestionsHandler);

  // Feedback mark as read/unread
  const markFeedbackReadHandler = require('../../api/feedback/mark-read');
  const markFeedbackUnreadHandler = require('../../api/feedback/mark-unread');
  app.post('/api/feedback/mark-read', markFeedbackReadHandler);
  app.post('/api/feedback/mark-unread', markFeedbackUnreadHandler);

  // Profile updates count
  const profileUpdatesCountHandler = require('../../api/profile/updates-count');
  app.get('/api/profile/updates-count', authenticateToken, profileUpdatesCountHandler);

  // Bot webhooks — each platform only registers on its deployment
  if (config.isTelegramMode) {
    const userBotWebhookHandler = require('../../api/webhooks/user-bot');
    const adminBotWebhookHandler = require('../../api/webhooks/admin-bot');
    const vkBotWebhookHandler = require('../../api/webhooks/vk-bot');
    app.post('/api/webhooks/user-bot', userBotWebhookHandler);
    app.post('/api/webhooks/admin-bot', adminBotWebhookHandler);
    app.post('/api/webhooks/vk-bot', vkBotWebhookHandler);
  }

  // MAX Bot webhook — enabled when MAX_BOT_TOKEN is configured
  if (config.maxBotToken) {
    const maxBotWebhookHandler = require('../../api/webhooks/max-bot');
    app.post('/api/webhooks/max-bot', maxBotWebhookHandler);
  }

  // Analytics
  const productStatsHandler = require('../../api/analytics/product-stats');
  const dashboardAnalyticsHandler = require('../../api/analytics/dashboard');
  const authorStatsHandler = require('../../api/analytics/author-stats');
  app.get('/api/analytics/product-stats', productStatsHandler);
  app.get('/api/analytics/dashboard', requireAdminAuth, dashboardAnalyticsHandler);
  app.get('/api/analytics/author-stats', requireAdminAuth, authorStatsHandler);

  // App settings
  const getSettingsHandler = require('../../api/settings/get');
  const updateSettingsHandler = require('../../api/settings/update');
  app.get('/api/settings/get', getSettingsHandler);
  app.post('/api/settings/update', requireAdminAuth, updateSettingsHandler);

  // VK admin actions
  const vkUpdateProductsHandler = require('../../api/admin/vk/update-products');
  app.post('/api/admin/vk/update-products', requireAdminAuth, vkUpdateProductsHandler);

  // Giveaways
  const giveawaysHandler = require('../../api/admin/giveaways/index');
  app.get('/api/admin/giveaways', requireAdminAuth, giveawaysHandler.listGiveaways);
  app.post('/api/admin/giveaways/create', requireAdminAuth, giveawaysHandler.createGiveaway);
  app.post('/api/admin/giveaways/pick-winners', requireAdminAuth, giveawaysHandler.pickWinners);
  app.post('/api/admin/giveaways/cancel', requireAdminAuth, giveawaysHandler.cancelGiveaway);
  app.post('/api/admin/giveaways/channels', requireAdminAuth, giveawaysHandler.saveChannels);

  // Giveaway cron (process expired)
  const processGiveawaysCron = require('../../api/cron/process-giveaways');
  app.get('/api/cron/process-giveaways', processGiveawaysCron);

  // Token cleanup cron (delete expired auth tokens)
  const cleanupTokensCron = require('../../api/cron/cleanup-tokens');
  app.get('/api/cron/cleanup-tokens', cleanupTokensCron);

  // Moderation admin endpoints
  const adminModerationWordsHandler = require('../../api/admin/moderation/words');
  const adminModerationTestHandler = require('../../api/admin/moderation/test');

  app.get('/api/admin/moderation/words', requireAdminAuth, adminModerationWordsHandler);
  app.post('/api/admin/moderation/words', requireAdminAuth, adminModerationWordsHandler);
  app.put('/api/admin/moderation/words', requireAdminAuth, adminModerationWordsHandler);
  app.delete('/api/admin/moderation/words', requireAdminAuth, adminModerationWordsHandler);
  app.post('/api/admin/moderation/test', requireAdminAuth, adminModerationTestHandler);

  // Certificates API
  const certificatesAPI = require('../../api/certificates/index');

  app.get('/api/certificates/templates', certificatesAPI.getTemplates);
  app.post('/api/certificates/create', certificatesAPI.createCertificate);
  app.get('/api/certificates/verify/:code', certificatesAPI.verifyCertificate);
  app.get('/api/certificates/user/:userId', authenticateToken, certificatesAPI.getUserCertificates);
  app.get('/api/certificates/:id', certificatesAPI.getCertificate);
  app.put('/api/certificates/:id/image', certificatesAPI.updateCertImageUrl);

  // ============ SHIPPING ROUTES ============
  const shippingCalculateHandler = require('../../api/shipping/calculate');
  app.post('/api/shipping/calculate', shippingCalculateHandler);

  // CDEK Widget service endpoint (replaces service.php)
  const cdekServiceHandler = require('../../api/shipping/cdek-service');
  app.get('/api/shipping/cdek-service', cdekServiceHandler);
  app.post('/api/shipping/cdek-service', cdekServiceHandler);

  // ============ ADDITIONAL ORDER ROUTES ============
  const confirmDeliveryHandler = require('../../api/orders/confirm-delivery');
  const orderTrackingHandler = require('../../api/orders/tracking');
  const parcelsHandler = require('../../api/orders/parcels');
  const createShipmentHandler = require('../../api/orders/create-shipment');

  app.post('/api/orders/confirm-delivery', authenticateToken, confirmDeliveryHandler);
  app.get('/api/orders/tracking', authenticateToken, orderTrackingHandler);
  app.get('/api/orders/parcels', requireAdminAuth, parcelsHandler);
  app.post('/api/orders/parcels', requireAdminAuth, parcelsHandler);
  app.post('/api/orders/create-shipment', requireAdminAuth, createShipmentHandler);

  // ============ ADDITIONAL SHIPPING ROUTES ============
  const shippingPointsHandler = require('../../api/shipping/points');
  const shippingServicesHandler = require('../../api/shipping/services');
  const shippingSuggestHandler = require('../../api/shipping/suggest');

  app.get('/api/shipping/points', shippingPointsHandler);
  app.get('/api/shipping/services', shippingServicesHandler);
  app.get('/api/shipping/suggest', shippingSuggestHandler);

  // Packaging configuration (admin only)
  const packagingConfigHandler = require('../../api/shipping/packaging-config');
  app.get('/api/shipping/packaging-config', requireAdminAuth, packagingConfigHandler);
  app.post('/api/shipping/packaging-config', requireAdminAuth, packagingConfigHandler);

  // ============ ADDRESS SUGGESTION ROUTES ============
  const addressSuggestHandler = require('../../api/address/suggest');
  app.post('/api/address/suggest', addressSuggestHandler);

  // ============ ADDITIONAL ADMIN ROUTES ============
  const adminEstimatesHandler = require('../../api/admin/estimates/index');
  const batchStatusHandler = require('../../api/admin/orders/batch-status');
  const sendContactNotificationHandler = require('../../api/admin/orders/send-contact-notification');
  const shipmentSettingsHandler = require('../../api/admin/shipments/settings');
  const parcelStorageSettingsHandler = require('../../api/admin/parcel-storage-settings');

  app.get('/api/admin/estimates', requireAdminAuth, adminEstimatesHandler);
  app.delete('/api/admin/estimates', requireAdminAuth, adminEstimatesHandler);
  app.post('/api/admin/orders/batch-status', requireAdminAuth, batchStatusHandler);
  app.post('/api/admin/orders/send-contact-notification', requireAdminAuth, sendContactNotificationHandler);
  app.get('/api/admin/shipments/settings', requireAdminAuth, shipmentSettingsHandler);
  app.post('/api/admin/shipments/settings', requireAdminAuth, shipmentSettingsHandler);
  app.get('/api/admin/parcel-storage-settings', requireAdminAuth, parcelStorageSettingsHandler);
  app.put('/api/admin/parcel-storage-settings', requireAdminAuth, parcelStorageSettingsHandler);

  // Editor settings routes
  const editorSettingsHandler = require('../../api/admin/editor/settings');
  app.get('/api/admin/editor/settings', requireAdminAuth, editorSettingsHandler);
  app.post('/api/admin/editor/settings', requireAdminAuth, editorSettingsHandler);

  // Order constants (server source of truth for admin miniapp status labels)
  const orderConstantsHandler = require('../../api/admin/order-constants');
  app.get('/api/admin/order-constants', requireAdminAuth, orderConstantsHandler);

  // Notification templates (admin)
  const notificationTemplatesHandler = require('../../api/admin/notification-templates');
  app.get('/api/admin/notification-templates', requireAdminAuth, notificationTemplatesHandler);
  app.put('/api/admin/notification-templates', requireAdminAuth, notificationTemplatesHandler);
  app.patch('/api/admin/notification-templates/toggle', requireAdminAuth, notificationTemplatesHandler.toggleHandler);
  app.post('/api/admin/notification-templates/reset', requireAdminAuth, notificationTemplatesHandler.resetHandler);

  // ============ IP RIGHTS ROUTES ============
  const ipRightsHandler = require('../../api/admin/ip-rights/index');
  app.get('/api/admin/ip-rights', requireAdminAuth, ipRightsHandler.listIpRights);
  app.post('/api/admin/ip-rights/dismiss', requireAdminAuth, ipRightsHandler.dismissCheck);
  app.post('/api/admin/ip-rights/confirm', requireAdminAuth, ipRightsHandler.confirmCheck);
  app.post('/api/admin/ip-rights/manual', requireAdminAuth, ipRightsHandler.saveManualEntry);
  app.post('/api/admin/ip-rights/manual/delete', requireAdminAuth, ipRightsHandler.deleteManualEntry);
  app.post('/api/admin/ip-rights/scan-cancel', requireAdminAuth, ipRightsHandler.cancelScan);

  // ============ CRON ROUTES ============
  const cronCheckIpRightsHandler = require('../../api/cron/check-ip-rights');
  const cronUpdateTrackingHandler = require('../../api/cron/update-tracking');
  app.get('/api/cron/check-ip-rights', cronCheckIpRightsHandler);
  app.get('/api/cron/update-tracking', cronUpdateTrackingHandler);

  // ============ IMAGE PROXY ROUTES ============
  // Proxy VK CDN images to bypass browser tracking protection in Incognito mode
  const imageProxyHandler = require('./image-proxy');
  app.get('/api/img', imageProxyHandler);

  console.log('Modular routes configured successfully');
};
