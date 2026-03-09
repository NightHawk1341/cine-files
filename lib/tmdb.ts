import { config } from './config';
import { supabase, camelizeKeys } from './db';

interface TmdbSearchResult {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  media_type: string;
  overview?: string;
  release_date?: string;
  first_air_date?: string;
  known_for_department?: string;
}

interface TmdbResponse<T> {
  results?: T[];
  [key: string]: unknown;
}

async function fetchFromProxy<T>(path: string): Promise<T | null> {
  const proxyUrl = config.tmdb.proxyUrl;
  if (!proxyUrl) return null;

  try {
    const response = await fetch(`${proxyUrl}/${path}`, {
      headers: {
        'X-Proxy-Secret': config.tmdb.proxySecret,
      },
      next: { revalidate: 3600 },
    });

    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

async function getCachedOrFetch<T>(cacheKey: string, path: string, ttlHours = 24): Promise<T | null> {
  // Check cache first
  const { data: cached } = await supabase
    .from('tmdb_cache')
    .select('response, expires_at')
    .eq('cache_key', cacheKey)
    .single();

  if (cached && new Date(cached.expires_at) > new Date()) {
    return cached.response as T;
  }

  // Fetch from proxy
  const data = await fetchFromProxy<T>(path);
  if (!data) return null;

  // Store in cache
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();
  await supabase.from('tmdb_cache').upsert(
    { cache_key: cacheKey, response: data as object, expires_at: expiresAt },
    { onConflict: 'cache_key' }
  );

  return data;
}

export async function searchTmdb(query: string, language = 'ru-RU'): Promise<TmdbSearchResult[]> {
  const cacheKey = `search/multi?query=${encodeURIComponent(query)}&lang=${language}`;
  const path = `search/multi?query=${encodeURIComponent(query)}&language=${language}`;

  const data = await getCachedOrFetch<TmdbResponse<TmdbSearchResult>>(cacheKey, path, 1);
  return data?.results ?? [];
}

export async function getTmdbEntity(type: 'movie' | 'tv' | 'person', tmdbId: number, language = 'ru-RU') {
  const cacheKey = `${type}/${tmdbId}?lang=${language}`;
  const path = `${type}/${tmdbId}?language=${language}&append_to_response=credits`;

  return getCachedOrFetch(cacheKey, path, 24);
}

export async function syncTmdbEntity(type: 'movie' | 'tv' | 'person', tmdbId: number) {
  const data = await getTmdbEntity(type, tmdbId);
  if (!data) return null;

  const entity = data as Record<string, unknown>;

  const titleRu = (entity.title as string) || (entity.name as string) || null;
  const titleEn = (entity.original_title as string) || (entity.original_name as string) || null;

  const { data: result } = await supabase
    .from('tmdb_entities')
    .upsert(
      {
        tmdb_id: tmdbId,
        entity_type: type,
        title_ru: titleRu,
        title_en: titleEn,
        metadata: entity as object,
        credits: (entity.credits as object) ?? null,
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: 'tmdb_id,entity_type' }
    )
    .select()
    .single();

  return result ? camelizeKeys<{ id: number; tmdbId: number; entityType: string; titleRu: string | null; titleEn: string | null }>(result) : null;
}
