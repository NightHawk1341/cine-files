import { MetadataRoute } from 'next';
import { supabase, camelizeKeys } from '@/lib/db';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.APP_URL || 'https://cinefiles.ru';

  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${baseUrl}/tags`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
    { url: `${baseUrl}/collections`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
    { url: `${baseUrl}/search`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
  ];

  try {
    const { data: categoriesData } = await supabase.from('categories').select('slug');
    const categoryPages: MetadataRoute.Sitemap = (categoriesData || []).map((cat) => ({
      url: `${baseUrl}/${cat.slug}`,
      changeFrequency: 'daily',
      priority: 0.9,
    }));

    const { data: articlesData } = await supabase
      .from('articles')
      .select('slug, updated_at, published_at, category:categories(slug)')
      .eq('status', 'published')
      .order('published_at', { ascending: false });

    const articles = camelizeKeys<Array<{
      slug: string; updatedAt: string | null; publishedAt: string | null;
      category: { slug: string };
    }>>(articlesData || []);

    const articlePages: MetadataRoute.Sitemap = articles.map((article) => ({
      url: `${baseUrl}/${article.category.slug}/${article.slug}`,
      lastModified: article.updatedAt || article.publishedAt || new Date().toISOString(),
      changeFrequency: 'weekly',
      priority: 0.7,
    }));

    const { data: tagsData } = await supabase
      .from('tags')
      .select('slug')
      .gt('article_count', 0);
    const tagPages: MetadataRoute.Sitemap = (tagsData || []).map((tag) => ({
      url: `${baseUrl}/tag/${tag.slug}`,
      changeFrequency: 'weekly',
      priority: 0.6,
    }));

    const { data: collectionsData } = await supabase
      .from('collections')
      .select('slug')
      .eq('is_visible', true);
    const collectionPages: MetadataRoute.Sitemap = (collectionsData || []).map((col) => ({
      url: `${baseUrl}/collection/${col.slug}`,
      changeFrequency: 'weekly',
      priority: 0.6,
    }));

    return [...staticPages, ...categoryPages, ...articlePages, ...tagPages, ...collectionPages];
  } catch {
    return staticPages;
  }
}
