/**
 * Response Helper Functions
 * Standardizes all API response formats across the application
 */

/**
 * Send a successful response
 *
 * @param {Object} res - Express response object
 * @param {*} data - Response data (will be spread into response)
 * @param {number} [statusCode=200] - HTTP status code
 * @returns {Object} Express response
 *
 * @example
 * success(res, { order: orderData });
 * // Returns: { success: true, order: {...} }
 */
function success(res, data, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    ...data
  });
}

/**
 * Send an error response
 *
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {number} [statusCode=500] - HTTP status code
 * @param {*} [details=null] - Additional error details
 * @returns {Object} Express response
 *
 * @example
 * error(res, 'Order not found', 404);
 * // Returns: { success: false, error: 'Order not found' }
 *
 * error(res, 'Validation failed', 400, { field: 'email' });
 * // Returns: { success: false, error: 'Validation failed', details: {...} }
 */
function error(res, message, statusCode = 500, details = null) {
  const response = {
    success: false,
    error: message
  };
  if (details) {
    response.details = details;
  }
  return res.status(statusCode).json(response);
}

/**
 * Send a 404 Not Found response
 *
 * @param {Object} res - Express response object
 * @param {string} [resource='Resource'] - Name of the resource that wasn't found
 * @returns {Object} Express response
 *
 * @example
 * notFound(res, 'Order');
 * // Returns: { success: false, error: 'Order not found' }
 */
function notFound(res, resource = 'Resource') {
  return res.status(404).json({
    success: false,
    error: `${resource} not found`
  });
}

/**
 * Send a 401 Unauthorized response
 *
 * @param {Object} res - Express response object
 * @param {string} [message='Unauthorized'] - Custom unauthorized message
 * @returns {Object} Express response
 *
 * @example
 * unauthorized(res);
 * // Returns: { success: false, error: 'Unauthorized' }
 */
function unauthorized(res, message = 'Unauthorized') {
  return res.status(401).json({
    success: false,
    error: message
  });
}

/**
 * Send a 403 Forbidden response
 *
 * @param {Object} res - Express response object
 * @param {string} [message='Forbidden'] - Custom forbidden message
 * @returns {Object} Express response
 *
 * @example
 * forbidden(res);
 * // Returns: { success: false, error: 'Forbidden' }
 */
function forbidden(res, message = 'Forbidden') {
  return res.status(403).json({
    success: false,
    error: message
  });
}

/**
 * Send a 400 Bad Request response
 *
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {Object} [validationErrors=null] - Validation error details
 * @returns {Object} Express response
 *
 * @example
 * badRequest(res, 'Invalid input', { email: 'Email is required' });
 * // Returns: { success: false, error: 'Invalid input', validation_errors: {...} }
 */
function badRequest(res, message, validationErrors = null) {
  const response = {
    success: false,
    error: message
  };
  if (validationErrors) {
    response.validation_errors = validationErrors;
  }
  return res.status(400).json(response);
}

/**
 * Send a 405 Method Not Allowed response
 *
 * @param {Object} res - Express response object
 * @param {string[]} [allowedMethods=[]] - List of allowed HTTP methods
 * @returns {Object} Express response
 *
 * @example
 * methodNotAllowed(res, ['GET', 'POST']);
 * // Returns: { success: false, error: 'Method not allowed', allowed_methods: [...] }
 */
function methodNotAllowed(res, allowedMethods = []) {
  const response = {
    success: false,
    error: 'Method not allowed'
  };
  if (allowedMethods.length > 0) {
    response.allowed_methods = allowedMethods;
  }
  return res.status(405).json(response);
}

/**
 * Send a response with custom status and message
 *
 * @param {Object} res - Express response object
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Response message
 * @param {*} [data=null] - Optional data
 * @returns {Object} Express response
 */
function custom(res, statusCode, message, data = null) {
  const response = {
    success: statusCode >= 200 && statusCode < 300,
    message
  };
  if (data) {
    response.data = data;
  }
  return res.status(statusCode).json(response);
}

module.exports = {
  success,
  error,
  notFound,
  unauthorized,
  forbidden,
  badRequest,
  methodNotAllowed,
  custom
};
