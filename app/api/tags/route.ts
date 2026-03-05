import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const search = searchParams.get('q');
  const limit = parseInt(searchParams.get('limit') || '50');

  const where = {
    ...(type ? { tagType: type } : {}),
    ...(search ? { nameRu: { contains: search, mode: 'insensitive' as const } } : {}),
  };

  const tags = await prisma.tag.findMany({
    where,
    orderBy: { articleCount: 'desc' },
    take: limit,
  });

  return NextResponse.json({ tags });
}
