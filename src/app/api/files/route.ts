import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { store } from '@/lib/data';
import { putObject } from '@/lib/storage';
import { MAX_FILE_BYTES } from '@/lib/limits';
import { isDemo } from '@/lib/env';
import { uploadPath } from '@/lib/upload-path';

// Demo-mode upload through the server; production uses /api/files/sign + /api/files/complete.
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  if (!isDemo) return NextResponse.json({ error: 'use_signed_upload' }, { status: 400 });
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'missing' }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: 'too_large' }, { status: 413 });
  const path = uploadPath(user.id, file.name);
  const mime = file.type || 'application/octet-stream';
  await putObject(path, Buffer.from(await file.arrayBuffer()), mime);
  const meta = await store().createFile({ name: file.name.slice(0, 200), storagePath: path, size: file.size, mime, uploadedBy: user.id });
  return NextResponse.json({ id: meta.id });
}
