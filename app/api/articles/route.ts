import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');
  const category = searchParams.get('category');
  const status = searchParams.get('status') || 'published';

  const where = {
    status,
    ...(category ? { category: { slug: category } } : {}),
  };

  const [articles, total] = await Promise.all([
    prisma.article.findMany({
      where,
      include: {
        category: true,
        author: {
          select: { id: true, displayName: true, avatarUrl: true },
        },
        tags: {
          include: { tag: true },
        },
      },
      orderBy: { publishedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.article.count({ where }),
  ]);

  return NextResponse.json({
    articles,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
}
