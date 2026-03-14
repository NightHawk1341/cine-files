/**
 * Centralized response helpers.
 * Matches TR-BUTE response envelope: { success: true/false, ... }
 */

function success(res, data, statusCode) {
  statusCode = statusCode || 200;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return res.status(statusCode).json(Object.assign({ success: true }, data));
  }
  return res.status(statusCode).json({ success: true, data: data });
}

function error(res, message, statusCode, details) {
  statusCode = statusCode || 500;
  var body = { success: false, error: message };
  if (details) body.details = details;
  return res.status(statusCode).json(body);
}

function notFound(res, resource) {
  var message = resource ? resource + ' not found' : 'Not found';
  return res.status(404).json({ success: false, error: message });
}

function badRequest(res, message, details) {
  var body = { success: false, error: message || 'Bad request' };
  if (details) body.details = details;
  return res.status(400).json(body);
}

module.exports = { success, error, notFound, badRequest };
