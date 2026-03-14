const { requireAuth, requireEditor, requireAdmin, requireCronAuth } = require('../middleware/auth');

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
  const cronTokenCleanup = require('../../api/cron-token-cleanup');
  const cronTmdbSync = require('../../api/cron-tmdb-sync');
  const cronTmdbCleanup = require('../../api/cron-tmdb-cleanup');
  const tmdbProxy = require('../../api/tmdb-proxy');
  const tmdbSearch = require('../../api/tmdb-search');
  const feedRss = require('../../api/feed-rss');
  const sitemap = require('../../api/sitemap');

  // ============================================================
  // Health check
  // ============================================================
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ============================================================
  // Auth
  // ============================================================
  app.get('/api/auth/yandex', authYandex.redirect());
  app.get('/api/auth/yandex/callback', authYandex.callback(deps));
  app.get('/api/auth/telegram', authTelegram.redirect());
  app.get('/api/auth/telegram/callback', authTelegram.callback(deps));

  // ============================================================
  // Categories
  // ============================================================
  app.get('/api/categories', categories.list(deps));

  // ============================================================
  // Articles — specific routes before :id catch-all
  // ============================================================
  app.get('/api/articles/related', articlesRelated.list(deps));
  app.get('/api/articles', articles.list(deps));
  app.post('/api/articles', requireEditor, articles.create(deps));
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
  // Note: multer or formidable middleware needed for file uploads
  app.post('/api/media/upload', requireEditor, mediaUpload.upload(deps));

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
