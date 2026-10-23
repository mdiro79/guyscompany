'use client';
import { supabaseBrowser } from '@/lib/supabase/client';
import { STORAGE_BUCKET } from '@/lib/limits';

// Uploads a file and returns its id. Production: signed URL straight to Supabase Storage.
export async function uploadFile(file: File): Promise<string> {
  const sign = await fetch('/api/files/sign', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: file.name, size: file.size, mime: file.type }),
  });
  if (!sign.ok) throw new Error('sign');
  const s = (await sign.json()) as { mode: 'local' } | { mode: 'supabase'; path: string; token: string };
  if (s.mode === 'local') {
    const body = new FormData();
    body.append('file', file);
    const res = await fetch('/api/files', { method: 'POST', body });
    if (!res.ok) throw new Error('upload');
    return ((await res.json()) as { id: string }).id;
  }
  const supabase = supabaseBrowser();
  if (!supabase) throw new Error('config');
  const { error } = await supabase.storage.from(STORAGE_BUCKET).uploadToSignedUrl(s.path, s.token, file, { contentType: file.type || undefined });
  if (error) throw new Error(error.message);
  const done = await fetch('/api/files/complete', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: s.path, name: file.name, mime: file.type }),
  });
  if (!done.ok) throw new Error('complete');
  return ((await done.json()) as { id: string }).id;
}
