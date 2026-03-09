import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, handleApiError, jsonError } from '@/lib/api-utils';

const COMMENT_INCLUDE = {
  user: {
    select: { id: true, displayName: true, avatarUrl: true },
  },
  replies: {
    include: {
      user: { select: { id: true, displayName: true, avatarUrl: true } },
    },
    where: { status: 'visible' },
    orderBy: { createdAt: 'asc' as const },
  },
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const articleId = searchParams.get('article_id');
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);

  if (!articleId) {
    return jsonError('article_id is required', 400);
  }

  const where = {
    articleId: parseInt(articleId),
    parentId: null, // Only top-level comments
    status: 'visible',
  };

  const [comments, total] = await Promise.all([
    prisma.comment.findMany({
      where,
      include: COMMENT_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.comment.count({ where }),
  ]);

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
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      select: { allowComments: true, status: true },
    });

    if (!article || article.status !== 'published') {
      return jsonError('Article not found', 404);
    }

    if (!article.allowComments) {
      return jsonError('Comments are disabled for this article', 403);
    }

    // Verify parent comment exists if replying
    if (parentId) {
      const parent = await prisma.comment.findUnique({
        where: { id: parentId },
        select: { articleId: true, status: true },
      });
      if (!parent || parent.articleId !== articleId || parent.status !== 'visible') {
        return jsonError('Parent comment not found', 404);
      }
    }

    const comment = await prisma.comment.create({
      data: {
        articleId,
        userId: user.userId,
        parentId: parentId || null,
        body: body.trim(),
      },
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });

    // Increment comment count
    await prisma.article.update({
      where: { id: articleId },
      data: { commentCount: { increment: 1 } },
    });

    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
