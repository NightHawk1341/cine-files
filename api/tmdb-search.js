const { searchTmdb } = require('../server/services/tmdb');

/**
 * GET /api/tmdb/search?q=query
 * Searches TMDB via the proxy (cached).
 */
function search() {
  return async (req, res) => {
    try {
      const query = req.query.q;

      if (!query || query.length < 2) {
        return res.status(400).json({ error: 'Query must be at least 2 characters' });
      }

      const results = await searchTmdb(query);

      const items = results.slice(0, 20).map((r) => ({
        tmdbId: r.id,
        mediaType: r.media_type,
        title: r.title || r.name || '',
        originalTitle: r.original_title || r.original_name || '',
        overview: r.overview?.slice(0, 200) || '',
        releaseDate: r.release_date || r.first_air_date || null,
        department: r.known_for_department || null,
      }));

      res.json({ results: items });
    } catch (err) {
      console.error('TMDB search error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

module.exports = { search };
