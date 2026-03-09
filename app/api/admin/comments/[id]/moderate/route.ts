import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin, handleApiError, jsonError } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

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

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { articleId: true, status: true },
    });

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

    await prisma.comment.update({
      where: { id: commentId },
      data: { status: newStatus },
    });

    // Update article comment count
    if (wasVisible && !willBeVisible) {
      await prisma.article.update({
        where: { id: comment.articleId },
        data: { commentCount: { decrement: 1 } },
      });
    } else if (!wasVisible && willBeVisible) {
      await prisma.article.update({
        where: { id: comment.articleId },
        data: { commentCount: { increment: 1 } },
      });
    }

    // Redirect back to moderation page
    return NextResponse.redirect(new URL('/admin/comments', request.url));
  } catch (error) {
    return handleApiError(error);
  }
}
