import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { jsonError } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);

  if (!query || query.length < 2) {
    return jsonError('Query must be at least 2 characters', 400);
  }

  const where = {
    status: 'published' as const,
    OR: [
      { title: { contains: query, mode: 'insensitive' as const } },
      { lead: { contains: query, mode: 'insensitive' as const } },
      { subtitle: { contains: query, mode: 'insensitive' as const } },
    ],
  };

  const [articles, total] = await Promise.all([
    prisma.article.findMany({
      where,
      include: {
        category: true,
        author: { select: { id: true, displayName: true, avatarUrl: true } },
        tags: { include: { tag: true } },
      },
      orderBy: { publishedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.article.count({ where }),
  ]);

  const tags = await prisma.tag.findMany({
    where: {
      nameRu: { contains: query, mode: 'insensitive' },
      articleCount: { gt: 0 },
    },
    orderBy: { articleCount: 'desc' },
    take: 10,
  });

  return NextResponse.json({
    articles,
    tags,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}
