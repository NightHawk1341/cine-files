/**
 * Add Product to Catalog API
 * Adds a single product to a catalog
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { catalog_id, product_id } = req.body;

    if (!catalog_id || !product_id) {
      return res.status(400).json({ error: 'Catalog ID and Product ID are required' });
    }

    // Get current catalog
    const { data: catalog, error: fetchError } = await supabase
      .from('catalogs')
      .select('product_ids')
      .eq('id', catalog_id)
      .single();

    if (fetchError || !catalog) {
      return res.status(404).json({ error: 'Catalog not found' });
    }

    // Parse current product_ids
    const currentIds = catalog.product_ids
      ? catalog.product_ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))
      : [];

    // Check if product already in catalog
    if (currentIds.includes(product_id)) {
      return res.json({ success: true, message: 'Product already in catalog' });
    }

    // Add product to catalog
    currentIds.push(product_id);
    const newProductIds = currentIds.join(',');

    const { error: updateError } = await supabase
      .from('catalogs')
      .update({ product_ids: newProductIds })
      .eq('id', catalog_id);

    if (updateError) {
      console.error('Error updating catalog:', updateError);
      return res.status(500).json({ error: 'Failed to update catalog' });
    }

    // Also update the product's catalog_ids
    const { data: product } = await supabase
      .from('products')
      .select('catalog_ids')
      .eq('id', product_id)
      .single();

    if (product) {
      const productCatalogIds = product.catalog_ids || [];
      if (!productCatalogIds.includes(catalog_id)) {
        await supabase
          .from('products')
          .update({ catalog_ids: [...productCatalogIds, catalog_id] })
          .eq('id', product_id);
      }
    }

    res.json({
      success: true,
      message: 'Product added to catalog'
    });
  } catch (error) {
    console.error('Error adding product to catalog:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
