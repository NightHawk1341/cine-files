const { config } = require('../lib/config');

/**
 * GET /api/tmdb/*
 * Proxies requests to TMDB API. Deployed on Vercel (US) to bypass geo-restrictions.
 */
function proxy() {
  return async (req, res) => {
    const secret = req.headers['x-proxy-secret'];
    if (!config.tmdb.proxySecret || secret !== config.tmdb.proxySecret) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Extract the TMDB path from the URL (everything after /api/tmdb/)
    const tmdbPath = req.params[0] || req.path.replace(/^\/api\/tmdb\//, '');

    const apiKey = config.tmdb.apiKey;
    if (!apiKey) {
      return res.status(500).json({ error: 'TMDB API key not configured' });
    }

    const tmdbUrl = new URL(`https://api.themoviedb.org/3/${tmdbPath}`);
    // Forward query params
    for (const [key, value] of Object.entries(req.query)) {
      tmdbUrl.searchParams.set(key, value);
    }

    try {
      const tmdbRes = await fetch(tmdbUrl.toString(), {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await tmdbRes.json();

      res.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
      res.status(tmdbRes.status).json(data);
    } catch {
      res.status(502).json({ error: 'TMDB request failed' });
    }
  };
}

module.exports = { proxy };
