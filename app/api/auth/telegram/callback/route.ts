import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { config } from '@/lib/config';
import { verifyTelegramIdToken, createSession } from '@/lib/auth';
import { supabase, camelizeKeys } from '@/lib/db';

/**
 * GET /api/auth/telegram/callback
 *
 * Handles Telegram OIDC callback.
 * Exchanges authorization code for id_token, verifies JWT via JWKS,
 * creates/updates user, issues session tokens.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(`${config.appUrl}?error=${error}`);
  }

  if (!code) {
    return NextResponse.redirect(`${config.appUrl}?error=no_code`);
  }

  // Read and verify PKCE state from cookie
  const cookieStore = await cookies();
  const pkceCookie = cookieStore.get('tg_pkce')?.value;

  if (!pkceCookie) {
    return NextResponse.redirect(`${config.appUrl}?error=auth_failed&details=missing_pkce_state`);
  }

  let pkceData: { codeVerifier: string; state: string };
  try {
    pkceData = JSON.parse(pkceCookie);
  } catch {
    return NextResponse.redirect(`${config.appUrl}?error=auth_failed&details=invalid_pkce_state`);
  }

  // Verify state to prevent CSRF
  if (state !== pkceData.state) {
    return NextResponse.redirect(`${config.appUrl}?error=auth_failed&details=state_mismatch`);
  }

  try {
    // Exchange authorization code for tokens
    const redirectUri = `${config.appUrl}/api/auth/telegram/callback`;
    const { botId, botToken } = config.telegram;

    const tokenParams = new URLSearchParams();
    tokenParams.append('grant_type', 'authorization_code');
    tokenParams.append('code', code);
    tokenParams.append('code_verifier', pkceData.codeVerifier);
    tokenParams.append('client_id', botId);
    tokenParams.append('redirect_uri', redirectUri);

    const tokenRes = await fetch('https://oauth.telegram.org/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${botId}:${botToken}`).toString('base64')}`,
      },
      body: tokenParams.toString(),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error('Telegram token exchange failed:', errBody);
      return NextResponse.redirect(`${config.appUrl}?error=auth_failed&details=token_exchange`);
    }

    const tokenData = await tokenRes.json();
    const idToken = tokenData.id_token;

    if (!idToken) {
      return NextResponse.redirect(`${config.appUrl}?error=auth_failed&details=no_id_token`);
    }

    // Verify the id_token JWT against Telegram's JWKS
    const tgUser = await verifyTelegramIdToken(idToken);
    if (!tgUser) {
      return NextResponse.redirect(`${config.appUrl}?error=auth_failed&details=invalid_id_token`);
    }

    const telegramId = tgUser.sub;

    // Find or create user
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegramId)
      .single();

    let user;

    if (!existingUser) {
      const { data: newUser } = await supabase
        .from('users')
        .insert({
          telegram_id: telegramId,
          display_name: [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || `tg_${telegramId}`,
          avatar_url: tgUser.photo_url || null,
          login_method: 'telegram',
          role: 'reader',
        })
        .select()
        .single();
      user = camelizeKeys<{ id: number; role: string }>(newUser);
    } else {
      // Update last login and profile info
      const { data: updatedUser } = await supabase
        .from('users')
        .update({
          last_login_at: new Date().toISOString(),
          avatar_url: tgUser.photo_url || existingUser.avatar_url,
          display_name: existingUser.display_name || [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' '),
        })
        .eq('id', existingUser.id)
        .select()
        .single();
      user = camelizeKeys<{ id: number; role: string }>(updatedUser);
    }

    // Create session (JWT access token + refresh token)
    const session = await createSession(user.id, user.role);

    // Clear PKCE cookie and set access token cookie
    const response = NextResponse.redirect(`${config.appUrl}`);

    response.cookies.set('access_token', session.accessToken, {
      httpOnly: true,
      secure: config.isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    response.cookies.set('refresh_token', session.refreshToken, {
      httpOnly: true,
      secure: config.isProd,
      sameSite: 'lax',
      path: '/api/auth',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    response.cookies.delete('tg_pkce');

    return response;
  } catch (err) {
    console.error('Telegram auth error:', err);
    return NextResponse.redirect(`${config.appUrl}?error=auth_failed`);
  }
}
