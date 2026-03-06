/**
 * T-Bank Payment Result Page
 *
 * GET /api/payment/tbank/result?status=success|fail&order=123
 *
 * Lightweight HTML page used as T-Bank success/fail redirect target.
 *
 * Two contexts:
 *   - Inside iframe (desktop overlay): notifies parent via postMessage
 *   - Top-level (external browser after Telegram Mini-App openLink):
 *       shows result + "Return to Telegram" button. The mini-app detects
 *       completion independently via polling — no auth-gated redirect needed.
 *
 * Being under /api/, this bypasses the site-lock middleware.
 */

const config = require('../../../lib/config');

module.exports = function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).send('Method not allowed');
  }

  const status = req.query.status;
  const orderId = req.query.order;
  const fromContext = req.query.from; // 'browser', 'telegram', 'vk', 'widget'
  const isSuccess = status === 'success';

  const title = isSuccess ? 'Оплата прошла' : 'Оплата не прошла';
  const subtitle = isSuccess
    ? 'Ваш платёж успешно принят'
    : 'Платёж не был завершён';

  // Telegram deep link — only when explicitly from Telegram context
  const botUsername = config.telegramBotUsername;
  const telegramLink = (fromContext === 'telegram' && botUsername) ? `https://t.me/${botUsername}` : null;

  // VK Mini App deep link
  const vkAppId = config.vkAppId;
  const vkLink = (fromContext === 'vk' && vkAppId) ? `https://vk.com/app${vkAppId}` : null;

  // Regular browser: return URL for order page
  const orderReturnUrl = (fromContext === 'browser' && orderId) ? `/order?id=${orderId}` : null;

  // SVG icons matching T-Bank's style
  const successIcon = `
    <svg width="88" height="88" viewBox="0 0 88 88" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="44" cy="44" r="44" fill="#00C37F"/>
      <path d="M27 44.5L38.5 56L61 32" stroke="white" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;

  const failIcon = `
    <svg width="88" height="88" viewBox="0 0 88 88" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="44" cy="44" r="44" fill="#FF5C5C"/>
      <path d="M30 30L58 58M58 30L30 58" stroke="white" stroke-width="4.5" stroke-linecap="round"/>
    </svg>`;

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;
      background: #1A1A1A;
      color: #fff;
      min-height: 100vh;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
    }

    .content {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 40px 24px 24px;
    }

    .icon-wrap {
      margin-bottom: 24px;
    }

    .result-title {
      font-size: 24px;
      font-weight: 700;
      color: #fff;
      margin-bottom: 10px;
      letter-spacing: -0.3px;
    }

    .result-subtitle {
      font-size: 15px;
      color: #8C8C8C;
      line-height: 1.5;
      max-width: 280px;
    }

    .actions {
      padding: 16px 16px;
      padding-bottom: calc(24px + env(safe-area-inset-bottom));
    }

    .btn-primary {
      display: block;
      width: 100%;
      padding: 16px;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 600;
      text-align: center;
      text-decoration: none;
      cursor: pointer;
      border: none;
      transition: opacity 0.15s;
      background: #FFDD2D;
      color: #1A1A1A;
    }
    .btn-primary:active { opacity: 0.8; }
  </style>
</head>
<body>

  <div class="content">
    <div class="icon-wrap">
      ${isSuccess ? successIcon : failIcon}
    </div>
    <div class="result-title">${title}</div>
    <div class="result-subtitle">${subtitle}</div>
  </div>

  <div class="actions">
    ${vkLink
      ? `<a class="btn-primary" href="${vkLink}">Вернуться в приложение</a>`
      : telegramLink
      ? `<a class="btn-primary" href="${telegramLink}">Вернуться в приложение</a>`
      : `<button class="btn-primary" id="done-btn">Готово</button>`
    }
  </div>

  <script>
    if (window.parent !== window) {
      // Inside iframe (desktop overlay) — notify parent to close it
      window.parent.postMessage({
        type: 'tbank-payment-result',
        status: '${isSuccess ? 'success' : 'fail'}'
      }, window.location.origin);
    }

    var doneBtn = document.getElementById('done-btn');
    if (doneBtn) {
      doneBtn.addEventListener('click', function() {
        window.close();
        ${orderReturnUrl ? `setTimeout(function(){ window.location.href = '${orderReturnUrl}'; }, 300);` : ''}
      });
    }
  </script>

</body>
</html>`;

  res.status(200).type('text/html').send(html);
};
