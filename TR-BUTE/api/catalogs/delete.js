/**
 * Catalog Delete API
 * Deletes a catalog (does not delete associated products)
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = async (req, res) => {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const catalog_id = req.body?.catalog_id || req.query?.catalog_id;

    if (!catalog_id) {
      return res.status(400).json({ error: 'Catalog ID is required' });
    }

    // First, remove this catalog from any products' catalog_ids
    const { data: products } = await supabase
      .from('products')
      .select('id, catalog_ids')
      .contains('catalog_ids', [parseInt(catalog_id)]);

    if (products && products.length > 0) {
      for (const product of products) {
        const newCatalogIds = (product.catalog_ids || []).filter(id => id !== parseInt(catalog_id));
        await supabase
          .from('products')
          .update({ catalog_ids: newCatalogIds })
          .eq('id', product.id);
      }
    }

    // Delete the catalog
    const { error } = await supabase
      .from('catalogs')
      .delete()
      .eq('id', catalog_id);

    if (error) {
      console.error('Error deleting catalog:', error);
      return res.status(500).json({ error: 'Failed to delete catalog' });
    }

    res.json({
      success: true,
      message: 'Catalog deleted successfully'
    });
  } catch (error) {
    console.error('Error in catalog delete:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
