import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  const categories = await prisma.category.findMany({
    orderBy: { sortOrder: 'asc' },
    include: {
      _count: { select: { articles: { where: { status: 'published' } } } },
    },
  });

  return NextResponse.json({
    categories: categories.map((c) => ({
      id: c.id,
      slug: c.slug,
      nameRu: c.nameRu,
      nameEn: c.nameEn,
      description: c.description,
      articleCount: c._count.articles,
    })),
  });
}
