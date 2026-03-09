import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireEditor, requireAdmin, handleApiError, jsonError } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;

  const where = /^\d+$/.test(id)
    ? { id: parseInt(id) }
    : { slug: id };

  const tag = await prisma.tag.findFirst({
    where,
    include: {
      tmdbEntity: true,
      _count: { select: { articles: true } },
    },
  });

  if (!tag) return jsonError('Tag not found', 404);

  return NextResponse.json({ tag });
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    await requireEditor();
    const { id } = await params;
    const tagId = parseInt(id);
    const body = await request.json();

    const existing = await prisma.tag.findUnique({ where: { id: tagId } });
    if (!existing) return jsonError('Tag not found', 404);

    const { nameRu, nameEn, tagType } = body;

    const tag = await prisma.tag.update({
      where: { id: tagId },
      data: {
        ...(nameRu !== undefined && { nameRu }),
        ...(nameEn !== undefined && { nameEn }),
        ...(tagType !== undefined && { tagType }),
      },
      include: {
        tmdbEntity: {
          select: { tmdbId: true, entityType: true, titleRu: true },
        },
      },
    });

    return NextResponse.json({ tag });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    await requireAdmin();
    const { id } = await params;
    const tagId = parseInt(id);

    const existing = await prisma.tag.findUnique({ where: { id: tagId } });
    if (!existing) return jsonError('Tag not found', 404);

    await prisma.tag.delete({ where: { id: tagId } });

    return NextResponse.json({ message: 'Tag deleted' });
  } catch (error) {
    return handleApiError(error);
  }
}
