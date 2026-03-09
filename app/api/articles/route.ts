import { NextResponse } from 'next/server';
import { supabase, camelizeKeys } from '@/lib/db';
import { requireEditor, handleApiError, jsonError } from '@/lib/api-utils';
import { generateSlug } from '@/lib/transliterate';

const ARTICLE_SELECT = `
  *,
  category:categories(*),
  author:users!author_id(id, display_name, avatar_url),
  tags:article_tags(*, tag:tags(*))
`;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
  const category = searchParams.get('category');
  const status = searchParams.get('status') || 'published';
  const featured = searchParams.get('featured');
  const authorId = searchParams.get('author_id');
  const tributeProductId = searchParams.get('tribute_product_id');

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  // Build query for articles
  let query = supabase
    .from('articles')
    .select(ARTICLE_SELECT, { count: 'exact' })
    .eq('status', status)
    .order('is_pinned', { ascending: false })
    .order('published_at', { ascending: false })
    .range(from, to);

  if (featured === 'true') query = query.eq('is_featured', true);
  if (authorId) query = query.eq('author_id', parseInt(authorId));
  if (tributeProductId) query = query.contains('tribute_product_ids', [parseInt(tributeProductId)]);

  // Category filter requires a join; filter by category_id after looking up slug
  if (category) {
    const { data: cat } = await supabase
      .from('categories')
      .select('id')
      .eq('slug', category)
      .single();
    if (cat) {
      query = query.eq('category_id', cat.id);
    }
  }

  const { data: articles, count } = await query;
  const total = count || 0;

  return NextResponse.json({
    articles: camelizeKeys(articles || []),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

export async function POST(request: Request) {
  try {
    const user = await requireEditor();
    const body = await request.json();

    const {
      title,
      categoryId,
      subtitle,
      lead,
      body: articleBody,
      coverImageUrl,
      coverImageAlt,
      coverImageCredit,
      metaTitle,
      metaDescription,
      status = 'draft',
      tagIds,
      tributeProductIds,
    } = body;

    if (!title || !categoryId) {
      return jsonError('Title and category are required', 400);
    }

    const slug = generateSlug(title);

    // Ensure unique slug
    const { data: existing } = await supabase
      .from('articles')
      .select('id')
      .eq('slug', slug)
      .single();
    const finalSlug = existing ? `${slug}-${Date.now()}` : slug;

    const { data: article } = await supabase
      .from('articles')
      .insert({
        slug: finalSlug,
        title,
        category_id: categoryId,
        author_id: user.userId,
        subtitle,
        lead,
        body: articleBody || [],
        cover_image_url: coverImageUrl,
        cover_image_alt: coverImageAlt,
        cover_image_credit: coverImageCredit,
        meta_title: metaTitle,
        meta_description: metaDescription,
        status,
        published_at: status === 'published' ? new Date().toISOString() : null,
        tribute_product_ids: tributeProductIds || [],
      })
      .select(ARTICLE_SELECT)
      .single();

    // Create tags if provided
    if (tagIds?.length && article) {
      await supabase.from('article_tags').insert(
        tagIds.map((tagId: number, i: number) => ({
          article_id: article.id,
          tag_id: tagId,
          is_primary: i === 0,
        }))
      );
    }

    return NextResponse.json({ article: camelizeKeys(article) }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
