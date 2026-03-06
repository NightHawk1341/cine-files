/**
 * Catalog Update API
 * Updates catalog product list
 */

const { createClient } = require('@supabase/supabase-js');
const { cacheDelete } = require('../../lib/cache');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { catalog_id, product_ids, title, description, cover_image, slug, genre } = req.body;

    if (!catalog_id) {
      return res.status(400).json({ error: 'Catalog ID is required' });
    }

    // Build update object
    const updates = {};

    if (product_ids !== undefined) {
      // Convert array to comma-separated string
      updates.product_ids = Array.isArray(product_ids)
        ? product_ids.join(',')
        : product_ids;
    }

    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (cover_image !== undefined) updates.cover_image = cover_image;
    if (slug !== undefined) updates.slug = slug;
    if (genre !== undefined) updates.genre = genre;
    if (req.body.sort_order !== undefined) updates.sort_order = req.body.sort_order;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const { data, error } = await supabase
      .from('catalogs')
      .update(updates)
      .eq('id', catalog_id)
      .select()
      .single();

    if (error) {
      console.error('Error updating catalog:', error);
      return res.status(500).json({ error: 'Failed to update catalog' });
    }

    // If product_ids were updated, also update the catalog_ids on the affected products
    if (product_ids !== undefined) {
      const productIdArray = Array.isArray(product_ids)
        ? product_ids
        : product_ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));

      // Update catalog_ids for products that should be in this catalog
      for (const productId of productIdArray) {
        // Get current catalog_ids for this product
        const { data: product } = await supabase
          .from('products')
          .select('catalog_ids')
          .eq('id', productId)
          .single();

        if (product) {
          const currentCatalogIds = product.catalog_ids || [];
          if (!currentCatalogIds.includes(catalog_id)) {
            await supabase
              .from('products')
              .update({ catalog_ids: [...currentCatalogIds, catalog_id] })
              .eq('id', productId);
          }
        }
      }
    }
    
    cacheDelete('catalogs:*').catch(() => {});
    cacheDelete('products:*').catch(() => {});
    
    res.json({
      success: true,
      catalog: data
    });
  } catch (error) {
    console.error('Error in catalog update:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
