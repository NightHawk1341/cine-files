/**
 * Admin Browser Login Endpoint
 * POST /api/admin/browser-login
 *
 * Authenticates admin or editor via username/password for browser access
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const config = require('../../lib/config');
const auth = require('../../auth');
const { success, error, badRequest, unauthorized, methodNotAllowed } = require('../../server/utils/response-helpers');

/**
 * Verify password - bcrypt hash only
 */
async function verifyPassword(inputPassword, storedPassword) {
  if (!storedPassword) return false;

  const isBcryptHash = /^\$2[aby]\$\d+\$/.test(storedPassword);
  if (!isBcryptHash) return false;

  return await bcrypt.compare(inputPassword, storedPassword);
}

/**
 * Main handler
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return badRequest(res, 'Имя пользователя и пароль обязательны');
    }

    // Check admin credentials
    const adminUsername = config.admin.username;
    const adminPassword = config.admin.password;

    // Check editor credentials
    const editorUsername = config.editor?.username;
    const editorPassword = config.editor?.password;

    // Determine role based on credentials
    let role = null;
    let authenticatedUsername = null;

    // Check admin first
    if (adminUsername && adminPassword && username === adminUsername) {
      const isValidPassword = await verifyPassword(password, adminPassword);
      if (isValidPassword) {
        role = 'admin';
        authenticatedUsername = adminUsername;
      }
    }

    // Check editor if not admin
    if (!role && editorUsername && editorPassword && username === editorUsername) {
      const isValidPassword = await verifyPassword(password, editorPassword);
      if (isValidPassword) {
        role = 'editor';
        authenticatedUsername = editorUsername;
      }
    }

    if (role) {
      // Generate JWT with role
      const token = jwt.sign(
        {
          isAdmin: true, // Keep for backwards compatibility - means "has admin panel access"
          role: role,    // New field: 'admin' or 'editor'
          username: authenticatedUsername,
          authMethod: 'browser',
          loginTime: new Date().toISOString()
        },
        auth.JWT_SECRET,
        { expiresIn: '7d' }
      );

      // Set secure HTTP-only cookie
      res.cookie('admin_token', token, {
        httpOnly: true,
        secure: config.isProduction,
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      return success(res, { message: 'Вход выполнен успешно', role });
    } else {
      // No credentials configured or invalid credentials
      if (!adminUsername || !adminPassword) {
        console.error('Admin credentials not configured');
        return error(res, 'Сервер не настроен для браузерного доступа', 500);
      }
      return unauthorized(res, 'Неверное имя пользователя или пароль');
    }
  } catch (err) {
    console.error('Browser login error:', err);
    return error(res, 'Ошибка при входе', 500);
  }
};
