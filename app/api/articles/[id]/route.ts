import { NextResponse } from 'next/server';
import { supabase, camelizeKeys } from '@/lib/db';
import { requireEditor, handleApiError, jsonError, getAuthUser } from '@/lib/api-utils';

// Select string for articles with relations
const ARTICLE_SELECT = `
  *,
  category:categories(*),
  author:users!author_id(id, display_name, avatar_url),
  tags:article_tags(*, tag:tags(*))
`;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;

  const query = supabase.from('articles').select(ARTICLE_SELECT);

  const { data: article } = /^\d+$/.test(id)
    ? await query.eq('id', parseInt(id)).single()
    : await query.eq('slug', id).single();

  if (!article) {
    return jsonError('Article not found', 404);
  }

  return NextResponse.json({ article: camelizeKeys(article) });
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const user = await requireEditor();
    const { id } = await params;
    const articleId = parseInt(id);

    const { data: existing } = await supabase
      .from('articles')
      .select('author_id, status')
      .eq('id', articleId)
      .single();

    if (!existing) return jsonError('Article not found', 404);

    // Editors can only edit their own articles; admins can edit any
    if (user.role === 'editor' && existing.author_id !== user.userId) {
      return jsonError('Forbidden', 403);
    }

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
      status,
      tagIds,
      tributeProductIds,
      isFeatured,
      isPinned,
      allowComments,
    } = body;

    // Determine if we're publishing for the first time
    const isPublishing = status === 'published' && existing.status !== 'published';

    // Update tags if provided
    if (tagIds !== undefined) {
      await supabase.from('article_tags').delete().eq('article_id', articleId);
      if (tagIds.length > 0) {
        await supabase.from('article_tags').insert(
          tagIds.map((tagId: number, i: number) => ({
            article_id: articleId,
            tag_id: tagId,
            is_primary: i === 0,
          }))
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (title !== undefined) updateData.title = title;
    if (categoryId !== undefined) updateData.category_id = categoryId;
    if (subtitle !== undefined) updateData.subtitle = subtitle;
    if (lead !== undefined) updateData.lead = lead;
    if (articleBody !== undefined) updateData.body = articleBody;
    if (coverImageUrl !== undefined) updateData.cover_image_url = coverImageUrl;
    if (coverImageAlt !== undefined) updateData.cover_image_alt = coverImageAlt;
    if (coverImageCredit !== undefined) updateData.cover_image_credit = coverImageCredit;
    if (metaTitle !== undefined) updateData.meta_title = metaTitle;
    if (metaDescription !== undefined) updateData.meta_description = metaDescription;
    if (status !== undefined) updateData.status = status;
    if (tributeProductIds !== undefined) updateData.tribute_product_ids = tributeProductIds;
    if (isFeatured !== undefined) updateData.is_featured = isFeatured;
    if (isPinned !== undefined) updateData.is_pinned = isPinned;
    if (allowComments !== undefined) updateData.allow_comments = allowComments;
    if (isPublishing) updateData.published_at = new Date().toISOString();

    const { data: article } = await supabase
      .from('articles')
      .update(updateData)
      .eq('id', articleId)
      .select(ARTICLE_SELECT)
      .single();

    return NextResponse.json({ article: camelizeKeys(article) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const user = await getAuthUser();
    if (!user) return jsonError('Unauthorized', 401);

    const { id } = await params;
    const articleId = parseInt(id);

    const { data: existing } = await supabase
      .from('articles')
      .select('author_id')
      .eq('id', articleId)
      .single();

    if (!existing) return jsonError('Article not found', 404);

    // Only admins or the article author can delete
    if (user.role !== 'admin' && existing.author_id !== user.userId) {
      return jsonError('Forbidden', 403);
    }

    await supabase.from('articles').delete().eq('id', articleId);

    return NextResponse.json({ message: 'Article deleted' });
  } catch (error) {
    return handleApiError(error);
  }
}
