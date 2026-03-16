const multer = require('multer');
const { requireAuth, requireEditor, requireAdmin, requireCronAuth } = require('../middleware/auth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    var allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'];
    cb(null, allowed.includes(file.mimetype));
  },
});

/**
 * Register all API routes.
 * Flat registration — matches TR-BUTE pattern.
 * Order matters: specific routes before dynamic catch-alls.
 *
 * @param {import('express').Application} app
 * @param {{ pool: import('pg').Pool, config: object }} deps
 */
function setupRoutes(app, deps) {
  const articles = require('../../api/articles');
  const articleById = require('../../api/article-by-id');
  const articlesRelated = require('../../api/articles-related');
  const categories = require('../../api/categories');
  const tags = require('../../api/tags');
  const tagById = require('../../api/tag-by-id');
  const comments = require('../../api/comments');
  const commentById = require('../../api/comment-by-id');
  const commentModerate = require('../../api/comment-moderate');
  const search = require('../../api/search');
  const mediaUpload = require('../../api/media-upload');
  const authYandex = require('../../api/auth-yandex');
  const authTelegram = require('../../api/auth-telegram');
  const authMe = require('../../api/auth-me');
  const authLogout = require('../../api/auth-logout');
  const userMe = require('../../api/user-me');
  const cronTokenCleanup = require('../../api/cron-token-cleanup');
  const cronTmdbSync = require('../../api/cron-tmdb-sync');
  const cronTmdbCleanup = require('../../api/cron-tmdb-cleanup');
  const tmdbProxy = require('../../api/tmdb-proxy');
  const tmdbSearch = require('../../api/tmdb-search');
  const feedRss = require('../../api/feed-rss');
  const sitemap = require('../../api/sitemap');
  const users = require('../../api/users');
  const media = require('../../api/media');
  const collections = require('../../api/collections');
  const settings = require('../../api/settings');
  const integrations = require('../../api/promos');
  const moderation = require('../../api/admin-moderation');

  // ============================================================
  // Health check
  // ============================================================
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ============================================================
  // Auth
  // ============================================================
  app.get('/api/auth/me', authMe.me(deps));
  app.post('/api/auth/logout', authLogout.logout(deps));

  // ============================================================
  // User self-service
  // ============================================================
  app.get('/api/users/me/comments', requireAuth, userMe.comments(deps));
  app.get('/api/users/me/articles', requireEditor, userMe.articles(deps));
  app.get('/api/users/me/favorites', requireAuth, userMe.favorites(deps));
  app.put('/api/users/me/favorites', requireAuth, userMe.updateFavorites(deps));
  app.put('/api/users/me', requireAuth, userMe.update(deps));
  app.delete('/api/users/me', requireAuth, userMe.remove(deps));
  app.get('/api/auth/yandex', authYandex.redirect());
  app.get('/api/auth/yandex/callback', authYandex.callback(deps));
  app.get('/api/auth/telegram', authTelegram.redirect());
  app.get('/api/auth/telegram/callback', authTelegram.callback(deps));

  // ============================================================
  // Categories
  // ============================================================
  app.get('/api/categories', categories.list(deps));
  app.post('/api/categories', requireAdmin, categories.create(deps));
  app.put('/api/categories/:id', requireAdmin, categories.update(deps));
  app.delete('/api/categories/:id', requireAdmin, categories.remove(deps));

  // ============================================================
  // Articles — specific routes before :id catch-all
  // ============================================================
  const articleProducts = require('../../api/article-products');

  app.get('/api/articles/related', articlesRelated.list(deps));
  app.get('/api/articles', articles.list(deps));
  app.post('/api/articles', requireEditor, articles.create(deps));
  app.get('/api/articles/:id/products', articleProducts.get(deps));
  app.get('/api/articles/:id', articleById.get(deps));
  app.put('/api/articles/:id', requireEditor, articleById.update(deps));
  app.delete('/api/articles/:id', requireAuth, articleById.remove(deps));

  // ============================================================
  // Tags
  // ============================================================
  app.get('/api/tags', tags.list(deps));
  app.post('/api/tags', requireEditor, tags.create(deps));
  app.get('/api/tags/:id', tagById.get(deps));
  app.put('/api/tags/:id', requireEditor, tagById.update(deps));
  app.delete('/api/tags/:id', requireAdmin, tagById.remove(deps));

  // ============================================================
  // Comments
  // ============================================================
  app.get('/api/comments', comments.list(deps));
  app.post('/api/comments', requireAuth, comments.create(deps));
  app.put('/api/comments/:id', requireAuth, commentById.update(deps));
  app.delete('/api/comments/:id', requireAuth, commentById.remove(deps));

  // ============================================================
  // Admin — comment moderation
  // ============================================================
  app.post('/api/admin/comments/:id/moderate', requireAdmin, commentModerate.moderate(deps));

  // ============================================================
  // Search
  // ============================================================
  app.get('/api/search', search.search(deps));

  // ============================================================
  // Media
  // ============================================================
  app.get('/api/media', requireEditor, media.list(deps));
  app.post('/api/media/upload', requireEditor, upload.single('file'), mediaUpload.upload(deps));
  app.delete('/api/media/:id', requireAdmin, media.remove(deps));

  // ============================================================
  // Admin — users
  // ============================================================
  app.get('/api/admin/users', requireAdmin, users.list(deps));
  app.put('/api/admin/users/:id/role', requireAdmin, users.updateRole(deps));

  // ============================================================
  // Collections
  // ============================================================
  app.get('/api/collections', collections.list(deps));
  app.post('/api/collections', requireAdmin, collections.create(deps));
  app.get('/api/collections/:id', collections.get(deps));
  app.put('/api/collections/:id', requireAdmin, collections.update(deps));
  app.delete('/api/collections/:id', requireAdmin, collections.remove(deps));
  app.put('/api/collections/:id/articles', requireAdmin, collections.updateArticles(deps));

  // ============================================================
  // Integrations (partner placements)
  // ============================================================
  app.get('/api/integrations', integrations.list(deps));
  app.get('/api/integrations/:id', integrations.get(deps));
  app.post('/api/integrations', requireAdmin, integrations.create(deps));
  app.put('/api/integrations/:id', requireAdmin, integrations.update(deps));
  app.delete('/api/integrations/:id', requireAdmin, integrations.remove(deps));
  app.post('/api/integrations/:id/view', integrations.view(deps));
  app.post('/api/integrations/:id/click', integrations.click(deps));

  // ============================================================
  // Admin — word filter / auto-moderation
  // ============================================================
  app.get('/api/admin/moderation/words', requireAdmin, moderation.list(deps));
  app.post('/api/admin/moderation/words', requireAdmin, moderation.create(deps));
  app.put('/api/admin/moderation/words/:id', requireAdmin, moderation.update(deps));
  app.delete('/api/admin/moderation/words/:id', requireAdmin, moderation.remove(deps));
  app.post('/api/admin/moderation/test', requireAdmin, moderation.test(deps));

  // ============================================================
  // Settings
  // ============================================================
  app.get('/api/settings', requireAdmin, settings.list(deps));
  app.put('/api/settings', requireAdmin, settings.update(deps));

  // ============================================================
  // TR-BUTE product proxy
  // ============================================================
  const tributeProducts = require('../../api/tribute-products');
  app.get('/api/tribute/products', tributeProducts.list());

  // ============================================================
  // TMDB
  // ============================================================
  app.get('/api/tmdb/search', requireEditor, tmdbSearch.search());
  app.get('/api/tmdb/*', tmdbProxy.proxy());

  // ============================================================
  // Cron jobs (require bearer auth)
  // ============================================================
  app.get('/api/cron/token-cleanup', requireCronAuth, cronTokenCleanup.cleanup(deps));
  app.get('/api/cron/tmdb-sync', requireCronAuth, cronTmdbSync.sync(deps));
  app.get('/api/cron/tmdb-cleanup', requireCronAuth, cronTmdbCleanup.cleanup(deps));

  // ============================================================
  // Feeds & SEO
  // ============================================================
  app.get('/feed/rss.xml', feedRss.rss(deps));
  app.get('/sitemap.xml', sitemap.sitemap(deps));
}

module.exports = { setupRoutes };
