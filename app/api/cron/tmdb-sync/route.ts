import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
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

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: staleEntities } = await supabase
    .from('tmdb_entities')
    .select('tmdb_id, entity_type')
    .lt('last_synced_at', sevenDaysAgo)
    .limit(50);

  let synced = 0;
  let failed = 0;

  for (const entity of staleEntities || []) {
    try {
      const type = entity.entity_type as 'movie' | 'tv' | 'person';
      await syncTmdbEntity(type, entity.tmdb_id);
      synced++;
    } catch {
      failed++;
    }
  }

  // Clean expired cache entries
  const { count } = await supabase
    .from('tmdb_cache')
    .delete()
    .lt('expires_at', new Date().toISOString())
    .select('*', { count: 'exact', head: true });

  return NextResponse.json({
    message: 'TMDB sync complete',
    stale: (staleEntities || []).length,
    synced,
    failed,
    cacheCleared: count || 0,
  });
}
