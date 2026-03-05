import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { config } from './config';
import { prisma } from './db';
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

  await prisma.authToken.create({
    data: {
      userId,
      refreshToken,
      expiresAt,
    },
  });

  return { accessToken, refreshToken, expiresAt };
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value;

  if (!token) return null;

  const payload = verifyAccessToken(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      displayName: true,
      avatarUrl: true,
      role: true,
      email: true,
    },
  });

  return user;
}

export function isAdmin(role: string): boolean {
  return role === 'admin';
}

export function isEditor(role: string): boolean {
  return role === 'editor' || role === 'admin';
}

export function verifyTelegramAuth(data: Record<string, string>): boolean {
  const { hash, ...rest } = data;
  if (!hash || !config.telegram.botToken) return false;

  const secret = crypto
    .createHash('sha256')
    .update(config.telegram.botToken)
    .digest();

  const checkString = Object.keys(rest)
    .sort()
    .map((key) => `${key}=${rest[key]}`)
    .join('\n');

  const hmac = crypto
    .createHmac('sha256', secret)
    .update(checkString)
    .digest('hex');

  return hmac === hash;
}
