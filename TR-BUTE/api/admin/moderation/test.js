/**
 * Moderation Test API (Admin)
 * POST /api/admin/moderation/test
 *
 * Lets admin test how a phrase would be moderated.
 */

const { checkText, normalizeText } = require('../../../lib/moderation');
const { success, error, badRequest, methodNotAllowed } = require('../../../server/utils/response-helpers');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return badRequest(res, 'text is required');
    }

    const result = await checkText(text);
    const normalized = normalizeText(text);

    return success(res, {
      passed: result.passed,
      matchedWords: result.matchedWords,
      normalizedText: normalized,
      originalText: text
    });
  } catch (err) {
    console.error('[moderation] Test error:', err);
    return error(res, 'Moderation test failed', 500);
  }
};
