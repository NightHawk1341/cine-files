import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  // Verify cron secret (Vercel cron jobs send this header)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // TODO: Implement TMDB trending sync in Phase 3
  return NextResponse.json({ message: 'TMDB sync placeholder', synced: 0 });
}
