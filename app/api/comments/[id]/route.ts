import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
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

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { userId: true, status: true },
    });

    if (!comment || comment.status !== 'visible') {
      return jsonError('Comment not found', 404);
    }

    // Users can only edit their own comments
    if (comment.userId !== user.userId && user.role !== 'admin') {
      return jsonError('Forbidden', 403);
    }

    const updated = await prisma.comment.update({
      where: { id: commentId },
      data: {
        body: body.trim(),
        updatedAt: new Date(),
      },
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });

    return NextResponse.json({ comment: updated });
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

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { userId: true, articleId: true },
    });

    if (!comment) return jsonError('Comment not found', 404);

    // Only comment author or admin can delete
    if (comment.userId !== user.userId && user.role !== 'admin') {
      return jsonError('Forbidden', 403);
    }

    await prisma.comment.update({
      where: { id: commentId },
      data: { status: 'deleted' },
    });

    await prisma.article.update({
      where: { id: comment.articleId },
      data: { commentCount: { decrement: 1 } },
    });

    return NextResponse.json({ message: 'Comment deleted' });
  } catch (error) {
    return handleApiError(error);
  }
}
