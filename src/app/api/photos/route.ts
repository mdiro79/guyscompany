import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { store } from '@/lib/data';
import { putObject } from '@/lib/storage';
import { PHOTO_MAX_BYTES, PHOTO_QUOTA_BYTES } from '@/lib/limits';

// The office phone's gallery: one's own photos (newest first) with the room used, and taking a new one.
// Each member has PHOTO_QUOTA_BYTES; a photo that would not fit is refused (the phone asks to delete some).
export const dynamic = 'force-dynamic';
const TYPES = new Set(['image/webp', 'image/jpeg', 'image/png']);

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const photos = await store().listPhotos(user.id);
  return NextResponse.json({
    photos: photos.map((p) => ({ id: p.id, size: p.size, width: p.width, height: p.height, createdAt: p.createdAt })),
    used: photos.reduce((s, p) => s + p.size, 0), quota: PHOTO_QUOTA_BYTES,
  }, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const form = await request.formData().catch(() => null);
  const file = form?.get('photo');
  const width = Number(form?.get('width')), height = Number(form?.get('height'));
  if (!(file instanceof File) || !TYPES.has(file.type)) return NextResponse.json({ error: 'not_a_photo' }, { status: 400 });
  if (file.size > PHOTO_MAX_BYTES) return NextResponse.json({ error: 'too_large' }, { status: 413 });
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 16 || height < 16 || width > 4096 || height > 4096) return NextResponse.json({ error: 'bad_size' }, { status: 400 });
  const used = (await store().listPhotos(user.id)).reduce((s, p) => s + p.size, 0);
  if (used + file.size > PHOTO_QUOTA_BYTES) return NextResponse.json({ error: 'full', used, quota: PHOTO_QUOTA_BYTES }, { status: 409 });
  const ext = file.type === 'image/webp' ? 'webp' : file.type === 'image/png' ? 'png' : 'jpg';
  const path = `${user.id}/photos/${crypto.randomUUID()}.${ext}`;
  await putObject(path, Buffer.from(await file.arrayBuffer()), file.type);
  const p = await store().createPhoto({ userId: user.id, storagePath: path, size: file.size, width, height });
  return NextResponse.json({ photo: { id: p.id, size: p.size, width, height, createdAt: p.createdAt }, used: used + file.size, quota: PHOTO_QUOTA_BYTES });
}
