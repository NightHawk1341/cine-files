const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { config } = require('./config');
const { getPool } = require('./db');

/**
 * Sign a JWT access token.
 * @param {{ userId: number, role: string }} payload
 * @returns {string}
 */
function signAccessToken(payload) {
  return jwt.sign(payload, config.auth.jwtSecret, {
    expiresIn: config.auth.accessTokenExpiry,
  });
}

/**
 * Verify a JWT access token.
 * @param {string} token
 * @returns {{ userId: number, role: string } | null}
 */
function verifyAccessToken(token) {
  try {
    return jwt.verify(token, config.auth.jwtSecret);
  } catch {
    return null;
  }
}

/**
 * Generate a random refresh token.
 * @returns {string}
 */
function generateRefreshToken() {
  return crypto.randomBytes(64).toString('hex');
}

/**
 * Create a session: issue tokens and store refresh token in DB.
 * @param {number} userId
 * @param {string} role
 * @returns {Promise<{ accessToken: string, refreshToken: string, expiresAt: Date }>}
 */
async function createSession(userId, role) {
  const pool = getPool();
  const accessToken = signAccessToken({ userId, role });
  const refreshToken = generateRefreshToken();
  const expiresAt = new Date(Date.now() + config.auth.refreshTokenExpiry * 24 * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO auth_tokens (user_id, refresh_token, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, refreshToken, expiresAt]
  );

  return { accessToken, refreshToken, expiresAt };
}

/**
 * Get current user from DB by ID.
 * @param {number} userId
 * @returns {Promise<object|null>}
 */
async function getUserById(userId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, display_name, avatar_url, role, email
     FROM users WHERE id = $1`,
    [userId]
  );
  if (!rows[0]) return null;
  return {
    id: rows[0].id,
    displayName: rows[0].display_name,
    avatarUrl: rows[0].avatar_url,
    role: rows[0].role,
    email: rows[0].email,
  };
}

function isAdmin(role) {
  return role === 'admin';
}

function isEditor(role) {
  return role === 'editor' || role === 'admin';
}

// ============================================================
// Telegram OIDC Helpers
// ============================================================

const TELEGRAM_JWKS_URL = 'https://oauth.telegram.org/.well-known/jwks.json';
const TELEGRAM_ISSUER = 'https://oauth.telegram.org';

let cachedJwks = null;
const JWKS_CACHE_TTL = 3600_000; // 1 hour

async function getTelegramJwks() {
  if (cachedJwks && Date.now() - cachedJwks.fetchedAt < JWKS_CACHE_TTL) {
    return cachedJwks.keys;
  }

  const res = await fetch(TELEGRAM_JWKS_URL);
  if (!res.ok) throw new Error(`Failed to fetch Telegram JWKS: ${res.status}`);

  const data = await res.json();
  cachedJwks = { keys: data.keys, fetchedAt: Date.now() };
  return data.keys;
}

function jwkToPem(jwk) {
  const n = Buffer.from(jwk.n, 'base64url');
  const e = Buffer.from(jwk.e, 'base64url');

  const encodedN = encodeUnsignedInteger(n);
  const encodedE = encodeUnsignedInteger(e);

  const rsaSequence = Buffer.concat([
    encodeSequence(Buffer.concat([encodedN, encodedE])),
  ]);

  const bitString = Buffer.concat([
    Buffer.from([0x03]),
    encodeDerLength(rsaSequence.length + 1),
    Buffer.from([0x00]),
    rsaSequence,
  ]);

  const rsaOid = Buffer.from('300d06092a864886f70d0101010500', 'hex');

  const publicKeyInfo = encodeSequence(
    Buffer.concat([rsaOid, bitString])
  );

  const base64 = publicKeyInfo.toString('base64');
  const lines = base64.match(/.{1,64}/g) || [];
  return `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----`;
}

function encodeUnsignedInteger(buf) {
  const needsPadding = buf[0] & 0x80;
  const content = needsPadding ? Buffer.concat([Buffer.from([0x00]), buf]) : buf;
  return Buffer.concat([Buffer.from([0x02]), encodeDerLength(content.length), content]);
}

function encodeSequence(content) {
  return Buffer.concat([Buffer.from([0x30]), encodeDerLength(content.length), content]);
}

function encodeDerLength(length) {
  if (length < 0x80) return Buffer.from([length]);
  if (length < 0x100) return Buffer.from([0x81, length]);
  return Buffer.from([0x82, (length >> 8) & 0xff, length & 0xff]);
}

/**
 * Verify a Telegram OIDC id_token.
 * @param {string} idToken
 * @returns {Promise<object|null>}
 */
async function verifyTelegramIdToken(idToken) {
  try {
    const headerB64 = idToken.split('.')[0];
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());
    const kid = header.kid;

    const jwks = await getTelegramJwks();
    const jwk = jwks.find((k) => k.kid === kid);
    if (!jwk) return null;

    const pem = jwkToPem(jwk);

    const payload = jwt.verify(idToken, pem, {
      issuer: TELEGRAM_ISSUER,
      audience: config.telegram.botId,
      algorithms: ['RS256'],
    });

    return payload;
  } catch {
    return null;
  }
}

/**
 * Generate PKCE code verifier and challenge for Telegram OIDC.
 * @returns {{ codeVerifier: string, codeChallenge: string }}
 */
function generatePkce() {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  return { codeVerifier, codeChallenge };
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  createSession,
  getUserById,
  isAdmin,
  isEditor,
  getTelegramJwks,
  verifyTelegramIdToken,
  generatePkce,
};
