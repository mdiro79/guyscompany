import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { store } from '@/lib/data';
import { objectSize } from '@/lib/storage';
import { ownsPath } from '@/lib/upload-path';
import { MAX_FILE_BYTES } from '@/lib/limits';

// Step 2: after the browser uploaded to Storage, record the file metadata (only the path is stored).
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { path, name, mime } = (await request.json()) as { path?: string; name?: string; mime?: string };
  if (!path || !name || !ownsPath(user.id, path)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const size = await objectSize(path);
  if (size === null) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (size > MAX_FILE_BYTES) return NextResponse.json({ error: 'too_large' }, { status: 413 });
  const meta = await store().createFile({ name: name.slice(0, 200), storagePath: path, size, mime: mime || 'application/octet-stream', uploadedBy: user.id });
  return NextResponse.json({ id: meta.id });
}
