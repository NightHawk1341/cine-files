import { NextResponse } from 'next/server';
import { supabase, camelizeKeys } from '@/lib/db';

export async function GET() {
  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .order('sort_order', { ascending: true });

  // Get published article counts per category
  const result = await Promise.all(
    (categories || []).map(async (c) => {
      const { count } = await supabase
        .from('articles')
        .select('*', { count: 'exact', head: true })
        .eq('category_id', c.id)
        .eq('status', 'published');

      const cat = camelizeKeys<{
        id: number;
        slug: string;
        nameRu: string;
        nameEn: string | null;
        description: string | null;
      }>(c);

      return {
        id: cat.id,
        slug: cat.slug,
        nameRu: cat.nameRu,
        nameEn: cat.nameEn,
        description: cat.description,
        articleCount: count || 0,
      };
    })
  );

  return NextResponse.json({ categories: result });
}
