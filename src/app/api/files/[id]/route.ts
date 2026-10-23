import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { store } from '@/lib/data';
import { getDemoObject, getObjectUrl } from '@/lib/storage';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });
  const meta = await store().getFile((await params).id);
  if (!meta) return new NextResponse('Not found', { status: 404 });
  const url = await getObjectUrl(meta.storagePath, meta.name);
  if (url) return NextResponse.redirect(url);
  const bytes = getDemoObject(meta.storagePath);
  if (!bytes) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(new Uint8Array(bytes), {
    headers: { 'content-type': meta.mime, 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(meta.name)}` },
  });
}
