import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireEditor, handleApiError, jsonError } from '@/lib/api-utils';
import { generateSlug } from '@/lib/transliterate';
import { syncTmdbEntity } from '@/lib/tmdb';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const search = searchParams.get('q');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));

  const where = {
    ...(type ? { tagType: type } : {}),
    ...(search ? { nameRu: { contains: search, mode: 'insensitive' as const } } : {}),
  };

  const [tags, total] = await Promise.all([
    prisma.tag.findMany({
      where,
      include: {
        tmdbEntity: {
          select: { tmdbId: true, entityType: true, titleRu: true },
        },
      },
      orderBy: { articleCount: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.tag.count({ where }),
  ]);

  return NextResponse.json({
    tags,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

export async function POST(request: Request) {
  try {
    await requireEditor();
    const body = await request.json();

    const { nameRu, nameEn, tagType, tmdbId, tmdbType } = body;

    if (!nameRu || !tagType) {
      return jsonError('nameRu and tagType are required', 400);
    }

    const slug = generateSlug(nameRu);

    const existing = await prisma.tag.findUnique({ where: { slug } });
    if (existing) {
      return jsonError('Tag with this name already exists', 409);
    }

    // If TMDB ID provided, sync entity first
    let tmdbEntityId: number | null = null;
    if (tmdbId && tmdbType) {
      const entity = await syncTmdbEntity(tmdbType, tmdbId);
      if (entity) {
        tmdbEntityId = entity.id;
      }
    }

    const tag = await prisma.tag.create({
      data: {
        slug,
        nameRu,
        nameEn: nameEn || null,
        tagType,
        tmdbEntityId,
      },
      include: {
        tmdbEntity: {
          select: { tmdbId: true, entityType: true, titleRu: true },
        },
      },
    });

    return NextResponse.json({ tag }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
