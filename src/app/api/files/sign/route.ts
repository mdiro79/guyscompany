import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { isDemo } from '@/lib/env';
import { createUploadUrl } from '@/lib/storage';
import { uploadPath } from '@/lib/upload-path';
import { MAX_FILE_BYTES } from '@/lib/limits';

// Step 1 of an upload: returns a signed Storage upload URL (or 'local' in demo mode).
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  if (isDemo) return NextResponse.json({ mode: 'local' });
  const { name, size } = (await request.json()) as { name?: string; size?: number };
  if (!name || !size || size > MAX_FILE_BYTES) return NextResponse.json({ error: 'too_large' }, { status: 413 });
  const path = uploadPath(user.id, name);
  return NextResponse.json({ mode: 'supabase', path, token: await createUploadUrl(path) });
}
