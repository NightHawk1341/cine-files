const { fetchTributeProducts } = require('../lib/tribute-api');

/**
 * GET /api/tribute/products?ids=1,2,3
 * Proxies product data from TR-BUTE for article content blocks.
 */
function list() {
  return async (req, res) => {
    const idsParam = req.query.ids;
    if (!idsParam) {
      return res.status(400).json({ error: 'ids parameter required' });
    }

    const ids = idsParam.split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(n => !isNaN(n));

    if (ids.length === 0) {
      return res.json({ products: [] });
    }

    if (ids.length > 20) {
      return res.status(400).json({ error: 'Maximum 20 product IDs' });
    }

    try {
      const products = await fetchTributeProducts(ids);
      res.json({ products });
    } catch {
      res.json({ products: [] });
    }
  };
}

module.exports = { list };
