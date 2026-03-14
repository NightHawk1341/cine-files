/**
 * GET /api/cron/token-cleanup
 * Deletes expired auth tokens.
 */
function cleanup({ pool }) {
  return async (req, res) => {
    const { rowCount } = await pool.query(
      'DELETE FROM auth_tokens WHERE expires_at < NOW()'
    );
    res.json({ message: 'Token cleanup complete', deleted: rowCount });
  };
}

module.exports = { cleanup };
