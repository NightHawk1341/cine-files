import { NextResponse } from 'next/server';
import { requireEditor, handleApiError, jsonError } from '@/lib/api-utils';
import { uploadToS3 } from '@/lib/storage';
import { prisma } from '@/lib/db';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'];

export async function POST(request: Request) {
  try {
    const user = await requireEditor();

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const altText = formData.get('alt') as string | null;
    const credit = formData.get('credit') as string | null;

    if (!file) {
      return jsonError('No file provided', 400);
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return jsonError(`Invalid file type. Allowed: ${ALLOWED_TYPES.join(', ')}`, 400);
    }

    if (file.size > MAX_FILE_SIZE) {
      return jsonError('File too large. Max 5MB', 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const url = await uploadToS3(buffer, file.name, file.type, 'uploads');

    const media = await prisma.media.create({
      data: {
        uploadedBy: user.userId,
        url,
        filename: file.name,
        mimeType: file.type,
        fileSize: file.size,
        altText,
        credit,
      },
    });

    return NextResponse.json({ media }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
