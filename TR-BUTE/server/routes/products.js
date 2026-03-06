/**
 * Product Routes
 *
 * Handles product listing, details, catalog management, and product images
 */

const express = require('express');
const { withCache } = require('../../lib/cache');

/**
 * Creates product router with required dependencies
 *
 * @param {Object} deps - Dependencies
 * @param {Object} deps.pool - PostgreSQL connection pool
 * @param {Function} deps.requireAdminAuth - Admin authentication middleware (optional for backward compat)
 * @returns {express.Router} Configured Express router
 */
module.exports = function createProductRouter(deps) {
  const { pool, requireAdminAuth } = deps;
  const router = express.Router();

  // Load external handlers for product management
  const createProductHandler = require('../../api/products/create');
  const updateProductHandler = require('../../api/products/update');
  const reorderProductHandler = require('../../api/products/reorder');
  const setSortSectionHandler = require('../../api/products/set-sort-section');
  const getProductImagesHandler = require('../../api/products/images/get');
  const addProductImageHandler = require('../../api/products/images/add');
  const updateProductImageHandler = require('../../api/products/images/update');
  const deleteProductImageHandler = require('../../api/products/images/delete');
  const reorderProductImagesHandler = require('../../api/products/images/reorder');
  const batchReorderProductImagesHandler = require('../../api/products/images/batch-reorder');
  const addImageRefHandler = require('../../api/products/image-refs/add');
  const deleteImageRefHandler = require('../../api/products/image-refs/delete');
  const productLinksHandler = require('../../api/products/links');
  const productLinksReorderHandler = require('../../api/products/links-reorder');
  const productTypeLinksHandler = require('../../api/products/type-links');

  // ============ PRODUCT MANAGEMENT (Admin Only) ============

  // Create product - requires admin auth
  if (requireAdminAuth) {
    router.post('/create', requireAdminAuth, createProductHandler);
    router.post('/update', requireAdminAuth, updateProductHandler);
    router.post('/reorder', requireAdminAuth, reorderProductHandler);
    router.post('/set-sort-section', requireAdminAuth, setSortSectionHandler);
  } else {
    console.warn('[products] WARNING: Product mutation routes mounted without admin auth middleware');
    router.post('/create', createProductHandler);
    router.post('/update', updateProductHandler);
    router.post('/reorder', reorderProductHandler);
    router.post('/set-sort-section', setSortSectionHandler);
  }

  // ============ PRODUCT IMAGES MANAGEMENT (Admin Only) ============

  // Get product images (public - read-only)
  router.get('/images/get', getProductImagesHandler);

  // Image modification requires admin auth
  if (requireAdminAuth) {
    router.post('/images/add', requireAdminAuth, addProductImageHandler);
    router.post('/images/update', requireAdminAuth, updateProductImageHandler);
    router.post('/images/delete', requireAdminAuth, deleteProductImageHandler);
    router.post('/images/reorder', requireAdminAuth, reorderProductImagesHandler);
    router.post('/images/batch-reorder', requireAdminAuth, batchReorderProductImagesHandler);
    router.post('/image-refs/add', requireAdminAuth, addImageRefHandler);
    router.post('/image-refs/delete', requireAdminAuth, deleteImageRefHandler);
  } else {
    console.warn('[products] WARNING: Image mutation routes mounted without admin auth middleware');
    router.post('/images/add', addProductImageHandler);
    router.post('/images/update', updateProductImageHandler);
    router.post('/images/delete', deleteProductImageHandler);
    router.post('/images/reorder', reorderProductImagesHandler);
    router.post('/images/batch-reorder', batchReorderProductImagesHandler);
    router.post('/image-refs/add', addImageRefHandler);
    router.post('/image-refs/delete', deleteImageRefHandler);
  }

  // ============ PRODUCT LINKS (Variants) ============
  // GET and POST for linked products - must come before /:idOrSlug catch-all
  router.get('/links', productLinksHandler);
  if (requireAdminAuth) {
    router.post('/links', requireAdminAuth, productLinksHandler);
    router.post('/links/reorder', requireAdminAuth, productLinksReorderHandler);
  } else {
    router.post('/links', productLinksHandler);
    router.post('/links/reorder', productLinksReorderHandler);
  }

  // ============ PRODUCT TYPE LINKS (фирменный <-> оригинальный) ============
  // GET and POST for type-linked products - must come before /:idOrSlug catch-all
  router.get('/type-links', productTypeLinksHandler);
  if (requireAdminAuth) {
    router.post('/type-links', requireAdminAuth, productTypeLinksHandler);
  } else {
    router.post('/type-links', productTypeLinksHandler);
  }

  // ============ PRODUCT LISTING & DETAILS ============

  // Get all products (minimal data for admin)
  router.get('/', async (req, res) => {
    try {
      const query = 'SELECT id, title, type, discount, triptych, price, old_price, status, slug, author, is_manual_sort, editing, restored FROM products ORDER BY id';
      const result = await pool.query(query);
      res.json(result.rows);
    } catch (err) {
      console.error('Error fetching products:', err);
      res.status(500).json({ error: 'Failed to fetch products' });
    }
  });

  // Get single product details (by ID or slug)
  router.get('/:idOrSlug', async (req, res) => {
    const param = req.params.idOrSlug;
    try {
      // Check if param is numeric (ID) or string (slug)
      const isNumeric = /^\d+$/.test(param);
      const productQuery = isNumeric
        ? 'SELECT id, title, description, discount, triptych, slug, author, status, genre, type, alt, editing, restored, vk_market_url FROM products WHERE id = $1'
        : 'SELECT id, title, description, discount, triptych, slug, author, status, genre, type, alt, editing, restored, vk_market_url FROM products WHERE slug = $1';

      const productResult = await pool.query(productQuery, [isNumeric ? parseInt(param) : param]);

      if (productResult.rows.length === 0) {
        return res.status(404).json({ error: 'Товар не найден' });
      }

      const product = productResult.rows[0];

      const imagesQuery = 'SELECT url FROM product_images WHERE product_id = $1 ORDER BY sort_order NULLS LAST, id';
      const imagesResult = await pool.query(imagesQuery, [product.id]);

      product.images = imagesResult.rows.map(row => row.url);
      res.json(product);
    } catch (err) {
      console.error('Ошибка получения товара:', err);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  });

  return router;
};

/**
 * Additional product-related routes that need different mounting
 * These are exported separately because they use different base paths
 */

/**
 * Get all products with their first image (public listing)
 * Mounted at /products (not /api/products)
 */
module.exports.publicProductList = function(deps) {
  const { pool } = deps;

  return async (req, res) => {
    try {
      // Check if request is for all products (admin) or just available (public)
      const showAll = req.query.all === 'true';
      const cacheKey = showAll ? 'products:all' : 'products:public';
      const rows = await withCache(cacheKey, 300, async () => {
        // Filter clause - public view excludes products not meant for direct browsing
        const whereClause = showAll ? '' : "WHERE p.status NOT IN ('available_via_var', 'not_for_sale')";
        const query = `
          SELECT
            p.id,
            p.title,
            p.slug,
            p.description,
            p.price,
            p.old_price,
            p.discount,
            p.genre,
            p.type,
            p.key_word as keywords,
            p.ip_names,
            p.alt,
            p.triptych,
            p.sort_order,
            p.is_manual_sort,
            p.created_at,
            p.release_date,
            p.development_time,
            p.hide_development_time,
            p.catalog_ids,
            p.status,
            p.author,
            p.editing,
            p.restored,
            p.vk_market_url,
            pi.url AS image
          FROM products p
          LEFT JOIN LATERAL (
            SELECT url FROM product_images
            WHERE product_id = p.id
            ORDER BY sort_order NULLS LAST, id ASC
            LIMIT 1
          ) pi ON true
          ${whereClause}
          ORDER BY p.sort_order ASC, p.created_at DESC
        `;
        const result = await pool.query(query);
        return result.rows;
      });
      res.json(rows);
    } catch (error) {
      console.error('Ошибка SQL:', error);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  };
};

/**
 * Get product images by product ID
 * Mounted at /products/:id/images
 */
module.exports.getProductImages = function(deps) {
  const { pool } = deps;

  return async (req, res) => {
    const productId = req.params.id;
    try {
      const query = 'SELECT id, url, extra, sort_order FROM product_images WHERE product_id = $1 ORDER BY sort_order NULLS LAST, id';
      const result = await pool.query(query, [productId]);
      res.json(result.rows || []);
    } catch (err) {
      console.error('Ошибка получения изображений:', err);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  };
};

/**
 * Get product images from secondary table
 * Mounted at /products/:id/images-2
 */
module.exports.getProductImages2 = function(deps) {
  const { pool } = deps;

  return async (req, res) => {
    const productId = req.params.id;
    try {
      const query = 'SELECT id, url, extra, deprecated, sort_order FROM product_images_2 WHERE product_id = $1 ORDER BY sort_order NULLS LAST, id';
      const result = await pool.query(query, [productId]);
      res.json(result.rows || []);
    } catch (err) {
      console.error('Ошибка получения изображений:', err);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  };
};

/**
 * Get all product images
 * Mounted at /api/all-images
 */
module.exports.getAllImages = function(deps) {
  const { pool } = deps;

  return async (req, res) => {
    try {
      const query = 'SELECT id, product_id, url, extra, sort_order, hidden, hidden_product FROM product_images ORDER BY product_id, sort_order NULLS LAST, id';
      const result = await pool.query(query);
      res.json(result.rows || []);
    } catch (err) {
      console.error('[all-images] Error:', err.message);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  };
};

/**
 * Get all product images from secondary table
 * Mounted at /api/all-images-2
 */
module.exports.getAllImages2 = function(deps) {
  const { pool } = deps;

  return async (req, res) => {
    try {
      const query = 'SELECT id, product_id, url, extra, deprecated, sort_order FROM product_images_2 ORDER BY product_id, sort_order NULLS LAST, id';
      const result = await pool.query(query);
      res.json(result.rows || []);
    } catch (err) {
      console.error('Ошибка получения изображений:', err);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  };
};

/**
 * Get all subcategories/catalogs
 * Mounted at /api/catalogs
 */
module.exports.getCatalogs = function(deps) {
  const { pool } = deps;

  return async (req, res) => {
    try {
      const rows = await withCache('catalogs:list', 600, async () => {
        const query = `
          SELECT id, title, slug, sort_order, genre, product_ids, description, created_at
          FROM catalogs
          ORDER BY sort_order ASC NULLS LAST, created_at DESC
        `;
        const result = await pool.query(query);
        return result.rows;
      });
      res.json(rows);
    } catch (err) {
      console.error('Ошибка subcategories:', err);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  };
};

/**
 * Get catalog with products (by ID or slug)
 * Mounted at /api/catalog/:idOrSlug
 */
module.exports.getCatalogDetails = function(deps) {
  const { pool } = deps;

  return async (req, res) => {
    const param = req.params.idOrSlug;
    try {
      // Check if param is numeric (ID) or string (slug)
      const isNumeric = /^\d+$/.test(param);
      const catalogQuery = isNumeric
        ? 'SELECT * FROM catalogs WHERE id = $1'
        : 'SELECT * FROM catalogs WHERE slug = $1';

      const catalogResult = await pool.query(catalogQuery, [isNumeric ? parseInt(param) : param]);

      if (catalogResult.rows.length === 0) {
        return res.status(404).json({ error: 'Каталог не найден' });
      }

      const catalog = catalogResult.rows[0];

      const productIds = catalog.product_ids
        .split(',')
        .map(id => parseInt(id.trim()))
        .filter(id => !isNaN(id));

      // Always include product ID 1 (special product) in every catalog if not already included
      const CUSTOM_PRODUCT_ID = 1;
      if (!productIds.includes(CUSTOM_PRODUCT_ID)) {
        productIds.unshift(CUSTOM_PRODUCT_ID);
      }

      if (productIds.length === 0) {
        return res.json({ catalog, products: [] });
      }

      const placeholders = productIds.map((_, i) => `$${i + 1}`).join(',');
      const productsQuery = `
        SELECT p.id, p.title, p.description, p.price, p.old_price, p.discount,
               p.triptych, p.sort_order, p.created_at, p.release_date, p.genre, p.type, p.slug
        FROM products p
        WHERE p.id IN (${placeholders})
        ORDER BY
          CASE WHEN p.id = ${CUSTOM_PRODUCT_ID} THEN 0 ELSE 1 END,
          p.sort_order ASC, p.created_at DESC
      `;

      const productsResult = await pool.query(productsQuery, productIds);
      const products = productsResult.rows;

      // Batch-fetch first image for all products in a single query
      if (products.length > 0) {
        const pIds = products.map(p => p.id);
        const imagesResult = await pool.query(`
          SELECT DISTINCT ON (product_id) product_id, url
          FROM product_images
          WHERE product_id = ANY($1::int[])
          ORDER BY product_id, sort_order NULLS LAST, id
        `, [pIds]);

        const imageMap = {};
        for (const row of imagesResult.rows) {
          imageMap[row.product_id] = [row.url];
        }
        for (const product of products) {
          product.images = imageMap[product.id] || [];
        }
      }

      res.json({ catalog, products });
    } catch (err) {
      console.error('Ошибка получения каталога:', err);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  };
};

/**
 * Get product prices
 * Mounted at /api/product-prices
 */
module.exports.getProductPrices = function(deps) {
  const { pool } = deps;

  return async (req, res) => {
    try {
      const query = 'SELECT id, format, frame_type, discount_price, base_price FROM product_prices ORDER BY id';
      const result = await pool.query(query);
      res.json(result.rows || []);
    } catch (err) {
      console.error('[product-prices] Error:', err.message);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  };
};
