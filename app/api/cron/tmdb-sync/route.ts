import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { syncTmdbEntity } from '@/lib/tmdb';

/**
 * TMDB Batch Sync Cron
 * Re-syncs TMDB entities that haven't been updated in 7+ days.
 * Also cleans expired cache entries.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const staleEntities = await prisma.tmdbEntity.findMany({
    where: {
      lastSyncedAt: { lt: sevenDaysAgo },
    },
    select: {
      tmdbId: true,
      entityType: true,
    },
    take: 50,
  });

  let synced = 0;
  let failed = 0;

  for (const entity of staleEntities) {
    try {
      const type = entity.entityType as 'movie' | 'tv' | 'person';
      await syncTmdbEntity(type, entity.tmdbId);
      synced++;
    } catch {
      failed++;
    }
  }

  // Clean expired cache entries
  const deleted = await prisma.tmdbCache.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });

  return NextResponse.json({
    message: 'TMDB sync complete',
    stale: staleEntities.length,
    synced,
    failed,
    cacheCleared: deleted.count,
  });
}
