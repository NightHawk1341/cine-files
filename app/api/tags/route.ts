import { NextResponse } from 'next/server';
import { supabase, camelizeKeys } from '@/lib/db';
import { requireEditor, handleApiError, jsonError } from '@/lib/api-utils';
import { generateSlug } from '@/lib/transliterate';
import { syncTmdbEntity } from '@/lib/tmdb';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const search = searchParams.get('q');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from('tags')
    .select(`
      *,
      tmdb_entity:tmdb_entities(tmdb_id, entity_type, title_ru)
    `, { count: 'exact' })
    .order('article_count', { ascending: false })
    .range(from, to);

  if (type) query = query.eq('tag_type', type);
  if (search) query = query.ilike('name_ru', `%${search}%`);

  const { data: tags, count } = await query;
  const total = count || 0;

  return NextResponse.json({
    tags: camelizeKeys(tags || []),
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

    const { data: existing } = await supabase
      .from('tags')
      .select('id')
      .eq('slug', slug)
      .single();
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

    const { data: tag } = await supabase
      .from('tags')
      .insert({
        slug,
        name_ru: nameRu,
        name_en: nameEn || null,
        tag_type: tagType,
        tmdb_entity_id: tmdbEntityId,
      })
      .select(`
        *,
        tmdb_entity:tmdb_entities(tmdb_id, entity_type, title_ru)
      `)
      .single();

    return NextResponse.json({ tag: camelizeKeys(tag) }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
