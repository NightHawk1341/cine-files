/**
 * Catalog Create API
 * Creates a new catalog
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
    const { title, genre, description, cover_image, slug } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    if (!genre) {
      return res.status(400).json({ error: 'Genre is required' });
    }

    // Get max sort_order to place new catalog at the end
    const { data: maxOrderData } = await supabase
      .from('catalogs')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1);

    const nextSortOrder = (maxOrderData?.[0]?.sort_order ?? -1) + 1;

    // Generate slug from title if not provided
    const catalogSlug = slug || title
      .toLowerCase()
      .replace(/[^a-zа-яё0-9\s-]/gi, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();

    // Create the catalog
    const { data, error } = await supabase
      .from('catalogs')
      .insert({
        title,
        genre,
        description: description || null,
        cover_image: cover_image || null,
        slug: catalogSlug,
        product_ids: '',
        sort_order: nextSortOrder
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating catalog:', error);
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Catalog with this slug already exists' });
      }
      return res.status(500).json({ error: 'Failed to create catalog' });
    }

    res.json({
      success: true,
      catalog: data
    });
  } catch (error) {
    console.error('Error in catalog create:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
