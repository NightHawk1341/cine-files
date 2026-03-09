import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await prisma.authToken.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });

  return NextResponse.json({ message: 'Token cleanup complete', deleted: result.count });
}
