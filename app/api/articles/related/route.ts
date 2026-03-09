import { NextResponse } from 'next/server';
import { supabase, camelizeKeys } from '@/lib/db';
import { config } from '@/lib/config';
import { jsonError } from '@/lib/api-utils';

/**
 * Related Articles API — called by TR-BUTE to show related CineFiles articles
 * on product pages. Protected by API key.
 *
 * GET /api/articles/related?tribute_product_id=123
 * GET /api/articles/related?tag_slug=avengers
 */
export async function GET(request: Request) {
  const apiKey = request.headers.get('X-API-Key');
  if (config.tribute.apiKey && apiKey !== config.tribute.apiKey) {
    return jsonError('Unauthorized', 401);
  }

  const { searchParams } = new URL(request.url);
  const tributeProductId = searchParams.get('tribute_product_id');
  const tagSlug = searchParams.get('tag_slug');
  const limit = Math.min(parseInt(searchParams.get('limit') || '5'), 20);

  if (!tributeProductId && !tagSlug) {
    return jsonError('Provide tribute_product_id or tag_slug', 400);
  }

  interface ArticleRow {
    slug: string;
    title: string;
    lead: string | null;
    coverImageUrl: string | null;
    publishedAt: string | null;
    category: { slug: string; nameRu: string };
  }

  let articles: ArticleRow[];

  if (tributeProductId) {
    const { data } = await supabase
      .from('articles')
      .select('slug, title, lead, cover_image_url, published_at, category:categories(slug, name_ru)')
      .eq('status', 'published')
      .contains('tribute_product_ids', [parseInt(tributeProductId)])
      .order('published_at', { ascending: false })
      .limit(limit);

    articles = camelizeKeys<ArticleRow[]>(data || []);
  } else {
    const { data: tag } = await supabase
      .from('tags')
      .select('id')
      .eq('slug', tagSlug!)
      .single();

    if (!tag) {
      return NextResponse.json({ articles: [] });
    }

    const { data: articleTags } = await supabase
      .from('article_tags')
      .select('article:articles(slug, title, lead, cover_image_url, published_at, category:categories(slug, name_ru))')
      .eq('tag_id', tag.id)
      .limit(limit);

    articles = camelizeKeys<Array<{ article: ArticleRow }>>((articleTags || [])).map((at) => at.article);
  }

  // Build full URLs
  const result = articles.map((a) => ({
    title: a.title,
    lead: a.lead,
    coverImageUrl: a.coverImageUrl,
    publishedAt: a.publishedAt,
    url: `${config.appUrl}/${a.category.slug}/${a.slug}`,
    category: a.category.nameRu,
  }));

  return NextResponse.json({ articles: result });
}
