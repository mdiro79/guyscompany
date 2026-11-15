import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { store } from '@/lib/data';
import { getDemoObject, getObjectUrl, removeObject } from '@/lib/storage';

// One photo of one's own gallery: shown, or deleted (which frees its room).
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });
  const p = await store().getPhoto((await params).id);
  if (!p || p.userId !== user.id) return new NextResponse('Not found', { status: 404 });
  const url = await getObjectUrl(p.storagePath, null);
  if (url) return NextResponse.redirect(url);
  const bytes = getDemoObject(p.storagePath);
  if (!bytes) return new NextResponse('Not found', { status: 404 });
  const type = p.storagePath.endsWith('.png') ? 'image/png' : p.storagePath.endsWith('.jpg') ? 'image/jpeg' : 'image/webp';
  return new NextResponse(new Uint8Array(bytes), { headers: { 'content-type': type, 'cache-control': 'private, max-age=3600' } });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const p = await store().getPhoto((await params).id);
  if (!p || p.userId !== user.id) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  await store().deletePhoto(p.id);
  await removeObject(p.storagePath).catch(() => {});
  return NextResponse.json({ ok: true });
}
