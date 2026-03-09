import { NextResponse } from 'next/server';
import { searchTmdb } from '@/lib/tmdb';
import { requireEditor, handleApiError, jsonError } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireEditor();

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    if (!query || query.length < 2) {
      return jsonError('Query must be at least 2 characters', 400);
    }

    const results = await searchTmdb(query);

    // Map to a simpler format for the autocomplete UI
    const items = results.slice(0, 20).map((r) => ({
      tmdbId: r.id,
      mediaType: r.media_type,
      title: r.title || r.name || '',
      originalTitle: r.original_title || r.original_name || '',
      overview: r.overview?.slice(0, 200) || '',
      releaseDate: r.release_date || r.first_air_date || null,
      department: r.known_for_department || null,
    }));

    return NextResponse.json({ results: items });
  } catch (error) {
    return handleApiError(error);
  }
}
