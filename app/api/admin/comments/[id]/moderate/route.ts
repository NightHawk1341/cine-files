import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { requireAdmin, handleApiError, jsonError } from '@/lib/api-utils';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    await requireAdmin();
    const { id } = await params;
    const commentId = parseInt(id);

    const formData = await request.formData();
    const action = formData.get('action') as string;

    const { data: comment } = await supabase
      .from('comments')
      .select('article_id, status')
      .eq('id', commentId)
      .single();

    if (!comment) return jsonError('Comment not found', 404);

    let newStatus: string;
    switch (action) {
      case 'hide': newStatus = 'hidden'; break;
      case 'show': newStatus = 'visible'; break;
      case 'delete': newStatus = 'deleted'; break;
      default: return jsonError('Invalid action', 400);
    }

    const wasVisible = comment.status === 'visible';
    const willBeVisible = newStatus === 'visible';

    await supabase
      .from('comments')
      .update({ status: newStatus })
      .eq('id', commentId);

    // Update article comment count
    if (wasVisible !== willBeVisible) {
      const { data: art } = await supabase
        .from('articles')
        .select('comment_count')
        .eq('id', comment.article_id)
        .single();
      if (art) {
        const newCount = willBeVisible
          ? art.comment_count + 1
          : Math.max(0, art.comment_count - 1);
        await supabase
          .from('articles')
          .update({ comment_count: newCount })
          .eq('id', comment.article_id);
      }
    }

    // Redirect back to moderation page
    return NextResponse.redirect(new URL('/admin/comments', request.url));
  } catch (error) {
    return handleApiError(error);
  }
}
