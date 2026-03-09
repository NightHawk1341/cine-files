import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireEditor, requireAdmin, handleApiError, jsonError, getAuthUser } from '@/lib/api-utils';

const ARTICLE_INCLUDE = {
  category: true,
  author: {
    select: { id: true, displayName: true, avatarUrl: true },
  },
  tags: {
    include: { tag: true },
  },
};

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;

  // Support both numeric ID and slug
  const where = /^\d+$/.test(id)
    ? { id: parseInt(id) }
    : { slug: id };

  const article = await prisma.article.findFirst({
    where,
    include: ARTICLE_INCLUDE,
  });

  if (!article) {
    return jsonError('Article not found', 404);
  }

  return NextResponse.json({ article });
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const user = await requireEditor();
    const { id } = await params;
    const articleId = parseInt(id);

    const existing = await prisma.article.findUnique({
      where: { id: articleId },
      select: { authorId: true, status: true },
    });

    if (!existing) return jsonError('Article not found', 404);

    // Editors can only edit their own articles; admins can edit any
    if (user.role === 'editor' && existing.authorId !== user.userId) {
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
      await prisma.articleTag.deleteMany({ where: { articleId } });
      if (tagIds.length > 0) {
        await prisma.articleTag.createMany({
          data: tagIds.map((tagId: number, i: number) => ({
            articleId,
            tagId,
            isPrimary: i === 0,
          })),
        });
      }
    }

    const article = await prisma.article.update({
      where: { id: articleId },
      data: {
        ...(title !== undefined && { title }),
        ...(categoryId !== undefined && { categoryId }),
        ...(subtitle !== undefined && { subtitle }),
        ...(lead !== undefined && { lead }),
        ...(articleBody !== undefined && { body: articleBody }),
        ...(coverImageUrl !== undefined && { coverImageUrl }),
        ...(coverImageAlt !== undefined && { coverImageAlt }),
        ...(coverImageCredit !== undefined && { coverImageCredit }),
        ...(metaTitle !== undefined && { metaTitle }),
        ...(metaDescription !== undefined && { metaDescription }),
        ...(status !== undefined && { status }),
        ...(tributeProductIds !== undefined && { tributeProductIds }),
        ...(isFeatured !== undefined && { isFeatured }),
        ...(isPinned !== undefined && { isPinned }),
        ...(allowComments !== undefined && { allowComments }),
        ...(isPublishing && { publishedAt: new Date() }),
      },
      include: ARTICLE_INCLUDE,
    });

    return NextResponse.json({ article });
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

    const existing = await prisma.article.findUnique({
      where: { id: articleId },
      select: { authorId: true },
    });

    if (!existing) return jsonError('Article not found', 404);

    // Only admins or the article author can delete
    if (user.role !== 'admin' && existing.authorId !== user.userId) {
      return jsonError('Forbidden', 403);
    }

    await prisma.article.delete({ where: { id: articleId } });

    return NextResponse.json({ message: 'Article deleted' });
  } catch (error) {
    return handleApiError(error);
  }
}
