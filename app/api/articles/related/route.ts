import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { config } from '@/lib/config';
import { jsonError } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

/**
 * Related Articles API — called by TR-BUTE to show related CineFiles articles
 * on product pages. Protected by API key.
 *
 * GET /api/articles/related?tribute_product_id=123
 * GET /api/articles/related?tag_slug=avengers
 */
export async function GET(request: Request) {
  const apiKey = request.headers.get('X-API-Key');
  if (config.tribute.apiKey && apiKey !== config.tribute.apiKey) {
    return jsonError('Unauthorized', 401);
  }

  const { searchParams } = new URL(request.url);
  const tributeProductId = searchParams.get('tribute_product_id');
  const tagSlug = searchParams.get('tag_slug');
  const limit = Math.min(parseInt(searchParams.get('limit') || '5'), 20);

  if (!tributeProductId && !tagSlug) {
    return jsonError('Provide tribute_product_id or tag_slug', 400);
  }

  let articles;

  if (tributeProductId) {
    // Find articles that reference this TR-BUTE product
    articles = await prisma.article.findMany({
      where: {
        status: 'published',
        tributeProductIds: { has: parseInt(tributeProductId) },
      },
      select: {
        slug: true,
        title: true,
        lead: true,
        coverImageUrl: true,
        publishedAt: true,
        category: { select: { slug: true, nameRu: true } },
      },
      orderBy: { publishedAt: 'desc' },
      take: limit,
    });
  } else {
    // Find articles by tag slug
    const tag = await prisma.tag.findUnique({ where: { slug: tagSlug! } });
    if (!tag) {
      return NextResponse.json({ articles: [] });
    }

    const articleTags = await prisma.articleTag.findMany({
      where: { tagId: tag.id, article: { status: 'published' } },
      include: {
        article: {
          select: {
            slug: true,
            title: true,
            lead: true,
            coverImageUrl: true,
            publishedAt: true,
            category: { select: { slug: true, nameRu: true } },
          },
        },
      },
      orderBy: { article: { publishedAt: 'desc' } },
      take: limit,
    });

    articles = articleTags.map((at) => at.article);
  }

  // Build full URLs
  const result = articles.map((a) => ({
    title: a.title,
    lead: a.lead,
    coverImageUrl: a.coverImageUrl,
    publishedAt: a.publishedAt,
    url: `${config.appUrl}/${a.category.slug}/${a.slug}`,
    category: a.category.nameRu,
  }));

  return NextResponse.json({ articles: result });
}
