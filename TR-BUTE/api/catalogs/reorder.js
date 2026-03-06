/**
 * Catalog Reorder API
 * Updates the sort order of catalogs
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
    const { catalog_ids } = req.body;

    if (!Array.isArray(catalog_ids) || catalog_ids.length === 0) {
      return res.status(400).json({ error: 'catalog_ids array is required' });
    }

    // Update sort_order for each catalog
    const updates = catalog_ids.map((id, index) => ({
      id,
      sort_order: index
    }));

    // Use batch update
    for (const update of updates) {
      const { error } = await supabase
        .from('catalogs')
        .update({ sort_order: update.sort_order })
        .eq('id', update.id);

      if (error) {
        console.error(`Error updating catalog ${update.id}:`, error);
      }
    }

    res.json({
      success: true,
      message: `Updated sort order for ${catalog_ids.length} catalogs`
    });
  } catch (error) {
    console.error('Error in catalog reorder:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
