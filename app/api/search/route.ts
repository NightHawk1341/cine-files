import { NextResponse } from 'next/server';
import { supabase, camelizeKeys } from '@/lib/db';
import { jsonError } from '@/lib/api-utils';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);

  if (!query || query.length < 2) {
    return jsonError('Query must be at least 2 characters', 400);
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const ARTICLE_SELECT = `
    *,
    category:categories(*),
    author:users!author_id(id, display_name, avatar_url),
    tags:article_tags(*, tag:tags(*))
  `;

  const [articlesResult, tagsResult] = await Promise.all([
    supabase
      .from('articles')
      .select(ARTICLE_SELECT, { count: 'exact' })
      .eq('status', 'published')
      .or(`title.ilike.%${query}%,lead.ilike.%${query}%,subtitle.ilike.%${query}%`)
      .order('published_at', { ascending: false })
      .range(from, to),
    supabase
      .from('tags')
      .select('*')
      .ilike('name_ru', `%${query}%`)
      .gt('article_count', 0)
      .order('article_count', { ascending: false })
      .limit(10),
  ]);

  const total = articlesResult.count || 0;

  return NextResponse.json({
    articles: camelizeKeys(articlesResult.data || []),
    tags: camelizeKeys(tagsResult.data || []),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}
