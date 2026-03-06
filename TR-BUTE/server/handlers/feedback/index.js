/**
 * Feedback Handlers Index
 * Exports all feedback-related handlers
 */

const createUnifiedFeedbackHandlers = require('./unified');
const createReviewsHandlers = require('./reviews');
const createCommentsHandlers = require('./comments');
const createSuggestionsHandlers = require('./suggestions');

module.exports = {
  createUnifiedFeedbackHandlers,
  createReviewsHandlers,
  createCommentsHandlers,
  createSuggestionsHandlers
};
