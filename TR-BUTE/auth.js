const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('./lib/config');

const JWT_SECRET = config.jwt.secret;
if (!JWT_SECRET) {
  throw new Error('CRITICAL: JWT_SECRET environment variable is required');
}
// Use config for Telegram bot token (supports both USER_BOT_TOKEN and BOT_TOKEN)
const TELEGRAM_BOT_TOKEN = config.auth.telegram.userBotToken;

// Verify Telegram Web App data
const verifyTelegramData = (initData) => {
  try {
    const url = new URLSearchParams(initData);
    const hash = url.get('hash');
    url.delete('hash');

    const dataCheckString = Array.from(url.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(TELEGRAM_BOT_TOKEN).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    return calculatedHash === hash;
  } catch (err) {
    console.error('Error verifying Telegram data:', err);
    return false;
  }
};

// Parse Telegram user data
const parseTelegramUser = (initData) => {
  try {
    const url = new URLSearchParams(initData);
    const userData = url.get('user');
    if (!userData) return null;
    
    return JSON.parse(userData);
  } catch (err) {
    console.error('Error parsing Telegram user:', err);
    return null;
  }
};

// Generate JWT tokens
const generateTokens = (userId) => {
  const accessToken = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
  const refreshToken = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });
  return { accessToken, refreshToken };
};

// Verify JWT
const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
};

module.exports = {
  verifyTelegramData,
  parseTelegramUser,
  generateTokens,
  verifyToken,
  JWT_SECRET
};