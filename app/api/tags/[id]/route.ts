import { NextResponse } from 'next/server';
import { supabase, camelizeKeys } from '@/lib/db';
import { requireEditor, requireAdmin, handleApiError, jsonError } from '@/lib/api-utils';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;

  let query = supabase.from('tags').select('*, tmdb_entity:tmdb_entities(*)');

  if (/^\d+$/.test(id)) {
    query = query.eq('id', parseInt(id));
  } else {
    query = query.eq('slug', id);
  }

  const { data: tag } = await query.single();

  if (!tag) return jsonError('Tag not found', 404);

  // Get article count
  const { count } = await supabase
    .from('article_tags')
    .select('*', { count: 'exact', head: true })
    .eq('tag_id', tag.id);

  return NextResponse.json({
    tag: { ...camelizeKeys(tag), _count: { articles: count || 0 } },
  });
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    await requireEditor();
    const { id } = await params;
    const tagId = parseInt(id);
    const body = await request.json();

    const { data: existing } = await supabase
      .from('tags')
      .select('id')
      .eq('id', tagId)
      .single();
    if (!existing) return jsonError('Tag not found', 404);

    const { nameRu, nameEn, tagType } = body;

    const updateData: Record<string, unknown> = {};
    if (nameRu !== undefined) updateData.name_ru = nameRu;
    if (nameEn !== undefined) updateData.name_en = nameEn;
    if (tagType !== undefined) updateData.tag_type = tagType;

    const { data: tag } = await supabase
      .from('tags')
      .update(updateData)
      .eq('id', tagId)
      .select(`
        *,
        tmdb_entity:tmdb_entities(tmdb_id, entity_type, title_ru)
      `)
      .single();

    return NextResponse.json({ tag: camelizeKeys(tag) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    await requireAdmin();
    const { id } = await params;
    const tagId = parseInt(id);

    const { data: existing } = await supabase
      .from('tags')
      .select('id')
      .eq('id', tagId)
      .single();
    if (!existing) return jsonError('Tag not found', 404);

    await supabase.from('tags').delete().eq('id', tagId);

    return NextResponse.json({ message: 'Tag deleted' });
  } catch (error) {
    return handleApiError(error);
  }
}
