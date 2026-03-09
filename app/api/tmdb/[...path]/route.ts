import { NextResponse } from 'next/server';
import { config } from '@/lib/config';

export const dynamic = 'force-dynamic';

/**
 * TMDB Proxy — forwards requests to TMDB API.
 * Deployed on Vercel to bypass geo-restrictions.
 * Protected by X-Proxy-Secret header.
 */

interface RouteParams {
  params: Promise<{ path: string[] }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const secret = request.headers.get('X-Proxy-Secret');
  if (!config.tmdb.proxySecret || secret !== config.tmdb.proxySecret) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { path } = await params;
  const tmdbPath = path.join('/');
  const { searchParams } = new URL(request.url);

  // Forward all query params to TMDB
  const tmdbUrl = new URL(`https://api.themoviedb.org/3/${tmdbPath}`);
  searchParams.forEach((value, key) => {
    tmdbUrl.searchParams.set(key, value);
  });

  const apiKey = config.tmdb.apiKey;
  if (!apiKey) {
    return NextResponse.json({ error: 'TMDB API key not configured' }, { status: 500 });
  }

  try {
    const res = await fetch(tmdbUrl.toString(), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await res.json();

    return NextResponse.json(data, {
      status: res.status,
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch {
    return NextResponse.json({ error: 'TMDB request failed' }, { status: 502 });
  }
}
