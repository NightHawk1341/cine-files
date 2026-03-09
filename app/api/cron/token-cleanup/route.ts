import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data } = await supabase
    .from('auth_tokens')
    .delete()
    .lt('expires_at', new Date().toISOString())
    .select('id');

  return NextResponse.json({ message: 'Token cleanup complete', deleted: data?.length || 0 });
}
