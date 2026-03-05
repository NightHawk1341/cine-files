import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query || query.length < 2) {
    return NextResponse.json({ articles: [], tags: [] });
  }

  const [articles, tags] = await Promise.all([
    prisma.article.findMany({
      where: {
        status: 'published',
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { lead: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        slug: true,
        title: true,
        lead: true,
        coverImageUrl: true,
        publishedAt: true,
        category: { select: { slug: true, nameRu: true } },
      },
      orderBy: { publishedAt: 'desc' },
      take: 20,
    }),
    prisma.tag.findMany({
      where: {
        nameRu: { contains: query, mode: 'insensitive' },
      },
      orderBy: { articleCount: 'desc' },
      take: 10,
    }),
  ]);

  return NextResponse.json({ articles, tags });
}
