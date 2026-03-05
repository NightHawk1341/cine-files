import { NextResponse } from 'next/server';
import { verifyAccessToken, type JwtPayload } from './auth';
import { cookies } from 'next/headers';

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function getAuthUser(): Promise<JwtPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value;
  if (!token) return null;
  return verifyAccessToken(token);
}

export async function requireAuth(): Promise<JwtPayload> {
  const user = await getAuthUser();
  if (!user) throw new AuthError('Unauthorized', 401);
  return user;
}

export async function requireEditor(): Promise<JwtPayload> {
  const user = await requireAuth();
  if (user.role !== 'editor' && user.role !== 'admin') {
    throw new AuthError('Forbidden', 403);
  }
  return user;
}

export async function requireAdmin(): Promise<JwtPayload> {
  const user = await requireAuth();
  if (user.role !== 'admin') {
    throw new AuthError('Forbidden', 403);
  }
  return user;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function handleApiError(error: unknown) {
  if (error instanceof AuthError) {
    return jsonError(error.message, error.status);
  }
  console.error('API Error:', error);
  return jsonError('Internal server error', 500);
}
