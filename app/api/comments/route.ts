import { NextResponse } from 'next/server';
import { supabase, camelizeKeys } from '@/lib/db';
import { requireAuth, handleApiError, jsonError } from '@/lib/api-utils';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const articleId = searchParams.get('article_id');
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);

  if (!articleId) {
    return jsonError('article_id is required', 400);
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const [commentsResult, countResult] = await Promise.all([
    supabase
      .from('comments')
      .select(`
        *,
        user:users!user_id(id, display_name, avatar_url),
        replies:comments!parent_id(
          *,
          user:users!user_id(id, display_name, avatar_url)
        )
      `)
      .eq('article_id', parseInt(articleId))
      .is('parent_id', null)
      .eq('status', 'visible')
      .order('created_at', { ascending: false })
      .range(from, to),
    supabase
      .from('comments')
      .select('*', { count: 'exact', head: true })
      .eq('article_id', parseInt(articleId))
      .is('parent_id', null)
      .eq('status', 'visible'),
  ]);

  const comments = camelizeKeys(commentsResult.data || []);
  const total = countResult.count || 0;

  return NextResponse.json({
    comments,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const { articleId, parentId, body } = await request.json();

    if (!articleId || !body?.trim()) {
      return jsonError('articleId and body are required', 400);
    }

    // Verify article exists and allows comments
    const { data: article } = await supabase
      .from('articles')
      .select('allow_comments, status')
      .eq('id', articleId)
      .single();

    if (!article || article.status !== 'published') {
      return jsonError('Article not found', 404);
    }

    if (!article.allow_comments) {
      return jsonError('Comments are disabled for this article', 403);
    }

    // Verify parent comment exists if replying
    if (parentId) {
      const { data: parent } = await supabase
        .from('comments')
        .select('article_id, status')
        .eq('id', parentId)
        .single();
      if (!parent || parent.article_id !== articleId || parent.status !== 'visible') {
        return jsonError('Parent comment not found', 404);
      }
    }

    const { data: comment } = await supabase
      .from('comments')
      .insert({
        article_id: articleId,
        user_id: user.userId,
        parent_id: parentId || null,
        body: body.trim(),
      })
      .select(`
        *,
        user:users!user_id(id, display_name, avatar_url)
      `)
      .single();

    // Increment comment count
    const { data: art } = await supabase
      .from('articles')
      .select('comment_count')
      .eq('id', articleId)
      .single();
    if (art) {
      await supabase
        .from('articles')
        .update({ comment_count: art.comment_count + 1 })
        .eq('id', articleId);
    }

    return NextResponse.json({ comment: camelizeKeys(comment) }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
