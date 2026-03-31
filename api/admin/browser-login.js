/**
 * Admin Browser Login Endpoint
 * POST /api/admin/browser-login
 *
 * Authenticates admin via username/password for browser access
 */

const jwt = require('jsonwebtoken');
const { config } = require('../../lib/config');
const { success, error, badRequest } = require('../../lib/response');

/**
 * Verify password - supports bcrypt hash or plain-text comparison
 */
async function verifyPassword(inputPassword, storedPassword) {
  if (!storedPassword) return false;

  const isBcryptHash = /^\$2[aby]\$\d+\$/.test(storedPassword);
  if (isBcryptHash) {
    const bcrypt = require('bcrypt');
    return await bcrypt.compare(inputPassword, storedPassword);
  }

  // Plain-text comparison (constant-time to avoid timing attacks)
  if (inputPassword.length !== storedPassword.length) return false;
  const crypto = require('crypto');
  return crypto.timingSafeEqual(
    Buffer.from(inputPassword),
    Buffer.from(storedPassword)
  );
}

/**
 * Factory function
 */
function login(deps) {
  return async function handler(req, res) {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return badRequest(res, 'Имя пользователя и пароль обязательны');
      }

      const adminUsername = config.admin.username;
      const adminPassword = config.admin.password;

      if (!adminUsername || !adminPassword) {
        console.error('Admin credentials not configured');
        return error(res, 'Сервер не настроен для браузерного доступа', 500);
      }

      if (username !== adminUsername) {
        return res.status(401).json({ success: false, message: 'Неверное имя пользователя или пароль' });
      }

      const isValidPassword = await verifyPassword(password, adminPassword);
      if (!isValidPassword) {
        return res.status(401).json({ success: false, message: 'Неверное имя пользователя или пароль' });
      }

      // Generate JWT
      const token = jwt.sign(
        {
          isAdmin: true,
          role: 'admin',
          username: adminUsername,
          authMethod: 'browser',
          loginTime: new Date().toISOString()
        },
        config.auth.jwtSecret,
        { expiresIn: '7d' }
      );

      // Set secure HTTP-only cookie
      res.cookie('admin_token', token, {
        httpOnly: true,
        secure: config.isProd,
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      return success(res, { message: 'Вход выполнен успешно', role: 'admin' });
    } catch (err) {
      console.error('Browser login error:', err);
      return error(res, 'Ошибка при входе', 500);
    }
  };
}

module.exports = { login };
