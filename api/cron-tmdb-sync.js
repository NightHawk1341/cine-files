const { syncTmdbEntity } = require('../server/services/tmdb');

/**
 * GET /api/cron/tmdb-sync
 * Re-syncs stale TMDB entities and cleans expired cache.
 */
function sync({ pool }) {
  return async (req, res) => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const { rows: staleEntities } = await pool.query(
      `SELECT tmdb_id, entity_type FROM tmdb_entities
       WHERE last_synced_at < $1
       LIMIT 50`,
      [sevenDaysAgo]
    );

    let synced = 0;
    let failed = 0;

    for (const entity of staleEntities) {
      try {
        await syncTmdbEntity(entity.entity_type, entity.tmdb_id);
        synced++;
      } catch {
        failed++;
      }
    }

    // Clean expired cache
    const { rowCount } = await pool.query(
      'DELETE FROM tmdb_cache WHERE expires_at < NOW()'
    );

    res.json({
      message: 'TMDB sync complete',
      stale: staleEntities.length,
      synced,
      failed,
      cacheCleared: rowCount,
    });
  };
}

module.exports = { sync };
