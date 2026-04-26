const crypto = require('crypto');
const { config } = require('../../lib/config');

const COOKIE_NAME = 'staging_auth';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

function makeToken(password) {
  return crypto
    .createHash('sha256')
    .update(password + (config.auth.jwtSecret || 'staging'))
    .digest('hex')
    .slice(0, 32);
}

function stagingLock(req, res, next) {
  if (!config.isStaging) return next();

  const password = config.staging.password;
  if (!password) return next();

  const expectedToken = makeToken(password);

  if (req.method === 'POST' && req.path === '/__staging_unlock') {
    const submitted = (req.body && req.body.password) || '';
    if (submitted === password) {
      res.cookie(COOKIE_NAME, expectedToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: COOKIE_MAX_AGE,
      });
      return res.redirect('/');
    }
    return res.status(401).send(lockPage(true));
  }

  if (req.cookies && req.cookies[COOKIE_NAME] === expectedToken) {
    return next();
  }

  return res.status(401).send(lockPage(false));
}

function lockPage(failed) {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CineFiles — Staging</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#111;color:#e0e0e0;font-family:system-ui,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center}
.card{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;padding:40px;width:100%;max-width:360px}
h1{font-size:1.1rem;font-weight:600;margin-bottom:6px;color:#fff}
p{font-size:0.85rem;color:#888;margin-bottom:24px}
input{width:100%;padding:10px 12px;background:#111;border:1px solid #333;border-radius:4px;color:#e0e0e0;font-size:0.95rem;outline:none}
input:focus{border-color:#555}
button{width:100%;margin-top:12px;padding:10px;background:#e0e0e0;color:#111;border:none;border-radius:4px;font-size:0.95rem;font-weight:600;cursor:pointer}
@media(hover:hover){button:hover{background:#fff}}
.error{margin-top:12px;font-size:0.85rem;color:#e87070}
</style>
</head>
<body>
<div class="card">
  <h1>CineFiles Staging</h1>
  <p>Доступ ограничен</p>
  <form method="POST" action="/__staging_unlock">
    <input type="password" name="password" placeholder="Пароль" autofocus>
    <button type="submit">Войти</button>
    ${failed ? '<p class="error">Неверный пароль</p>' : ''}
  </form>
</div>
</body>
</html>`;
}

module.exports = stagingLock;
