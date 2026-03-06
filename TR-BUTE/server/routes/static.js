/**
 * Static Page Routes
 *
 * Serves HTML pages. The /product/:slug route does server-side meta injection
 * for SEO: фирменный products get title/description/OG tags; all others get noindex.
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { withCache } = require('../../lib/cache');

const PRODUCT_HTML_PATH = path.join(__dirname, '../../public/pages/product.html');
const SITE_URL = 'https://buy-tribute.com';

// Cache the product page HTML so we only read disk once
let productHtmlCache = null;
function getProductHtml() {
  if (!productHtmlCache) {
    productHtmlCache = fs.readFileSync(PRODUCT_HTML_PATH, 'utf8');
  }
  return productHtmlCache;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

module.exports = function createStaticRouter({ pool, config }) {
  const router = express.Router();
  const siteUrl = (config && config.appUrl) || SITE_URL;

  // ============ SITEMAP ============
  router.get('/sitemap.xml', async (req, res) => {
    try {
      const xml = await withCache('sitemap', 3600, async () => {
        return await generateSitemap(pool, siteUrl);
      });
      res.set('Content-Type', 'application/xml; charset=utf-8');
      res.set('Cache-Control', 'public, max-age=3600');
      res.send(xml);
    } catch (err) {
      console.error('sitemap.xml error:', err);
      res.status(500).send('Error generating sitemap');
    }
  });
  async function generateSitemap(pool, siteUrl) {      
      const result = await pool.query(
        `SELECT slug, updated_at
         FROM products
         WHERE type = 'фирменный'
           AND slug IS NOT NULL
           AND slug != ''
           AND status != 'archive'
         ORDER BY sort_order ASC, created_at DESC`
      );

      const staticPages = [
        { url: '/', priority: '1.0', changefreq: 'weekly' },
        { url: '/catalog', priority: '0.9', changefreq: 'daily' },
        { url: '/customers', priority: '0.7', changefreq: 'weekly' },
        { url: '/picker', priority: '0.6', changefreq: 'monthly' },
        { url: '/info', priority: '0.5', changefreq: 'monthly' },
        { url: '/faq', priority: '0.5', changefreq: 'monthly' },
      ];

      const today = new Date().toISOString().split('T')[0];

      let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
      xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

      for (const page of staticPages) {
        xml += `  <url>\n`;
        xml += `    <loc>${siteUrl}${page.url}</loc>\n`;
        xml += `    <lastmod>${today}</lastmod>\n`;
        xml += `    <changefreq>${page.changefreq}</changefreq>\n`;
        xml += `    <priority>${page.priority}</priority>\n`;
        xml += `  </url>\n`;
      }

      for (const row of result.rows) {
        const lastmod = row.updated_at
          ? new Date(row.updated_at).toISOString().split('T')[0]
          : today;
        xml += `  <url>\n`;
        xml += `    <loc>${siteUrl}/product/${encodeURIComponent(row.slug)}</loc>\n`;
        xml += `    <lastmod>${lastmod}</lastmod>\n`;
        xml += `    <changefreq>monthly</changefreq>\n`;
        xml += `    <priority>0.8</priority>\n`;
        xml += `  </url>\n`;
      }

      xml += '</urlset>';

      return xml;
  }

  // ============ PRODUCT PAGE (with SSR meta injection) ============
  router.get('/product/:slug', async (req, res) => {
    const { slug } = req.params;

    try {
      const result = await pool.query(
        `SELECT p.slug, p.type, p.alt, p.title, p.description, pi.url AS image
         FROM products p
         LEFT JOIN LATERAL (
           SELECT url FROM product_images WHERE product_id = p.id ORDER BY sort_order ASC LIMIT 1
         ) pi ON true
         WHERE p.slug = $1
         LIMIT 1`,
        [slug]
      );

      let html = getProductHtml();
      const product = result.rows[0];

      if (product && product.type === 'фирменный') {
        const altText = product.alt || product.title || slug;
        const pageTitle = `${escapeHtml(altText)} — TR/BUTE постер`;
        const description = escapeHtml(product.description || '');
        const canonical = `${siteUrl}/product/${encodeURIComponent(product.slug)}`;
        const ogImage = product.image || '';

        // Replace the static title tag
        html = html.replace(
          '<title>Постер • TR/BUTE</title>',
          `<title>${pageTitle}</title>`
        );

        // Remove the template noindex meta (this is a real, indexable product page)
        html = html.replace(
          '\n  <meta name="robots" content="noindex, nofollow" id="robots-meta">',
          ''
        );

        // Fill in the empty OG meta tags already present in the HTML
        html = html.replace(
          'content="" id="og-title"',
          `content="${pageTitle}" id="og-title"`
        );
        html = html.replace(
          'content="" id="og-description"',
          `content="${description}" id="og-description"`
        );
        html = html.replace(
          'content="" id="og-image"',
          `content="${escapeHtml(ogImage)}" id="og-image"`
        );
        html = html.replace(
          'content="" id="og-url"',
          `content="${canonical}" id="og-url"`
        );

        // Inject description and canonical before </head>
        const seoTags = [
          `  <meta name="description" content="${description}">`,
          `  <link rel="canonical" href="${canonical}">`,
          `  <meta property="og:type" content="product">`,
        ].join('\n');
        html = html.replace('</head>', `${seoTags}\n</head>`);
      }
      // оригинал or unknown slug keeps the template noindex already in product.html

      res.set('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (err) {
      console.error('Product SSR error:', err);
      // Fall back to plain file serve on DB error
      res.sendFile(PRODUCT_HTML_PATH);
    }
  });

  // ============ STATIC PAGE ROUTES ============
  router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public', 'index.html'));
  });

  router.get('/product', (req, res) => {
    res.sendFile(PRODUCT_HTML_PATH);
  });

  router.get('/ar-view', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public', 'pages', 'ar-view.html'));
  });

  router.get('/faq', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public', 'pages', 'faq.html'));
  });

  router.get('/info', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public', 'pages', 'info.html'));
  });

  router.get('/legal', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public', 'pages', 'legal.html'));
  });

  router.get('/catalog', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public', 'pages', 'catalog.html'));
  });

  router.get('/favorites', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public', 'pages', 'favorites.html'));
  });

  router.get('/picker', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public', 'pages', 'picker.html'));
  });

  router.get('/cart', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public', 'pages', 'cart.html'));
  });

  router.get('/checkout', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public', 'pages', 'checkout.html'));
  });

  router.get('/order', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public', 'pages', 'order.html'));
  });

  router.get('/profile', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public', 'pages', 'profile.html'));
  });

  router.get('/customers', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public', 'pages', 'customers.html'));
  });

  router.get('/certificate', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public', 'pages', 'certificate.html'));
  });

  return router;
};
