/**
 * User Feedback Router
 * Handles reviews, comments, and suggestions endpoints
 *
 * Consolidated feedback system supporting:
 * - Unified /api/feedback endpoints
 * - Legacy /api/reviews, /api/comments, /api/suggestions endpoints
 * - Admin response and visibility controls
 */

const express = require('express');
const axios = require('axios');
const router = express.Router();

const {
  createUnifiedFeedbackHandlers,
  createReviewsHandlers,
  createCommentsHandlers,
  createSuggestionsHandlers
} = require('../handlers/feedback');

/**
 * Creates and configures the feedback router
 * @param {Object} deps - Dependencies
 * @param {Object} deps.pool - PostgreSQL connection pool
 * @param {Function} deps.authenticateToken - JWT authentication middleware
 * @param {Object} deps.config - Application configuration
 * @returns {express.Router} Configured router
 */
function createFeedbackRouter({ pool, authenticateToken, config }) {
  // Initialize handlers with dependencies
  const deps = { pool, config, axios };

  const unifiedHandlers = createUnifiedFeedbackHandlers(deps);
  const reviewsHandlers = createReviewsHandlers(deps);
  const commentsHandlers = createCommentsHandlers(deps);
  const suggestionsHandlers = createSuggestionsHandlers(deps);

  // ============ UNIFIED FEEDBACK ENDPOINTS ============

  router.get('/feedback', unifiedHandlers.getAllFeedback);
  router.post('/feedback', authenticateToken, unifiedHandlers.submitFeedback);
  router.delete('/feedback/:feedbackId', authenticateToken, unifiedHandlers.deleteFeedback);
  router.post('/feedback/:feedbackId/like', authenticateToken, unifiedHandlers.toggleLike);
  router.get('/feedback/likes', authenticateToken, unifiedHandlers.getUserLikes);
  router.get('/feedback/user', authenticateToken, unifiedHandlers.getUserFeedback);
  router.post('/feedback/visibility', unifiedHandlers.updateVisibility);
  router.post('/feedback/:feedbackId/response', authenticateToken, unifiedHandlers.addResponse);
  router.delete('/feedback/response/:responseId', authenticateToken, unifiedHandlers.deleteResponse);

  // ============ REVIEWS ============

  router.get('/reviews', reviewsHandlers.getAllReviews);
  router.get('/reviews/product/:productId', reviewsHandlers.getProductReviews);
  router.get('/reviews/order/:orderId', authenticateToken, reviewsHandlers.getOrderReview);
  router.post('/reviews', authenticateToken, reviewsHandlers.submitReview);
  router.delete('/reviews/:reviewId', authenticateToken, reviewsHandlers.deleteReview);
  router.post('/reviews/:reviewId/like', authenticateToken, reviewsHandlers.toggleLike);
  router.get('/reviews/likes', authenticateToken, reviewsHandlers.getUserLikes);
  router.post('/reviews/:reviewId/response', authenticateToken, reviewsHandlers.addResponse);
  router.delete('/reviews/response/:responseId', authenticateToken, reviewsHandlers.deleteResponse);
  router.post('/reviews/visibility', reviewsHandlers.updateVisibility);
  router.post('/reviews/respond', reviewsHandlers.adminRespond);
  router.post('/reviews/response-delete', reviewsHandlers.adminDeleteResponse);

  // ============ COMMENTS ============

  router.get('/comments', commentsHandlers.getAllComments);
  router.post('/comments', authenticateToken, commentsHandlers.postComment);
  router.delete('/comments/:commentId', authenticateToken, commentsHandlers.deleteComment);
  router.post('/comments/:commentId/like', authenticateToken, commentsHandlers.toggleLike);
  router.get('/comments/likes', authenticateToken, commentsHandlers.getUserLikes);
  router.post('/comments/:commentId/response', authenticateToken, commentsHandlers.addResponse);
  router.delete('/comments/response/:responseId', authenticateToken, commentsHandlers.deleteResponse);
  router.post('/comments/visibility', commentsHandlers.updateVisibility);
  router.post('/comments/respond', commentsHandlers.adminRespond);
  router.post('/comments/response-delete', commentsHandlers.adminDeleteResponse);

  // ============ SUGGESTIONS ============

  router.get('/suggestions', suggestionsHandlers.getAllSuggestions);
  router.post('/suggestions', authenticateToken, suggestionsHandlers.postSuggestion);
  router.delete('/suggestions/:suggestionId', authenticateToken, suggestionsHandlers.deleteSuggestion);
  router.post('/suggestions/:suggestionId/upvote', authenticateToken, suggestionsHandlers.toggleUpvote);
  router.get('/suggestions/upvotes', authenticateToken, suggestionsHandlers.getUserUpvotes);
  router.post('/suggestions/:suggestionId/response', authenticateToken, suggestionsHandlers.addResponse);
  router.delete('/suggestions/response/:responseId', authenticateToken, suggestionsHandlers.deleteResponse);
  router.post('/suggestions/visibility', suggestionsHandlers.updateVisibility);
  router.post('/suggestions/respond', suggestionsHandlers.adminRespond);
  router.post('/suggestions/response-delete', suggestionsHandlers.adminDeleteResponse);

  return router;
}

module.exports = createFeedbackRouter;
