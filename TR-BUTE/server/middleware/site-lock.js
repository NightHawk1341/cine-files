/**
 * Site Lock Middleware
 *
 * TEMPORARY: This middleware adds a password protection layer to the public site.
 * TODO: Remove this file and the middleware registration when the site is ready for public access.
 *
 * @see /TODO_REMOVE_LOCKSCREEN.md
 */

const crypto = require('crypto');

// Set to false to temporarily hide the lockscreen without removing the middleware
const LOCKSCREEN_ENABLED = true;

// Hash of the lockscreen password for comparison
const SITE_LOCK_PASSWORD = process.env.SITE_LOCK_PASSWORD || 'ccritique';
const PASSWORD_HASH = crypto.createHash('sha256').update(SITE_LOCK_PASSWORD).digest('hex');
const COOKIE_NAME = 'site_access_token';
const VK_SESSION_COOKIE = 'vk_miniapp_session';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Lock screen HTML template
 */
function getLockScreenHTML() {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>В разработке | TR-BUTE</title>
  <meta name="robots" content="noindex, nofollow">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #121212;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      color: #E0E0E0;
    }

    .lock {
      max-width: 360px;
      width: 100%;
      text-align: center;
    }

    .lock svg {
      width: 48px;
      height: 48px;
      stroke: #fbe98a;
      margin-bottom: 20px;
    }

    .lock h1 {
      font-size: 1.2rem;
      font-weight: 500;
      margin-bottom: 6px;
    }

    .lock p {
      color: #888;
      font-size: 0.85rem;
      margin-bottom: 28px;
    }

    .lock input {
      width: 100%;
      padding: 12px 14px;
      border: 1px solid #333;
      border-radius: 8px;
      background: #1e1e1e;
      color: #E0E0E0;
      font-size: 0.95rem;
      outline: none;
      margin-bottom: 12px;
    }

    .lock input:focus {
      border-color: #fbe98a;
    }

    .lock input::placeholder {
      color: #555;
    }

    .lock button {
      width: 100%;
      padding: 12px;
      background: #fbe98a;
      border: none;
      border-radius: 8px;
      color: #121212;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
    }

    .lock button:active {
      opacity: 0.85;
    }

    .lock .err {
      color: #c44;
      font-size: 0.8rem;
      margin-top: 10px;
      display: none;
    }

    .lock .err.show { display: block; }
  </style>
</head>
<body>
  <div class="lock">
    <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
      <path d="M12 6v6l4 2"/>
    </svg>
    <h1>Данный раздел сайта в разработке</h1>
    <p>Введите пароль для доступа</p>
    <form id="f" method="POST" action="/__site_unlock">
      <input type="password" name="password" placeholder="Пароль" required autocomplete="off">
      <button type="submit">Войти</button>
      <div class="err" id="err">Неверный пароль</div>
    </form>
  </div>
  <script>
    if (new URLSearchParams(location.search).get('error') === '1')
      document.getElementById('err').classList.add('show');
  </script>
</body>
</html>`;
}

/**
 * Verify password and generate access token
 */
function verifyPassword(password) {
  const inputHash = crypto.createHash('sha256').update(password || '').digest('hex');
  return inputHash === PASSWORD_HASH;
}

/**
 * Generate access token for cookie
 */
function generateAccessToken() {
  return crypto.createHash('sha256').update(PASSWORD_HASH + Date.now()).digest('hex').substring(0, 32);
}

/**
 * Site lock middleware
 * Protects public site routes with password
 */
function siteLockMiddleware(req, res, next) {
  // Lockscreen temporarily disabled
  if (!LOCKSCREEN_ENABLED) {
    return next();
  }

  // Skip for API routes
  if (req.path.startsWith('/api/')) {
    return next();
  }

  // Skip for VK Mini App sessions.
  // First request has vk_app_id in query; we set a session cookie so subsequent
  // requests (SPA page fetches) also bypass the lock. sameSite=none is required
  // because VK loads the app in a cross-origin iframe.
  if (req.query.vk_app_id) {
    res.cookie(VK_SESSION_COOKIE, '1', {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 24 * 60 * 60 * 1000 // 24h
    });
    return next();
  }
  if (req.cookies?.[VK_SESSION_COOKIE]) {
    return next();
  }

  // Skip for admin routes
  if (req.path.startsWith('/admin')) {
    return next();
  }

  // Skip for /products API endpoint (returns JSON, used by admin miniapp)
  if (req.path === '/products' || req.path.startsWith('/products/')) {
    return next();
  }

  // Skip for static assets
  if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|map)$/i)) {
    return next();
  }

  // Skip for unlock endpoint
  if (req.path === '/__site_unlock') {
    return next();
  }

  // Check for access cookie
  const accessToken = req.cookies?.[COOKIE_NAME];
  if (accessToken) {
    // Valid token exists, allow access
    return next();
  }

  // No valid access, show lock screen
  res.status(200).send(getLockScreenHTML());
}

/**
 * Unlock endpoint handler
 */
function unlockHandler(req, res) {
  console.log('[Site Lock] Unlock handler called');
  console.log('[Site Lock] Method:', req.method);
  console.log('[Site Lock] Content-Type:', req.get('content-type'));
  console.log('[Site Lock] Body:', req.body);

  try {
    // Defensive check for body parsing
    if (!req.body) {
      console.error('[Site Lock] req.body is undefined - body parser may not be configured');
      return res.redirect('/?error=1');
    }

    const { password } = req.body;
    const redirectTo = req.query.redirect || '/';

    console.log('[Site Lock] Password received:', password ? '[REDACTED]' : 'empty');

    if (verifyPassword(password)) {
      console.log('[Site Lock] Password verified successfully');
      // Set access cookie
      const token = generateAccessToken();
      res.cookie(COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: COOKIE_MAX_AGE,
        sameSite: 'lax'
      });

      // Redirect to original destination
      return res.redirect(redirectTo);
    }

    console.log('[Site Lock] Password verification failed');
    // Wrong password, show lock screen with error
    res.redirect('/?error=1');
  } catch (error) {
    console.error('[Site Lock] Unlock error:', error);
    res.redirect('/?error=1');
  }
}

module.exports = {
  siteLockMiddleware,
  unlockHandler,
  COOKIE_NAME
};
