import { NextResponse } from 'next/server';
import { config } from '@/lib/config';

export async function GET() {
  const { clientId } = config.yandexOAuth;

  if (!clientId) {
    return NextResponse.json({ error: 'Yandex OAuth not configured' }, { status: 500 });
  }

  const redirectUri = `${config.appUrl}/api/auth/yandex/callback`;
  const url = new URL('https://oauth.yandex.ru/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);

  return NextResponse.redirect(url.toString());
}
