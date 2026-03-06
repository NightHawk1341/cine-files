/**
 * JWT Authentication Middleware
 *
 * Verifies JWT tokens from Authorization header and attaches user info to request
 */

const auth = require('../../auth');

/**
 * Middleware to verify JWT token and authenticate requests
 *
 * Extracts token from "Authorization: Bearer <token>" header
 * Sets req.userId and req.user on successful authentication
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const decoded = auth.verifyToken(token);
  if (!decoded) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }

  // Set both req.userId and req.user for compatibility with different API endpoints
  req.userId = decoded.userId;
  req.user = { id: decoded.userId };
  next();
};

module.exports = authenticateToken;
