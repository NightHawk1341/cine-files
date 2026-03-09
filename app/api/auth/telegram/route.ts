import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import { config } from '@/lib/config';
import { generatePkce } from '@/lib/auth';

/**
 * GET /api/auth/telegram
 *
 * Initiates Telegram OIDC login flow.
 * Redirects user to oauth.telegram.org with PKCE challenge.
 */
export async function GET() {
  const { botId } = config.telegram;

  if (!botId) {
    return NextResponse.json({ error: 'Telegram OAuth not configured' }, { status: 500 });
  }

  const redirectUri = `${config.appUrl}/api/auth/telegram/callback`;
  const { codeVerifier, codeChallenge } = generatePkce();
  const state = crypto.randomBytes(16).toString('hex');

  // Store PKCE verifier + state in a short-lived httpOnly cookie
  const cookieStore = await cookies();
  cookieStore.set('tg_pkce', JSON.stringify({ codeVerifier, state }), {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/api/auth/telegram',
  });

  const url = new URL('https://oauth.telegram.org/auth');
  url.searchParams.set('client_id', botId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid profile photo');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');

  return NextResponse.redirect(url.toString());
}
