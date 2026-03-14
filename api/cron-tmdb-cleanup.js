/**
 * GET /api/cron/tmdb-cleanup
 * Deletes expired TMDB cache entries.
 */
function cleanup({ pool }) {
  return async (req, res) => {
    const { rowCount } = await pool.query(
      'DELETE FROM tmdb_cache WHERE expires_at < NOW()'
    );
    res.json({ message: 'TMDB cache cleanup complete', deleted: rowCount });
  };
}

module.exports = { cleanup };
