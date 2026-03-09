import { NextResponse } from 'next/server';
import { supabase, camelizeKeys } from '@/lib/db';
import { getAuthUser, handleApiError, jsonError } from '@/lib/api-utils';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const user = await getAuthUser();
    if (!user) return jsonError('Unauthorized', 401);

    const { id } = await params;
    const commentId = parseInt(id);
    const { body } = await request.json();

    if (!body?.trim()) {
      return jsonError('body is required', 400);
    }

    const { data: comment } = await supabase
      .from('comments')
      .select('user_id, status')
      .eq('id', commentId)
      .single();

    if (!comment || comment.status !== 'visible') {
      return jsonError('Comment not found', 404);
    }

    // Users can only edit their own comments
    if (comment.user_id !== user.userId && user.role !== 'admin') {
      return jsonError('Forbidden', 403);
    }

    const { data: updated } = await supabase
      .from('comments')
      .update({
        body: body.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', commentId)
      .select(`
        *,
        user:users!user_id(id, display_name, avatar_url)
      `)
      .single();

    return NextResponse.json({ comment: camelizeKeys(updated) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const user = await getAuthUser();
    if (!user) return jsonError('Unauthorized', 401);

    const { id } = await params;
    const commentId = parseInt(id);

    const { data: comment } = await supabase
      .from('comments')
      .select('user_id, article_id')
      .eq('id', commentId)
      .single();

    if (!comment) return jsonError('Comment not found', 404);

    // Only comment author or admin can delete
    if (comment.user_id !== user.userId && user.role !== 'admin') {
      return jsonError('Forbidden', 403);
    }

    await supabase
      .from('comments')
      .update({ status: 'deleted' })
      .eq('id', commentId);

    // Decrement comment count
    const { data: art } = await supabase
      .from('articles')
      .select('comment_count')
      .eq('id', comment.article_id)
      .single();
    if (art) {
      await supabase
        .from('articles')
        .update({ comment_count: Math.max(0, art.comment_count - 1) })
        .eq('id', comment.article_id);
    }

    return NextResponse.json({ message: 'Comment deleted' });
  } catch (error) {
    return handleApiError(error);
  }
}
