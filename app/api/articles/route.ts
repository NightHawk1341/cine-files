import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireEditor, handleApiError, jsonError } from '@/lib/api-utils';
import { generateSlug } from '@/lib/transliterate';

export const dynamic = 'force-dynamic';

const ARTICLE_INCLUDE = {
  category: true,
  author: {
    select: { id: true, displayName: true, avatarUrl: true },
  },
  tags: {
    include: { tag: true },
  },
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
  const category = searchParams.get('category');
  const status = searchParams.get('status') || 'published';
  const featured = searchParams.get('featured');
  const authorId = searchParams.get('author_id');
  const tributeProductId = searchParams.get('tribute_product_id');

  const where: Record<string, unknown> = { status };

  if (category) where.category = { slug: category };
  if (featured === 'true') where.isFeatured = true;
  if (authorId) where.authorId = parseInt(authorId);
  if (tributeProductId) where.tributeProductIds = { has: parseInt(tributeProductId) };

  const [articles, total] = await Promise.all([
    prisma.article.findMany({
      where,
      include: ARTICLE_INCLUDE,
      orderBy: [
        { isPinned: 'desc' },
        { publishedAt: 'desc' },
      ],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.article.count({ where }),
  ]);

  return NextResponse.json({
    articles,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

export async function POST(request: Request) {
  try {
    const user = await requireEditor();
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
      status = 'draft',
      tagIds,
      tributeProductIds,
    } = body;

    if (!title || !categoryId) {
      return jsonError('Title and category are required', 400);
    }

    const slug = generateSlug(title);

    // Ensure unique slug
    const existing = await prisma.article.findUnique({ where: { slug } });
    const finalSlug = existing ? `${slug}-${Date.now()}` : slug;

    const article = await prisma.article.create({
      data: {
        slug: finalSlug,
        title,
        categoryId,
        authorId: user.userId,
        subtitle,
        lead,
        body: articleBody || [],
        coverImageUrl,
        coverImageAlt,
        coverImageCredit,
        metaTitle,
        metaDescription,
        status,
        publishedAt: status === 'published' ? new Date() : null,
        tributeProductIds: tributeProductIds || [],
        ...(tagIds?.length && {
          tags: {
            createMany: {
              data: tagIds.map((tagId: number, i: number) => ({
                tagId,
                isPrimary: i === 0,
              })),
            },
          },
        }),
      },
      include: ARTICLE_INCLUDE,
    });

    return NextResponse.json({ article }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
