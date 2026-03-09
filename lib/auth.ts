import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { config } from './config';
import { supabase, camelizeKeys } from './db';
import crypto from 'crypto';

export interface JwtPayload {
  userId: number;
  role: string;
}

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.auth.jwtSecret, {
    expiresIn: config.auth.accessTokenExpiry,
  });
}

export function verifyAccessToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, config.auth.jwtSecret) as JwtPayload;
  } catch {
    return null;
  }
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(64).toString('hex');
}

export async function createSession(userId: number, role: string) {
  const accessToken = signAccessToken({ userId, role });
  const refreshToken = generateRefreshToken();
  const expiresAt = new Date(Date.now() + config.auth.refreshTokenExpiry * 24 * 60 * 60 * 1000);

  await supabase.from('auth_tokens').insert({
    user_id: userId,
    refresh_token: refreshToken,
    expires_at: expiresAt.toISOString(),
  });

  return { accessToken, refreshToken, expiresAt };
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value;

  if (!token) return null;

  const payload = verifyAccessToken(token);
  if (!payload) return null;

  const { data: user } = await supabase
    .from('users')
    .select('id, display_name, avatar_url, role, email')
    .eq('id', payload.userId)
    .single();

  if (!user) return null;

  return camelizeKeys<{
    id: number;
    displayName: string | null;
    avatarUrl: string | null;
    role: string;
    email: string | null;
  }>(user);
}

export function isAdmin(role: string): boolean {
  return role === 'admin';
}

export function isEditor(role: string): boolean {
  return role === 'editor' || role === 'admin';
}

// ============================================================
// Telegram OIDC Helpers
// ============================================================

const TELEGRAM_JWKS_URL = 'https://oauth.telegram.org/.well-known/jwks.json';
const TELEGRAM_ISSUER = 'https://oauth.telegram.org';

let cachedJwks: { keys: JsonWebKey[]; fetchedAt: number } | null = null;
const JWKS_CACHE_TTL = 3600_000; // 1 hour

interface TelegramJwk {
  kty: string;
  kid: string;
  use: string;
  n: string;
  e: string;
  alg: string;
}

export async function getTelegramJwks(): Promise<TelegramJwk[]> {
  if (cachedJwks && Date.now() - cachedJwks.fetchedAt < JWKS_CACHE_TTL) {
    return cachedJwks.keys as TelegramJwk[];
  }

  const res = await fetch(TELEGRAM_JWKS_URL);
  if (!res.ok) throw new Error(`Failed to fetch Telegram JWKS: ${res.status}`);

  const data = await res.json();
  cachedJwks = { keys: data.keys, fetchedAt: Date.now() };
  return data.keys as TelegramJwk[];
}

function jwkToPem(jwk: TelegramJwk): string {
  // Convert JWK RSA public key to PEM format
  const n = Buffer.from(jwk.n, 'base64url');
  const e = Buffer.from(jwk.e, 'base64url');

  // DER encode RSA public key
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

  // RSA OID: 1.2.840.113549.1.1.1
  const rsaOid = Buffer.from('300d06092a864886f70d0101010500', 'hex');

  const publicKeyInfo = encodeSequence(
    Buffer.concat([rsaOid, bitString])
  );

  const base64 = publicKeyInfo.toString('base64');
  const lines = base64.match(/.{1,64}/g) || [];
  return `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----`;
}

function encodeUnsignedInteger(buf: Buffer): Buffer {
  // Prepend 0x00 if high bit is set (to keep it positive)
  const needsPadding = buf[0] & 0x80;
  const content = needsPadding ? Buffer.concat([Buffer.from([0x00]), buf]) : buf;
  return Buffer.concat([Buffer.from([0x02]), encodeDerLength(content.length), content]);
}

function encodeSequence(content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([0x30]), encodeDerLength(content.length), content]);
}

function encodeDerLength(length: number): Buffer {
  if (length < 0x80) return Buffer.from([length]);
  if (length < 0x100) return Buffer.from([0x81, length]);
  return Buffer.from([0x82, (length >> 8) & 0xff, length & 0xff]);
}

export interface TelegramIdToken {
  sub: string; // Telegram user ID
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  iss: string;
  aud: string;
  exp: number;
  iat: number;
}

export async function verifyTelegramIdToken(idToken: string): Promise<TelegramIdToken | null> {
  try {
    // Decode header to find key ID
    const headerB64 = idToken.split('.')[0];
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());
    const kid = header.kid;

    // Fetch JWKS and find matching key
    const jwks = await getTelegramJwks();
    const jwk = jwks.find((k) => k.kid === kid);
    if (!jwk) return null;

    const pem = jwkToPem(jwk);

    // Verify JWT signature and claims
    const payload = jwt.verify(idToken, pem, {
      issuer: TELEGRAM_ISSUER,
      audience: config.telegram.botId,
      algorithms: ['RS256'],
    }) as TelegramIdToken;

    return payload;
  } catch {
    return null;
  }
}

/**
 * Generate PKCE code verifier and challenge for Telegram OIDC
 */
export function generatePkce(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  return { codeVerifier, codeChallenge };
}
